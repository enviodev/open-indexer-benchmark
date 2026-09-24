// Tests how several samples of a row become the one row published, and when
// the gate holds a row back.
//
//   node scripts/test-aggregate.ts
//
// The gate is what stands between a slow minute on a shared endpoint and the
// README, and it only ever runs on a push to main — so a mistake in it would
// otherwise first show up as a wrong published number, or as a recheck that
// never fires. The last section drives build-tables.ts itself over artifact
// directories laid out the way the workflow names them.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { judge, parseArtifactIndexer, pickMedian } from "../cases/lib/aggregate.ts";
import type { BenchmarkResult } from "../cases/lib/result.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures++;
}

function result(eventsPerSec: number, over: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    name: "Envio Indexer",
    toolUrl: "https://envio.dev",
    source: "RPC",
    sourceUrl: "https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc",
    storage: "Postgres",
    blocksPerSec: eventsPerSec * 10,
    eventsPerSec,
    throughputSource: "window",
    correctness: "ok",
    correctnessDetail: "",
    dbSizeBytes: 1_000_000,
    dbTotalBytes: 1_000_000,
    rangeSeconds: 1,
    windowSeconds: 100,
    ...over,
  };
}

console.log("Artifact names:");
{
  const a = parseArtifactIndexer("envio-rpc--r2");
  check("a round suffix is split off", a.indexer === "envio-rpc" && a.round === "r2", JSON.stringify(a));
  const b = parseArtifactIndexer("envio-subgraph-rpc--recheck");
  check(
    "a recheck suffix is split off",
    b.indexer === "envio-subgraph-rpc" && b.round === "recheck",
    JSON.stringify(b)
  );
  const c = parseArtifactIndexer("rindexer-hypersync");
  check(
    "a name without a suffix is a single round",
    c.indexer === "rindexer-hypersync" && c.round === "r1",
    JSON.stringify(c)
  );
}

console.log("\nMedian:");
{
  check("one sample is its own median", pickMedian([result(5)]).eventsPerSec === 5);
  check("three samples take the middle", pickMedian([result(300), result(40), result(270)]).eventsPerSec === 270);
  check(
    "an even count takes the lower middle, a rate some run produced",
    pickMedian([result(10), result(40), result(30), result(20)]).eventsPerSec === 20
  );
  const m = pickMedian([result(100, { blocksPerSec: 1 }), result(200, { blocksPerSec: 2 }), result(300, { blocksPerSec: 3 })]);
  check("the whole row comes from the median sample", m.eventsPerSec === 200 && m.blocksPerSec === 2);

  const wrong = pickMedian([
    result(100),
    result(200),
    result(300, { correctness: "mismatch", correctnessDetail: "3 balances wrong" }),
  ]);
  check(
    "correctness is the worst any sample reported",
    wrong.eventsPerSec === 200 &&
      wrong.correctness === "mismatch" &&
      wrong.correctnessDetail === "in 1 of 3 runs: 3 balances wrong",
    JSON.stringify([wrong.correctness, wrong.correctnessDetail])
  );
  const partial = pickMedian([
    result(100, { correctness: "unknown", correctnessDetail: "stopped at 60%" }),
    result(200, { correctness: "unknown", correctnessDetail: "stopped at 70%" }),
  ]);
  check(
    "a median that already has the worst status keeps its own detail",
    partial.correctness === "unknown" && partial.correctnessDetail === "stopped at 60%",
    partial.correctnessDetail
  );
}

console.log("\nGate:");
{
  const base = { published: 269, touched: false, final: false };
  check("within 2x publishes", judge({ ...base, samples: [200, 250, 300] }).kind === "publish");
  check(
    "a touched tool publishes however far it moved",
    judge({ ...base, samples: [40, 42, 45], touched: true }).kind === "publish"
  );
  check("a new row publishes", judge({ ...base, samples: [40], published: null }).kind === "publish");
  check(
    "a published zero has nothing to compare against",
    judge({ ...base, samples: [40], published: 0 }).kind === "publish"
  );
  check(
    "a move every sample agrees on is a shift",
    judge({ ...base, samples: [40, 42, 45] }).kind === "shift"
  );
  check(
    "an upward move every sample agrees on is a shift",
    judge({ ...base, samples: [900, 1000, 1100] }).kind === "shift"
  );
  // The 2026-09-09 case: two slow samples and one at the published value.
  check(
    "a move the samples disagree on is rechecked",
    judge({ ...base, samples: [42.9, 43, 269] }).kind === "recheck"
  );
  check(
    "a single sample never counts as agreement",
    judge({ ...base, samples: [42.9] }).kind === "recheck"
  );
  const final = judge({ ...base, samples: [42.9, 43, 269, 50], final: true });
  check(
    "still disagreeing after the recheck publishes with a note",
    final.kind === "unstable" && final.note.includes("4 runs ranged 42.9–269.0"),
    JSON.stringify(final)
  );
  // One slow round out of three, and the recheck sides with the other two.
  check(
    "a recheck that settled it publishes",
    judge({ ...base, samples: [42.9, 260, 269, 265], final: true }).kind === "publish"
  );
  // Two slow, two normal: no majority either way, so the row is flagged
  // rather than quietly published at either level.
  check(
    "an even split stays unstable",
    judge({ ...base, samples: [42.9, 43, 269, 260], final: true }).kind === "unstable"
  );
}

