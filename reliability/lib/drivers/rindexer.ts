import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "../../../cases/lib/process.ts";
import { Supervised, type DriverFactory } from "./common.ts";

const CLI = resolve(
  process.env.HOME ?? "~",
  ".config",
  ".rindexer",
  "bin",
  "rindexer"
);

export const rindexerDriver: DriverFactory = (ctx) => {
  const url = ctx.db.urlFor(ctx.database);
  const env = {
    ...process.env,
    ETHEREUM_RPC: ctx.rpcUrl,
    DATABASE_URL: url,
    POSTGRES_PASSWORD: "reliability",
  };
  const proc = new Supervised("rindexer");

  return {
    url,
    async prepare() {
      if (!existsSync(CLI)) {
        // install.sh resolves "latest" through an unauthenticated GitHub API
        // call that is occasionally throttled, so give it a few tries — but
        // exit non-zero when they all fail. Without `pipefail` and the explicit
        // `exit 1`, the trailing `sleep` returned success, `prepare()` was
        // taken to have worked, and launching a CLI that was never installed
        // was published as the indexer crashing.
        //
        // CI installs a version resolved through an authenticated API call
        // before this ever runs; this path is the local one.
        await exec(
          "bash",
          [
            "-c",
            "set -o pipefail; for i in 1 2 3; do " +
              "if curl --fail --location --proto '=https' --proto-redir '=https' " +
              "https://rindexer.xyz/install.sh | bash; then exit 0; fi; " +
              'echo "rindexer install attempt $i failed; retrying..." >&2; ' +
              "sleep $((i * 5)); done; exit 1",
          ],
          ctx.dir,
          env
        );
      }

      const template = readFileSync(resolve(ctx.dir, "rindexer.template.yaml"), "utf8");
      writeFileSync(
        resolve(ctx.dir, "rindexer.yaml"),
        template
          .replaceAll("__START_BLOCK__", String(ctx.startBlock))
          .replaceAll(
            "# __END_BLOCK__",
            ctx.endBlock === null ? "" : `end_block: "${ctx.endBlock}"`
          )
      );
    },
    async launch() {
      // Indexer only: the harness reads PostgreSQL, so a GraphQL server would
      // be work no check consumes. The manifest sets `drop_each_run: false`, so
      // this resumes rather than rebuilding — the whole point of relaunching.
      proc.start(CLI, ["start", "indexer"], ctx.dir, env);
    },
    stop: (signal) => proc.stop(signal),
    async cleanup() {
      await proc.stop("SIGKILL");
    },
    alive: () => proc.alive(),
    exit: () => proc.exit(),
    output: (lines) => proc.output(lines),
  };
};
