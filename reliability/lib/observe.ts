// Reading what an indexer actually wrote.
//
// Every check in this suite ends the same way: compare the rows in the tool's
// database against the rows on the chain. That is harder than it sounds,
// because six frameworks spell the same two entities six ways — `Transfer` and
// `transfer`, `blockNumber` and `block_number`, one schema per deployment for
// Graph Node and `public` for everyone else — and the suite has to read all of
// them without a per-tool branch, or the per-tool branch becomes the place the
// bugs live.
//
// So tables are resolved by introspection, reusing the throughput suite's
// resolver: it already knows how to find an entity across these tools, and
// crucially it knows that a Graph Node table holds every historical version of
// a row and that only the current one counts. Getting that wrong would report
// every reorg as unhandled for exactly one tool.
//
// Columns are resolved here rather than there, because the throughput suite
// only ever needs them inside a checksum expression and the scenarios need the
// values themselves.

import { whereClause } from "../../cases/lib/checksum.ts";
import { resolveEntityTables, type SqlRunner } from "../../cases/lib/verify.ts";
import { RELIABILITY_CASE } from "./case.ts";

/** A transfer as the indexer stored it. */
export interface StoredRow {
  block: number;
  logIndex: number;
  amount: bigint;
  from: string;
  to: string;
}

/** The token row, which exists for what its text columns do or do not hold. */
export interface StoredToken {
  symbol: string | null;
  name: string | null;
}

const COLUMNS = {
  block: ["block_number", "blocknumber", "block", "block_height", "blockheight"],
  logIndex: ["log_index", "logindex", "index", "log_idx"],
  amount: ["amount", "value"],
  from: ["from", "from_address", "sender"],
  to: ["to", "to_address", "receiver"],
  address: ["id", "address", "account"],
  balance: ["balance", "amount", "value"],
  symbol: ["symbol"],
  name: ["name", "token_name", "tokenname"],
};

interface Column {
  name: string;
  /** The declared SQL type, lowercased, which decides how it is read back. */
  type: string;
}

