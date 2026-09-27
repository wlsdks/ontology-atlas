// Native git commands for the vault, with the safety rules of `git-snapshot.mjs`
// (cli/ and mcp/ mirror): local commits only, push or pull only on request, no
// auto-init, no credentials, nothing outside the vault pathspec.

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use crate::errors::coded;

// The path comes from the WebView; canonicalized as git's cwd so relative
// pathspecs cannot reach outside the vault.
pub(crate) fn validate_vault_dir(vault_path: &str) -> Result<PathBuf, String> {
    if vault_path.trim().is_empty() {
        return Err(coded("vault-path-empty", ""));
    }
    let path = PathBuf::from(vault_path);
    let metadata = fs::metadata(&path).map_err(|_| coded("vault-path-missing", ""))?;
    if !metadata.is_dir() {
        return Err(coded("vault-path-not-a-folder", ""));
    }
    fs::canonicalize(&path).map_err(|err| coded("vault-path-unresolvable", err))
}

struct GitRun {
    success: bool,
    stdout: String,
    stderr: String,
}

/// `Err` only when spawn fails; stderr is piped so it stays off the user's terminal.
fn run_git(cwd: &Path, args: &[&str]) -> Result<GitRun, String> {
    let mut command = Command::new("git");
    command.args(args).current_dir(cwd);
    silence_git_credential_prompts(&mut command);
    let output = command
        .output()
        .map_err(|err| coded("git-not-runnable", err))?;
    Ok(GitRun {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

/// Guards against a credential helper or `SSH_ASKPASS` opening a window nobody
/// expects; the deadline is the real defence. `GIT_SSH_COMMAND` is left alone so a
/// user's `core.sshCommand` still applies.
fn silence_git_credential_prompts(command: &mut Command) {
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "");
}

/// Generous so a slow first pull finishes; it bounds a remote that accepts the
/// connection and then never answers, since git has no timeout of its own.
const NETWORK_GIT_DEADLINE: std::time::Duration = std::time::Duration::from_secs(120);

fn run_network_git(cwd: &Path, args: &[&str]) -> Result<GitRun, String> {
    let mut command = Command::new("git");
    command.args(args).current_dir(cwd);
    silence_git_credential_prompts(&mut command);
    let label = args.first().copied().unwrap_or("command");
    run_with_deadline(command, label, NETWORK_GIT_DEADLINE)
}

/// The pipes drain while waiting, or output past their 64 KiB buffer blocks the child.
fn run_with_deadline(
    mut command: Command,
    label: &str,
    deadline: std::time::Duration,
) -> Result<GitRun, String> {
    use std::process::Stdio;

    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| coded("git-not-runnable", err))?;
    let stdout = drain_pipe(child.stdout.take());
    let stderr = drain_pipe(child.stderr.take());

    let started = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Ok(GitRun {
                    success: status.success(),
                    stdout: collect_pipe(stdout),
                    stderr: collect_pipe(stderr),
                });
            }
            Ok(None) => {
                if started.elapsed() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(coded(
                        "git-network-timeout",
                        format!("git {label} did not finish within {}s", deadline.as_secs()),
                    ));
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(err) => return Err(coded("git-not-runnable", err)),
        }
    }
}

fn drain_pipe<R: std::io::Read + Send + 'static>(
    pipe: Option<R>,
) -> Option<std::thread::JoinHandle<Vec<u8>>> {
    pipe.map(|mut pipe| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            bytes
        })
    })
}

fn collect_pipe(reader: Option<std::thread::JoinHandle<Vec<u8>>>) -> String {
    let bytes = reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    String::from_utf8_lossy(&bytes).into_owned()
}

/// `Ok(None)` outside a git repo.
pub(crate) fn find_repo_root(vault_dir: &Path) -> Result<Option<PathBuf>, String> {
    let out = run_git(vault_dir, &["rev-parse", "--show-toplevel"])?;
    if !out.success {
        return Ok(None);
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    // Canonicalized to match vault_dir's pathspec base (for example /var vs /private/var).
    let root = PathBuf::from(trimmed);
    Ok(Some(fs::canonicalize(&root).unwrap_or(root)))
}

/// `Err` outside a repo; this never auto-inits. The `git_init` button is a separate,
/// explicit path.
fn require_repo_root(vault_dir: &Path) -> Result<PathBuf, String> {
    match find_repo_root(vault_dir)? {
        Some(root) => Ok(root),
        None => Err(coded("git-repo-missing", "")),
    }
}

/// "." when the vault is the repo root.
fn vault_pathspec(repo_root: &Path, vault_dir: &Path) -> String {
    match vault_dir.strip_prefix(repo_root) {
        Ok(rel) => {
            let mut parts: Vec<String> = Vec::new();
            for component in rel.components() {
                if let Component::Normal(part) = component {
                    parts.push(part.to_string_lossy().into_owned());
                }
            }
            if parts.is_empty() {
                ".".into()
            } else {
                parts.join("/")
            }
        }
        Err(_) => ".".into(),
    }
}

struct PorcelainRow {
    index: char,
    worktree: char,
    path: String,
    renamed_from: Option<String>,
}

fn parse_porcelain(out: &str) -> Vec<PorcelainRow> {
    out.lines()
        .filter_map(|line| {
            // Read with `get`, not sliced: callers are sync commands on the macOS main thread,
            // where a panic aborts the app. An unrecognized line is skipped.
            let bytes = line.as_bytes();
            let index = *bytes.first()? as char;
            let worktree = *bytes.get(1)? as char;
            let rest = line.get(3..)?;
            let mut renamed_from = None;
            let mut path = rest.to_string();
            if let Some(arrow) = rest.find(" -> ") {
                if let (Some(before), Some(after)) = (rest.get(..arrow), rest.get(arrow + 4..)) {
                    renamed_from = Some(before.to_string());
                    path = after.to_string();
                }
            }
            Some(PorcelainRow {
                index,
                worktree,
                path,
                renamed_from,
            })
        })
        .collect()
}

fn get_porcelain_status(repo_root: &Path, pathspec: &str) -> Result<Vec<PorcelainRow>, String> {
    let out = run_git(
        repo_root,
        &[
            // Raw UTF-8 paths; the default core.quotePath C-quotes non-ASCII names and every
            // consumer would mangle them. The newline+arrow form stays because the Rust
            // mirror's tests pin it.
            "-c",
            "core.quotepath=false",
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--",
            pathspec,
        ],
    )?;
    if !out.success {
        return Err(coded(
            "git-status-failed",
            first_nonempty_line(&out.stderr).unwrap_or_else(|| "unknown error".into()),
        ));
    }
    Ok(parse_porcelain(&out.stdout))
}

/// Whole-repo status for the staged-outside-vault guard; empty on failure.
fn get_full_porcelain_status(repo_root: &Path) -> Vec<PorcelainRow> {
    match run_git(
        repo_root,
        &[
            "-c",
            "core.quotepath=false",
            "status",
            "--porcelain",
            "--untracked-files=all",
        ],
    ) {
        Ok(out) if out.success => parse_porcelain(&out.stdout),
        _ => Vec::new(),
    }
}

fn classify_change(row: &PorcelainRow) -> &'static str {
    if row.index == 'D' || row.worktree == 'D' {
        return "deleted";
    }
    if row.index == 'R' {
        return "renamed";
    }
    if (row.index == '?' && row.worktree == '?') || row.index == 'A' {
        return "added";
    }
    "modified"
}

type KindSlug = (Option<String>, Option<String>);

// Best-effort top-level `kind:`/`slug:` from the leading `---` block; never
// blocks a commit.
fn read_kind_slug(abs_path: &Path) -> KindSlug {
    use std::io::BufRead;

    let Ok(file) = fs::File::open(abs_path) else {
        return (None, None);
    };
    let mut lines = std::io::BufReader::new(file).lines();
    if !matches!(lines.next(), Some(Ok(first)) if first.trim_end() == "---") {
        return (None, None);
    }
    let mut kind = None;
    let mut slug = None;
    for line in lines {
        let Ok(line) = line else {
            return (None, None);
        };
        let trimmed = line.trim_end();
        if trimmed == "---" {
            break;
        }
        if let Some(rest) = line.strip_prefix("kind:") {
            let value = unquote(rest.trim());
            if !value.is_empty() {
                kind = Some(value);
            }
        } else if let Some(rest) = line.strip_prefix("slug:") {
            let value = unquote(rest.trim());
            if !value.is_empty() {
                slug = Some(value);
            }
        }
    }
    (kind, slug)
}

