import { type ChildProcess } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, kill, psql, start } from "../process.ts";
import { type DriverFactory } from "./common.ts";
import { createEnvioSnapshot, ENVIO_DB_URL } from "./envio.ts";

const PG_PORT = 5433;

/**
 * The envio CLI, installed once and shared across cases the way the Graph Node
 * binary is. It is deliberately not a dependency of any `subgraph/` directory:
 * the point of this tool is that the subgraph project it runs is the same one
 * Graph Node indexes, with nothing added to it.
 */
const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "envio-subgraph");

/**
 * Runs the case's existing Subgraph project on HyperIndex, reading from
 * HyperSync or from a plain RPC endpoint.
 *
 * There is no envio config anywhere in that directory — `subgraph.yaml` is the
 * config, and envio picks it up because no `config.yaml` sits beside it. The
 * mappings, schema and ABIs are the same files Graph Node reads. On start,
 * envio builds `generated/` with the project's own graph-cli.
 */
export const envioSubgraphDriver = (mode: "hypersync" | "rpc"): DriverFactory => ({
  config,
  rpcUrl,
  endBlock,
}) => {
  const dir = resolve(config.dir, "subgraph");
  const envio = resolve(CLI_DIR, "node_modules", ".bin", "envio");
  const env = {
    ...process.env,
    ENVIO_TUI: "false",
    ENVIO_HASURA: "false",
    ENVIO_PG_PORT: String(PG_PORT),
    // A bare URL leaves HyperSync as the source and keeps RPC for contract
    // calls and the block-timestamp fallback; `for: sync` makes it the source.
    ENVIO_SUBGRAPH_RPC:
      mode === "rpc" ? JSON.stringify({ url: rpcUrl, for: "sync" }) : rpcUrl,
  };
  let proc: ChildProcess | null = null;
  let done = false;

  return {
    dbUrl: ENVIO_DB_URL,
    async prepare() {
      console.log("Cleaning previous build...");
      rmSync(resolve(dir, ".envio"), { recursive: true, force: true });
      rmSync(resolve(dir, "generated"), { recursive: true, force: true });
      rmSync(resolve(dir, "build"), { recursive: true, force: true });

      // `envio start -r` resets the database asynchronously after launch, so a
      // snapshot taken before that lands would read the previous phase's
      // progress. Drop the schema up front instead.
      await psql(ENVIO_DB_URL, "DROP SCHEMA IF EXISTS public CASCADE").catch(() => {});
      await psql(ENVIO_DB_URL, "CREATE SCHEMA public").catch(() => {});

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);
      await exec("pnpm", ["install", "--frozen-lockfile"], CLI_DIR);

      // The same manifest Graph Node reads, with the same range baked in.
      const template = readFileSync(resolve(dir, "subgraph.template.yaml"), "utf8");
      writeFileSync(
        resolve(dir, "subgraph.yaml"),
        template
          .replaceAll("__START_BLOCK__", String(config.startBlock))
          .replaceAll("__END_BLOCK__", String(endBlock))
      );
    },
    async launch() {
      // Run from the subgraph directory: that is the project root, and the
      // mappings' relative paths and its own graph-cli resolve from there.
      proc = start(envio, ["start", "-r"], dir, env);
      proc.on("exit", () => (done = true));
    },
    snapshot: createEnvioSnapshot(config),
    async stop() {
      await kill(proc);
      proc = null;
    },
    // envio manages its own Postgres container and the next phase drops the
    // schema anyway, so there is nothing to tear down here.
    async cleanup() {},
    exited: () => done,
  };
};