/** Columns of a table, keyed lowercase so a candidate list can be matched. */
async function columnsOf(sql: SqlRunner, qualified: string): Promise<Map<string, Column>> {
  const [schema, table] = qualified.replace(/"/g, "").split(".");
  const rows = await sql(
    `SELECT column_name, data_type FROM information_schema.columns ` +
      `WHERE table_schema = '${schema}' AND table_name = '${table}'`
  );
  const found = new Map<string, Column>();
  for (const line of rows.split("\n").map((r) => r.trim()).filter(Boolean)) {
    const [name, type] = line.split("|");
    found.set(name.toLowerCase(), { name, type: (type ?? "").toLowerCase() });
  }
  return found;
}

function find(columns: Map<string, Column>, candidates: string[]): Column | null {
  for (const candidate of candidates) {
    const hit = columns.get(candidate.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function pick(columns: Map<string, Column>, candidates: string[]): string | null {
  const column = find(columns, candidates);
  return column ? `"${column.name}"` : null;
}

/**
 * An address as `0x…`, lowercase, whatever the tool stored it as. Ponder keeps
 * hex in `bytea` and everyone else in a text column; comparing the two forms
 * directly would report every address as wrong for exactly one tool.
 */
function addressExpr(column: Column): string {
  return column.type === "bytea"
    ? `('0x' || encode("${column.name}", 'hex'))`
    : `lower("${column.name}"::text)`;
}

export class MissingSchema extends Error {}

/**
 * Reads one tool's tables.
 *
 * Resolution is cached and dropped on any failure, exactly as the throughput
 * suite's progress reader does it, because half these scenarios drop and
 * recreate the schema underneath us: a tool restarting after a kill, or an
 * envio `start -r`. A cached table name that no longer exists would turn a
 * successful recovery into a scenario-wide failure.
 */
export function observer(sql: SqlRunner) {
  let resolved: {
    transfer: {
      qualified: string;
      predicate: string;
      block: string;
      logIndex: string;
      amount: string;
      from: string;
      to: string;
    };
    account: { qualified: string; predicate: string; address: string; balance: string } | null;
    token: { qualified: string; predicate: string; symbol: string; name: string | null } | null;
  } | null = null;

  /**
   * The table backing one entity, or null when the tool has not written it.
   *
   * Resolved one entity at a time rather than all three together, because not
   * every project has all three. No-code rindexer has no facility for reading
   * contract state, so its schema has no token row and never will; a resolver
   * that failed the lot on one missing entity would turn that into an indexer
   * whose tables cannot be read at all, rather than two checks it cannot be
   * asked.
   */
  async function optionalTable(key: string) {
    const spec = RELIABILITY_CASE.entities.find((entity) => entity.key === key);
    if (!spec) return null;
    try {
      const [table] = await resolveEntityTables(sql, [spec]);
      return table ?? null;
    } catch {
      return null;
    }
  }

  async function resolve() {
    const transferSpec = RELIABILITY_CASE.entities.find((e) => e.key === "transfer")!;
    // The transfer table is the one entity every project must have: without it
    // there is nothing to compare against the chain.
    const [transferTable] = await resolveEntityTables(sql, [transferSpec]);
    if (!transferTable) throw new MissingSchema("no transfer table yet");
    const transferColumns = await columnsOf(sql, transferTable.qualified);
    const block = pick(transferColumns, COLUMNS.block);
    const logIndex = pick(transferColumns, COLUMNS.logIndex);
    const amount = pick(transferColumns, COLUMNS.amount);
    const fromColumn = find(transferColumns, COLUMNS.from);
    const toColumn = find(transferColumns, COLUMNS.to);
    if (!block || !logIndex || !amount || !fromColumn || !toColumn) {
      throw new MissingSchema(
        `the transfer table ${transferTable.qualified} is missing one of the block, ` +
          `log index, amount, from or to columns — every reliability project has to ` +
          `store all five`
      );
    }

    // The balance table is allowed to be absent in the same way the token
    // table is: a tool that has not written its first transfer has not created
    // it either, and a scenario that finds it missing when it should be there
    // says so as a failed check rather than as a crash.
    const accountTable = await optionalTable("account");
    let account = null;
    if (accountTable) {
      const accountColumns = await columnsOf(sql, accountTable.qualified);
      const addressColumn = find(accountColumns, COLUMNS.address);
      const balance = pick(accountColumns, COLUMNS.balance);
      if (addressColumn && balance) {
        account = {
          qualified: accountTable.qualified,
          predicate: accountTable.predicate,
          address: addressExpr(addressColumn),
          balance,
        };
      }
    }

    // The token table is allowed to be absent: a tool that has not yet made
    // its first contract read has not written it, and one scenario is
    // precisely about what happens when that read answers nothing.
    const tokenTable = await optionalTable("token");
    let token = null;
    if (tokenTable) {
      const tokenColumns = await columnsOf(sql, tokenTable.qualified);
      const symbol = pick(tokenColumns, COLUMNS.symbol);
      if (symbol) {
        token = {
          qualified: tokenTable.qualified,
          predicate: tokenTable.predicate,
          symbol,
          name: pick(tokenColumns, COLUMNS.name),
        };
      }
    }
    resolved = {
      transfer: {
        qualified: transferTable.qualified,
        predicate: transferTable.predicate,
        block,
        logIndex,
        amount,
        from: addressExpr(fromColumn),
        to: addressExpr(toColumn),
      },
      account,
      token,
    };
    return resolved;
  }

  async function withSchema<T>(read: (schema: NonNullable<typeof resolved>) => Promise<T>): Promise<T> {
    try {
      return await read(resolved ?? (await resolve()));
    } catch (err) {
      resolved = null;
      throw err;
    }
  }

  return {
    /** Forget the resolved schema, for a tool that is about to recreate it. */
    reset() {
      resolved = null;
    },

    /** Every transfer the tool currently holds, oldest first. */
    rows(): Promise<StoredRow[]> {
      return withSchema(async ({ transfer }) => {
        const out = await sql(
          `SELECT ${transfer.block}::text, ${transfer.logIndex}::text, ` +
            `(${transfer.amount}::numeric)::text, ${transfer.from}, ${transfer.to} ` +
            `FROM ${transfer.qualified}${whereClause(transfer.predicate)} ` +
            `ORDER BY ${transfer.block}::numeric, ${transfer.logIndex}::numeric`
        );
        return out
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [block, logIndex, amount, from, to] = line.split("|");
            return {
              block: Number(block),
              logIndex: Number(logIndex),
              amount: BigInt(amount || "0"),
              from: from ?? "",
              to: to ?? "",
            };
          });
      });
    },

    /** How many transfers, without paying for the rows. */
    count(): Promise<number> {
      return withSchema(async ({ transfer }) => {
        const out = await sql(
          `SELECT count(*)::text FROM ${transfer.qualified}${whereClause(transfer.predicate)}`
        );
        return Number(out.trim()) || 0;
      });
    },

    /** The highest block the tool has written a row for, or 0. */
    highestBlock(): Promise<number> {
      return withSchema(async ({ transfer }) => {
        const out = await sql(
          `SELECT coalesce(max(${transfer.block}::numeric), 0)::text ` +
            `FROM ${transfer.qualified}${whereClause(transfer.predicate)}`
        );
        return Number(out.trim()) || 0;
      });
    },

    /**
     * Balances as the tool holds them, keyed by lowercase address. An account
     * the tool no longer has a row for is absent rather than zero, which is
     * how a rolled-back reorg that deleted the row reads.
     */
    balances(): Promise<Map<string, bigint> | null> {
      return withSchema(async ({ account }) => {
        if (!account) return null;
        const out = await sql(
          `SELECT ${account.address}, (${account.balance}::numeric)::text ` +
            `FROM ${account.qualified}${whereClause(account.predicate)}`
        );
        const balances = new Map<string, bigint>();
        for (const line of out.split("\n").map((l) => l.trim()).filter(Boolean)) {
          const [address, balance] = line.split("|");
          balances.set(address, BigInt(balance || "0"));
        }
        return balances;
      });
    },

    /**
     * The token rows. An empty array means the table is not there yet, which
     * is a different finding from a row whose symbol is null, so the two are
     * never collapsed.
     */
    tokens(): Promise<StoredToken[]> {
      return withSchema(async ({ token }) => {
        if (!token) return [];
        // A null and the string "null" have to stay apart, so nulls are
        // labelled in SQL rather than guessed at from an empty line: psql
        // renders both a null and an empty string as nothing at all.
        const name = token.name ?? "NULL";
        const out = await sql(
          `SELECT CASE WHEN ${token.symbol} IS NULL THEN '<null>' ELSE ` +
            `'<v>' || ${token.symbol} END, ` +
            `CASE WHEN ${name} IS NULL THEN '<null>' ELSE '<v>' || ${name} END ` +
            `FROM ${token.qualified}${whereClause(token.predicate)}`
        );
        return out
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [symbol, tokenName] = line.split("|");
            const read = (cell: string | undefined) =>
              cell === undefined || cell === "<null>" ? null : cell.replace(/^<v>/, "");
            return { symbol: read(symbol), name: read(tokenName) };
          });
      });
    },
  };
}

