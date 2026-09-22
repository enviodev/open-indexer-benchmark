// An indexer the harness can be tested against.
//
// Every check in this suite is a claim that the harness would have noticed
// something. There is exactly one way to know that: point it at an indexer
// that really does the thing, and at one that really does not, and see which
// verdicts come back. Real indexers cannot be asked to misbehave on cue, so
// this one exists - a small, honest ERC-20 indexer with defects that can be
// switched on.
//
// It is a test double, not a benchmark subject. It never appears in a
// published table, it is never scored, and it is deliberately the simplest
// implementation that is correct: reads logs over RPC, tracks block hashes so
// it can tell a reorg happened, writes transfers, balances and the token row,
// and records a checkpoint. What makes it useful is the `defects` set:
//
//   no-reorg-handling   never checks whether the blocks it stored are still
//                       on the chain, the way an indexer that only ever
//                       appends behaves
//   checkpoint-ahead    records progress before the rows it covers are
//                       committed, so a crash loses exactly one batch
//   double-apply        applies a batch's balance changes twice on restart,
//                       the classic replay bug an append-only table hides
//   die-on-db-error     exits the moment a query fails, instead of retrying
//   no-sanitise         writes strings through unchanged, so a NUL byte in
//                       one reaches Postgres and fails the insert
//   asks-for-an-unserved-method
//                       reaches for a JSON-RPC method the generated chain does
//                       not implement, which stands for every real indexer
//                       that uses something nobody thought to mock
//   no-token-table      writes no token row at all, standing in for a project
//                       that cannot read contract state - a no-code rindexer
//                       project is exactly this, and the checks that read a
//                       token row have to come back unmeasured rather than
//                       failed, and rather than breaking every other read
//
// Each defect is meant to fail a specific check. scripts/test-reliability-
// harness.ts turns them on one at a time and asserts exactly that.

import type { DriverFactory, Snapshot } from "../../cases/lib/drivers/index.ts";
import { psql, sleep } from "../../cases/lib/process.ts";
import { START_BLOCK, TOKEN } from "./case.ts";

export type Defect =
  | "asks-for-an-unserved-method"
  | "no-token-table"
  | "no-reorg-handling"
  | "checkpoint-ahead"
  | "double-apply"
  | "die-on-db-error"
  | "no-sanitise";

export interface FakeOptions {
  /** Where it writes. A real database: the harness's SQL has to be exercised. */
  dbUrl: string;
  defects?: Defect[];
  /** Blocks per eth_getLogs request, halved whenever the endpoint refuses one. */
  batchBlocks?: number;
}

const SELECTOR_SYMBOL = "0x95d89b41";
const SELECTOR_NAME = "0x06fdde03";

/** Decodes an ABI-encoded string return, or null for empty returndata. */
function decodeString(data: string): string | null {
  const raw = data.replace(/^0x/, "");
  if (raw.length < 128) return null;
  const length = Number(BigInt(`0x${raw.slice(64, 128)}`));
  if (length === 0) return null;
  return Buffer.from(raw.slice(128, 128 + length * 2), "hex").toString("utf8");
}

