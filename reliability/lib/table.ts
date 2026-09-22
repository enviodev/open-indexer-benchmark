// The reliability table, and reading it back.
//
// Same shape and the same rules as the throughput tables in
// ../../cases/lib/table.ts - rows
// are tools, a tool appears once per source, a run that produced no fresh
// result keeps its last published row rather than vanishing - because the two
// tables sit on the same page and a reader should not have to learn them
// separately. What differs is what a cell holds. There, a cell is a
// measurement. Here it is "4 / 6": the checks a tool passed over the checks it
// was asked. That is only honest if the six are one click away, so every cell
// is a link into the scenario page that lists them.
//
// Each group cell may also carry one number the score cannot express: how many
// times a tool had to be restarted by hand, how far behind the head it runs.
// The score says whether the tool passed; the number says what living with it
// costs.

import { GROUPS, SCENARIOS } from "./scenarios.ts";
import { tallyRank, type Tally, type ToolScore } from "./score.ts";

/** Where a score links to, relative to the repository README. */
export const DETAIL_PAGE = "./reliability/README.md";

const NO_VALUE = "—";

/**
 * A note and the cell it is about.
 *
 * The reference number goes on that cell rather than on the overall tally: a
 * reader following "(3)" from the end of the row has to work out which of six
 * columns it was about, and the one thing the note exists to say is which.
 * Notes with no group are about the row itself - a tool nothing ran for - and
 * those do go on the overall cell, because that is what they are about.
 */
export interface ReliabilityNote {
  /** The group whose cell carries the reference, or the row when absent. */
  group?: string;
  text: string;
}

export interface ReliabilityRow {
  name: string;
  /** Markdown link to the tool's project page. */
  tool: string;
  /** Markdown link to the source the reliability run read through. */
  source: string;
  /** Rendered cell per group id. */
  cells: Record<string, string>;
  /** Passes over asks across the whole suite; asked 0 means nothing ran. */
  overall: Tally;
  overallCell: string;
  /** Numbered notes this row earned: a dash to explain, or a nil to name. */
  notes: ReliabilityNote[];
  carriedOver?: boolean;
}

function formatValue(value: number, unit: string): string {
  if (unit === "ms") {
    return value < 1_000 ? `${Math.round(value)}ms` : `${(value / 1_000).toFixed(1)}s`;
  }
  if (unit === "s") return `${value < 10 ? value.toFixed(1) : value.toFixed(0)}s`;
  return value.toLocaleString("en-US");
}

/** "2 restarts", "1 restart", "no restarts" - the singular matters at a glance. */
function formatHeadline(value: number, unit: string, abbr?: string): string {
  if (!abbr) return formatValue(value, unit);
  if (value === 0) return `no ${abbr}`;
  const word = value === 1 && abbr.endsWith("s") ? abbr.slice(0, -1) : abbr;
  return `${formatValue(value, unit)} ${word}`;
}

/** The headline measure of a group, if the run reported one. */
function headlineOf(group: string, measures: Record<string, number>): string | null {
  for (const scenario of SCENARIOS) {
    if (scenario.group !== group) continue;
    for (const measure of scenario.measures ?? []) {
      if (!measure.headline) continue;
      const value = measures[measure.id];
      if (value === undefined) continue;
      return formatHeadline(value, measure.unit, measure.abbr);
    }
  }
  return null;
}

function scoreCell(group: string, tally: Tally, headline: string | null): string {
  const link = `${DETAIL_PAGE}#${group}`;
  if (tally.asked === 0) return `[${NO_VALUE}](${link})`;
  return `[${tally.passed} / ${tally.asked}${headline ? ` · ${headline}` : ""}](${link})`;
}

/**
 * Build one row from a scored tool.
 *
 * Notes are deliberately sparse. A cell below full marks is explained on the
 * page it links to, in the words of the check it failed; repeating all of that
 * under the table would bury the table. What earns a note is the two things a
 * reader cannot infer from a number: a dash, which is an absence rather than a
 * result, and a zero, which is a tool that failed a whole column and deserves
 * to be told apart from one that scraped through it.
 */
