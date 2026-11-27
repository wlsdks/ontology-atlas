//! Git for the scheduled recheck (`docs/specs/2026-11-27-stale-concept-recheck.md`): whether a
//! run may commit here, what changed in each cited file, one commit holding exactly the documents
//! the run marked, its put-back when Git refuses, and the undo of a run or one concept.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::classify::git_error_text;
use super::repo::{
    find_repo_root, get_current_branch, get_head_hash, is_head_detached, vault_pathspec,
};
use super::runner::{run_git, validate_vault_dir};
use crate::code_reader::refusal::path_refusal;
use crate::vault::scope::{normalize_relative_path, resolve_existing_inside};
use crate::vault::write::{ensure_vault_directory_blocking, write_vault_text_file_blocking};

#[cfg(test)]
mod tests;

/// Written before any document and removed once the run's documents are committed or put back,
/// so a run Atlas quit in the middle of is put back when the folder opens again.
const PENDING_FILE: &str = ".ontology-atlas/recheck-pending.json";
const UNDONE_FOLDER: &str = ".ontology-atlas/undone";
/// Git's refusal shown in a sentence: its first lines, cut.
const DETAIL_MAX_CHARS: usize = 400;
/// A diff over this many bytes is cut like one over the line limit.
const DIFF_MAX_BYTES: usize = 64 * 1024;
const DIFF_REQUEST_MAX: usize = 256;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecheckHold {
    /// `git`: Git cannot commit here now; `branch`: the remote's default branch is checked out.
    reason: &'static str,
    detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckGitState {
    repository: bool,
    head: Option<String>,
    branch: Option<String>,
    remote_default: Option<String>,
    hold: Option<RecheckHold>,
}

/// Where a recheck may commit, read before any agent turn. Held only for a reason Git gives:
/// no commit yet, a detached HEAD, an operation in progress, or the remote's known default
/// branch checked out. With no remote, or no default recorded, the run goes ahead.
#[tauri::command(async)]
pub fn git_recheck_state(vault_path: String) -> Result<RecheckGitState, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let Some(repo_root) = find_repo_root(&vault_dir)? else {
        return Ok(RecheckGitState {
            repository: false,
            head: None,
            branch: None,
            remote_default: None,
            hold: None,
        });
    };
    let head = get_head_hash(&repo_root);
    let detached = is_head_detached(&repo_root);
    let branch = if detached {
        None
    } else {
        get_current_branch(&repo_root)
    };
    let remote_default = remote_default_branch(&repo_root);
    let hold = git_hold(&repo_root, head.is_some(), detached)
        .map(|detail| RecheckHold {
            reason: "git",
            detail,
        })
        .or_else(|| match (&branch, &remote_default) {
            (Some(branch), Some(default)) if branch == default => Some(RecheckHold {
                reason: "branch",
                detail: branch.clone(),
            }),
            _ => None,
        });
    Ok(RecheckGitState {
        repository: true,
        head,
        branch,
        remote_default,
        hold,
    })
}

fn git_hold(repo_root: &Path, has_head: bool, detached: bool) -> Option<String> {
    if !has_head {
        return Some("no commit yet".into());
    }
    if detached {
        return Some("detached HEAD".into());
    }
    operation_in_progress(repo_root).map(|operation| format!("{operation} in progress"))
}

fn operation_in_progress(repo_root: &Path) -> Option<&'static str> {
    let out = run_git(repo_root, &["rev-parse", "--absolute-git-dir"]).ok()?;
    if !out.success {
        return None;
    }
    let git_dir = PathBuf::from(out.stdout.trim());
    [
        ("MERGE_HEAD", "merge"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("BISECT_LOG", "bisect"),
    ]
    .into_iter()
    .find(|(marker, _)| git_dir.join(marker).exists())
    .map(|(_, operation)| operation)
}

