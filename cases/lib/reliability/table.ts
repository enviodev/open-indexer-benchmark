// The reliability table, and reading it back.
//
// Same shape and the same rules as the throughput tables in ../table.ts — rows
// are tools, a tool appears once per source, a run that produced no fresh
// result keeps its last published row rather than vanishing — because the two
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
export const DETAIL_PAGE = "./cases/reliability/README.md";

const NO_VALUE = "—";

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
  notes: string[];
  carriedOver?: boolean;
}

function formatValue(value: number, unit: string): string {
  if (unit === "ms") {
    return value < 1_000 ? `${Math.round(value)}ms` : `${(value / 1_000).toFixed(1)}s`;
  }
  if (unit === "s") return `${value < 10 ? value.toFixed(1) : value.toFixed(0)}s`;
  return value.toLocaleString("en-US");
}

/** "2 restarts", "1 restart", "no restarts" — the singular matters at a glance. */
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
  const notes: string[] = [];

  for (const group of GROUPS) {
    const scored = score.groups.find((g) => g.group === group.id);
    const tally: Tally = scored ?? { passed: 0, asked: 0 };
    cells[group.id] = scoreCell(group.id, tally, headlineOf(group.id, measures));

    if (tally.asked === 0) {
      const why = scored?.scenarios
        .flatMap((s) => s.skipped.map((skip) => skip.detail))
        .find(Boolean);
      notes.push(`${group.title} was not measured${why ? `: ${why}` : ""}`);
      continue;
    }
    if (tally.passed === 0) {
      const worst = scored?.scenarios.flatMap((s) => s.failures)[0];
      notes.push(
        `passed no ${group.title} check${worst ? `, starting with: ${worst.detail}` : ""}`
      );
    }
  }

  return {
    name: score.name,
    tool: `[${score.name}](${score.toolUrl})`,
    source: `[${score.source}](${score.sourceUrl})`,
    cells,
    overall: { passed: score.passed, asked: score.asked },
    overallCell:
      score.asked === 0 ? NO_VALUE : `**${score.passed} / ${score.asked}**`,
    notes,
  };
}

const HEAD = ["tool", "source", ...GROUPS.map((g) => g.title), "overall"];

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
    const marks: string[] = [];
    for (const note of row.notes) {
      notes.push(`**(${notes.length + 1})** ${row.name} — ${note}`);
      marks.push(String(notes.length));
    }
    const name = row.carriedOver ? `${row.tool} ⚠️` : row.tool;
    lines.push(
      `| ${[
        name,
        row.source,
        ...GROUPS.map((g) => row.cells[g.id] ?? NO_VALUE),
        `${row.overallCell}${marks.length > 0 ? ` (${marks.join(", ")})` : ""}`,
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
      )} — carried forward from a previous run; the latest run produced no fresh result.`
    );
  }
  return lines.join("\n");
}

/** Identifies a row across runs, the way the throughput tables do. */
export function reliabilityRowKey(row: Pick<ReliabilityRow, "name" | "source">): string {
  return `${row.name}|${linkText(row.source)}`;
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

    const label = cells[0].replace(/\s*⚠️\s*$/, "").trim();
    const name = linkText(label);
    if (!name) continue;
    // "**23 / 35** (1, 2)" — the note references belong to the run that
    // published them, and a carried row is re-numbered from its own notes, so
    // strip them before the cell is kept.
    const overallCell = cells[cells.length - 1].replace(/\s*\(\d+(?:,\s*\d+)*\)\s*$/, "");
    const tally = overallCell.replace(/\*/g, "").match(/(\d+)\s*\/\s*(\d+)/);

    rows.push({
      name,
      tool: label,
      source: cells[1],
      cells: Object.fromEntries(GROUPS.map((group, i) => [group.id, cells[2 + i]])),
      overall: tally
        ? { passed: Number(tally[1]), asked: Number(tally[2]) }
        : { passed: 0, asked: 0 },
      overallCell,
      // Notes are not carried: they were numbered against the table that
      // published them, and re-rendering would point them at other rows.
      notes: [],
    });
  }
  return rows;
}
