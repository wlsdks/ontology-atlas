import type { GitStatusResult } from "@/shared/lib/tauri-git";

/**
 * Where this branch's steps can go, read from one status.
 *
 * The screen used to have two answers: an upstream, or "no remote yet" with a button that
 * registers `origin`. The second answer was also given to a repository whose `origin` exists
 * but whose branch was never pushed, and to a detached HEAD — and the button there ran
 * `git remote set-url origin`, replacing a real remote (2026-09-25). Each state below has its
 * own next step:
 *
 * - `tracking` — the branch follows an upstream; Fetch, Pull and Push work.
 * - `no-remote` — there is no `origin`; the next step is connecting one.
 * - `never-sent` — `origin` exists and this branch was never sent to it; the next step is
 *   sending it, which records the upstream. Nothing registers or rewrites a remote.
 * - `detached` — HEAD names a commit, not a branch; nothing can be sent until a branch is
 *   checked out, and nothing on screen offers to.
 * - `unknown` — the bridge did not say whether `origin` exists (one older than the field).
 *   The screen claims neither remote nor its absence, and offers nothing that could rewrite one.
 */
export type GitRemoteState = "tracking" | "no-remote" | "never-sent" | "detached" | "unknown";

export function describeRemoteState(
  status: Pick<GitStatusResult, "upstream" | "hasOrigin" | "detached"> | null,
): GitRemoteState {
  if (!status) return "unknown";
  if (status.upstream) return "tracking";
  if (status.detached === true) return "detached";
  if (status.hasOrigin === true) return "never-sent";
  if (status.hasOrigin === false) return "no-remote";
  return "unknown";
}
