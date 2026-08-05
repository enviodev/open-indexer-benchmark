// How reliability results are published.
//
// Two shapes, because they answer different questions. The summary matrix is
// the one that belongs in a README: one row per tool, one column per scenario,
// and a glyph you can read at a glance. The per-scenario tables are where the
// numbers live — how many times a tool had to be restarted, how long it took to
// come back, what the head latency actually was — because a glyph that says
// "degraded" without saying by how much is an accusation rather than a result.
//
// Notes are numbered and collected under each table for the same reason the
// throughput tables do it: a cell wide enough to hold the explanation makes the
// table unreadable, and an explanation that is not published makes the verdict
// unfalsifiable.

import { OUT_OF_SCOPE, TOOL_INFO } from "./drivers/index.ts";
import type { Scenario, ScenarioResult } from "./harness.ts";

const GLYPH: Record<string, string> = {
  pass: "✅",
  degraded: "⚠️",
  fail: "❌",
  error: "❓",
};

const NO_VALUE = "—";

const toolCell = (tool: string): string => {
  const info = TOOL_INFO[tool];
  return info ? `[${info.name}](${info.url})` : tool;
};

/** Tools in the order they should appear: best overall first. */
function rankTools(results: ScenarioResult[]): string[] {
  const score = new Map<string, number>();
  for (const result of results) {
    const points =
      result.status === "pass" ? 3 : result.status === "degraded" ? 2 : result.status === "fail" ? 0 : 1;
    score.set(result.tool, (score.get(result.tool) ?? 0) + points);
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tool]) => tool);
}

export function buildSummaryTable(
  results: ScenarioResult[],
  scenarios: Scenario[]
): string {
  if (results.length === 0) return "_No reliability results collected._";

  const columns = ["tool", ...scenarios.map((scenario) => scenario.title), "crashes"];
  const lines = [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
  ];
  const notes: string[] = [];

  for (const tool of rankTools(results)) {
    const cells: string[] = [toolCell(tool)];
    let crashes = 0;
    for (const scenario of scenarios) {
      const result = results.find(
        (r) => r.tool === tool && r.scenario === scenario.key
      );
      if (!result) {
        cells.push(NO_VALUE);
        continue;
      }
      crashes += result.crashes;
      let cell = GLYPH[result.status] ?? "❓";
      if (result.status !== "pass" && result.detail) {
        notes.push(
          `**(${notes.length + 1})** ${TOOL_INFO[tool]?.name ?? tool}, ` +
            `${scenario.title.toLowerCase()} — ${result.detail}`
        );
        cell = `${cell} (${notes.length})`;
      }
      cells.push(cell);
    }
    cells.push(String(crashes));
    lines.push(`| ${cells.join(" | ")} |`);
  }

  for (const [tool, reason] of Object.entries(OUT_OF_SCOPE)) {
    notes.push(`**(${notes.length + 1})** ${tool} — ${reason}`);
    lines.push(
      `| ${[
        tool,
        ...scenarios.map(() => NO_VALUE),
        `${NO_VALUE} (${notes.length})`,
      ].join(" | ")} |`
    );
  }

  if (notes.length > 0) lines.push("", ...notes.map((note) => `> ${note}`));
  return lines.join("\n");
}

/** One scenario's own table, with whatever it measured as extra columns. */
export function buildScenarioTable(
  scenario: Scenario,
  results: ScenarioResult[]
): string {
  const mine = results.filter((result) => result.scenario === scenario.key);
  if (mine.length === 0) return "_No results collected._";

  // Metric columns are the union across tools, in first-seen order, so a tool
  // that failed early and measured nothing still gets a row.
  const metricKeys: string[] = [];
  for (const result of mine) {
    for (const key of Object.keys(result.metrics ?? {})) {
      if (!metricKeys.includes(key)) metricKeys.push(key);
    }
  }

  const columns = ["tool", "result", "crashes", "restarts", ...metricKeys, "notes"];
  const lines = [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
  ];

  const order = rankTools(mine);
  for (const tool of order) {
    const result = mine.find((r) => r.tool === tool);
    if (!result) continue;
    const note = [result.detail, result.crashDetail].filter(Boolean).join("; ");
    lines.push(
      `| ${[
        toolCell(tool),
        GLYPH[result.status] ?? "❓",
        String(result.crashes),
        String(result.restarts),
        ...metricKeys.map((key) => {
          const value = result.metrics?.[key];
          return value === undefined ? NO_VALUE : String(value);
        }),
        note || NO_VALUE,
      ].join(" | ")} |`
    );
  }
  return lines.join("\n");
}

/** The whole run as markdown: summary first, then a section per scenario. */
export function buildReport(
  results: ScenarioResult[],
  scenarios: Scenario[]
): string {
  const sections = [buildSummaryTable(results, scenarios)];
  for (const scenario of scenarios) {
    if (!results.some((result) => result.scenario === scenario.key)) continue;
    sections.push(
      [
        `### ${scenario.title}`,
        "",
        scenario.summary,
        "",
        buildScenarioTable(scenario, results),
      ].join("\n")
    );
  }
  return sections.join("\n\n");
}

/** One line per tool for the run log, so a failure is legible without the table. */
export function summariseRun(results: ScenarioResult[]): string {
  return results
    .map(
      (result) =>
        `${GLYPH[result.status] ?? "❓"} ${result.tool}/${result.scenario} — ` +
        `${result.detail || "ok"}` +
        (result.crashes > 0 ? ` [${result.crashDetail}]` : "")
    )
    .join("\n");
}