/// `strip_prefix`/`strip_suffix`, not byte indexing, so a panic cannot abort the
/// app from the macOS main thread.
fn unquote(value: &str) -> String {
    for quote in ['"', '\''] {
        if let Some(inner) = value
            .strip_prefix(quote)
            .and_then(|rest| rest.strip_suffix(quote))
        {
            return inner.to_string();
        }
    }
    value.to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangeEntry {
    path: String,
    status: String,
    kind: Option<String>,
    slug: String,
    renamed_from: Option<String>,
}

fn build_change_summary(
    rows: &[PorcelainRow],
    repo_root: &Path,
    vault_dir: &Path,
) -> Vec<ChangeEntry> {
    rows.iter()
        .map(|row| {
            let abs_path = repo_root.join(&row.path);
            let status = classify_change(row);
            let mut kind = None;
            let mut slug = path_based_slug(vault_dir, &abs_path);
            if row.path.ends_with(".md") && status != "deleted" {
                let (k, s) = read_kind_slug(&abs_path);
                if k.is_some() {
                    kind = k;
                }
                if let Some(s) = s {
                    slug = s;
                }
            }
            let renamed_from = if status == "renamed" {
                row.renamed_from.clone()
            } else {
                None
            };
            ChangeEntry {
                path: row.path.clone(),
                status: status.to_string(),
                kind,
                slug,
                renamed_from,
            }
        })
        .collect()
}

fn path_based_slug(vault_dir: &Path, abs_path: &Path) -> String {
    let rel = abs_path
        .strip_prefix(vault_dir)
        .unwrap_or(abs_path)
        .to_string_lossy()
        .replace('\\', "/");
    rel.strip_suffix(".md").unwrap_or(&rel).to_string()
}

/// Kind counts plus up to three representative slugs.
fn format_snapshot_summary(changes: &[ChangeEntry]) -> String {
    let added = changes.iter().filter(|c| c.status == "added").count();
    let modified = changes.iter().filter(|c| c.status == "modified").count();
    let removed = changes.iter().filter(|c| c.status == "deleted").count();
    let renamed = changes.iter().filter(|c| c.status == "renamed").count();

    let mut parts: Vec<String> = Vec::new();
    if added > 0 {
        parts.push(format!(
            "+{added} concept{}",
            if added == 1 { "" } else { "s" }
        ));
    }
    if modified > 0 {
        parts.push(format!("~{modified} updated"));
    }
    if renamed > 0 {
        parts.push(format!("→{renamed} renamed"));
    }
    if removed > 0 {
        parts.push(format!("-{removed} removed"));
    }

    let headline = if parts.is_empty() {
        "ontology snapshot: no concept changes".to_string()
    } else {
        format!("ontology snapshot: {}", parts.join(", "))
    };

    let slugs: Vec<&str> = changes.iter().map(|c| c.slug.as_str()).collect();
    let shown = &slugs[..slugs.len().min(3)];
    let overflow = slugs.len() - shown.len();
    if shown.is_empty() {
        headline
    } else {
        let overflow_text = if overflow > 0 {
            format!(", +{overflow}")
        } else {
            String::new()
        };
        format!("{headline} ({}{overflow_text})", shown.join(", "))
    }
}

fn status_mark(status: &str) -> char {
    match status {
        "added" => 'A',
        "modified" => 'M',
        "deleted" => 'D',
        "renamed" => 'R',
        _ => '?',
    }
}

/// A custom message keeps the auto summary in the body.
fn build_commit_message(
    subject: &str,
    auto_summary: &str,
    changes: &[ChangeEntry],
    has_custom_message: bool,
) -> String {
    let mut body: Vec<String> = Vec::new();
    if has_custom_message {
        body.push(auto_summary.to_string());
        body.push(String::new());
    }
    for c in changes {
        body.push(format!("  {}  {}", status_mark(&c.status), c.path));
    }
    format!("{subject}\n\n{}", body.join("\n"))
}

/// Reported as a warning, never mixed into the commit.
fn find_staged_outside_vault(rows: &[PorcelainRow], pathspec: &str) -> Vec<String> {
    rows.iter()
        .filter(|row| {
            let is_staged = row.index != ' ' && row.index != '?';
            is_staged && !is_under_pathspec(&row.path, pathspec)
        })
        .map(|row| row.path.clone())
        .collect()
}

fn is_under_pathspec(path: &str, pathspec: &str) -> bool {
    if pathspec == "." {
        return true;
    }
    path == pathspec || path.starts_with(&format!("{pathspec}/"))
}

fn first_nonempty_line(text: &str) -> Option<String> {
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .map(|l| l.to_string())
}

/// A code the screen localizes through `nativeErrors`, plus git's own first line
/// as detail, because only git knows what went wrong (see `errors.rs`).
struct GitErrorInfo {
    /// Also the prefix of the `Err(String)` payload.
    code: &'static str,
    /// Machine detail, never prose.
    note: Option<String>,
    /// Untranslated: it is typed verbatim into a shell.
    guidance: Option<String>,
}

fn classify_git_error(raw: &str, operation: &str) -> GitErrorInfo {
    let text = raw.to_lowercase();
    let first_line = first_nonempty_line(raw);

    if text.contains("non-fast-forward")
        || text.contains("updates were rejected")
        || (text.contains("[rejected]") && text.contains("fetch first"))
    {
        return GitErrorInfo {
            code: "push-non-fast-forward",
            note: first_line,
            guidance: Some("git pull".into()),
        };
    }

    if text.contains("gpg failed to sign")
        || text.contains("signing failed")
        || (text.contains("gpg") && text.contains("sign"))
    {
        return GitErrorInfo {
            code: "gpg-sign-failed",
            note: first_line,
            guidance: Some("git config commit.gpgsign false".into()),
        };
    }

    if text.contains("cannot do a partial commit") {
        return GitErrorInfo {
            code: "merge-in-progress",
            note: first_line,
            guidance: Some("git status".into()),
        };
    }

    if text.contains("conflict") || text.contains("automatic merge failed") {
        return GitErrorInfo {
            code: "pull-conflict",
            note: first_line,
            guidance: Some("git status".into()),
        };
    }

    if text.contains("would be overwritten") || text.contains("overwritten by merge") {
        return GitErrorInfo {
            code: "local-changes",
            note: first_line,
            guidance: None,
        };
    }

    if text.contains("no tracking information")
        || text.contains("couldn't find remote ref")
        || text.contains("no such remote")
    {
        return GitErrorInfo {
            code: "no-upstream",
            note: first_line,
            guidance: Some("git push -u origin <branch>".into()),
        };
    }

    if text.contains("repository not found")
        || text.contains("could not read from remote")
        || text.contains("does not appear to be a git repository")
    {
        return GitErrorInfo {
            code: "remote-unreachable",
            note: first_line,
            guidance: Some("git remote -v".into()),
        };
    }

    if text.contains("authentication failed")
        || text.contains("permission denied")
        || text.contains("could not read username")
    {
        return GitErrorInfo {
            code: "remote-auth",
            note: first_line,
            guidance: None,
        };
    }

    if text.contains("pre-commit") || text.contains("commit-msg") || text.contains("hook") {
        return GitErrorInfo {
            code: "pre-commit-hook",
            note: first_line,
            guidance: None,
        };
    }

    if operation == "commit" {
        return GitErrorInfo {
            code: "commit-rejected",
            note: first_line,
            guidance: None,
        };
    }
    GitErrorInfo {
        code: "git-command-failed",
        // Which command failed rides with the note instead of eleven translated sentences.
        note: Some(match first_line {
            Some(line) => format!("git {operation}: {line}"),
            None => format!("git {operation}"),
        }),
        guidance: None,
    }
}

/// `<code>: <git's words>`.
fn classified_error_string(info: &GitErrorInfo) -> String {
    coded(info.code, info.note.clone().unwrap_or_default())
}

fn git_error_text(run: &GitRun) -> String {
    let mut parts = Vec::new();
    if !run.stderr.trim().is_empty() {
        parts.push(run.stderr.clone());
    }
    if !run.stdout.trim().is_empty() {
        parts.push(run.stdout.clone());
    }
    parts.join("\n")
}

fn get_current_branch(repo_root: &Path) -> Option<String> {
    let out = run_git(repo_root, &["rev-parse", "--abbrev-ref", "HEAD"]).ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn get_upstream_ref(repo_root: &Path) -> Option<String> {
    let out = run_git(
        repo_root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn get_head_hash(repo_root: &Path) -> Option<String> {
    let out = run_git(repo_root, &["rev-parse", "HEAD"]).ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn get_remote_url(repo_root: &Path, remote_name: &str) -> Option<String> {
    let out = run_git(repo_root, &["remote", "get-url", remote_name]).ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// `git symbolic-ref -q HEAD` fails exactly then; if git cannot run, report not detached.
fn is_head_detached(repo_root: &Path) -> bool {
    run_git(repo_root, &["symbolic-ref", "-q", "HEAD"])
        .map(|out| !out.success)
        .unwrap_or(false)
}

fn get_head_short_hash(repo_root: &Path) -> Option<String> {
    let out = run_git(repo_root, &["rev-parse", "--short", "HEAD"]).ok()?;
    if !out.success {
        return None;
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    initialized: bool,
    repo_root: Option<String>,
    branch: Option<String>,
    /// `None` means push is unavailable.
    upstream: Option<String>,
    changed_count: usize,
    /// The snapshot never touches them.
    staged_outside_vault: Vec<String>,
    /// `None` without an upstream. Without these the Push button could only lie.
    ahead: Option<usize>,
    /// `None` without an upstream.
    behind: Option<usize>,
    /// Read locally, never contacting the remote. "No remote", "never pushed" and
    /// "no branch" need different next steps, or connecting a remote overwrites origin.
    has_origin: bool,
    /// Nothing can be sent until a branch is checked out.
    detached: bool,
    /// `None` before the first commit.
    head_short_hash: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushOutcome {
    pushed: bool,
    remote_url: Option<String>,
    message: Option<String>,
    guidance: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotResult {
    committed: bool,
    /// "no-changes" or null (committed).
    reason: Option<String>,
    commit_hash: Option<String>,
    subject: Option<String>,
    summary: Option<String>,
    counts: SnapshotCounts,
    files: Vec<ChangeEntry>,
    staged_outside_vault: Vec<String>,
    /// Only when push was requested.
    push: Option<PushOutcome>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCounts {
    added: usize,
    modified: usize,
    deleted: usize,
    renamed: usize,
    total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    short_hash: String,
    hash: String,
    subject: String,
    relative_time: String,
    iso_time: String,
    /// Carries `kind`/`slug` so history reads at the concept level.
    files: Vec<ChangeEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    count: usize,
    files: Vec<ChangeEntry>,
    /// New files appear only in the list.
    diff: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFetchResult {
    ok: bool,
    /// Empty string with `ok:false` when absent.
    upstream: String,
    /// Re-measured after the fetch; the screen enables Pull/Push from it.
    ahead: Option<usize>,
    behind: Option<usize>,
    summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    ok: bool,
    upstream: String,
    summary: String,
}

/// Reports `initialized:false` outside a repo instead of an error, since auto-init is forbidden.
#[tauri::command]
pub fn git_status(vault_path: String) -> Result<GitStatusResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let Some(repo_root) = find_repo_root(&vault_dir)? else {
        return Ok(GitStatusResult {
            initialized: false,
            repo_root: None,
            branch: None,
            upstream: None,
            changed_count: 0,
            staged_outside_vault: Vec::new(),
            ahead: None,
            behind: None,
            has_origin: false,
            detached: false,
            head_short_hash: None,
        });
    };
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    let full_rows = get_full_porcelain_status(&repo_root);
    let staged_outside = find_staged_outside_vault(&full_rows, &pathspec);
    let upstream = get_upstream_ref(&repo_root);
    let (ahead, behind) = match upstream.as_deref() {
        Some(_) => divergence_counts(&repo_root),
        None => (None, None),
    };

    Ok(GitStatusResult {
        initialized: true,
        repo_root: Some(repo_root.to_string_lossy().into_owned()),
        branch: get_current_branch(&repo_root),
        upstream,
        changed_count: rows.len(),
        staged_outside_vault: staged_outside,
        ahead,
        behind,
        has_origin: get_remote_url(&repo_root, "origin").is_some(),
        detached: is_head_detached(&repo_root),
        head_short_hash: get_head_short_hash(&repo_root),
    })
}

/// As of the last fetch, so the screen needs a separate Fetch to refresh them.
fn divergence_counts(repo_root: &Path) -> (Option<usize>, Option<usize>) {
    let out = match run_git(
        repo_root,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    ) {
        Ok(o) if o.success => o,
        // A vanished upstream or broken ref is unknown, not 0.
        _ => return (None, None),
    };
    let mut parts = out.stdout.split_whitespace();
    let ahead = parts.next().and_then(|v| v.parse::<usize>().ok());
    let behind = parts.next().and_then(|v| v.parse::<usize>().ok());
    (ahead, behind)
}

/// Receives only; the working tree is untouched. Runs only when the user presses it.
#[tauri::command(async)]
pub fn git_fetch(vault_path: String) -> Result<GitFetchResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let Some(upstream) = get_upstream_ref(&repo_root) else {
        return Ok(GitFetchResult {
            ok: false,
            upstream: String::new(),
            ahead: None,
            behind: None,
            // A code, not a sentence: `nativeErrors` holds the wording.
            summary: "remote-no-upstream".to_string(),
        });
    };
    let out = run_network_git(&repo_root, &["fetch", "--prune"])?;
    if !out.success {
        // Keep git's reason and the next step; a failure without them cannot be fixed.
        let info = classify_git_error(&out.stderr, "fetch");
        return Err(classified_error_string(&info));
    }
    let (ahead, behind) = divergence_counts(&repo_root);
    Ok(GitFetchResult {
        ok: true,
        upstream,
        ahead,
        behind,
        summary: match (ahead, behind) {
            (Some(0), Some(0)) => "remote-in-sync".to_string(),
            (_, _) => "remote-diverged".to_string(),
        },
    })
}

/// Adds and commits only the vault scope. No changes is `reason:"no-changes"` and
/// a requested push still goes. `set_upstream` is the explicit "send this branch"
/// press and is never implied by `push`.
#[tauri::command(async)]
pub fn git_snapshot(
    vault_path: String,
    message: Option<String>,
    push: Option<bool>,
    set_upstream: Option<bool>,
) -> Result<GitSnapshotResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    let set_upstream = set_upstream.unwrap_or(false);

    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    if rows.is_empty() {
        // A requested push still sends already recorded steps when nothing is new.
        let push_outcome = if push.unwrap_or(false) {
            Some(run_push(&repo_root, set_upstream))
        } else {
            None
        };
        return Ok(GitSnapshotResult {
            committed: false,
            reason: Some("no-changes".into()),
            commit_hash: None,
            subject: None,
            summary: None,
            counts: SnapshotCounts {
                added: 0,
                modified: 0,
                deleted: 0,
                renamed: 0,
                total: 0,
            },
            files: Vec::new(),
            staged_outside_vault: Vec::new(),
            push: push_outcome,
        });
    }

    let changes = build_change_summary(&rows, &repo_root, &vault_dir);
    let auto_summary = format_snapshot_summary(&changes);
    let custom = message.as_deref().map(str::trim).filter(|m| !m.is_empty());
    let subject = custom.unwrap_or(&auto_summary).to_string();
    let full_message = build_commit_message(&subject, &auto_summary, &changes, custom.is_some());

    let full_rows = get_full_porcelain_status(&repo_root);
    let staged_outside = find_staged_outside_vault(&full_rows, &pathspec);

    // Only untracked files inside the vault are added; tracked changes go through the
    // pathspec partial commit without touching the index.
    let untracked: Vec<&str> = rows
        .iter()
        .filter(|r| r.index == '?' && r.worktree == '?')
        .map(|r| r.path.as_str())
        .collect();
    if !untracked.is_empty() {
        let mut add_args: Vec<&str> = vec!["add", "--"];
        add_args.extend_from_slice(&untracked);
        let add_run = run_git(&repo_root, &add_args)?;
        if !add_run.success {
            let info = classify_git_error(&git_error_text(&add_run), "commit");
            return Err(classified_error_string(&info));
        }
    }

    let commit_run = run_git(
        &repo_root,
        &["commit", "-m", &full_message, "--", &pathspec],
    )?;
    if !commit_run.success {
        let info = classify_git_error(&git_error_text(&commit_run), "commit");
        return Err(classified_error_string(&info));
    }

    let commit_hash = get_head_hash(&repo_root);

    let counts = SnapshotCounts {
        added: changes.iter().filter(|c| c.status == "added").count(),
        modified: changes.iter().filter(|c| c.status == "modified").count(),
        deleted: changes.iter().filter(|c| c.status == "deleted").count(),
        renamed: changes.iter().filter(|c| c.status == "renamed").count(),
        total: changes.len(),
    };

    // `-u` only on the explicit send-this-branch press, never because an upstream is missing.
    let push_outcome = if push.unwrap_or(false) {
        Some(run_push(&repo_root, set_upstream))
    } else {
        None
    };

    Ok(GitSnapshotResult {
        committed: true,
        reason: None,
        commit_hash,
        subject: Some(subject),
        summary: Some(auto_summary),
        counts,
        files: changes,
        staged_outside_vault: staged_outside,
        push: push_outcome,
    })
}

/// The commit already exists, so a push failure returns guidance, not `Err`.
/// Without `set_upstream`, `origin` or a branch, nothing is sent.
fn run_push(repo_root: &Path, set_upstream: bool) -> PushOutcome {
    let upstream = get_upstream_ref(repo_root);
    let first_send = upstream.is_none();
    if first_send {
        let refusal = if !set_upstream || get_remote_url(repo_root, "origin").is_none() {
            let branch = get_current_branch(repo_root).unwrap_or_else(|| "<branch>".into());
            Some((
                coded("push-no-upstream", ""),
                format!("git push -u origin {branch}"),
            ))
        } else if is_head_detached(repo_root) {
            // A detached HEAD has no branch name to send under.
            Some((
                coded("push-detached-head", ""),
                "git switch <branch>".to_string(),
            ))
        } else {
            None
        };
        if let Some((message, guidance)) = refusal {
            return PushOutcome {
                pushed: false,
                remote_url: None,
                message: Some(message),
                guidance: Some(guidance),
            };
        }
    }
    let args: &[&str] = if first_send {
        &["push", "--set-upstream", "origin", "HEAD"]
    } else {
        &["push"]
    };
    match run_network_git(repo_root, args) {
        Ok(out) if out.success => {
            let remote_name = upstream
                .as_deref()
                .and_then(|name| name.split('/').next())
                .unwrap_or("origin");
            PushOutcome {
                pushed: true,
                remote_url: get_remote_url(repo_root, remote_name),
                message: None,
                guidance: None,
            }
        }
        Ok(out) => {
            let info = classify_git_error(&git_error_text(&out), "push");
            PushOutcome {
                pushed: false,
                remote_url: None,
                message: Some(classified_error_string(&info)),
                guidance: info.guidance,
            }
        }
        Err(err) => PushOutcome {
            pushed: false,
            remote_url: None,
            message: Some(err),
            guidance: None,
        },
    }
}

/// Empty list when there are no commits.
#[tauri::command]
pub fn git_history(
    vault_path: String,
    limit: Option<u32>,
    path: Option<String>,
) -> Result<Vec<GitCommitInfo>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let vault_spec = vault_pathspec(&repo_root, &vault_dir);
    // The single-document path must lie inside the vault (`vault_document_path`).
    let pathspec = match path.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(document) => vault_document_path(document, &vault_spec)?,
        None => vault_spec,
    };
    let max_count = limit.unwrap_or(10).max(1).to_string();
    const SEP: char = '\x1f';
    // The separator leads each record; at the tail, `--name-status` lines would attach
    // to the next commit.
    const REC: char = '\x1e';
    let format = format!("--pretty=format:{REC}%h{SEP}%H{SEP}%s{SEP}%cr{SEP}%cI");

    let out = run_git(
        &repo_root,
        &[
            "log",
            &format!("--max-count={max_count}"),
            &format,
            "--name-status",
            "--no-renames",
            "--",
            &pathspec,
        ],
    )?;
    if !out.success {
        // Zero commits and the like degrade to an empty list.
        return Ok(Vec::new());
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let mut kinds = std::collections::HashMap::new();
    let commits = trimmed
        .split(REC)
        .filter(|block| !block.trim().is_empty())
        .filter_map(|block| {
            let mut lines = block.trim_matches('\n').lines();
            let mut fields = lines.next()?.split(SEP);
            let info = (
                fields.next()?.to_string(),
                fields.next()?.to_string(),
                fields.next().unwrap_or("").to_string(),
                fields.next().unwrap_or("").to_string(),
                fields.next().unwrap_or("").to_string(),
            );
            let files = lines
                .filter_map(|line| history_change_entry(line, &repo_root, &vault_dir, &mut kinds))
                .collect();
            Some(GitCommitInfo {
                short_hash: info.0,
                hash: info.1,
                subject: info.2,
                relative_time: info.3,
                iso_time: info.4,
                files,
            })
        })
        .collect();
    Ok(commits)
}

/// One `M\tpath` line. `kind` comes from the file on disk now, not the blob at that
/// commit, to avoid a `git show` per commit; deleted files get only a path slug.
fn history_change_entry(
    line: &str,
    repo_root: &Path,
    vault_dir: &Path,
    kinds: &mut std::collections::HashMap<String, KindSlug>,
) -> Option<ChangeEntry> {
    let mut cols = line.split('\t');
    let code = cols.next()?.trim();
    let path = cols.next()?.trim();
    if code.is_empty() || path.is_empty() {
        return None;
    }
    let status = match code.chars().next()? {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        _ => "modified",
    };
    let abs_path = repo_root.join(path);
    let mut kind = None;
    let mut slug = path_based_slug(vault_dir, &abs_path);
    if path.ends_with(".md") && status != "deleted" {
        let (k, s) = kinds
            .entry(path.to_string())
            .or_insert_with(|| read_kind_slug(&abs_path))
            .clone();
        if k.is_some() {
            kind = k;
        }
        if let Some(s) = s {
            slug = s;
        }
    }
    Some(ChangeEntry {
        path: path.to_string(),
        status: status.to_string(),
        kind,
        slug,
        renamed_from: None,
    })
}

#[tauri::command]
pub fn git_diff(vault_path: String) -> Result<GitDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    let changes = build_change_summary(&rows, &repo_root, &vault_dir);

    // Falls back to the index when there is no HEAD.
    let diff = match run_git(&repo_root, &["diff", "HEAD", "--", &pathspec]) {
        Ok(out) if out.success => out.stdout,
        _ => match run_git(&repo_root, &["diff", "--", &pathspec]) {
            Ok(out) if out.success => out.stdout,
            _ => String::new(),
        },
    };

    Ok(GitDiffResult {
        count: changes.len(),
        files: changes,
        diff,
    })
}

/// One commit's vault-scope patch; separate from `git_diff`, which reads the
/// uncommitted tree, so each signature says what it asks.
#[tauri::command]
pub fn git_commit_diff(vault_path: String, hash: String) -> Result<GitDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    // Arrives as an argument, so strings that look like options (`--upload-pack=…`) are refused.
    let rev = hash.trim();
    if rev.is_empty() || !rev.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("commit hash must be hexadecimal".to_string());
    }

    let out = run_git(
        &repo_root,
        &[
            "show",
            "--format=",
            "--no-color",
            "--patch",
            rev,
            "--",
            &pathspec,
        ],
    )?;
    let diff = if out.success {
        out.stdout
    } else {
        String::new()
    };

    Ok(GitDiffResult {
        count: 0,
        files: Vec::new(),
        diff,
    })
}

/// Opt-in. Missing upstream, conflict and non-fast-forward return a clean `Err`.
#[tauri::command(async)]
pub fn git_pull(vault_path: String) -> Result<GitPullResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;

    let Some(upstream) = get_upstream_ref(&repo_root) else {
        let branch = get_current_branch(&repo_root).unwrap_or_else(|| "<branch>".into());
        return Err(coded("no-upstream", format!("git push -u origin {branch}")));
    };

    let out = run_network_git(&repo_root, &["pull"])?;
    if !out.success {
        let info = classify_git_error(&git_error_text(&out), "pull");
        return Err(classified_error_string(&info));
    }
    let summary = out
        .stdout
        .trim()
        .lines()
        .rfind(|l| !l.trim().is_empty())
        .unwrap_or("up to date")
        .to_string();

    Ok(GitPullResult {
        ok: true,
        upstream,
        summary,
    })
}

/// Argument arrays already prevent shell injection; this refuses empty,
/// whitespace-bearing and flag-like values.
fn validate_remote_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(coded("remote-url-empty", ""));
    }
    if trimmed.starts_with('-') {
        return Err(coded("remote-url-leading-dash", ""));
    }
    if trimmed.chars().any(char::is_whitespace) {
        return Err(coded("remote-url-has-whitespace", ""));
    }
    // Only scp-like, https, ssh and file paths.
    let looks_scp = trimmed.contains('@') && trimmed.contains(':');
    let looks_url = trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("ssh://")
        || trimmed.starts_with("git://");
    // A Windows drive path is a path too, or a first send to a local backup fails there.
    let bytes = trimmed.as_bytes();
    let looks_drive_path = bytes.len() > 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/');
    let looks_path = trimmed.starts_with('/') || trimmed.starts_with("file://") || looks_drive_path;
    if !(looks_scp || looks_url || looks_path) {
        return Err(coded("remote-url-unrecognized", ""));
    }
    Ok(trimmed.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInitResult {
    /// False with a reason if it was already a repository.
    initialized: bool,
    /// "already" or null (just started).
    reason: Option<String>,
    repo_root: String,
    /// Read via `git symbolic-ref`, which works before the first commit.
    branch: Option<String>,
    changed_count: usize,
}

/// Only on a direct user press. It only inits: no add, commit, push, remote or
/// user setup, and an existing repository is left alone (`reason: "already"`).
#[tauri::command]
pub fn git_init(vault_path: String) -> Result<GitInitResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;

    // Inside a repo already: never create a nested one.
    if let Some(root) = find_repo_root(&vault_dir)? {
        let pathspec = vault_pathspec(&root, &vault_dir);
        let changed = get_porcelain_status(&root, &pathspec)?.len();
        return Ok(GitInitResult {
            initialized: false,
            reason: Some("already".into()),
            repo_root: root.to_string_lossy().into_owned(),
            branch: get_current_branch(&root),
            changed_count: changed,
        });
    }

    let out = run_git(&vault_dir, &["init"])?;
    if !out.success {
        let info = classify_git_error(&git_error_text(&out), "init");
        return Err(classified_error_string(&info));
    }

    // Re-read for the canonical path (symlinks, /var).
    let root = find_repo_root(&vault_dir)?.ok_or_else(|| coded("git-init-repo-missing", ""))?;
    let pathspec = vault_pathspec(&root, &vault_dir);
    let changed = get_porcelain_status(&root, &pathspec)?.len();

    Ok(GitInitResult {
        initialized: true,
        reason: None,
        repo_root: root.to_string_lossy().into_owned(),
        branch: get_current_branch(&root),
        changed_count: changed,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDocumentDiffResult {
    path: String,
    /// The whole document as context, so the reader can draw it and mark changes.
    diff: String,
    /// Git never saw it; every line reads as added.
    untracked: bool,
    /// `diff` is then empty.
    too_large: bool,
}

/// The reader draws one element per line without windowing; past this ceiling
/// nothing is sent and the screen keeps its hunks, which always hold the changes.
const MAX_DOCUMENT_DIFF_LINES: usize = 3_000;

/// A capped answer carries no diff, since a prefix would read as the whole document.
fn cap_document_diff(path: String, diff: String, untracked: bool) -> GitDocumentDiffResult {
    if diff.lines().count() > MAX_DOCUMENT_DIFF_LINES {
        return GitDocumentDiffResult {
            path,
            diff: String::new(),
            untracked,
            too_large: true,
        };
    }
    GitDocumentDiffResult {
        path,
        diff,
        untracked,
        too_large: false,
    }
}

#[tauri::command]
pub fn git_document_diff(
    vault_path: String,
    relative_path: String,
    source: Option<String>,
    previous_path: Option<String>,
) -> Result<GitDocumentDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let vault_spec = vault_pathspec(&repo_root, &vault_dir);
    let repo_rel = vault_document_path(&relative_path, &vault_spec)?;
    // Both names go into the pathspec so git pairs a rename; with only the new name
    // every line reads as added.
    let previous_rel = match previous_path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
    {
        Some(previous) => Some(vault_document_path(previous, &vault_spec)?),
        None => None,
    };
    const WHOLE: &str = "-U1000000";

    if let Some(hash) = source.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let src = validate_restore_source(hash)?;
        let out = run_git(
            &repo_root,
            &[
                "show",
                WHOLE,
                "--no-color",
                "--format=",
                &src,
                "--",
                &repo_rel,
            ],
        )?;
        if !out.success {
            return Err(coded("restore-source-missing", ""));
        }
        return Ok(cap_document_diff(repo_rel, out.stdout, false));
    }

    let rows = get_porcelain_status(&repo_root, &repo_rel)?;
    let untracked = rows
        .iter()
        .any(|r| r.path == repo_rel && r.index == '?' && r.worktree == '?');
    if untracked {
        let raw = fs::read_to_string(repo_root.join(&repo_rel)).unwrap_or_default();
        let mut diff = format!("diff --git a/{repo_rel} b/{repo_rel}\n--- /dev/null\n+++ b/{repo_rel}\n@@ -0,0 +1 @@\n");
        for line in raw.lines() {
            diff.push('+');
            diff.push_str(line);
            diff.push('\n');
        }
        return Ok(cap_document_diff(repo_rel, diff, true));
    }
    let mut args: Vec<&str> = vec!["diff", WHOLE, "--no-color", "HEAD", "--", &repo_rel];
    if let Some(previous) = previous_rel.as_deref() {
        args.push(previous);
    }
    let out = run_git(&repo_root, &args)?;
    let diff = if out.success {
        out.stdout
    } else {
        let mut staged: Vec<&str> = vec!["diff", WHOLE, "--no-color", "--", &repo_rel];
        if let Some(previous) = previous_rel.as_deref() {
            staged.push(previous);
        }
        run_git(&repo_root, &staged)
            .map(|o| o.stdout)
            .unwrap_or_default()
    };
    // A pure rename has no content lines, so the document itself is returned under a
    // header that already says the name changed.
    if previous_rel.is_some()
        && !diff
            .lines()
            .any(|line| line.starts_with('+') || line.starts_with('-'))
    {
        let raw = fs::read_to_string(repo_root.join(&repo_rel)).unwrap_or_default();
        let mut context = format!("diff --git a/{repo_rel} b/{repo_rel}\n@@ -1,1 +1,1 @@\n");
        for line in raw.lines() {
            context.push(' ');
            context.push_str(line);
            context.push('\n');
        }
        return Ok(cap_document_diff(repo_rel, context, false));
    }
    Ok(cap_document_diff(repo_rel, diff, false))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRestoreResult {
    restored: bool,
    path: String,
    /// `HEAD` or the source commit hash.
    source: String,
    /// `None` when clean.
    previous_status: Option<String>,
}

/// The identity fields owned by `mcp/src/schema.mjs`: immutable `uid`, linked `slug`,
/// and `merged_uids`.
#[derive(Debug, Default, PartialEq, Eq)]
struct DocumentIdentity {
    uid: Option<String>,
    slug: Option<String>,
    merged_uids: bool,
}

/// Best-effort: no frontmatter means no identity, and two such files compare equal.
fn read_identity(raw: &str) -> DocumentIdentity {
    let mut identity = DocumentIdentity::default();
    let mut lines = raw.lines();
    if lines.next().map(|l| l.trim_end()) != Some("---") {
        return identity;
    }
    for line in lines {
        let trimmed = line.trim_end();
        if trimmed == "---" {
            break;
        }
        if let Some(rest) = line.strip_prefix("uid:") {
            let value = unquote(rest.trim());
            if !value.is_empty() {
                identity.uid = Some(value);
            }
        } else if let Some(rest) = line.strip_prefix("slug:") {
            let value = unquote(rest.trim());
            if !value.is_empty() {
                identity.slug = Some(value);
            }
        } else if line.starts_with("merged_uids:") {
            identity.merged_uids = true;
        }
    }
    identity
}

fn identity_difference(current: &DocumentIdentity, source: &DocumentIdentity) -> Option<String> {
    if current.uid != source.uid {
        return Some(format!(
            "uid {} -> {}",
            current.uid.as_deref().unwrap_or("(none)"),
            source.uid.as_deref().unwrap_or("(none)")
        ));
    }
    if current.slug != source.slug {
        return Some(format!(
            "slug {} -> {}",
            current.slug.as_deref().unwrap_or("(none)"),
            source.slug.as_deref().unwrap_or("(none)")
        ));
    }
    if current.merged_uids && !source.merged_uids {
        return Some("merged_uids would be dropped".into());
    }
    None
}

/// Repository-relative as the screen holds it: forward slashes, no `..`, empty or
/// dot segments, and inside the vault pathspec. Anything else is refused.
fn vault_document_path(relative_path: &str, vault_spec: &str) -> Result<String, String> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
    {
        return Err(coded("restore-path-invalid", ""));
    }
    let mut parts = Vec::new();
    for segment in trimmed.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(coded("restore-path-invalid", ""));
        }
        parts.push(segment);
    }
    let normalized = parts.join("/");
    let inside = vault_spec == "." || normalized.starts_with(&format!("{vault_spec}/"));
    if !inside {
        return Err(coded("restore-path-invalid", ""));
    }
    Ok(normalized)
}

/// Refs, ranges and options never reach git.
fn validate_restore_source(source: &str) -> Result<String, String> {
    let trimmed = source.trim();
    if trimmed == "HEAD" {
        return Ok(trimmed.into());
    }
    let hex =
        trimmed.len() >= 7 && trimmed.len() <= 40 && trimmed.chars().all(|c| c.is_ascii_hexdigit());
    if hex {
        Ok(trimmed.to_ascii_lowercase())
    } else {
        Err(coded("restore-source-invalid", ""))
    }
}

/// Restores one document to `source`, uncommitted. Refuses an untracked path
/// (restoring would delete it), a missing source, a changed `uid`/`slug`/`merged_uids`
/// or an unreadable file, since `git restore` is identity-blind. Confirm-button only.
#[tauri::command]
pub fn git_restore_file(
    vault_path: String,
    relative_path: String,
    source: String,
) -> Result<GitRestoreResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let vault_spec = vault_pathspec(&repo_root, &vault_dir);
    let repo_rel = vault_document_path(&relative_path, &vault_spec)?;
    let src = validate_restore_source(&source)?;

    let rows = get_porcelain_status(&repo_root, &repo_rel)?;
    let row = rows.iter().find(|r| r.path == repo_rel);
    let previous_status = row.map(|r| classify_change(r).to_string());
    if src == "HEAD" {
        if let Some(r) = row {
            if (r.index == '?' && r.worktree == '?') || r.index == 'A' {
                return Err(coded("restore-untracked", ""));
            }
        }
    }

    let show = run_git(&repo_root, &["show", &format!("{src}:{repo_rel}")])?;
    if !show.success {
        return Err(coded("restore-source-missing", ""));
    }
    match fs::read_to_string(repo_root.join(&repo_rel)) {
        Ok(current) => {
            if let Some(difference) =
                identity_difference(&read_identity(&current), &read_identity(&show.stdout))
            {
                return Err(coded("restore-identity-mismatch", difference));
            }
        }
        // A deleted document has no identity to disagree with.
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        // Any other read failure means the identity guard did not run, so the write stops.
        Err(err) => return Err(coded("restore-identity-check-failed", err)),
    }

    let run = run_git(
        &repo_root,
        &[
            "restore",
            &format!("--source={src}"),
            "--worktree",
            "--staged",
            "--",
            &repo_rel,
        ],
    )?;
    if !run.success {
        return Err(coded(
            "git-restore-failed",
            first_nonempty_line(&run.stderr).unwrap_or_default(),
        ));
    }

    Ok(GitRestoreResult {
        restored: true,
        path: repo_rel,
        source: src,
        previous_status,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSetRemoteResult {
    ok: bool,
    /// Always "origin".
    remote: String,
    url: String,
    /// Tells the user what changed.
    replaced: Option<String>,
}

/// Only addresses the user entered; nothing is guessed. No push happens here.
#[tauri::command]
pub fn git_set_remote(vault_path: String, url: String) -> Result<GitSetRemoteResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let clean = validate_remote_url(&url)?;

    let existing = get_remote_url(&repo_root, "origin");
    // `add` fails when origin exists.
    let subcommand = if existing.is_some() { "set-url" } else { "add" };
    let out = run_git(
        &repo_root,
        &["remote", subcommand, "origin", clean.as_str()],
    )?;
    if !out.success {
        let info = classify_git_error(&git_error_text(&out), "remote");
        return Err(classified_error_string(&info));
    }

    let replaced = existing.filter(|prev| prev != &clean);

    Ok(GitSetRemoteResult {
        ok: true,
        remote: "origin".into(),
        url: clean,
        replaced,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProbe {
    installed: bool,
    /// Shown to the user as is.
    version: Option<String>,
    /// Selects platform install guidance.
    platform: String,
}

fn host_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

/// One historical version of one vault file: when it landed and what it said.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeRevision {
    slug: String,
    iso_time: String,
    content: String,
}

/// Revisions newest first for the summary-freshness check. Git plumbing only; the
/// ontology judgement lives in one shared TypeScript module. A slug without history
/// is absent, not an error.
#[tauri::command]
pub fn vault_node_revisions(
    vault_path: String,
    slugs: Vec<String>,
    max_revisions: Option<u32>,
) -> Result<Vec<NodeRevision>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    let prefix = if pathspec == "." {
        String::new()
    } else {
        format!("{pathspec}/")
    };
    let max_count = max_revisions.unwrap_or(40).clamp(1, 200).to_string();

    let mut revisions = Vec::new();
    for slug in slugs.iter().take(MAX_FRESHNESS_SLUGS) {
        // Dropped rather than escaped, since the slug reaches a `git show` argument.
        if slug.is_empty() || slug.contains("..") || slug.starts_with('/') || slug.contains('\\') {
            continue;
        }
        let file_path = format!("{prefix}{slug}.md");
        let log = run_git(
            &repo_root,
            &[
                "log",
                &format!("--max-count={max_count}"),
                "--pretty=format:%H %cI",
                "--no-renames",
                "--",
                &file_path,
            ],
        )?;
        if !log.success {
            continue;
        }
        for line in log.stdout.lines() {
            let line = line.trim();
            let Some((hash, iso_time)) = line.split_once(' ') else {
                continue;
            };
            let show = run_git(&repo_root, &["show", &format!("{hash}:{file_path}")])?;
            if !show.success {
                continue;
            }
            revisions.push(NodeRevision {
                slug: slug.clone(),
                iso_time: iso_time.trim().to_string(),
                content: show.stdout,
            });
        }
    }
    Ok(revisions)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathLastChange {
    path: String,
    /// A moved file or folder reads `false`.
    exists: bool,
    /// A folder's change time is weaker evidence than a file's.
    is_dir: bool,
    /// `None` when uncommitted or older than the window.
    last_changed_at: Option<String>,
}

/// One `git log --name-only` walk matched in memory, not one process per concept.
const MAX_EVIDENCE_PATHS: usize = 512;
const EVIDENCE_WALK_COMMITS: &str = "--max-count=3000";

/// `repo_paths` are repository-relative; `vault_paths` resolve through the vault
/// pathspec. Anything that could climb, be absolute or look like an option is
/// dropped, since every value reaches a `git log` argument.
#[tauri::command]
pub fn git_paths_last_change(
    vault_path: String,
    repo_paths: Vec<String>,
    vault_paths: Vec<String>,
) -> Result<Vec<PathLastChange>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    let prefix = if pathspec == "." {
        String::new()
    } else {
        format!("{pathspec}/")
    };

    // (key as the caller wrote it, repository-relative path)
    let mut wanted: Vec<(String, String)> = Vec::new();
    let mut push = |key: &str, resolved: String| {
        if wanted.len() >= MAX_EVIDENCE_PATHS {
            return;
        }
        if wanted.iter().any(|(k, _)| k == key) {
            return;
        }
        wanted.push((key.to_string(), resolved));
    };
    // Documents first: the cap is shared, and implementation paths must not starve
    // concept documents.
    for raw in &vault_paths {
        if let Some(clean) = safe_relative_path(raw) {
            push(raw, format!("{prefix}{clean}"));
        }
    }
    for raw in &repo_paths {
        if let Some(clean) = safe_relative_path(raw) {
            push(raw, clean);
        }
    }
    if wanted.is_empty() {
        return Ok(Vec::new());
    }

    const REC: char = '\x1e';
    let format = format!("--pretty=format:{REC}%cI");
    let mut args: Vec<&str> = vec![
        // Otherwise git C-quotes non-ASCII paths and Korean names never match.
        "-c",
        "core.quotepath=false",
        "log",
        EVIDENCE_WALK_COMMITS,
        &format,
        "--name-only",
        "--no-renames",
        "--",
    ];
    for (_, resolved) in &wanted {
        args.push(resolved.as_str());
    }
    let out = run_git(&repo_root, &args)?;

    let mut last: std::collections::HashMap<usize, String> = std::collections::HashMap::new();
    if out.success {
        let mut current_time: Option<String> = None;
        for line in out.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Some(rest) = line.strip_prefix(REC) {
                current_time = Some(rest.trim().to_string());
                continue;
            }
            let Some(time) = current_time.as_ref() else {
                continue;
            };
            for (index, (_, resolved)) in wanted.iter().enumerate() {
                if last.contains_key(&index) {
                    continue;
                }
                let under = line.len() > resolved.len()
                    && line.starts_with(resolved.as_str())
                    && line.as_bytes().get(resolved.len()) == Some(&b'/');
                if line == resolved || under {
                    last.insert(index, time.clone());
                }
            }
        }
    }

    Ok(wanted
        .iter()
        .enumerate()
        .map(|(index, (key, resolved))| {
            let on_disk = repo_root.join(resolved);
            PathLastChange {
                path: key.clone(),
                exists: on_disk.exists(),
                is_dir: on_disk.is_dir(),
                last_changed_at: last.get(&index).cloned(),
            }
        })
        .collect())
}

fn safe_relative_path(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.starts_with('-')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
        || trimmed.split('/').any(|part| part == "..")
    {
        return None;
    }
    Some(trimmed.to_string())
}

/// Bounds `git show` processes per paint.
const MAX_FRESHNESS_SLUGS: usize = 64;

/// Read-only detection so the UI can pick platform install guidance; it installs
/// nothing.
#[tauri::command]
pub fn git_probe() -> GitProbe {
    let platform = host_platform().to_string();
    match Command::new("git").arg("--version").output() {
        Ok(out) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            GitProbe {
                installed: true,
                version: if version.is_empty() {
                    None
                } else {
                    Some(version)
                },
                platform,
            }
        }
        // A non-zero exit still ran, so git is installed.
        Ok(_) => GitProbe {
            installed: true,
            version: None,
            platform,
        },
        Err(_) => GitProbe {
            installed: false,
            version: None,
            platform,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn vault_pathspec_returns_dot_when_vault_is_repo_root() {
        let root = Path::new("/repo");
        assert_eq!(vault_pathspec(root, Path::new("/repo")), ".");
    }

    #[test]
    fn vault_pathspec_returns_relative_when_vault_nested() {
        let root = Path::new("/repo");
        assert_eq!(
            vault_pathspec(root, Path::new("/repo/docs/ontology")),
            "docs/ontology"
        );
    }

    #[test]
    fn parse_porcelain_reads_status_codes_and_paths() {
        let rows = parse_porcelain("?? docs/new.md\n M docs/edit.md\nD  docs/gone.md\n");
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].index, '?');
        assert_eq!(rows[0].worktree, '?');
        assert_eq!(rows[0].path, "docs/new.md");
        assert_eq!(rows[1].index, ' ');
        assert_eq!(rows[1].worktree, 'M');
        assert_eq!(rows[2].index, 'D');
    }

    #[test]
    fn a_waited_command_drains_output_larger_than_a_pipe_buffer() {
        let mut command = Command::new("node");
        command.args([
            "-e",
            "process.stdout.write('o'.repeat(200000)); process.stderr.write('e'.repeat(100000))",
        ]);
        let run = run_with_deadline(command, "probe", std::time::Duration::from_secs(20)).unwrap();
        assert!(run.success);
        assert_eq!(run.stdout.len(), 200_000);
        assert_eq!(run.stderr.len(), 100_000);
    }

    #[test]
    fn parse_porcelain_reads_rename_source() {
        let rows = parse_porcelain("R  docs/old.md -> docs/new.md\n");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].index, 'R');
        assert_eq!(rows[0].renamed_from.as_deref(), Some("docs/old.md"));
        assert_eq!(rows[0].path, "docs/new.md");
    }

    /// An empty result here would draw every step as outside the concepts, silently.
    #[test]
    fn history_change_entry_reads_status_code_and_path() {
        let repo = PathBuf::from("/repo");
        let vault = PathBuf::from("/repo/docs");
        let added = history_change_entry(
            "A\tdocs/elements/foo.md",
            &repo,
            &vault,
            &mut HashMap::new(),
        )
        .unwrap();
        assert_eq!(added.status, "added");
        assert_eq!(added.path, "docs/elements/foo.md");
        assert_eq!(added.slug, "elements/foo");
        assert_eq!(added.kind, None);

        assert_eq!(
            history_change_entry("D\tdocs/gone.md", &repo, &vault, &mut HashMap::new())
                .unwrap()
                .status,
            "deleted"
        );
        assert_eq!(
            history_change_entry("M\tdocs/x.md", &repo, &vault, &mut HashMap::new())
                .unwrap()
                .status,
            "modified"
        );
        assert_eq!(
            history_change_entry("R100\tdocs/y.md", &repo, &vault, &mut HashMap::new())
                .unwrap()
                .status,
            "renamed"
        );
    }

    #[test]
    fn history_change_entry_rejects_lines_without_a_tab() {
        let repo = PathBuf::from("/repo");
        let vault = PathBuf::from("/repo/docs");
        assert!(history_change_entry("", &repo, &vault, &mut HashMap::new()).is_none());
        assert!(history_change_entry("no tab here", &repo, &vault, &mut HashMap::new()).is_none());
        assert!(history_change_entry("M\t", &repo, &vault, &mut HashMap::new()).is_none());
    }

    #[test]
    fn classify_change_maps_status_codes() {
        let mk = |i: char, w: char| PorcelainRow {
            index: i,
            worktree: w,
            path: "x".into(),
            renamed_from: None,
        };
        assert_eq!(classify_change(&mk('?', '?')), "added");
        assert_eq!(classify_change(&mk('A', ' ')), "added");
        assert_eq!(classify_change(&mk(' ', 'M')), "modified");
        assert_eq!(classify_change(&mk('D', ' ')), "deleted");
        assert_eq!(classify_change(&mk(' ', 'D')), "deleted");
        assert_eq!(classify_change(&mk('R', ' ')), "renamed");
    }

    #[test]
    fn find_staged_outside_vault_flags_staged_paths_beyond_pathspec() {
        let rows = parse_porcelain("M  src/other.rs\nM  docs/inside.md\n?? docs/untracked.md\n");
        let outside = find_staged_outside_vault(&rows, "docs");
        assert_eq!(outside, vec!["src/other.rs".to_string()]);
    }

    #[test]
    fn find_staged_outside_vault_dot_pathspec_never_flags() {
        let rows = parse_porcelain("M  src/other.rs\n");
        assert!(find_staged_outside_vault(&rows, ".").is_empty());
    }

    #[test]
    fn format_snapshot_summary_counts_and_slugs() {
        let changes = vec![
            ChangeEntry {
                path: "docs/a.md".into(),
                status: "added".into(),
                kind: None,
                slug: "a".into(),
                renamed_from: None,
            },
            ChangeEntry {
                path: "docs/b.md".into(),
                status: "modified".into(),
                kind: None,
                slug: "b".into(),
                renamed_from: None,
            },
        ];
        let summary = format_snapshot_summary(&changes);
        assert!(summary.contains("+1 concept"));
        assert!(summary.contains("~1 updated"));
        assert!(summary.contains("(a, b)"));
    }

    #[test]
    fn format_snapshot_summary_truncates_slug_list() {
        let changes: Vec<ChangeEntry> = (0..5)
            .map(|i| ChangeEntry {
                path: format!("docs/n{i}.md"),
                status: "added".into(),
                kind: None,
                slug: format!("n{i}"),
                renamed_from: None,
            })
            .collect();
        let summary = format_snapshot_summary(&changes);
        assert!(summary.contains("+5 concepts"));
        assert!(summary.contains("+2)")); // 3 shown + overflow 2
    }

    #[test]
    fn build_commit_message_embeds_auto_summary_for_custom_message() {
        let changes = vec![ChangeEntry {
            path: "docs/a.md".into(),
            status: "added".into(),
            kind: None,
            slug: "a".into(),
            renamed_from: None,
        }];
        let msg = build_commit_message(
            "my subject",
            "ontology snapshot: +1 concept (a)",
            &changes,
            true,
        );
        assert!(msg.starts_with("my subject\n\n"));
        assert!(msg.contains("ontology snapshot: +1 concept (a)"));
        assert!(msg.contains("  A  docs/a.md"));
    }

    #[test]
    fn classify_git_error_detects_non_fast_forward() {
        let info = classify_git_error("! [rejected] main -> main (non-fast-forward)", "push");
        assert_eq!(info.code, "push-non-fast-forward");
        assert!(info.guidance.as_deref() == Some("git pull"));
    }

    #[test]
    fn classify_git_error_detects_hook_rejection() {
        let info = classify_git_error("pre-commit hook failed", "commit");
        assert_eq!(info.code, "pre-commit-hook");
    }

    #[test]
    fn classify_git_error_commit_fallback() {
        let info = classify_git_error("something weird happened", "commit");
        assert_eq!(info.code, "commit-rejected");
    }

    #[test]
    fn safe_relative_path_refuses_escapes_and_options() {
        assert_eq!(
            safe_relative_path("src/widgets/app-nav-rail/"),
            Some("src/widgets/app-nav-rail".into())
        );
        assert_eq!(
            safe_relative_path("  cli/src/index.mjs "),
            Some("cli/src/index.mjs".into())
        );
        assert_eq!(safe_relative_path("../secrets"), None);
        assert_eq!(safe_relative_path("src/../../etc"), None);
        assert_eq!(safe_relative_path("/etc/passwd"), None);
        assert_eq!(safe_relative_path("--output=x"), None);
        assert_eq!(safe_relative_path(""), None);
        assert_eq!(
            safe_relative_path("docs/..hidden/a.md"),
            Some("docs/..hidden/a.md".into())
        );
    }

    #[test]
    fn validate_vault_dir_rejects_missing_path() {
        let err = validate_vault_dir("/path/does/not/exist/atlas").unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn a_document_past_the_ceiling_sends_no_diff_at_all() {
        let short = cap_document_diff("a.md".into(), "+one\n+two\n".into(), false);
        assert!(!short.too_large);
        assert_eq!(short.diff, "+one\n+two\n");

        let long: String = (0..MAX_DOCUMENT_DIFF_LINES + 1)
            .map(|i| format!(" line {i}\n"))
            .collect();
        let capped = cap_document_diff("a.md".into(), long, false);
        assert!(capped.too_large);
        assert_eq!(capped.diff, "");
        assert_eq!(capped.path, "a.md");
    }

    #[test]
    fn restore_path_stays_inside_the_vault() {
        assert_eq!(
            vault_document_path("domains/orders.md", ".").unwrap(),
            "domains/orders.md"
        );
        assert_eq!(
            vault_document_path(" domains/orders.md ", ".").unwrap(),
            "domains/orders.md"
        );
        assert_eq!(
            vault_document_path("docs/ontology/domains/orders.md", "docs/ontology").unwrap(),
            "docs/ontology/domains/orders.md"
        );
        for bad in [
            "",
            "/etc/passwd",
            "../outside.md",
            "a/../b.md",
            "a//b.md",
            "./a.md",
            "a\\b.md",
        ] {
            let err = vault_document_path(bad, ".").unwrap_err();
            assert!(err.starts_with("restore-path-invalid"), "{bad}: {err}");
        }
        for outside in ["README.md", "docs/other/x.md", "docs/ontologyx/a.md"] {
            let err = vault_document_path(outside, "docs/ontology").unwrap_err();
            assert!(err.starts_with("restore-path-invalid"), "{outside}: {err}");
        }
    }

    #[test]
    fn restore_source_is_head_or_a_hash() {
        assert_eq!(validate_restore_source("HEAD").unwrap(), "HEAD");
        assert_eq!(validate_restore_source("A1B2C3D").unwrap(), "a1b2c3d");
        for bad in [
            "",
            "HEAD~1",
            "main",
            "abc",
            "--output=x",
            "a1b2c3d..a1b2c3e",
        ] {
            let err = validate_restore_source(bad).unwrap_err();
            assert!(err.starts_with("restore-source-invalid"), "{bad}: {err}");
        }
    }

    #[test]
    fn identity_guard_names_the_field_that_would_change() {
        let now =
            "---\nuid: 11111111\nslug: domains/orders\nmerged_uids: [22222222]\n---\n# Orders\n";
        let same = "---\nuid: \"11111111\"\nslug: 'domains/orders'\nmerged_uids: [22222222]\n---\nolder body\n";
        assert_eq!(
            identity_difference(&read_identity(now), &read_identity(same)),
            None
        );

        let other_uid = "---\nuid: 99999999\nslug: domains/orders\nmerged_uids: [22222222]\n---\n";
        assert_eq!(
            identity_difference(&read_identity(now), &read_identity(other_uid)).as_deref(),
            Some("uid 11111111 -> 99999999")
        );
        let renamed = "---\nuid: 11111111\nslug: domains/order\nmerged_uids: [22222222]\n---\n";
        assert_eq!(
            identity_difference(&read_identity(now), &read_identity(renamed)).as_deref(),
            Some("slug domains/orders -> domains/order")
        );
        let pre_merge = "---\nuid: 11111111\nslug: domains/orders\n---\n";
        assert_eq!(
            identity_difference(&read_identity(now), &read_identity(pre_merge)).as_deref(),
            Some("merged_uids would be dropped")
        );
        assert_eq!(
            identity_difference(&read_identity("# a"), &read_identity("# b")),
            None
        );
    }

    #[test]
    fn host_platform_is_one_of_the_three_we_guide() {
        assert!(matches!(host_platform(), "macos" | "windows" | "linux"));
    }

    #[test]
    fn git_probe_reports_this_machine_truthfully() {
        let probe = git_probe();
        assert!(probe.installed);
        assert!(probe.version.as_deref().unwrap_or("").contains("git"));
    }

    #[test]
    fn validate_remote_url_accepts_the_four_real_shapes() {
        for url in [
            "git@github.com:me/repo.git",
            "https://github.com/me/repo.git",
            "ssh://git@host/me/repo.git",
            "/Users/me/backup/repo.git",
            "D:\\backup\\repo.git",
            "D:/backup/repo.git",
        ] {
            assert_eq!(
                validate_remote_url(url).unwrap(),
                url,
                "should accept {url}"
            );
        }
        assert_eq!(
            validate_remote_url("  git@github.com:me/repo.git \n").unwrap(),
            "git@github.com:me/repo.git"
        );
    }

    #[test]
    fn validate_remote_url_rejects_non_addresses() {
        for bad in [
            "",
            "   ",
            "--upload-pack=evil",
            "git@host:a b",
            "저장소주소",
            "D:",
            "1:\\backup",
        ] {
            assert!(validate_remote_url(bad).is_err(), "should reject {bad:?}");
        }
    }

    #[test]
    fn read_kind_slug_extracts_frontmatter_fields() {
        let dir = std::env::temp_dir().join(format!("atlas-git-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("node.md");
        fs::write(
            &file,
            "---\nkind: capability\nslug: \"my-cap\"\n---\n# Body\n",
        )
        .unwrap();
        let (kind, slug) = read_kind_slug(&file);
        assert_eq!(kind.as_deref(), Some("capability"));
        assert_eq!(slug.as_deref(), Some("my-cap"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_kind_slug_reads_no_further_than_the_frontmatter() {
        let dir = std::env::temp_dir().join(format!("atlas-git-front-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("node.md");
        let mut bytes = b"---\nkind: element\nslug: reader\n---\n".to_vec();
        bytes.extend_from_slice(&[0xff, 0xfe, b'\n']);
        fs::write(&file, bytes).unwrap();
        let (kind, slug) = read_kind_slug(&file);
        assert_eq!(kind.as_deref(), Some("element"));
        assert_eq!(slug.as_deref(), Some("reader"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn history_rows_of_one_path_reuse_the_first_read() {
        let dir = std::env::temp_dir().join(format!("atlas-git-rows-{}", std::process::id()));
        let _ = fs::create_dir_all(dir.join("docs"));
        fs::write(dir.join("docs/a.md"), "---\nkind: capability\n---\n").unwrap();
        let vault = dir.join("docs");
        let mut kinds = HashMap::new();
        let first = history_change_entry("M\tdocs/a.md", &dir, &vault, &mut kinds).unwrap();
        fs::write(dir.join("docs/a.md"), "---\nkind: element\n---\n").unwrap();
        let second = history_change_entry("A\tdocs/a.md", &dir, &vault, &mut kinds).unwrap();
        assert_eq!(first.kind.as_deref(), Some("capability"));
        assert_eq!(
            second.kind, first.kind,
            "the second row must not open the file again"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_document_that_cannot_be_read_stops_the_restore() {
        // A read failing for any reason but absence means the guard never ran.
        let dir = std::env::temp_dir().join(format!("atlas-restore-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let git = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .args(args)
                .current_dir(&dir)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {args:?}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        };
        git(&["init", "-q"]);
        git(&["config", "user.email", "test@example.invalid"]);
        git(&["config", "user.name", "atlas test"]);
        git(&["config", "commit.gpgsign", "false"]);
        // autocrlf would return CRLF and fail a test about identity.
        git(&["config", "core.autocrlf", "false"]);
        let file = dir.join("orders.md");
        let committed = "---\nuid: 11111111\nslug: domains/orders\n---\n# Orders\n";
        fs::write(&file, committed).unwrap();
        git(&["add", "orders.md"]);
        git(&["commit", "-qm", "seed"]);

        // 0xff never appears in valid UTF-8.
        let unreadable = [0xffu8, 0xfe, 0xff];
        fs::write(&file, unreadable).unwrap();
        let vault = dir.to_string_lossy().into_owned();
        let err = git_restore_file(vault.clone(), "orders.md".into(), "HEAD".into()).unwrap_err();
        assert!(err.starts_with("restore-identity-check-failed"), "{err}");
        assert_eq!(
            fs::read(&file).unwrap(),
            unreadable,
            "a refusal must leave the document alone"
        );

        fs::write(
            &file,
            "---\nuid: 11111111\nslug: domains/orders\n---\n# Changed\n",
        )
        .unwrap();
        let done = git_restore_file(vault, "orders.md".into(), "HEAD".into()).unwrap();
        assert!(done.restored);
        assert_eq!(fs::read_to_string(&file).unwrap(), committed);
        let _ = fs::remove_dir_all(&dir);
    }

    /// The bare repository stands in for `origin` locally; nothing touches the network.
    struct Scratch {
        dir: PathBuf,
        work: PathBuf,
        origin: PathBuf,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("atlas-remote-state-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            let work = dir.join("work");
            let origin = dir.join("origin.git");
            fs::create_dir_all(&work).unwrap();
            let scratch = Scratch { dir, work, origin };
            scratch.git(&["init", "-q", "-b", "main"]);
            scratch.git(&["config", "user.email", "test@example.invalid"]);
            scratch.git(&["config", "user.name", "atlas test"]);
            scratch.git(&["config", "commit.gpgsign", "false"]);
            scratch.git(&["config", "core.autocrlf", "false"]);
            scratch.commit("one.md", "one");
            let out = Command::new("git")
                .args(["init", "-q", "--bare"])
                .arg(&scratch.origin)
                .output()
                .unwrap();
            assert!(out.status.success(), "git init --bare");
            scratch
        }

        fn git(&self, args: &[&str]) -> String {
            let out = Command::new("git")
                .args(args)
                .current_dir(&self.work)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {args:?}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }

        fn commit(&self, file: &str, body: &str) {
            fs::write(self.work.join(file), body).unwrap();
            self.git(&["add", file]);
            self.git(&["commit", "-qm", body]);
        }

        fn add_origin(&self) {
            let origin = self.origin.to_string_lossy().into_owned();
            self.git(&["remote", "add", "origin", &origin]);
        }

        fn origin_main(&self) -> Option<String> {
            let out = Command::new("git")
                .args(["rev-parse", "--verify", "-q", "refs/heads/main"])
                .current_dir(&self.origin)
                .output()
                .unwrap();
            out.status
                .success()
                .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
        }

        fn vault(&self) -> String {
            self.work.to_string_lossy().into_owned()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn status_tells_no_remote_from_a_branch_never_sent_from_a_detached_head() {
        let scratch = Scratch::new("status");
        let status = git_status(scratch.vault()).unwrap();
        assert!(status.upstream.is_none());
        assert!(!status.has_origin);
        assert!(!status.detached);
        assert_eq!(status.branch.as_deref(), Some("main"));

        // `origin` exists but the branch was never pushed.
        scratch.add_origin();
        let status = git_status(scratch.vault()).unwrap();
        assert!(status.upstream.is_none());
        assert!(status.has_origin);
        assert!(!status.detached);

        let head = scratch.git(&["rev-parse", "--short", "HEAD"]);
        scratch.git(&["checkout", "-q", "--detach"]);
        let status = git_status(scratch.vault()).unwrap();
        assert!(status.detached);
        assert!(status.upstream.is_none());
        assert_eq!(status.head_short_hash.as_deref(), Some(head.as_str()));
    }

    #[test]
    fn a_branch_never_sent_goes_to_origin_only_when_asked_to_set_its_upstream() {
        let scratch = Scratch::new("first-send");
        scratch.add_origin();

        // Push alone does not invent a destination.
        let refused = git_snapshot(scratch.vault(), None, Some(true), None).unwrap();
        let outcome = refused
            .push
            .expect("a push was asked for, so it is answered");
        assert!(!outcome.pushed);
        assert_eq!(outcome.message.as_deref(), Some("push-no-upstream"));
        assert_eq!(scratch.origin_main(), None);

        // `origin/main` becomes the upstream that Push, Pull and Fetch follow.
        let sent = git_snapshot(scratch.vault(), None, Some(true), Some(true)).unwrap();
        assert!(!sent.committed);
        assert!(sent.push.expect("answered").pushed);
        assert_eq!(
            scratch.origin_main(),
            Some(scratch.git(&["rev-parse", "HEAD"]))
        );
        let status = git_status(scratch.vault()).unwrap();
        assert_eq!(status.upstream.as_deref(), Some("origin/main"));
        assert_eq!((status.ahead, status.behind), (Some(0), Some(0)));
    }

    #[test]
    fn push_with_nothing_to_record_still_sends_the_steps_already_made() {
        let scratch = Scratch::new("push-recorded");
        scratch.add_origin();
        scratch.git(&["push", "-q", "-u", "origin", "main"]);
        scratch.commit("two.md", "two");
        assert_eq!(git_status(scratch.vault()).unwrap().ahead, Some(1));

        let result = git_snapshot(scratch.vault(), None, Some(true), None).unwrap();
        assert!(!result.committed);
        assert_eq!(result.reason.as_deref(), Some("no-changes"));
        assert!(result.push.expect("answered").pushed);
        assert_eq!(
            scratch.origin_main(),
            Some(scratch.git(&["rev-parse", "HEAD"]))
        );
    }

    #[test]
    fn a_detached_head_sends_nothing_even_when_asked_to_set_an_upstream() {
        let scratch = Scratch::new("detached");
        scratch.add_origin();
        scratch.git(&["checkout", "-q", "--detach"]);

        let result = git_snapshot(scratch.vault(), None, Some(true), Some(true)).unwrap();
        let outcome = result.push.expect("answered");
        assert!(!outcome.pushed);
        assert_eq!(outcome.message.as_deref(), Some("push-detached-head"));
        assert_eq!(scratch.origin_main(), None);
    }

    #[test]
    fn a_registered_remote_is_told_apart_and_the_first_send_sets_the_upstream() {
        // Registering a remote only stores an address; the screen needs a first push or
        // "Connect a remote" is a dead end.
        let base = std::env::temp_dir().join(format!("atlas-publish-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let dir = base.join("vault");
        let remote = base.join("remote.git");
        fs::create_dir_all(&dir).unwrap();
        let git = |cwd: &Path, args: &[&str]| -> String {
            let out = std::process::Command::new("git")
                .args(args)
                .current_dir(cwd)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {args:?}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        git(&base, &["init", "-q", "--bare", "remote.git"]);
        git(&dir, &["init", "-q"]);
        git(&dir, &["config", "user.email", "test@example.invalid"]);
        git(&dir, &["config", "user.name", "atlas test"]);
        git(&dir, &["config", "commit.gpgsign", "false"]);
        fs::write(dir.join("orders.md"), "---\nkind: domain\n---\n# Orders\n").unwrap();
        git(&dir, &["add", "orders.md"]);
        git(&dir, &["commit", "-qm", "seed"]);
        let vault = dir.to_string_lossy().into_owned();

        let before = git_status(vault.clone()).unwrap();
        assert!(!before.has_origin, "no remote is registered yet");
        assert!(before.upstream.is_none());

        git_set_remote(vault.clone(), remote.to_string_lossy().into_owned()).unwrap();
        let saved = git_status(vault.clone()).unwrap();
        assert!(saved.has_origin, "a registered origin reads as a remote");
        assert!(
            saved.upstream.is_none(),
            "registering an address sends nothing"
        );

        let plain = git_snapshot(vault.clone(), None, Some(true), None).unwrap();
        let refused = plain.push.expect("a push was asked for");
        assert!(!refused.pushed);
        assert!(refused.message.unwrap().starts_with("push-no-upstream"));

        let first = git_snapshot(vault.clone(), None, Some(true), Some(true)).unwrap();
        assert!(!first.committed);
        let sent = first.push.expect("a push was asked for");
        assert!(sent.pushed, "{:?}", sent.message);
        let after = git_status(vault.clone()).unwrap();
        let branch = after.branch.clone().expect("a branch is checked out");
        assert_eq!(
            after.upstream.as_deref(),
            Some(format!("origin/{branch}").as_str())
        );
        assert_eq!((after.ahead, after.behind), (Some(0), Some(0)));
        assert_eq!(
            git(&remote, &["rev-parse", &format!("refs/heads/{branch}")]),
            git(&dir, &["rev-parse", "HEAD"]),
            "the remote holds the step that was sent"
        );

        git(&dir, &["checkout", "-q", "--detach"]);
        let detached = git_snapshot(vault, None, Some(true), Some(true)).unwrap();
        let refused = detached.push.expect("a push was asked for");
        assert!(!refused.pushed);
        assert!(refused.message.unwrap().starts_with("push-detached-head"));
        let _ = fs::remove_dir_all(&base);
    }
}
