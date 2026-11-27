//! Git for the scheduled recheck (`docs/specs/2026-11-27-stale-concept-recheck.md`): whether a
//! run may commit here, what changed in each cited file, one commit holding exactly the documents
//! the run marked, its put-back when Git refuses, and the undo of a run or one concept.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

use super::classify::git_error_text;
use super::repo::{find_repo_root, get_head_hash, vault_pathspec};
use super::runner::{
    run_git, run_git_read_lines_bounded, run_git_with_deadline, validate_vault_dir,
};
use crate::code_reader::refusal::path_refusal;
use crate::vault::scope::{normalize_relative_path, resolve_existing_inside};
use crate::vault::write::{ensure_vault_directory_blocking, write_vault_text_file_blocking};

#[cfg(test)]
mod tests;

/// Under the app's data folder, never the opened folder: a journal in the folder could be
/// planted to make Atlas write chosen text into its documents when the folder opens.
const JOURNAL_FOLDER: &str = "recheck-pending";
const UNDONE_FOLDER: &str = ".ontology-atlas/undone";
/// Git's refusal shown in a sentence: its first lines, cut.
const DETAIL_MAX_CHARS: usize = 400;
/// A diff over this many bytes is cut like one over the line limit.
const DIFF_MAX_BYTES: usize = 64 * 1024;
/// Git is stopped once a diff's output passes this, and the line count is a lower bound.
const DIFF_READ_CEILING: usize = 8 * 1024 * 1024;
const DIFF_REQUEST_MAX: usize = 256;
/// A commit runs the person's hooks; one that has not finished by then is stopped and refused.
const COMMIT_DEADLINE: Duration = Duration::from_secs(60);
const MARKS_MAX: usize = 4096;
const DOCUMENT_MAX_BYTES: u64 = 1024 * 1024;
const EVIDENCE_CHECKED_KEY: &str = "evidence_checked:";

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
    /// The repository's top folder, so a source read can be matched to it.
    repo_root: Option<String>,
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
            repo_root: None,
            head: None,
            branch: None,
            remote_default: None,
            hold: None,
        });
    };
    let place = commit_place(&repo_root);
    Ok(RecheckGitState {
        repository: true,
        repo_root: Some(repo_root.to_string_lossy().into_owned()),
        head: place.head,
        branch: place.branch,
        remote_default: place.remote_default,
        hold: place.hold,
    })
}

struct CommitPlace {
    head: Option<String>,
    branch: Option<String>,
    remote_default: Option<String>,
    hold: Option<RecheckHold>,
}

/// Read again right before every commit and undo, not only before the turn.
fn commit_place(repo_root: &Path) -> CommitPlace {
    let head = get_head_hash(repo_root);
    let branch = checked_out_branch(repo_root);
    let remote_default = remote_default_branch(repo_root);
    let hold = git_hold(repo_root, head.is_some(), branch.is_none())
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
    CommitPlace {
        head,
        branch,
        remote_default,
        hold,
    }
}

/// The checked-out branch as `HEAD` names it, `None` when detached. Read as a ref, because
/// `rev-parse --abbrev-ref` answers `heads/main` when a tag is also called `main`.
fn checked_out_branch(repo_root: &Path) -> Option<String> {
    let out = run_git(repo_root, &["symbolic-ref", "--quiet", "HEAD"]).ok()?;
    if !out.success {
        return None;
    }
    out.stdout
        .trim()
        .strip_prefix("refs/heads/")
        .filter(|name| !name.is_empty())
        .map(str::to_string)
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
    let Ok(out) = run_git_read_lines_bounded(
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
        max_lines,
        DIFF_MAX_BYTES,
        DIFF_READ_CEILING,
    ) else {
        return answer;
    };
    if !out.success {
        return answer;
    }
    answer.lines = out.lines;
    answer.cut = out.cut;
    answer.diff = Some(out.kept);
    answer
}