/// The branch `refs/remotes/origin/HEAD` names, as `base_line::remote_default` reads it.
fn remote_default_branch(repo_root: &Path) -> Option<String> {
    let out = run_git(
        repo_root,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    )
    .ok()?;
    if !out.success {
        return None;
    }
    out.stdout
        .trim()
        .strip_prefix("refs/remotes/origin/")
        .filter(|name| !name.is_empty())
        .map(str::to_string)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckDiffRequest {
    commit: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckDiff {
    commit: String,
    path: String,
    /// The code reader refuses this path (a name that holds keys, a Git or hidden folder, or a
    /// path out of the folder); nothing of it was read.
    refused: bool,
    /// `git diff -w <commit> HEAD -- <path>`, cut to `max_lines`; `None` when refused or unreadable.
    diff: Option<String>,
    /// Lines of the whole diff, before any cut.
    lines: usize,
    cut: bool,
}

/// What changed in each cited file from its document's commit to `HEAD`, whitespace ignored.
#[tauri::command(async)]
pub fn git_recheck_diffs(
    vault_path: String,
    requests: Vec<RecheckDiffRequest>,
    max_lines: usize,
) -> Result<Vec<RecheckDiff>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = super::repo::require_repo_root(&vault_dir)?;
    Ok(requests
        .into_iter()
        .take(DIFF_REQUEST_MAX)
        .map(|request| cited_diff(&repo_root, request, max_lines))
        .collect())
}

fn cited_diff(repo_root: &Path, request: RecheckDiffRequest, max_lines: usize) -> RecheckDiff {
    let refused = path_refusal(&request.path).is_some();
    let mut answer = RecheckDiff {
        commit: request.commit,
        path: request.path,
        refused,
        diff: None,
        lines: 0,
        cut: false,
    };
    if refused || !is_commit_name(&answer.commit) || answer.path.starts_with('-') {
        return answer;
    }
    let Ok(out) = run_git(
        repo_root,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "-w",
            "--no-color",
            &answer.commit,
            "HEAD",
            "--",
            &answer.path,
        ],
    ) else {
        return answer;
    };
    if !out.success {
        return answer;
    }
    answer.lines = out.stdout.lines().count();
    let mut kept = String::new();
    for (index, line) in out.stdout.lines().enumerate() {
        if index >= max_lines || kept.len() + line.len() + 1 > DIFF_MAX_BYTES {
            answer.cut = true;
            break;
        }
        kept.push_str(line);
        kept.push('\n');
    }
    answer.diff = Some(kept);
    answer
}

