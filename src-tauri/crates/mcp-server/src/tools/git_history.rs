//! `git_history`: the newest commits that touched the vault's folder, with whether the list is
//! the whole story. Read-only.

use hardened_git::CommitSummary;
use serde::Serialize;

use super::argument_checks::optional_positive_integer;
use super::vault_repository::{locate, Located, VaultRepository};
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const DEFAULT_LIMIT: usize = 20;
const MAX_LIMIT: f64 = 100.0;

#[derive(Serialize)]
struct CommitRow<'a> {
    hash: &'a str,
    #[serde(rename = "shortHash")]
    short_hash: &'a str,
    #[serde(rename = "authoredAt")]
    authored_at: &'a str,
    subject: &'a str,
}

#[derive(Serialize)]
struct History<'a> {
    operation: &'static str,
    ok: bool,
    #[serde(rename = "repoRoot")]
    repo_root: String,
    #[serde(rename = "vaultRoot")]
    vault_root: String,
    #[serde(rename = "vaultPathspec")]
    vault_pathspec: &'a str,
    head: Option<&'a str>,
    branch: Option<&'a str>,
    limit: usize,
    count: usize,
    limited: bool,
    #[serde(rename = "hasMore")]
    has_more: bool,
    shallow: bool,
    #[serde(rename = "historyComplete")]
    history_complete: bool,
    commits: Vec<CommitRow<'a>>,
}

fn read_history(found: &VaultRepository, limit: usize) -> Result<ToolOutput, ToolError> {
    let failed = |error: hardened_git::GitReadError| ToolError::failed(error.to_string());
    let head = found.repository.head_state().map_err(failed)?;
    // A branch with no commit has no history, which is an answer; asking git anyway would fail
    // and a failure is never reported as an empty, complete history.
    let mut commits: Vec<CommitSummary> = match head.commit() {
        Some(_) => found
            .repository
            .history(&found.scope, limit + 1)
            .map_err(failed)?,
        None => Vec::new(),
    };
    let has_more = commits.len() > limit;
    commits.truncate(limit);
    ToolOutput::json(&History {
        operation: "git_history",
        ok: true,
        repo_root: found.top_level.to_string_lossy().into_owned(),
        vault_root: found.vault.to_string_lossy().into_owned(),
        vault_pathspec: found.scope.as_str(),
        head: head.commit().map(|commit| commit.as_str()),
        branch: head.branch(),
        limit,
        count: commits.len(),
        limited: has_more,
        has_more,
        shallow: found.shallow,
        history_complete: !has_more && !found.shallow,
        commits: commits
            .iter()
            .map(|commit| CommitRow {
                hash: &commit.hash,
                short_hash: &commit.short_hash,
                authored_at: &commit.authored_at,
                subject: &commit.subject,
            })
            .collect(),
    })
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let limit = optional_positive_integer(arguments, "limit", Some(MAX_LIMIT))?
        .map_or(DEFAULT_LIMIT, |number| number as usize);
    match locate(context, "git_history")? {
        Located::Found(found) => read_history(&found, limit),
        Located::Missing(reason) => ToolOutput::json(&reason),
    }
}
