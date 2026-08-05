import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "../../../cases/lib/process.ts";
import { ensureGraphNode } from "../../../cases/lib/drivers/subgraph.ts";
import { Supervised, type DriverFactory } from "./common.ts";

const HTTP_PORT = 19_892;
const INDEX_NODE_PORT = 19_893;
const ADMIN_PORT = 19_894;
const METRICS_PORT = 19_895;

export const subgraphDriver: DriverFactory = (ctx) => {
  const url = ctx.db.urlFor(ctx.database);
  const proc = new Supervised("graph-node");
  let gnd = "";

  return {
    url,
    async prepare() {
      rmSync(resolve(ctx.dir, "build"), { recursive: true, force: true });
      rmSync(resolve(ctx.dir, "generated"), { recursive: true, force: true });

      await exec("pnpm", ["install", "--frozen-lockfile"], ctx.dir);

      // graph-cli has no environment override for the block range, so the
      // manifest is written per run.
      const template = readFileSync(resolve(ctx.dir, "subgraph.template.yaml"), "utf8");
      writeFileSync(
        resolve(ctx.dir, "subgraph.yaml"),
        template
          .replaceAll("__START_BLOCK__", String(ctx.startBlock))
          .replaceAll(
            "__END_BLOCK_LINE__",
            ctx.endBlock === null ? "" : `endBlock: ${ctx.endBlock}`
          )
      );

      gnd = await ensureGraphNode(ctx.dir);
      await exec("pnpm", ["exec", "graph", "codegen"], ctx.dir);
      await exec("pnpm", ["exec", "graph", "build"], ctx.dir);
    },
    async launch() {
      // `gnd dev` deploys the built subgraph and starts indexing on startup.
      // Re-running it against a database that already holds the deployment
      // resumes it rather than starting over, which is what makes it usable as
      // a restart-recovery subject at all.
      proc.start(
        gnd,
        [
          "dev",
          "--postgres-url", url,
          "--ethereum-rpc", `mainnet:${ctx.rpcUrl}`,
          "--http-port", String(HTTP_PORT),
          "--index-node-port", String(INDEX_NODE_PORT),
          "--admin-port", String(ADMIN_PORT),
          "--metrics-port", String(METRICS_PORT),
        ],
        ctx.dir,
        {
          ...process.env,
          GRAPH_LOG: "info",
          // While it believes itself to be syncing, Graph Node holds entity
          // changes in memory and flushes them every 300 seconds. Every
          // reliability check reads PostgreSQL, so the default would have the
          // harness watching an empty database for minutes and calling it a
          // stall. Batching stays on, bounded well inside the scenarios'
          // patience; readings are then at most this many seconds stale, which
          // the head-latency result accounts for.
          GRAPH_STORE_WRITE_BATCH_DURATION: "5",
        }
      );
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