fn is_commit_name(value: &str) -> bool {
    matches!(value.len(), 40 | 64)
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// The subset of `hashes` that name a commit in this repository: a mark naming anything else is no mark.
#[tauri::command(async)]
pub fn git_known_commits(vault_path: String, hashes: Vec<String>) -> Result<Vec<String>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = super::repo::require_repo_root(&vault_dir)?;
    let mut wanted: Vec<String> = hashes
        .into_iter()
        .filter(|hash| is_commit_name(hash))
        .collect();
    wanted.sort();
    wanted.dedup();
    if wanted.is_empty() {
        return Ok(Vec::new());
    }
    let input: String = wanted
        .iter()
        .map(|hash| format!("{hash}^{{commit}}\n"))
        .collect();
    let (_, out) = super::runner::run_git_read_with_input(
        &repo_root,
        &["cat-file", "--batch-check"],
        input.into_bytes(),
    )?;
    let answers = String::from_utf8_lossy(&out);
    Ok(wanted
        .into_iter()
        .zip(answers.lines())
        .filter(|(_, line)| line.split(' ').nth(1) == Some("commit"))
        .map(|(hash, _)| hash)
        .collect())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckDocument {
    /// Vault-relative.
    path: String,
    before: String,
    after: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingRun {
    pass_id: String,
    documents: Vec<RecheckDocument>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckCommit {
    /// `committed`, `nothing`, `head-moved` or `refused`.
    outcome: &'static str,
    commit: Option<String>,
    written: Vec<String>,
    /// Documents that no longer held what the run read, left as they are.
    changed_meanwhile: Vec<String>,
    /// Git's refusal.
    detail: Option<String>,
    /// After a refusal: documents put back as before the run.
    restored: Vec<String>,
    /// After a refusal: documents a person changed after Atlas wrote them, left as they are.
    left: Vec<String>,
    /// After a refusal: the folder holding the text Atlas took back out.
    copy: Option<String>,
}

struct Vault {
    root: String,
    repo_root: PathBuf,
    pathspec: String,
}

fn open_vault(vault_path: &str) -> Result<Vault, String> {
    let vault_dir = validate_vault_dir(vault_path)?;
    let repo_root = super::repo::require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    Ok(Vault {
        root: vault_dir.to_string_lossy().into_owned(),
        repo_root,
        pathspec,
    })
}

impl Vault {
    /// A vault-relative Markdown document as Git names it, or `Err` for anything else.
    fn repo_path(&self, relative: &str) -> Result<String, String> {
        let clean = normalize_relative_path(relative)?;
        let clean = clean.to_string_lossy().replace('\\', "/");
        if !clean.ends_with(".md") || clean.split('/').any(|part| part.starts_with('.')) {
            return Err("recheck-document-invalid".into());
        }
        Ok(if self.pathspec == "." {
            clean
        } else {
            format!("{}/{clean}", self.pathspec)
        })
    }

    fn read(&self, relative: &str) -> Option<String> {
        let path = resolve_existing_inside(&self.root, relative).ok()?;
        std::fs::read_to_string(path).ok()
    }

    fn write(&self, relative: &str, text: &str) -> Result<(), String> {
        write_vault_text_file_blocking(self.root.clone(), relative.to_string(), text.to_string())
    }

    fn committed(&self, revision: &str, repo_path: &str) -> Option<String> {
        let out = run_git(
            &self.repo_root,
            &["cat-file", "blob", &format!("{revision}:{repo_path}")],
        )
        .ok()?;
        out.success.then_some(out.stdout)
    }

    fn head(&self) -> Option<String> {
        get_head_hash(&self.repo_root)
    }

    fn commit_only(&self, message: &str, repo_paths: &[String]) -> Result<(), String> {
        let mut args: Vec<&str> = vec!["commit", "--only", "-m", message, "--"];
        args.extend(repo_paths.iter().map(String::as_str));
        let out = run_git(&self.repo_root, &args)?;
        if out.success {
            Ok(())
        } else {
            Err(short_detail(&git_error_text(&out)))
        }
    }

    fn write_pending(&self, pending: &PendingRun) -> Result<(), String> {
        ensure_vault_directory_blocking(self.root.clone(), ".ontology-atlas".into())?;
        let text = serde_json::to_string(pending).map_err(|err| err.to_string())?;
        self.write(PENDING_FILE, &text)
    }

    fn remove_pending(&self) {
        if let Ok(path) = resolve_existing_inside(&self.root, PENDING_FILE) {
            let _ = std::fs::remove_file(path);
        }
    }

    /// Keeps `text` under `.ontology-atlas/undone/<pass>/<path>`; answers the folder.
    fn keep_undone(&self, pass_id: &str, relative: &str, text: &str) -> Option<String> {
        let folder = format!("{UNDONE_FOLDER}/{pass_id}");
        let target = format!("{folder}/{relative}");
        let parent = Path::new(&target)
            .parent()
            .map(|parent| parent.to_string_lossy().replace('\\', "/"))?;
        ensure_vault_directory_blocking(self.root.clone(), parent).ok()?;
        self.write(&target, text).ok()?;
        Some(format!("{folder}/"))
    }
}

fn short_detail(text: &str) -> String {
    let joined = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(3)
        .collect::<Vec<_>>()
        .join(" ");
    joined.chars().take(DETAIL_MAX_CHARS).collect()
}

fn is_pass_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// Writes each document's marked text and commits exactly those documents on the checked-out
/// branch, only while `HEAD` is `expected_head` and each document still holds what the run read.
/// When Git refuses, each document that still holds what Atlas wrote is put back; one a person
/// changed since is left and named, and the text taken out is kept under `.ontology-atlas/undone/`.
#[tauri::command(async)]
pub fn git_recheck_commit(
    vault_path: String,
    pass_id: String,
    expected_head: String,
    message: String,
    documents: Vec<RecheckDocument>,
) -> Result<RecheckCommit, String> {
    let vault = open_vault(&vault_path)?;
    if !is_pass_id(&pass_id) || message.trim().is_empty() {
        return Err("recheck-request-invalid".into());
    }
    commit_documents(&vault, &pass_id, &expected_head, &message, documents, || {})
}

fn commit_documents(
    vault: &Vault,
    pass_id: &str,
    expected_head: &str,
    message: &str,
    documents: Vec<RecheckDocument>,
    before_commit: impl FnOnce(),
) -> Result<RecheckCommit, String> {
    if vault.head().as_deref() != Some(expected_head) {
        return Ok(RecheckCommit {
            outcome: "head-moved",
            ..RecheckCommit::default()
        });
    }
    let mut result = RecheckCommit::default();
    let mut taken: Vec<(RecheckDocument, String)> = Vec::new();
    for document in documents {
        let repo_path = vault.repo_path(&document.path)?;
        let unchanged_on_disk =
            vault.read(&document.path).as_deref() == Some(document.before.as_str());
        let unchanged_at_head =
            vault.committed("HEAD", &repo_path).as_deref() == Some(document.before.as_str());
        if unchanged_on_disk && unchanged_at_head && document.before != document.after {
            taken.push((document, repo_path));
        } else {
            result.changed_meanwhile.push(document.path);
        }
    }
    if taken.is_empty() {
        result.outcome = "nothing";
        return Ok(result);
    }
    vault.write_pending(&PendingRun {
        pass_id: pass_id.to_string(),
        documents: taken.iter().map(|(document, _)| document.clone()).collect(),
    })?;
    for (document, _) in &taken {
        if let Err(error) = vault.write(&document.path, &document.after) {
            put_back(vault, pass_id, &taken, &mut result);
            vault.remove_pending();
            result.outcome = "refused";
            result.detail = Some(short_detail(&error));
            return Ok(result);
        }
    }
    before_commit();
    let repo_paths: Vec<String> = taken.iter().map(|(_, path)| path.clone()).collect();
    let committed = if vault.head().as_deref() == Some(expected_head) {
        vault.commit_only(message, &repo_paths)
    } else {
        Err("HEAD moved".into())
    };
    match committed {
        Ok(()) => {
            vault.remove_pending();
            result.outcome = "committed";
            result.commit = vault.head();
            result.written = taken
                .into_iter()
                .map(|(document, _)| document.path)
                .collect();
        }
        Err(detail) => {
            put_back(vault, pass_id, &taken, &mut result);
            vault.remove_pending();
            result.outcome = if detail == "HEAD moved" {
                "head-moved"
            } else {
                "refused"
            };
            result.detail = Some(detail);
        }
    }
    Ok(result)
}

fn put_back(
    vault: &Vault,
    pass_id: &str,
    taken: &[(RecheckDocument, String)],
    result: &mut RecheckCommit,
) {
    for (document, _) in taken {
        let current = vault.read(&document.path);
        if current.as_deref() == Some(document.before.as_str()) {
            continue;
        }
        if current.as_deref() != Some(document.after.as_str()) {
            result.left.push(document.path.clone());
            continue;
        }
        if let Some(copy) = vault.keep_undone(pass_id, &document.path, &document.after) {
            result.copy = Some(copy);
        }
        match vault.write(&document.path, &document.before) {
            Ok(()) => result.restored.push(document.path.clone()),
            Err(_) => result.left.push(document.path.clone()),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckRecovered {
    pass_id: String,
    restored: Vec<String>,
}

/// After Atlas quit between writing a run's documents and committing them: puts back each that
/// still holds what Atlas wrote and was never committed. `None` when no run was left open.
#[tauri::command(async)]
pub fn git_recheck_recover(vault_path: String) -> Result<Option<RecheckRecovered>, String> {
    let vault = open_vault(&vault_path)?;
    let Some(text) = vault.read(PENDING_FILE) else {
        return Ok(None);
    };
    let Ok(pending) = serde_json::from_str::<PendingRun>(&text) else {
        vault.remove_pending();
        return Ok(None);
    };
    let mut restored = Vec::new();
    for document in &pending.documents {
        let Ok(repo_path) = vault.repo_path(&document.path) else {
            continue;
        };
        let holds_atlas_text =
            vault.read(&document.path).as_deref() == Some(document.after.as_str());
        let committed =
            vault.committed("HEAD", &repo_path).as_deref() == Some(document.after.as_str());
        if holds_atlas_text && !committed && vault.write(&document.path, &document.before).is_ok() {
            restored.push(document.path.clone());
        }
    }
    vault.remove_pending();
    Ok(Some(RecheckRecovered {
        pass_id: pending.pass_id,
        restored,
    }))
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckUndo {
    /// `undone`, `nothing`, `gone` or `refused`.
    outcome: &'static str,
    commit: Option<String>,
    undone: Vec<String>,
    /// Documents that changed after the run, left as they are.
    skipped: Vec<String>,
    detail: Option<String>,
}

/// Commits the text each document had before `run_commit`, for those still exactly as the run
/// left them. A run whose commit is no longer on this branch is `gone`.
#[tauri::command(async)]
pub fn git_recheck_undo(
    vault_path: String,
    run_commit: String,
    paths: Vec<String>,
    message: String,
) -> Result<RecheckUndo, String> {
    let vault = open_vault(&vault_path)?;
    if !is_commit_name(&run_commit) || message.trim().is_empty() {
        return Err("recheck-request-invalid".into());
    }
    let detached = is_head_detached(&vault.repo_root);
    if let Some(detail) = git_hold(&vault.repo_root, vault.head().is_some(), detached) {
        return Ok(RecheckUndo {
            outcome: "refused",
            detail: Some(detail),
            ..RecheckUndo::default()
        });
    }
    let on_branch = run_git(
        &vault.repo_root,
        &["merge-base", "--is-ancestor", &run_commit, "HEAD"],
    )?
    .success;
    if !on_branch {
        return Ok(RecheckUndo {
            outcome: "gone",
            ..RecheckUndo::default()
        });
    }
    let mut result = RecheckUndo::default();
    let mut written: Vec<(String, String, String)> = Vec::new();
    let parent = format!("{run_commit}^");
    for path in paths {
        let repo_path = vault.repo_path(&path)?;
        let (Some(at_run), Some(before_run)) = (
            vault.committed(&run_commit, &repo_path),
            vault.committed(&parent, &repo_path),
        ) else {
            result.skipped.push(path);
            continue;
        };
        let unchanged_since = vault.committed("HEAD", &repo_path).as_deref()
            == Some(at_run.as_str())
            && vault.read(&path).as_deref() == Some(at_run.as_str());
        if !unchanged_since || at_run == before_run {
            result.skipped.push(path);
            continue;
        }
        vault.write(&path, &before_run)?;
        written.push((path, repo_path, at_run));
    }
    if written.is_empty() {
        result.outcome = "nothing";
        return Ok(result);
    }
    let repo_paths: Vec<String> = written
        .iter()
        .map(|(_, repo_path, _)| repo_path.clone())
        .collect();
    match vault.commit_only(&message, &repo_paths) {
        Ok(()) => {
            result.outcome = "undone";
            result.commit = vault.head();
            result.undone = written.into_iter().map(|(path, _, _)| path).collect();
        }
        Err(detail) => {
            for (path, _, at_run) in &written {
                let _ = vault.write(path, at_run);
            }
            result.outcome = "refused";
            result.detail = Some(detail);
        }
    }
    Ok(result)
}
