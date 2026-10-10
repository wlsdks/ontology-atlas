import type { GitStatusResult } from "@/shared/lib/tauri-git";

/**
 * Where this branch's steps can go, read from one status. Only `no-remote` may offer to
 * register `origin`; offering it elsewhere would rewrite a real remote. Each state's next step:
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

/**
 * The presses that reach the remote. On a branch `origin` has never seen, `push` is its first
 * send (`push -u`, see `describeRemoteState`): the one press that turns a saved address into an
 * upstream.
 */
export type RemoteAction = "fetch" | "pull" | "push";

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