export function fakeIndexer(options: FakeOptions): DriverFactory {
  const defects = new Set(options.defects ?? []);
  const { dbUrl } = options;

  return ({ rpcUrl }) => {
    let running = false;
    let exited = false;
    let checkpoint = START_BLOCK - 1;
    /**
     * Bumped by a kill, so writes already in flight are abandoned.
     *
     * A signal to a real process interrupts it wherever it is, including
     * between a statement being sent and the rows landing. This double runs
     * in the harness's own process, where nothing can interrupt an async
     * function mid-await, so the generation stands in for that: after a kill,
     * every write from the previous generation refuses to run. Without it a
     * "kill" is an orderly stop that finishes what it started, and a defect
     * that only shows when a batch is cut in half can never show at all.
     */
    let generation = 0;
    let batch = options.batchBlocks ?? 500;
    let loop: Promise<void> | null = null;

    const sql = (query: string) => psql(dbUrl, query);

    /** A write that a kill since `gen` cancels, the way a signal would. */
    function sqlAlive(gen: number, query: string): Promise<string> {
      if (gen !== generation) return Promise.reject(new Error("killed mid-batch"));
      return sql(query);
    }

    async function rpc(method: string, params: unknown[]): Promise<any> {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json();
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      return body.result;
    }

    const hex = (n: number) => `0x${n.toString(16)}`;

    /** Everything one batch writes, in one statement, so a crash is atomic. */
    async function writeBatch(
      logs: any[],
      upTo: number,
      { skipCheckpoint = false, hashRows = [] as string[], gen = generation } = {}
    ) {
      const values: string[] = [];
      const balances = new Map<string, bigint>();
      // A log is identified by its block and its index within it, and the
      // same one may arrive twice: a provider stitching two backends together
      // will serve it twice in one response. Deduplicating here rather than
      // relying on the primary key is the difference between a balance that
      // is right and one that is doubled - the insert absorbs the second row
      // and the arithmetic does not.
      const seen = new Set<string>();
      for (const log of logs) {
        const identity = `${BigInt(log.blockNumber)}-${BigInt(log.logIndex)}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const block = Number(BigInt(log.blockNumber));
        const logIndex = BigInt(log.logIndex).toString();
        const from = `0x${log.topics[1].slice(-40)}`;
        const to = `0x${log.topics[2].slice(-40)}`;
        const amount = BigInt(log.data);
        values.push(
          `('${block}-${logIndex}', ${block}, ${logIndex}, '${from}', '${to}', ${amount})`
        );
        // A double-apply counts the same movement twice, which a transfer
        // table cannot show and a balance can.
        const times = defects.has("double-apply") ? 2n : 1n;
        balances.set(from, (balances.get(from) ?? 0n) - amount * times);
        balances.set(to, (balances.get(to) ?? 0n) + amount * times);
      }

      const statements: string[] = ["BEGIN"];
      if (hashRows.length > 0) {
        statements.push(
          `INSERT INTO block (number, hash) VALUES ${hashRows.join(",")} ` +
            `ON CONFLICT (number) DO UPDATE SET hash = EXCLUDED.hash`
        );
      }
      if (values.length > 0) {
        statements.push(
          `INSERT INTO transfer (id, block_number, log_index, "from", "to", amount) ` +
            `VALUES ${values.join(",")} ON CONFLICT (id) DO NOTHING`
        );
        const balanceValues = [...balances]
          .map(([address, delta]) => `('${address}', ${delta})`)
          .join(",");
        statements.push(
          `INSERT INTO account (id, balance) VALUES ${balanceValues} ` +
            `ON CONFLICT (id) DO UPDATE SET balance = account.balance + EXCLUDED.balance`
        );
      }
      if (!skipCheckpoint) statements.push(`UPDATE progress SET block = ${upTo}`);
      statements.push("COMMIT");
      await sqlAlive(gen, statements.join("; "));
    }

    /**
     * Undo everything above a height. An indexer without reorg handling skips
     * this entirely, which is the defect.
     */
    async function rollbackTo(height: number) {
      if (defects.has("no-reorg-handling")) return;
      await sql(
        [
          "BEGIN",
          // Balances are rebuilt from the transfers that survive rather than
          // decremented, which is the simplest thing that is definitely right.
          `DELETE FROM transfer WHERE block_number > ${height}`,
          `DELETE FROM block WHERE number > ${height}`,
          "DELETE FROM account",
          `INSERT INTO account (id, balance) ` +
            `SELECT id, sum(delta) FROM (` +
            `SELECT "from" AS id, -amount AS delta FROM transfer ` +
            `UNION ALL SELECT "to", amount FROM transfer) m GROUP BY id`,
          `UPDATE progress SET block = ${height}`,
          "COMMIT",
        ].join("; ")
      );
      checkpoint = height;
    }

    /**
     * Walk back until the stored hash matches the chain, which is how an
     * indexer notices a reorg - including one that happened while it was not
     * running, which is why the hashes are in the database rather than in
     * memory. An indexer that keeps them only in memory cannot tell, after a
     * restart, that the chain moved under it.
     */
    async function reconcile(): Promise<void> {
      if (defects.has("no-reorg-handling")) return;
      let height = checkpoint;
      while (height >= START_BLOCK) {
        const stored = (
          await sql(`SELECT hash FROM block WHERE number = ${height}`)
        ).trim();
        if (!stored) break;
        const live = await rpc("eth_getBlockByNumber", [hex(height), false]);
        if (live && live.hash === stored) break;
        height--;
      }
      if (height < checkpoint) await rollbackTo(height);
    }

    async function readToken() {
      if (defects.has("no-token-table")) return;
      const call = async (selector: string) =>
        rpc("eth_call", [{ to: TOKEN, data: selector }, "latest"]).catch(() => "0x");
      const symbol = decodeString(await call(SELECTOR_SYMBOL));
      const raw = decodeString(await call(SELECTOR_NAME));
      // Postgres will not store a NUL in a text column. Stripping it is the
      // correct behaviour; the defect writes it through and the insert fails.
      const name =
        raw === null
          ? null
          : defects.has("no-sanitise")
            ? raw
            : raw.replace(new RegExp(String.fromCharCode(0), "g"), "");
      const quoted = (value: string | null) =>
        value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
      await sql(
        `INSERT INTO token (id, symbol, name) VALUES ('${TOKEN}', ${quoted(symbol)}, ` +
          `${quoted(name)}) ON CONFLICT (id) DO UPDATE SET symbol = EXCLUDED.symbol, ` +
          `name = EXCLUDED.name`
      );
    }

    async function step(gen = generation) {
      const head = Number(BigInt(await rpc("eth_blockNumber", [])));
      if (head <= checkpoint) {
        // The head moved backwards, or has not moved. A replica answering from
        // behind is not a reorg, so nothing is undone on the strength of it.
        return;
      }
      await reconcile();

      const from = checkpoint + 1;
      const to = Math.min(head, from + batch - 1);
      let logs: any[];
      try {
        logs = await rpc("eth_getLogs", [
          { fromBlock: hex(from), toBlock: hex(to), address: TOKEN },
        ]);
      } catch (err) {
        const message = String((err as Error).message);
        // The two caps a public endpoint imposes. Both say the same thing:
        // ask for less.
        if (/max block range|more than \d+ results/.test(message) && batch > 1) {
          batch = Math.max(1, Math.floor(batch / 2));
          return;
        }
        throw err;
      }

      // Remember the hashes of the blocks just covered, so a later pass can
      // tell whether they are still on the chain. Written in the same
      // transaction as the rows, so the two can never disagree after a crash.
      const hashRows: string[] = [];
      for (let height = from; height <= to; height++) {
        const block = await rpc("eth_getBlockByNumber", [hex(height), false]);
        if (block) hashRows.push(`(${height}, '${block.hash}')`);
      }

      await writeBatch(logs, to, { hashRows, gen });
      checkpoint = to;
      if (logs.length > 0 && batch < (options.batchBlocks ?? 500)) {
        // Widen again once the endpoint stops refusing, so a transient cap
        // does not become a permanent cost.
        batch = Math.min(options.batchBlocks ?? 500, batch * 2);
      }
    }

    /**
     * The indexing loop, bound to the generation it was started in.
     *
     * The binding is what makes a kill final. Setting `running` to false only
     * stops the next iteration, and the loop that was mid-flight when it was
     * killed would wake from its retry sleep to find `running` true again
     * after the restart - two loops indexing the same chain into the same
     * database, which shows up as every balance applied twice. A process that
     * is killed does not come back when its replacement starts.
     */
    async function run(gen: number) {
      if (defects.has("asks-for-an-unserved-method")) {
        // Stands in for an indexer that uses a method the mock never learned.
        // What matters is not that this call fails - it is that every verdict
        // in the scenario becomes unmeasured, because the benchmark cannot
        // mark a tool down for a question it could not answer.
        await rpc("eth_newFilter", [{}]).catch(() => {});
      }
      try {
        await readToken();
      } catch {
        // The token read is not what keeps an indexer alive.
      }
      while (running && gen === generation) {
        try {
          if (defects.has("checkpoint-ahead")) {
            // Progress is recorded before the rows it covers, so a crash
            // between the two loses a batch nothing will come back for. The
            // range is worked out first: moving the checkpoint and then
            // reading from it would leave nothing to fetch at all, which is a
            // broken double rather than a defective indexer.
            const head = Number(BigInt(await rpc("eth_blockNumber", [])));
            const from = checkpoint + 1;
            const to = Math.min(head, checkpoint + batch);
            if (to >= from) {
              await sqlAlive(gen, `UPDATE progress SET block = ${to}`);
              checkpoint = to;
              const logs = await rpc("eth_getLogs", [
                { fromBlock: hex(from), toBlock: hex(to), address: TOKEN },
              ]);
              // Long enough that a kill is very likely to land between the
              // checkpoint and the rows it claims to cover. A real indexer's
              // window is microseconds wide and is met by running for hours;
              // a test that has to be met in one run of one scenario has to
              // widen it, or it is testing the harness's luck rather than its
              // checks.
              await sleep(1_000);
              await writeBatch(logs, to, { skipCheckpoint: true, gen });
            }
          } else {
            await step(gen);
          }
        } catch (err) {
          if (defects.has("die-on-db-error") && /psql|connection/i.test(String(err))) {
            if (process.env.RELIABILITY_DEBUG) console.error(`  [fake] dying: ${err}`);
            running = false;
            exited = true;
            return;
          }
          // Everything else is retried, which is what an indexer pointed at a
          // flaky endpoint has to do. A retry loop that hides why it is
          // retrying is miserable to debug, and this double exists to be
          // debugged, so the reason is available on request.
          if (process.env.RELIABILITY_DEBUG) console.error(`  [fake] ${err}`);
          await sleep(1_000);
        }
        await sleep(200);
      }
    }

    return {
      dbUrl,
      async prepare() {
        await sql(
          [
            "DROP TABLE IF EXISTS transfer, account, token, progress, block",
            `CREATE TABLE transfer (id text PRIMARY KEY, block_number bigint, ` +
              `log_index numeric, "from" text, "to" text, amount numeric)`,
            "CREATE TABLE account (id text PRIMARY KEY, balance numeric)",
            ...(defects.has("no-token-table")
              ? []
              : ["CREATE TABLE token (id text PRIMARY KEY, symbol text, name text)"]),
            "CREATE TABLE progress (block bigint)",
            "CREATE TABLE block (number bigint PRIMARY KEY, hash text)",
            `INSERT INTO progress (block) VALUES (${START_BLOCK - 1})`,
          ].join("; ")
        );
        checkpoint = START_BLOCK - 1;
        batch = options.batchBlocks ?? 500;
        exited = false;
      },
      async launch() {
        // The checkpoint is read back rather than assumed, so a relaunch after
        // a kill resumes where the database says it got to.
        const stored = await sql("SELECT block::text FROM progress").catch(() => "");
        checkpoint = Number(stored.trim()) || START_BLOCK - 1;
        // A new generation, so any loop left over from a kill stops rather
        // than resuming alongside this one.
        generation++;
        running = true;
        exited = false;
        loop = run(generation);
      },
      async snapshot(): Promise<Snapshot> {
        const [count, block] = (
          await sql(
            "SELECT (SELECT count(*) FROM transfer)::text, " +
              "(SELECT coalesce(max(block), 0) FROM progress)::text"
          )
        ).split("|");
        return {
          events: Number(count) || 0,
          blocks: Math.max(0, (Number(block) || 0) - START_BLOCK),
        };
      },
      async stop() {
        running = false;
        await loop?.catch(() => {});
        loop = null;
        exited = true;
      },
      async cleanup() {},
      /**
       * SIGKILL stops the loop where it stands, with no chance to finish the
       * statement in flight - which is what a real kill does, and what the
       * checkpoint-ahead defect needs in order to lose anything. SIGTERM lets
       * the current pass finish first.
       */
      async signal(signal) {
        if (signal === "SIGKILL") {
          running = false;
          exited = true;
          loop = null;
          // Anything not yet sent is abandoned…
          generation++;
          // …and anything already sent is aborted. A real kill closes the
          // socket, which rolls back the transaction on it. Letting it commit
          // instead leaves rows the restarted process does not know it has,
          // and applies them a second time - a bug in the double that reads
          // exactly like the bug the scenario hunts for.
          await sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity " +
              "WHERE datname = current_database() AND pid <> pg_backend_pid()"
          ).catch(() => {});
          return true;
        }
        running = false;
        await loop?.catch(() => {});
        loop = null;
        exited = true;
        return true;
      },
      exited: () => exited,
    };
  };
}
