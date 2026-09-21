import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { client, graphql } from "ponder";

// Ponder refuses to start without this file, so it is here rather than because
// the reliability suite reads it: every check queries PostgreSQL directly, the
// same way the throughput scenarios do. What it serves is what `ponder dev`
// scaffolds — a tool should be run the way its own docs start it.
const app = new Hono();

app.use("/sql/*", client({ db, schema }));

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

export default app;