export type Observer = ReturnType<typeof observer>;

/**
 * How an indexer's rows differ from the chain's, over the range the chain
 * covers. Rows above `upTo` are ignored rather than counted as extra: a tool
 * that is ahead of where the comparison was taken is not wrong, it is fast.
 */
export function diffRows(
  stored: StoredRow[],
  chain: { block: number; logIndex: number; amount: bigint }[],
  upTo: number
) {
  const key = (row: { block: number; logIndex: number }) => `${row.block}:${row.logIndex}`;
  const wanted = new Map(chain.filter((r) => r.block <= upTo).map((r) => [key(r), r.amount]));
  const held = new Map(stored.filter((r) => r.block <= upTo).map((r) => [key(r), r.amount]));

  const missing: string[] = [];
  const wrong: string[] = [];
  for (const [id, amount] of wanted) {
    const mine = held.get(id);
    if (mine === undefined) missing.push(id);
    else if (mine !== amount) wrong.push(`${id} holds ${mine}, chain says ${amount}`);
  }
  const extra = [...held.keys()].filter((id) => !wanted.has(id));
  // Duplicates cannot show up in the maps above — a second row with the same
  // block and log index overwrites the first — so they are counted separately.
  // A retried batch landing twice is exactly the failure the crash scenarios
  // are looking for, and it would otherwise read as a clean run.
  const duplicates = stored.filter((r) => r.block <= upTo).length - held.size;

  return { missing, wrong, extra, duplicates };
}


/**
 * The balances a list of transfers adds up to. The sender is debited and the
 * receiver credited, which is what every reliability project's handler does —
 * so an indexer holding the right transfers and the wrong balances has applied
 * some of them more than once, or failed to take one back.
 *
 * Accounts that net to zero are dropped, because an indexer is free to delete
 * such a row or keep it at zero and neither is wrong.
 */
export function balancesOf(
  rows: { from: string; to: string; amount: bigint }[]
): Map<string, bigint> {
  const balances = new Map<string, bigint>();
  const move = (address: string, delta: bigint) =>
    balances.set(address.toLowerCase(), (balances.get(address.toLowerCase()) ?? 0n) + delta);
  for (const row of rows) {
    move(row.from, -row.amount);
    move(row.to, row.amount);
  }
  for (const [address, balance] of balances) {
    if (balance === 0n) balances.delete(address);
  }
  return balances;
}

/** Accounts whose balance differs from what the chain's transfers imply. */
export function diffBalances(
  stored: Map<string, bigint>,
  expected: Map<string, bigint>
): string[] {
  const wrong: string[] = [];
  for (const [address, balance] of expected) {
    const mine = stored.get(address) ?? 0n;
    if (mine !== balance) wrong.push(`${address} holds ${mine}, chain implies ${balance}`);
  }
  for (const [address, balance] of stored) {
    if (balance !== 0n && !expected.has(address)) {
      wrong.push(`${address} holds ${balance}, chain implies 0`);
    }
  }
  return wrong;
}
