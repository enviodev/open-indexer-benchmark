import { type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { exec, gql, kill, start, waitPg } from "../process.ts";
import { BENCHMARK_PORT, type DriverFactory } from "./common.ts";

const PG_PORT = 23_798;
export const SQD_DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/squid`;

export const sqdDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "sqd");
  const graphqlUrl = `http://localhost:${BENCHMARK_PORT}/graphql`;
  const env = {
    ...process.env,
    RPC_ENDPOINT: rpcUrl,
    DB_PORT: String(PG_PORT),
    DB_HOST: "localhost",
    DB_NAME: "squid",
    DB_PASS: "postgres",
    GQL_PORT: String(BENCHMARK_PORT),
    SQD_END_BLOCK: String(endBlock),
  };
  let processor: ChildProcess | null = null;
  let gqlServer: ChildProcess | null = null;
  let done = false;

  // "transferEventsConnection" exposes totalCount; "transferEvents" is the
  // plain collection used to read the highest indexed block from the last id.
  const blockField = config.sqdConnections[0].replace(/Connection$/, "");
  const snapshotQuery = `{
    ${config.sqdConnections
      .map((c, i) => `count${i}: ${c}(orderBy: id_ASC) { totalCount }`)
      .join("\n    ")}
    latest: ${blockField}(orderBy: id_DESC, limit: 1) { id }
  }`;

  return {
    name: "Sqd",
    dbUrl: SQD_DB_URL,
    async prepare() {
      console.log("Cleaning squid build artifacts...");
      rmSync(resolve(dir, "lib"), { recursive: true, force: true });
      rmSync(resolve(dir, "db/migrations"), { recursive: true, force: true });

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);
      console.log("Generating models from schema...\n");
      await exec("pnpm", ["codegen"], dir);
      console.log("Building squid project...\n");
      await exec("pnpm", ["build"], dir);

      console.log("Starting PostgreSQL database...\n");
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
      await exec("docker", ["compose", "up", "-d"], dir, env);
      await waitPg(SQD_DB_URL, "SELECT 1");

      console.log("Generating migrations...\n");
      await exec("npx", ["squid-typeorm-migration", "generate"], dir, env);
      console.log("Applying migrations...\n");
      await exec("npx", ["squid-typeorm-migration", "apply"], dir, env);
    },
    async launch() {
      gqlServer = start("npx", ["squid-graphql-server"], dir, env);
      processor = start(
        "node",
        ["--require=dotenv/config", "lib/main.js"],
        dir,
        env
      );
      // The processor exits by itself once it reaches its end block.
      processor.on("exit", () => (done = true));
    },
    async snapshot() {
      const data: any = await gql(graphqlUrl, snapshotQuery);
      let events = 0;
      for (let i = 0; i < config.sqdConnections.length; i++) {
        events += data[`count${i}`]?.totalCount ?? 0;
      }
      // Event ids are "<blockHeight>-<logIndex>"; within a single benchmark the
      // heights all have the same digit count, so id_DESC orders by height.
      const lastId: string | undefined = data.latest?.[0]?.id;
      const block = lastId ? parseInt(lastId.split("-")[0], 10) : 0;
      return {
        events,
        blocks:
          Number.isFinite(block) && block > config.startBlock
            ? block - config.startBlock
            : 0,
      };
    },
    async stop() {
      await kill(processor);
      await kill(gqlServer);
      processor = null;
      gqlServer = null;
    },
    async cleanup() {
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
    },
    exited: () => done,
  };
};