console.log("\nbuild-tables.ts end to end:");
{
  const benchCase = "erc20-transfer-events";
  const dir = mkdtempSync(join(tmpdir(), "test-aggregate-"));
  try {
    const readme = join(dir, "README.md");
    writeFileSync(
      readme,
      [
        `<!-- BENCHMARK:${benchCase}:START -->`,
        "| tool | source | events/s | blocks/s | vs best | data | storage |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 80,000.0 | 9,000.0 | — | ✅ | Postgres 1.4 MB |",
        "| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 269.0 | 60.0 | 297.4x slower | ✅ | Postgres 1.4 MB |",
        "| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 230.0 | 29.0 | 347.8x slower | ✅ | Postgres 2.5 MB |",
        `<!-- BENCHMARK:${benchCase}:END -->`,
      ].join("\n")
    );
    const results = join(dir, "results");
    const write = (indexer: string, round: string, r: BenchmarkResult) => {
      const d = join(results, `benchmark-${benchCase}--${indexer}--${round}`);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "benchmark-output.txt"), `noise\nBENCHMARK_RESULT ${JSON.stringify(r)}\n`);
    };
    const hypersync = (rate: number) =>
      result(rate, { source: "HyperSync", sourceUrl: "https://docs.envio.dev/docs/HyperSync/overview" });
    const ponder = (rate: number) => result(rate, { name: "Ponder", toolUrl: "https://ponder.sh" });
    // HyperSync is steady; Envio RPC has two slow samples and one normal one;
    // Ponder really did get ten times slower in every round.
    [81_000, 79_000, 80_500].forEach((r, i) => write("envio", `r${i + 1}`, hypersync(r)));
    [42.9, 43.1, 268].forEach((r, i) => write("envio-rpc", `r${i + 1}`, result(r)));
    [23, 22, 24].forEach((r, i) => write("ponder", `r${i + 1}`, ponder(r)));

    const run = (gate: string) =>
      execFileSync(process.execPath, [join(ROOT, "scripts", "build-tables.ts")], {
        encoding: "utf8",
        env: {
          ...process.env,
          CASES: JSON.stringify([benchCase]),
          RESULTS_DIR: results,
          OUT_DIR: dir,
          README_PATH: readme,
          GATE: gate,
          TOUCHED_INDEXERS: "{}",
          GITHUB_STEP_SUMMARY: "",
        },
      });

    run("recheck");
    const recheck = JSON.parse(readFileSync(join(dir, "benchmark-recheck.json"), "utf8"));
    check(
      "only the row whose samples disagree is sent back",
      JSON.stringify(recheck) === JSON.stringify({ [benchCase]: ["envio-rpc"] }),
      JSON.stringify(recheck)
    );
    const preview = readFileSync(join(dir, `benchmark-table-${benchCase}.md`), "utf8");
    check("the median of the steady row is used", preview.includes("| 80,500.0 |"), preview);
    check("an agreed shift is published", preview.includes("| 23.0 |"), preview);

    // The recheck lands at the published value: two of four samples now sit
    // there, the median (lower middle) is 43.1, and the runs still disagree.
    write("envio-rpc", "recheck", result(270));
    const out = run("final");
    const table = readFileSync(join(dir, `benchmark-readme-${benchCase}.md`), "utf8");
    check(
      "a row still disagreeing is published with its note in the README",
      table.includes("| 43.1 |") &&
        table.includes("> ⚠️ Envio Indexer via RPC — 4 runs ranged 42.9–270.0 events/s"),
      table
    );
    check("and is annotated on the run", out.includes("::warning::"), out);
    check(
      "the recheck artifact is counted as the same indexer, not a failed job",
      !out.includes("carried forward"),
      out
    );

    const off = run("off");
    check("with the gate off nothing is flagged", !off.includes("⚠️"), off);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? "\nAll aggregate checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
