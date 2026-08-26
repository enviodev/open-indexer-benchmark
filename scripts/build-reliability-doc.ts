// Renders the reliability scenario page from the catalog.
//
//   node scripts/build-reliability-doc.ts
//
// The page exists because a score is not a result on its own. A reader who
// follows "72" from the results table is owed the list of things that were
// asked, what each was worth, and what the tool would have had to do to earn
// it — and owed it in the same words the run scored against, not a paraphrase
// that has since drifted from the code.
//
// So the page is generated rather than written. The catalog in
// cases/lib/reliability/scenarios.ts is the source for both, which makes the
// explanation and the arithmetic the same artefact: a check cannot be scored
// without appearing here, and cannot be described here in terms other than the
// ones it is scored by.
//
// Re-run it after changing the catalog; scripts/test-reliability.ts fails if
// the committed page has fallen behind.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS, SCENARIOS, scenarioPoints } from "../cases/lib/reliability/scenarios.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DOC_PATH = resolve(ROOT, "cases", "reliability", "README.md");

const PREAMBLE = `# Reliability Scenarios

The throughput tables answer one question: how fast. These answer the other one
— what happens when something goes wrong. A database restarts under the
indexer, the chain rewrites six blocks it had already stored, a provider starts
answering 429 to everything, a token's \`symbol()\` returns no data at all. None
of that is exotic; all of it is a Tuesday. What differs between tools is whether
it costs throughput, costs data, or costs someone their evening.

## How these scenarios are run

Every scenario runs against a chain the benchmark makes up
([\`cases/lib/chain-mock.ts\`](../lib/chain-mock.ts)) rather than a real network,
for the reason that makes the scores mean anything: a nine-block reorg, a node
that stalls for exactly thirty seconds, and a log index of \`0xffffffe2\` cannot
be arranged on a real chain on demand, and could never be arranged twice the
same way. The mock chain does all three on request, identically, every run. The
blocks, their logs and their hashes are derived from the block number and the
branch it sits on, so a replacement block after a reorg is genuinely a different
block carrying different data — which is what makes "did the tool roll back?" a
question with an observable answer.

The indexer under test is otherwise run exactly as the throughput scenarios run
it: the tool's own production command, its own database, no benchmark-specific
configuration. What the harness does is start the chain, provoke it, and read
the tool's tables directly.

**What this cannot tell you.** A mocked chain is an RPC endpoint, so every tool
is measured on its RPC ingestion path. A tool that reads its own network in
production may behave differently there, and nothing here claims otherwise —
the source column says which path was measured, the same way it does for
throughput.

## How a score is put together

Each check below is worth the points it names, and every scenario's checks add
up to 100. A scenario's score is the share of its points earned; a column's
score is the share earned across the scenarios in it; the overall score is the
mean of the columns.

Columns are averaged rather than pooled, so that writing four more reorg checks
does not quietly demote crash recovery for every tool. The columns are meant to
be equal questions and the arithmetic says so.

A check the run could not put — the tool exited before the scenario reached it,
the case does not apply — is scored as neither pass nor fail: it leaves the
fraction entirely, so a score is always over what was actually asked. A column
where nothing could be measured publishes a dash, never a zero. "Not measured"
and "measured, scored nothing" are opposite findings and the table keeps them
apart.

Points are not spread evenly on purpose. Losing data is not the same finding as
taking longer to notice, so a check about rows that are wrong is worth more than
one about seconds spent recovering — and both are published, because an operator
choosing a tool cares about each.
`;

function anchor(id: string): string {
  return `<a id="${id}"></a>`;
}

const lines: string[] = [PREAMBLE, "## The scenarios", ""];

// A table of contents that doubles as the map from a results-table column to
// the questions behind it.
for (const group of GROUPS) {
  const scenarios = SCENARIOS.filter((scenario) => scenario.group === group.id);
  lines.push(
    `- [**${group.title}**](#${group.id}) — ${group.blurb}`,
    ...scenarios.map((scenario) => `  - [${scenario.title}](#${scenario.id})`)
  );
}
lines.push("");

for (const group of GROUPS) {
  const scenarios = SCENARIOS.filter((scenario) => scenario.group === group.id);
  lines.push(
    anchor(group.id),
    "",
    `## ${group.title.charAt(0).toUpperCase()}${group.title.slice(1)}`,
    "",
    group.blurb,
    "",
    scenarios.length === 1
      ? `One scenario, scored out of ${scenarioPoints(scenarios[0])} points.`
      : `${scenarios.length} scenarios, each scored out of 100 points; the column is the share earned across all of them.`,
    ""
  );

  for (const scenario of scenarios) {
    lines.push(
      anchor(scenario.id),
      "",
      `### ${scenario.title}`,
      "",
      scenario.summary,
      "",
      "**What the harness does.** " + scenario.method,
      "",
      "| check | points | what a pass means |",
      "| --- | --- | --- |",
      ...scenario.checks.map(
        (check) =>
          `| ${check.label} | ${check.points} | ${check.detail.replace(/\|/g, "\\|")} |`
      ),
      ""
    );
    if (scenario.measures?.length) {
      lines.push(
        "Reported alongside the score, and not part of it:",
        "",
        "| measure | unit | what it says |",
        "| --- | --- | --- |",
        ...scenario.measures.map(
          (measure) =>
            `| ${measure.label}${measure.headline ? " *(shown in the results table)*" : ""} | ${measure.unit} | ${measure.detail.replace(/\|/g, "\\|")} |`
        ),
        ""
      );
    }
  }
}

lines.push(
  "---",
  "",
  "_This page is generated from [`cases/lib/reliability/scenarios.ts`](../lib/reliability/scenarios.ts)",
  "by `node scripts/build-reliability-doc.ts`. Edit the catalog, not this file: it is the same",
  "source the scores are computed from, so what a check is worth and what it means cannot drift apart._",
  ""
);

export const doc = lines.join("\n");

if (import.meta.filename === process.argv[1]) {
  writeFileSync(DOC_PATH, doc);
  console.log(`Wrote ${DOC_PATH}`);
}
