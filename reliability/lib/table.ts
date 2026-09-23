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
  /** What broke, one line each, in the words of somebody living with the tool. */
  failing: string[];
  /** What the run could not ask, and why - kept apart because it is not a finding. */
  unmeasured: string[];
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

/** The headline measure of a group, if the run reported one, and its tags. */
function headlineOf(group: string, measures: Record<string, number>): string | null {
  const inGroup = SCENARIOS.filter((scenario) => scenario.group === group).flatMap(
    (scenario) => scenario.measures ?? []
  );
  const headline = inGroup.find(
    (measure) => measure.headline && measures[measure.id] !== undefined
  );
  if (!headline) return null;
  const tags = inGroup
    .filter((measure) => measure.tag && measures[measure.id] === 1)
    .map((measure) => measure.tag);
  return [formatHeadline(measures[headline.id], headline.unit, headline.abbr), ...tags].join(", ");
}

/**
 * The tally, with a tick after it on the columns a tool passed whole.
 *
 * Reading a row of "10/10, 6/6, 8/10" means dividing five fractions to find
 * the one that is not one. The tick does that division for the reader, so the
 * fractions left bare are the findings - but the count stays, because "8/10"
 * next to a tick says nothing about how much was asked unless the tick says it
 * too. The count comes first so the column reads as a column of counts, and
 * the tick after it lines up with the bold tallies of the columns that fell
 * short rather than pushing them out of alignment.
 *
 * The link lives on the column heading rather than in every cell: the same URL
 * seven times a column is most of the table's width and none of its meaning.
 */
