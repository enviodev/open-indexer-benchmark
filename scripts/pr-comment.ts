// Writes one section of the pull request's results comment.
//
//   SECTION=reliability node scripts/pr-comment.ts /tmp/reliability-comment.md
//
// Two workflows have something to say about a pull request - what the tools do
// when things go wrong, and how fast they are when they do not - and a reader
// wants both in one place. So every run
// posts a new comment carrying both sections: its own, freshly measured, and
// the other workflow's carried forward from the last such comment.
//
// A new comment each time rather than an edit in place, because these results
// are a history. Which commit made a check start passing is a thing worth
// being able to scroll back to, and an edited comment has thrown that away by
// the time anyone asks.
//
// Needs GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER, which every workflow
// job already has, and nothing else.

import { readFileSync } from "node:fs";

const token = required("GITHUB_TOKEN");
const [owner, repo] = required("GITHUB_REPOSITORY").split("/");
const issue = required("PR_NUMBER");
const section = required("SECTION");
const body = readFileSync(process.argv[2], "utf8").trim();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Marks the comment this script owns, so it is found again next time. */
const MARKER = "<!-- ci-results -->";

/**
 * The order sections appear in, whichever workflow finishes first.
 *
 * Reliability comes first: what a tool does when its database goes away is
 * worth more than how fast it is when nothing does.
 */
const ORDER = ["reliability", "benchmarks"];

const open = (id: string) => `<!-- section:${id} -->`;
const close = (id: string) => `<!-- /section:${id} -->`;

/** Says a section is not this run's work. Stripped on the way in, so a
 * section carried through five runs says it once rather than five times. */
const CARRIED = "_Carried forward from an earlier run._";

/** One section's content, or nothing when the comment has no such section. */
function sectionOf(comment: string, id: string): string | null {
  const from = comment.indexOf(open(id));
  const to = comment.indexOf(close(id));
  if (from === -1 || to === -1 || to < from) return null;
  return comment
    .slice(from + open(id).length, to)
    .split(CARRIED)
    .join("")
    .trim();
}

function render(sections: Map<string, string>): string {
  const parts = [MARKER];
  for (const id of ORDER) {
    const content = sections.get(id);
    if (!content) continue;
    parts.push("", open(id), "", content, "", close(id));
  }
  return parts.join("\n");
}

/** Set by the runner; a stub in the tests. */
const API = process.env.GITHUB_API_URL ?? "https://api.github.com";

const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} answered ${res.status}: ${await res.text()}`);
  }
  return res.json();
};

const comments = (await api(
  `/repos/${owner}/${repo}/issues/${issue}/comments?per_page=100`
)) as { id: number; body?: string }[];

// The most recent one, because that is the one holding the other workflow's
// latest results. The listing is oldest first.
const previous = comments.filter((comment) => comment.body?.startsWith(MARKER)).pop();

const sections = new Map<string, string>();
for (const id of ORDER) {
  // Only the other workflow's section is carried. This run measured its own,
  // and publishing a stale copy of it beside fresh results would be the one
  // way this comment could lie.
  if (id === section) continue;
  const kept = previous ? sectionOf(previous.body ?? "", id) : null;
  if (kept) sections.set(id, `${kept}\n\n${CARRIED}`);
}
sections.set(section, body);

const created = (await api(`/repos/${owner}/${repo}/issues/${issue}/comments`, {
  method: "POST",
  body: JSON.stringify({ body: render(sections) }),
})) as { id: number };
console.log(
  `Posted comment ${created.id} with a fresh ${section} section` +
    `${sections.size > 1 ? " and the other carried forward" : ""}.`
);