fn is_commit_name(value: &str) -> bool {
    matches!(value.len(), 40 | 64)
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckMark {
    /// Vault-relative document.
    path: String,
    /// The commit its `evidence_checked` names.
    mark: String,
}

/// The documents whose mark still stands: it names a commit of this repository, and the
/// document then and now differ only in their `evidence_checked` line. A mark naming an
/// unknown commit, or a document a person changed after the recheck, counts as none.
#[tauri::command(async)]
pub fn git_recheck_marks_hold(
    vault_path: String,
    marks: Vec<RecheckMark>,
) -> Result<Vec<String>, String> {
    let vault = open_vault(&vault_path)?;
    Ok(marks
        .into_iter()
        .take(MARKS_MAX)
        .filter(|mark| is_commit_name(&mark.mark))
        .filter_map(|mark| {
            let repo_path = vault.repo_path(&mark.path).ok()?;
            let then = vault.committed(&format!("{}^{{commit}}", mark.mark), &repo_path)?;
            let now = vault.read(&mark.path)?;
            (without_marks(&then) == without_marks(&now)).then_some(mark.path)
        })
        .collect())
}

/// The text with line endings as LF and every `evidence_checked` line of its frontmatter removed.
fn without_marks(text: &str) -> String {
    let text = text.replace("\r\n", "\n");
    let mut lines = text.split('\n');
    let mut out: Vec<&str> = Vec::new();
    if text.starts_with("---\n") {
        if let Some(open) = lines.next() {
            out.push(open);
        }
        for line in lines.by_ref() {
            if line == "---" {
                out.push(line);
                break;
            }
            if !line.starts_with(EVIDENCE_CHECKED_KEY) {
                out.push(line);
            }
        }
    }
    out.extend(lines);
    out.join("\n")
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UncommittedPaths {
    changed: Vec<String>,
    /// Paths past the request cap, which Git was not asked about: treat them as changed.
    unchecked: Vec<String>,
}

/// Which of the given paths have uncommitted changes, staged or not, as the caller wrote them:
/// `vault_paths` vault-relative, `repo_paths` repository-relative. A run skips those concepts.
#[tauri::command(async)]
pub fn git_uncommitted_paths(
    vault_path: String,
    vault_paths: Vec<String>,
    repo_paths: Vec<String>,
) -> Result<UncommittedPaths, String> {
    let vault = open_vault(&vault_path)?;
    let prefix = if vault.pathspec == "." {
        String::new()
    } else {
        format!("{}/", vault.pathspec)
    };
    let mut wanted: Vec<(String, String)> = vault_paths
        .iter()
        .map(|path| (path.clone(), format!("{prefix}{path}")))
        .chain(repo_paths.iter().map(|path| (path.clone(), path.clone())))
        .filter(|(key, _)| {
            !key.is_empty() && !key.starts_with('-') && normalize_relative_path(key).is_ok()
        })
        .collect();
    let unchecked: Vec<String> = if wanted.len() > super::evidence::MAX_EVIDENCE_PATHS {
        wanted
            .split_off(super::evidence::MAX_EVIDENCE_PATHS)
            .into_iter()
            .map(|(key, _)| key)
            .collect()
    } else {
        Vec::new()
    };
    if wanted.is_empty() {
        return Ok(UncommittedPaths {
            changed: Vec::new(),
            unchecked,
        });
    }
    let mut args = vec![
        "-c",
        "core.quotepath=false",
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=no",
        "--",
    ];
    args.extend(wanted.iter().map(|(_, resolved)| resolved.as_str()));
    let out = run_git(&vault.repo_root, &args)?;
    if !out.success {
        return Err(short_detail(&out.stderr));
    }
    let changed: std::collections::HashSet<&str> = out
        .stdout
        .split('\0')
        .filter_map(|record| record.get(3..))
        .filter(|path| !path.is_empty())
        .collect();
    Ok(UncommittedPaths {
        changed: wanted
            .into_iter()
            .filter(|(_, resolved)| changed.contains(resolved.as_str()))
            .map(|(key, _)| key)
            .collect(),
        unchecked,
    })
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
    #[serde(default)]
    round_id: String,
    pass_id: String,
    documents: Vec<RecheckDocument>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecheckCommit {
    /// `committed`, `nothing`, `held`, `head-moved` or `refused`.
    outcome: &'static str,
    commit: Option<String>,
    written: Vec<String>,
    /// Documents that no longer held what the run read, left as they are.
    changed_meanwhile: Vec<String>,
    /// Git's refusal.
    detail: Option<String>,
    /// When `held`: why Git could not commit when the run finished.
    hold: Option<RecheckHold>,
    /// After a refusal: documents put back as before the run.
    restored: Vec<String>,
    /// After a refusal: documents a person changed after Atlas wrote them, left as they are.
    left: Vec<String>,
    /// After a refusal: the folder holding the text Atlas took back out.
    copy: Option<String>,
    /// After a commit: documents whose committed text is not what Atlas wrote (a hook changed
    /// them). The commit stays for the person to undo.
    rewritten: Vec<String>,
}

struct Vault {
    root: String,
    repo_root: PathBuf,
    pathspec: String,
    /// The run journal for this folder, under the app's data folder.
    journal: Option<PathBuf>,
    commit_deadline: Duration,
}

fn open_vault(vault_path: &str) -> Result<Vault, String> {
    let vault_dir = validate_vault_dir(vault_path)?;
    let repo_root = super::repo::require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    Ok(Vault {
        root: vault_dir.to_string_lossy().into_owned(),
        repo_root,
        pathspec,
        journal: None,
        commit_deadline: COMMIT_DEADLINE,
    })
}

/// `vault_path` with its run journal kept in `journal_dir`, one file per folder.
fn open_vault_with_journal(vault_path: &str, journal_dir: &Path) -> Result<Vault, String> {
    use sha2::{Digest, Sha256};
    let mut vault = open_vault(vault_path)?;
    let name = crate::lower_hex::lower_hex(&Sha256::digest(vault.root.as_bytes()));
    vault.journal = Some(journal_dir.join(format!("{name}.json")));
    Ok(vault)
}

fn journal_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(JOURNAL_FOLDER))
        .map_err(|error| error.to_string())
}

enum CommitStop {
    Held(RecheckHold),
    HeadMoved,
    Refused(String),
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
        if std::fs::metadata(&path).ok()?.len() > DOCUMENT_MAX_BYTES {
            return None;
        }
        std::fs::read_to_string(path).ok()
    }

    fn write(&self, relative: &str, text: &str) -> Result<(), String> {
        write_vault_text_file_blocking(self.root.clone(), relative.to_string(), text.to_string())
    }

    /// The blob at `revision:repo_path` as Git stores it, at most `DOCUMENT_MAX_BYTES`.
    fn committed(&self, revision: &str, repo_path: &str) -> Option<String> {
        let object = format!("{revision}:{repo_path}");
        let size = run_git(&self.repo_root, &["cat-file", "-s", &object]).ok()?;
        if !size.success || size.stdout.trim().parse::<u64>().ok()? > DOCUMENT_MAX_BYTES {
            return None;
        }
        let out = run_git(&self.repo_root, &["cat-file", "blob", &object]).ok()?;
        out.success.then_some(out.stdout)
    }

    /// Git's own answer to "is this document at `HEAD` exactly as on disk": tracked in `HEAD`
    /// and with no staged, unstaged or untracked change, line-ending rules applied.
    fn clean_at_head(&self, repo_path: &str) -> bool {
        let tracked = run_git(
            &self.repo_root,
            &["cat-file", "-e", &format!("HEAD:{repo_path}")],
        )
        .is_ok_and(|out| out.success);
        tracked
            && run_git(
                &self.repo_root,
                &[
                    "-c",
                    "core.quotepath=false",
                    "status",
                    "--porcelain=v1",
                    "-z",
                    "--untracked-files=all",
                    "--",
                    repo_path,
                ],
            )
            .is_ok_and(|out| out.success && out.stdout.is_empty())
    }

    fn head(&self) -> Option<String> {
        get_head_hash(&self.repo_root)
    }

    /// The commit only when `HEAD` is still `expected_head` and Git may commit here now.
    fn commit_checked(
        &self,
        expected_head: Option<&str>,
        message: &str,
        repo_paths: &[String],
    ) -> Result<(), CommitStop> {
        let place = commit_place(&self.repo_root);
        if let Some(hold) = place.hold {
            return Err(CommitStop::Held(hold));
        }
        if expected_head.is_some_and(|expected| place.head.as_deref() != Some(expected)) {
            return Err(CommitStop::HeadMoved);
        }
        let mut args: Vec<&str> = vec!["commit", "--only", "-m", message, "--"];
        args.extend(repo_paths.iter().map(String::as_str));
        let out = run_git_with_deadline(&self.repo_root, &args, self.commit_deadline)
            .map_err(|error| CommitStop::Refused(short_detail(&error)))?;
        if out.success {
            Ok(())
        } else {
            Err(CommitStop::Refused(short_detail(&git_error_text(&out))))
        }
    }

    fn write_pending(&self, pending: &PendingRun) -> Result<(), String> {
        let journal = self.journal.as_ref().ok_or("recheck-journal-missing")?;
        if let Some(parent) = journal.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let text = serde_json::to_string(pending).map_err(|error| error.to_string())?;
        let temporary = journal.with_extension("json.tmp");
        std::fs::write(&temporary, text).map_err(|error| error.to_string())?;
        std::fs::rename(&temporary, journal).map_err(|error| error.to_string())
    }

    fn read_pending(&self) -> Option<String> {
        std::fs::read_to_string(self.journal.as_ref()?).ok()
    }

    fn remove_pending(&self) {
        if let Some(journal) = &self.journal {
            let _ = std::fs::remove_file(journal);
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
/// branch, only while Git may commit here, `HEAD` is `expected_head` and each document still
/// holds what the run read. When Git refuses, each document that still holds what Atlas wrote is
/// put back; one a person changed since is left and named, and the text taken out is kept under
/// `.ontology-atlas/undone/`.
#[tauri::command(async)]
pub fn git_recheck_commit(
    app: tauri::AppHandle,
    vault_path: String,
    round_id: String,
    pass_id: String,
    expected_head: String,
    message: String,
    documents: Vec<RecheckDocument>,
) -> Result<RecheckCommit, String> {
    let vault = open_vault_with_journal(&vault_path, &journal_dir(&app)?)?;
    if !is_pass_id(&round_id) || !is_pass_id(&pass_id) || message.trim().is_empty() {
        return Err("recheck-request-invalid".into());
    }
    commit_documents(
        &vault,
        &round_id,
        &pass_id,
        &expected_head,
        &message,
        documents,
        || {},
    )
}

fn commit_documents(
    vault: &Vault,
    round_id: &str,
    pass_id: &str,
    expected_head: &str,
    message: &str,
    documents: Vec<RecheckDocument>,
    before_commit: impl FnOnce(),
) -> Result<RecheckCommit, String> {
    let place = commit_place(&vault.repo_root);
    if let Some(hold) = place.hold {
        return Ok(RecheckCommit {
            outcome: "held",
            hold: Some(hold),
            ..RecheckCommit::default()
        });
    }
    if place.head.as_deref() != Some(expected_head) {
        return Ok(RecheckCommit {
            outcome: "head-moved",
            ..RecheckCommit::default()
        });
    }
    let mut result = RecheckCommit::default();
    let mut taken: Vec<(RecheckDocument, String)> = Vec::new();
    for document in documents {
        let repo_path = vault.repo_path(&document.path)?;
        let unchanged = vault.read(&document.path).as_deref() == Some(document.before.as_str())
            && vault.clean_at_head(&repo_path);
        if unchanged && document.before != document.after {
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
        round_id: round_id.to_string(),
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
    match vault.commit_checked(Some(expected_head), message, &repo_paths) {
        Ok(()) => {
            vault.remove_pending();
            result.outcome = "committed";
            result.commit = vault.head();
            for (document, repo_path) in taken {
                let as_written = vault.read(&document.path).as_deref()
                    == Some(document.after.as_str())
                    && vault.clean_at_head(&repo_path);
                if !as_written {
                    result.rewritten.push(document.path.clone());
                }
                result.written.push(document.path);
            }
        }
        Err(stop) => {
            put_back(vault, pass_id, &taken, &mut result);
            vault.remove_pending();
            match stop {
                CommitStop::Held(hold) => {
                    result.outcome = "held";
                    result.hold = Some(hold);
                }
                CommitStop::HeadMoved => result.outcome = "head-moved",
                CommitStop::Refused(detail) => {
                    result.outcome = "refused";
                    result.detail = Some(detail);
                }
            }
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
    round_id: String,
    pass_id: String,
    restored: Vec<String>,
}

/// After Atlas quit between writing a run's documents and committing them: puts back each that
/// still holds what Atlas wrote and was never committed. `None` when no run was left open.
/// Only the journal this app wrote is read; a file in the opened folder is never trusted.
#[tauri::command(async)]
pub fn git_recheck_recover(
    app: tauri::AppHandle,
    vault_path: String,
) -> Result<Option<RecheckRecovered>, String> {
    let vault = open_vault_with_journal(&vault_path, &journal_dir(&app)?)?;
    Ok(recover_run(&vault))
}

fn recover_run(vault: &Vault) -> Option<RecheckRecovered> {
    let text = vault.read_pending()?;
    let Ok(pending) = serde_json::from_str::<PendingRun>(&text) else {
        vault.remove_pending();
        return None;
    };
    let mut restored = Vec::new();
    for document in &pending.documents {
        let Ok(repo_path) = vault.repo_path(&document.path) else {
            continue;
        };
        let holds_atlas_text =
            vault.read(&document.path).as_deref() == Some(document.after.as_str());
        if holds_atlas_text
            && !vault.clean_at_head(&repo_path)
            && vault.write(&document.path, &document.before).is_ok()
        {
            restored.push(document.path.clone());
        }
    }
    vault.remove_pending();
    Some(RecheckRecovered {
        round_id: pending.round_id,
        pass_id: pending.pass_id,
        restored,
    })
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

/// `text` with the line endings `like` uses on disk, so a put-back document keeps them.
fn with_line_endings_of(text: &str, like: &str) -> String {
    if like.contains("\r\n") && !text.contains('\r') {
        text.replace('\n', "\r\n")
    } else {
        text.to_string()
    }
}

/// Commits the text each document had before `run_commit`, for those still exactly as the run
/// left them, under the same holds as a run's commit. A run whose commit is no longer on this
/// branch is `gone`. When Git refuses, every document Atlas changed for the undo is put back
/// unless a person changed it meanwhile.
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
    undo_run(&vault, &run_commit, paths, &message, || {})
}

fn hold_detail(hold: &RecheckHold) -> String {
    if hold.reason == "branch" {
        format!("{} is the remote's default branch", hold.detail)
    } else {
        hold.detail.clone()
    }
}

fn undo_run(
    vault: &Vault,
    run_commit: &str,
    paths: Vec<String>,
    message: &str,
    before_commit: impl FnOnce(),
) -> Result<RecheckUndo, String> {
    if let Some(hold) = commit_place(&vault.repo_root).hold {
        return Ok(RecheckUndo {
            outcome: "refused",
            detail: Some(hold_detail(&hold)),
            ..RecheckUndo::default()
        });
    }
    let on_branch = run_git(
        &vault.repo_root,
        &["merge-base", "--is-ancestor", run_commit, "HEAD"],
    )?
    .success;
    if !on_branch {
        return Ok(RecheckUndo {
            outcome: "gone",
            ..RecheckUndo::default()
        });
    }
    let mut result = RecheckUndo::default();
    // Per document: the vault path, Git's path, the text on disk before the undo and the text written.
    let mut written: Vec<(String, String, String, String)> = Vec::new();
    let parent = format!("{run_commit}^");
    for path in paths {
        let repo_path = vault.repo_path(&path)?;
        let (Some(at_run), Some(before_run), Some(on_disk)) = (
            vault.committed(run_commit, &repo_path),
            vault.committed(&parent, &repo_path),
            vault.read(&path),
        ) else {
            result.skipped.push(path);
            continue;
        };
        let unchanged_since = vault.committed("HEAD", &repo_path).as_deref()
            == Some(at_run.as_str())
            && vault.clean_at_head(&repo_path);
        if !unchanged_since || at_run == before_run {
            result.skipped.push(path);
            continue;
        }
        let text = with_line_endings_of(&before_run, &on_disk);
        if let Err(error) = vault.write(&path, &text) {
            restore_undo(vault, &written, &mut result);
            result.outcome = "refused";
            result.detail = Some(short_detail(&error));
            return Ok(result);
        }
        written.push((path, repo_path, on_disk, text));
    }
    if written.is_empty() {
        result.outcome = "nothing";
        return Ok(result);
    }
    before_commit();
    let repo_paths: Vec<String> = written
        .iter()
        .map(|(_, repo_path, _, _)| repo_path.clone())
        .collect();
    match vault.commit_checked(None, message, &repo_paths) {
        Ok(()) => {
            result.outcome = "undone";
            result.commit = vault.head();
            result.undone = written.into_iter().map(|(path, ..)| path).collect();
        }
        Err(stop) => {
            restore_undo(vault, &written, &mut result);
            result.outcome = "refused";
            result.detail = Some(match stop {
                CommitStop::Held(hold) => hold_detail(&hold),
                CommitStop::HeadMoved => "HEAD moved".into(),
                CommitStop::Refused(detail) => detail,
            });
        }
    }
    Ok(result)
}

/// Puts back each document the undo rewrote, unless a person changed it since; that one is named.
fn restore_undo(
    vault: &Vault,
    written: &[(String, String, String, String)],
    result: &mut RecheckUndo,
) {
    for (path, _, on_disk, text) in written {
        if vault.read(path).as_deref() != Some(text.as_str()) || vault.write(path, on_disk).is_err()
        {
            result.skipped.push(path.clone());
        }
    }
}