function scoreCell(tally: Tally, headline: string | null): string {
  // Bracketed, because it is not part of the score: "10/11 2 restarts" reads
  // as one number said twice, where "10/11 (2 restarts)" reads as a score and
  // a thing worth knowing about living with it.
  const measure = headline ? ` (${headline})` : "";
  if (tally.asked === 0) return NO_VALUE;
  const count = `${tally.passed}/${tally.asked}`;
  if (tally.passed === tally.asked) return `${count} ✅${measure}`;
  return `**${count}**${measure}`;
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
    cells[group.id] = scoreCell(tally, headlineOf(group.id, measures));

    if (tally.asked === 0) {
      const why = scored?.scenarios
        .flatMap((s) => s.skipped.map((skip) => skip.detail))
        .find(Boolean);
      notes.push({
        group: group.id,
        failing: [],
        unmeasured: [why ? `not tested: ${why}` : "not tested"],
      });
      continue;
    }

    // Every cell below full marks says what broke, in the words of somebody
    // who has to live with it rather than the words of the assertion. A
    // reader looking at "5 / 6" should not have to open another page to learn
    // which one, and a check that was never asked belongs here too: it is
    // missing from the denominator, which is invisible in the cell.
    const failures = scored?.scenarios.flatMap((s) => s.failures) ?? [];
    const skipped = scored?.scenarios.flatMap((s) => s.skipped) ?? [];
    if (failures.length > 0 || skipped.length > 0) {
      notes.push({
        group: group.id,
        failing: unique(failures.map(phraseFor)),
        unmeasured: unique(skipped.map((skip) => `not tested: ${skip.label}`)),
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
 * A fresh row, with every column its run did not report filled from the row
 * the table last published.
 *
 * CI runs one job per tool per column, and a job can fail on its own. Left
 * alone, the tool's other columns would publish and the failed one would read
 * as a dash - an absence dressed as a result, replacing a real one. So the last
 * published cell stands in, marked, and its tally counts towards the overall
 * again. Only a column nothing reported is filled: one the run reached and
 * could not measure is a result of this run, dash and all.
 */
export function fillUnreportedColumns(
  fresh: ReliabilityRow,
  prior: ReliabilityRow,
  reported: ReadonlySet<string>
): ReliabilityRow {
  const cells = { ...fresh.cells };
  let notes = [...fresh.notes];
  let { passed, asked } = fresh.overall;
  for (const group of GROUPS) {
    if (reported.has(group.id)) continue;
    const last = (prior.cells[group.id] ?? NO_VALUE).replace(/\s*⚠️\s*$/, "");
    const tally = last.replace(/\*/g, "").match(/(\d+)\s*\/\s*(\d+)/);
    if (!tally) continue;
    cells[group.id] = `${last} ⚠️`;
    passed += Number(tally[1]);
    asked += Number(tally[2]);
    notes = notes.filter((note) => note.group !== group.id);
    notes.push({
      group: group.id,
      failing: [],
      unmeasured: ["not reported by this run; the cell is the last published result"],
    });
  }
  return {
    ...fresh,
    cells,
    notes,
    overall: { passed, asked },
    overallCell: asked === 0 ? NO_VALUE : `**${passed} / ${asked}**`,
  };
}

/**
 * What a failed check says under the table, and whether it said it every time.
 *
 * A check that failed on some repeats and not others is not a finding about
 * the tool, it is a finding about the harness: something in it is timing
 * dependent. Averaging that into a flat sentence is how a broken case gets
 * missed, so the count travels with the phrase and whoever reads the table
 * can see there is a race to go and fix.
 */
function phraseFor(failure: { failing: string; detail: string }): string {
  const some = /\(failed (\d+) of (\d+) runs\)/.exec(failure.detail);
  return some ? `${failure.failing} (only ${some[1]} of ${some[2]} runs)` : failure.failing;
}

/**
 * "Missing data: rows lost when the database restarts" with the impact in
 * bold, so a reader scanning a column of failures sees what kind each one is
 * before reading what set it off. A phrase without an impact prefix is left
 * as it is rather than guessed at.
 */
function impactFirst(phrase: string): string {
  const colon = phrase.indexOf(": ");
  if (colon <= 0) return phrase;
  return `**${phrase.slice(0, colon)}**: ${phrase.slice(colon + 2)}`;
}

/** In order, without repeats: two checks failing the same way say it once. */
function unique(values: string[]): string[] {
  return [...new Set(values)];
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
  return source;
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
    notes: [{ failing: [], unmeasured: [reason] }],
  };
}

/** Where the source column points: what the generated chain is, and why. */
const SOURCE_URL =
  "./reliability/README.md#why-a-generated-chain-and-not-a-real-node";

/** The key a row-level note is filed under, which no group uses. */
const OVERALL = "overall";

/**
 * The column headings carry the links, once each, rather than every cell
 * carrying the same one.
 */
const HEAD = [
  "tool",
  `[source](${SOURCE_URL})`,
  ...GROUPS.map((g) => `[${g.title}](${DETAIL_PAGE}#${g.id})`),
  OVERALL,
];

export function buildReliabilityTable(rows: ReliabilityRow[]): string {
  if (rows.length === 0) return "_No reliability results collected._";

  // Most checks passed first, then the share of what each was asked. A row
  // nothing ran for sorts last: ranking an absence among results would be
  // meaningless either way it went, and tallyRank gives it a share of -1.
  const sorted = [...rows].sort((a, b) => {
    const [passedA, shareA] = tallyRank(a.overall);
    const [passedB, shareB] = tallyRank(b.overall);
    return passedB - passedA || shareB - shareA;
  });

  const lines = [
    `| ${HEAD.join(" | ")} |`,
    `| ${HEAD.map(() => "---").join(" | ")} |`,
  ];
  /**
   * One collapsed block under the table for every tool's failures, so the
   * table stays where the eye lands and the reasons are one click away.
   *
   * Inside, a tool, its columns, and every failure in the column - nothing
   * cut, since nothing below the table is in the way of anything. Each
   * failure leads with what it costs whoever runs the tool, in bold, from a
   * short fixed vocabulary - Missing data, Wrong balances, Stops indexing -
   * so a reader scanning the block learns the kinds once and reads the
   * triggers after them. What a run could not test is in italics beside the
   * failures, because a cell's denominator is shorter by it and the cell
   * cannot say so. Tools that fail nothing are not in the block.
   */
  const entries: string[] = [];
  let failingTotal = 0;
  let toolsFailing = 0;
  for (const row of sorted) {
    const name = row.carriedOver ? `${row.tool} ⚠️` : row.tool;
    lines.push(
      `| ${[
        name,
        row.source,
        ...GROUPS.map((g) => row.cells[g.id] ?? NO_VALUE),
        row.overallCell,
      ].join(" | ")} |`
    );
    if (row.notes.length === 0) continue;
    if (row.notes.some((note) => note.failing.length > 0)) toolsFailing++;

    // A note about the row rather than a column - a tool nothing ran for - is
    // one sentence beside the tool's name.
    if (row.notes.every((note) => !note.group)) {
      const said = row.notes.flatMap((note) => [...note.failing, ...note.unmeasured]);
      entries.push(`- **${row.name}** - <i>${said.join("; ")}</i>`);
      continue;
    }

    entries.push(`- **${row.name}**`);
    for (const note of row.notes) {
      failingTotal += note.failing.length;
      const items = [
        ...note.failing.map(impactFirst),
        ...note.unmeasured.map((item) => `<i>${item}</i>`),
      ];
      if (items.length === 0) continue;
      const group = GROUPS.find((g) => g.id === note.group);
      if (!group) {
        entries.push(...items.map((item) => `  - ${item}`));
        continue;
      }
      entries.push(`  - *${group.title}*`, ...items.map((item) => `    - ${item}`));
    }
  }

  const notes: string[] = [];
  if (entries.length > 0) {
    // Counted over the tools that failed something: a tool nothing ran for
    // is in the list, but "3 failing checks across 7 tools" would spread
    // three findings over five tools that had none.
    const count =
      failingTotal > 0
        ? `${failingTotal} failing ${failingTotal === 1 ? "check" : "checks"} across ` +
          `${toolsFailing} ${toolsFailing === 1 ? "tool" : "tools"}`
        : rows.every((row) => row.overall.asked === 0)
          ? "no results published yet"
          : "nothing failed; some checks were not tested";
    // GitHub renders markdown inside <details> only with a blank line after
    // the summary and before the close; without them the list comes out as
    // one run-on paragraph of dashes.
    notes.push(
      "<details>",
      `<summary>What failed, and what it means for you - ${count}</summary>`,
      "",
      ...entries,
      "",
      "</details>"
    );
  }
  while (notes.at(-1) === "") notes.pop();
  if (notes.length > 0) lines.push("", ...notes);

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
