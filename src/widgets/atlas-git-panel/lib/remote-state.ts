import type { GitStatusResult } from "@/shared/lib/git/tauri-git";

/**
 * Where this branch's steps can go, read from one status. Only `no-remote` may offer to register
 * `origin`; elsewhere it would rewrite a real remote. `unknown` (a bridge older than the field)
 * claims neither a remote nor its absence; `detached` offers nothing.
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