export function toReliabilityRow(
  score: ToolScore,
  measures: Record<string, number>
): ReliabilityRow {
  const cells: Record<string, string> = {};
  const notes: ReliabilityNote[] = [];

  for (const group of GROUPS) {
    const scored = score.groups.find((g) => g.group === group.id);
    const tally: Tally = scored ?? { passed: 0, asked: 0 };
    cells[group.id] = scoreCell(group.id, tally, headlineOf(group.id, measures));

    if (tally.asked === 0) {
      const why = scored?.scenarios
        .flatMap((s) => s.skipped.map((skip) => skip.detail))
        .find(Boolean);
      notes.push({
        group: group.id,
        text: `${group.title} was not measured${why ? `: ${why}` : ""}`,
      });
      continue;
    }

    // Every cell below full marks says why, check by check. A reader looking
    // at "5 / 6" should not have to open another page to learn which one, and
    // a check that was never asked is part of that answer too: it is missing
    // from the denominator, which is invisible in the cell.
    const failures = scored?.scenarios.flatMap((s) => s.failures) ?? [];
    const skipped = scored?.scenarios.flatMap((s) => s.skipped) ?? [];
    if (failures.length > 0 || skipped.length > 0) {
      notes.push({
        group: group.id,
        text: [
          ...byReason(failures).map(([labels, why]) => `${labels} - ${why}`),
          ...byReason(skipped).map(([labels, why]) => `${labels} was not asked - ${why}`),
        ].join("; "),
      });
    }
  }

  return {
    name: score.name,
    tool: `[${score.name}](${score.toolUrl})`,
    source: sourceCell(score.source),
    cells,
    overall: { passed: score.passed, asked: score.asked },
    overallCell:
      score.asked === 0 ? NO_VALUE : `**${score.passed} / ${score.asked}**`,
    notes,
  };
}

/**
 * Checks grouped by the reason they give, so a column that failed ten ways for
 * one reason says the reason once. A tool that exited when its database went
 * away fails every check in the group with that same sentence, and repeating
 * it ten times buries the one time it differs.
 */
function byReason(
  checks: { label: string; detail: string }[]
): [labels: string, reason: string][] {
  const byDetail = new Map<string, string[]>();
  for (const check of checks) {
    byDetail.set(check.detail, [...(byDetail.get(check.detail) ?? []), check.label]);
  }
  return [...byDetail].map(([detail, labels]) => [
    labels.map((label) => `**${label}**`).join(", "),
    detail,
  ]);
}

/**
 * What a tool read through, linked to what that means here.
 *
 * The throughput tables link a source to the provider behind it, because there
 * a source is a product and its speed is the thing being measured. Here every
 * run reads the same generated chain over plain JSON-RPC, and linking it to a
 * provider would claim a measurement of that provider which nobody made. The
 * link goes to the page that says what the chain is instead.
 */
function sourceCell(source: string): string {
  return source === "—" ? source : `[${source}](${SOURCE_URL})`;
}

/**
 * The row published for a tool the suite does not run, with the reason.
 *
 * A tool missing from a table is indistinguishable from a tool whose job
 * failed, and the reasons here are worth reading: some are facts about the
 * benchmark that will not change - a source that cannot be made to reorg on
 * request - and some are work not yet done. Either way the row is present and
 * says which.
 */
export function unrunRow(
  tool: { name: string; toolUrl: string; source: string; sourceUrl: string },
  reason: string
): ReliabilityRow {
  return {
    name: tool.name,
    tool: `[${tool.name}](${tool.toolUrl})`,
    source: sourceCell(tool.source),
    cells: Object.fromEntries(GROUPS.map((group) => [group.id, NO_VALUE])),
    overall: { passed: 0, asked: 0 },
    overallCell: NO_VALUE,
    notes: [{ text: reason }],
  };
}

/** Where the source column points: what the generated chain is, and why. */
const SOURCE_URL =
  "./reliability/README.md#why-a-generated-chain-and-not-a-real-node";

/** The key a row-level note is filed under, which no group uses. */
const OVERALL = "overall";

const HEAD = ["tool", "source", ...GROUPS.map((g) => g.title), OVERALL];

