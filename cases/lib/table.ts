// Result table rendering, shared by the local benchmark runner and the CI
// summary job so both publish an identical format.
//
// Rows are indexers and columns are metrics: a benchmark gains metrics far
// more often than it gains indexers, and only this orientation has room to
// grow.

export interface ResultCells {
  blocks: string;
  events: string;
  correctness: string;
  dbSize: string;
}

export interface TableRow {
  name: string;
  /** Sort key; also drives the "vs best" column. */
  blocksPerSec: number;
  cells: ResultCells;
  /** True when re-published from the README because this run produced none. */
  carriedOver?: boolean;
}

const COLUMNS = ["Indexer", "blocks/s", "events/s", "vs best", "Data", "DB size"];

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

  const sorted = [...rows].sort((a, b) => b.blocksPerSec - a.blocksPerSec);
  const best = sorted[0].blocksPerSec;

  const lines = [
    `| ${COLUMNS.join(" | ")} |`,
    `| ${COLUMNS.map(() => "---").join(" | ")} |`,
  ];
  for (const row of sorted) {
    const name = row.carriedOver ? `${row.name} ⚠️` : row.name;
    lines.push(
      `| ${[
        name,
        row.cells.blocks,
        row.cells.events,
        relative(best, row.blocksPerSec),
        row.cells.correctness,
        row.cells.dbSize,
      ].join(" | ")} |`
    );
  }

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

  for (const line of body.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < COLUMNS.length) continue;
    // Skip the header and its separator.
    if (cells[0] === COLUMNS[0] || /^-+$/.test(cells[1] ?? "")) continue;

    const name = cells[0].replace(/\s*⚠️\s*$/, "").trim();
    const blocksPerSec = parseFloat(cells[1].replace(/,/g, ""));
    if (!name || !Number.isFinite(blocksPerSec)) continue;

    rows.push({
      name,
      blocksPerSec,
      cells: {
        blocks: cells[1],
        events: cells[2],
        correctness: cells[4],
        dbSize: cells[5],
      },
    });
  }
  return rows;
}
