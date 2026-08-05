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
        // call that is occasionally throttled, so give it a few tries.
        await exec(
          "bash",
          [
            "-c",
            "for i in 1 2 3; do curl -L https://rindexer.xyz/install.sh | bash && break; " +
              'echo "rindexer install attempt $i failed; retrying..." >&2; sleep $((i * 5)); done',
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
            "__END_BLOCK_LINE__",
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
    output: () => proc.output(),
  };
};