export function buildReliabilityTable(rows: ReliabilityRow[]): string {
  if (rows.length === 0) return "_No reliability results collected._";

  // Best share first, then most checks passed. A row nothing ran for sorts
  // last: ranking an absence among results would be meaningless either way it
  // went, and tallyRank gives it a share of -1 to keep it there.
  const sorted = [...rows].sort((a, b) => {
    const [shareA, passedA] = tallyRank(a.overall);
    const [shareB, passedB] = tallyRank(b.overall);
    return shareB - shareA || passedB - passedA;
  });

  const lines = [
    `| ${HEAD.join(" | ")} |`,
    `| ${HEAD.map(() => "---").join(" | ")} |`,
  ];
  const notes: string[] = [];
  for (const row of sorted) {
    /** Reference numbers by the cell that carries them. */
    const marks = new Map<string, string[]>();
    for (const note of row.notes) {
      notes.push(`**(${notes.length + 1})** ${row.name} - ${note.text}`);
      const on = note.group ?? OVERALL;
      marks.set(on, [...(marks.get(on) ?? []), String(notes.length)]);
    }
    const mark = (cell: string, on: string) => {
      const refs = marks.get(on);
      return refs ? `${cell} (${refs.join(", ")})` : cell;
    };
    const name = row.carriedOver ? `${row.tool} ⚠️` : row.tool;
    lines.push(
      `| ${[
        name,
        row.source,
        ...GROUPS.map((g) => mark(row.cells[g.id] ?? NO_VALUE, g.id)),
        mark(row.overallCell, OVERALL),
      ].join(" | ")} |`
    );
  }
  if (notes.length > 0) lines.push("", ...notes.map((note) => `> ${note}`));

  const carried = sorted.filter((row) => row.carriedOver).map((row) => row.name);
  if (carried.length > 0) {
    lines.push(
      "",
      `> ⚠️ ${carried.join(
        ", "
      )} - carried forward from a previous run; the latest run produced no fresh result.`
    );
  }
  return lines.join("\n");
}

/** Identifies a row across runs, the way the throughput tables do. */
export function reliabilityRowKey(row: Pick<ReliabilityRow, "name" | "source">): string {
  return `${row.name}|${linkText(row.source)}`;
}

/** A cell without the reference numbers the run that published it added. */
function stripMarks(cell: string): string {
  return cell.replace(/\s*\(\d+(?:,\s*\d+)*\)\s*$/, "").trim();
}

function linkText(cell: string): string {
  return (cell.match(/^\[([^\]]+)\]/)?.[1] ?? cell).trim();
}

export const RELIABILITY_START = "<!-- RELIABILITY:START -->";
export const RELIABILITY_END = "<!-- RELIABILITY:END -->";

/**
 * Read back a table this module rendered, so a tool whose reliability job
 * failed keeps its last published row. Cells are preserved verbatim; only the
 * overall tally is parsed, and only to sort by.
 */
export function parsePublishedReliability(markdown: string): ReliabilityRow[] {
  const start = markdown.indexOf(RELIABILITY_START);
  const end = markdown.indexOf(RELIABILITY_END);
  if (start === -1 || end === -1 || end < start) return [];
  const body = markdown.slice(start + RELIABILITY_START.length, end);

  const rows: ReliabilityRow[] = [];
  for (const line of body.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < HEAD.length) continue;
    if (cells[0] === HEAD[0] || /^-+$/.test(cells[1] ?? "")) continue;

    // The mark says this row was already being carried when it was published,
    // and stripping it without keeping it would re-render a stale row as a
    // fresh one - the row would quietly become a result of the latest run.
    const carriedOver = /⚠️\s*$/.test(cells[0]);
    const label = cells[0].replace(/\s*⚠️\s*$/, "").trim();
    const name = linkText(label);
    if (!name) continue;
    // "**23 / 35** (1, 2)" - the note references belong to the run that
    // published them, and a carried row is re-numbered from its own notes, so
    // they are stripped from every cell that carries one before it is kept.
    const overallCell = stripMarks(cells[cells.length - 1]);
    const tally = overallCell.replace(/\*/g, "").match(/(\d+)\s*\/\s*(\d+)/);

    rows.push({
      name,
      tool: label,
      source: cells[1],
      cells: Object.fromEntries(
        GROUPS.map((group, i) => [group.id, stripMarks(cells[2 + i])])
      ),
      overall: tally
        ? { passed: Number(tally[1]), asked: Number(tally[2]) }
        : { passed: 0, asked: 0 },
      overallCell,
      carriedOver,
      // Notes are not carried: they were numbered against the table that
      // published them, and re-rendering would point them at other rows.
      notes: [],
    });
  }
  return rows;
}
