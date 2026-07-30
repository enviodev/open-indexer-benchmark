// Result table rendering, shared by the local benchmark runner and the CI
// summary job so both publish an identical format.
//
// Rows are indexers and columns are metrics: a benchmark gains metrics far
// more often than it gains indexers, and only this orientation has room to
// grow.

export interface ResultCells {
  /** Markdown link to the tool's project page. */
  tool: string;
  /** Markdown link to the data source the tool ingests from. */
  source: string;
  blocks: string;
  events: string;
  /** Status marker only — "✅", "❌" or "❓". */
  correctness: string;
  /** Why it is not ✅, rendered as a numbered note under the table. */
  correctnessDetail: string;
  dbSize: string;
}

export interface TableRow {
  /** Display name. Not unique — the same tool appears once per data source. */
  name: string;
  /** Sort key; also drives the "vs best" column. */
  eventsPerSec: number;
  cells: ResultCells;
  /** True when re-published from the README because this run produced none. */
  carriedOver?: boolean;
}

/**
 * Identifies a row across runs. The tool name alone is not enough: the same
 * tool is benchmarked once per data source, so name and source together are
 * what make a published row match a fresh result.
 */
export function rowKey(row: Pick<TableRow, "name" | "cells">): string {
  return `${row.name}|${linkText(row.cells.source)}`;
}

/** "[HyperSync](https://…)" → "HyperSync"; plain text passes through. */
function linkText(cell: string): string {
  return (cell.match(/^\[([^\]]+)\]/)?.[1] ?? cell).trim();
}

const COLUMNS = ["tool", "source", "events/s", "blocks/s", "vs best", "data", "storage"];

export function formatRate(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** "29.5x slower" relative to the fastest row. */
function relative(best: number, rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  const ratio = best / rate;
  if (ratio <= 1.0001) return "—";
  return `${ratio % 1 === 0 ? Math.round(ratio) : ratio.toFixed(1)}x slower`;
}

export function buildTable(rows: TableRow[]): string {
  if (rows.length === 0) return "_No results collected._";

  const sorted = [...rows].sort((a, b) => b.eventsPerSec - a.eventsPerSec);
  const best = sorted[0].eventsPerSec;

  const lines = [
    `| ${COLUMNS.join(" | ")} |`,
    `| ${COLUMNS.map(() => "---").join(" | ")} |`,
  ];
  // Anything other than a pass gets a numbered reference, so the cell stays
  // narrow and the full explanation lives under the table.
  const notes: string[] = [];
  for (const row of sorted) {
    const tool = row.cells.tool || row.name;
    const name = row.carriedOver ? `${tool} ⚠️` : tool;
    let correctness = row.cells.correctness;
    if (correctness !== "✅" && row.cells.correctnessDetail) {
      notes.push(`**(${notes.length + 1})** ${row.name} — ${row.cells.correctnessDetail}`);
      correctness = `${correctness} (${notes.length})`;
    }
    lines.push(
      `| ${[
        name,
        row.cells.source,
        row.cells.events,
        row.cells.blocks,
        relative(best, row.eventsPerSec),
        correctness,
        row.cells.dbSize,
      ].join(" | ")} |`
    );
  }
  if (notes.length > 0) lines.push("", ...notes.map((note) => `> ${note}`));

  const carried = sorted.filter((r) => r.carriedOver).map((r) => r.name);
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

/**
 * Read back a table this module rendered, so an indexer whose job failed keeps
 * its last published numbers instead of silently vanishing from the results.
 * Cells are preserved verbatim; only the sort key is parsed.
 */
export function parsePublishedTable(markdown: string, benchCase: string): TableRow[] {
  const startMarker = `<!-- BENCHMARK:${benchCase}:START -->`;
  const endMarker = `<!-- BENCHMARK:${benchCase}:END -->`;
  const start = markdown.indexOf(startMarker);
  const end = markdown.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return [];

  const body = markdown.slice(start + startMarker.length, end);
  const rows: TableRow[] = [];

  // Notes are rendered as "> **(1)** Tool — detail" beneath the table.
  const notes = new Map<string, string>();
  for (const line of body.split("\n")) {
    const note = line.match(/^>\s*\*\*\((\d+)\)\*\*\s*.*?—\s*(.+)$/);
    if (note) notes.set(note[1], note[2].trim());
  }

  for (const line of body.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < COLUMNS.length) continue;
    // Skip the header and its separator.
    if (cells[0] === COLUMNS[0] || /^-+$/.test(cells[1] ?? "")) continue;

    const label = cells[0].replace(/\s*⚠️\s*$/, "").trim();
    const name = linkText(label);
    const eventsPerSec = parseFloat(cells[2].replace(/,/g, ""));
    if (!name || !Number.isFinite(eventsPerSec)) continue;

    // "❌ (1)" refers to note 1 below the table; recover both halves.
    const reference = cells[5].match(/^(\S+)\s*\((\d+)\)$/);
    rows.push({
      name,
      eventsPerSec,
      cells: {
        tool: label,
        source: cells[1],
        events: cells[2],
        blocks: cells[3],
        correctness: reference ? reference[1] : cells[5],
        correctnessDetail: reference ? (notes.get(reference[2]) ?? "") : "",
        dbSize: cells[6],
      },
    });
  }
  return rows;
}
