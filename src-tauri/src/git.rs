// Atlas Git — Tauri native git layer (IPC for making desktop apps version-control vaults via git). The web GUI
// invokes these `#[tauri::command]`s in the next step. Shell out to system git via `std::process::Command`, with safety
// rules ported directly from JS `git-snapshot.mjs` (cli/ · mcp/ mirror).
//
// ── Atlas Git Trust Charter (invariants this file must uphold) ─────────────────────
//  1. Local commits only — transmission (push/pull) only via explicit arguments/calls (opt-in).
//  2. Never auto-`git init` on uninitialized repos — report state only.
//  3. Zero token/login/credential handling — local git processes only.
//  4. Never touch files outside the vault — `git commit -m <msg> -- <pathspec>`
//     isolates "partial commits" so changes already staged outside the vault remain untouched,
//     and only untracked new files within the vault scope are `git add`ed.
//  5. No forced auto-execution or auto-backup — all via explicit calls only.
//
// Graceful failure: Expected failures (not a repo · non-fast-forward · hook rejection · conflict)
// return clean single-line `Result<_, String>` instead of panics/stack traces.

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use crate::errors::coded;

// ── Vault path validation (absolute path injection defense) ─────────────────────────────────
// vault_path comes from JS (web GUI). Confirm existence + directory,
// canonicalize to resolve symbolic links/relative pieces into real paths, then use as git's
// cwd. Since pathspecs are calculated relative to repo_root, add/commit leaks outside the vault
// are fundamentally impossible.
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

// ── Low-level git shell-out ──────────────────────────────────────────────────────
struct GitRun {
    success: bool,
    stdout: String,
    stderr: String,
}

/// Runs git in `cwd` and captures stdout/stderr. Returns `Err` only if spawn itself fails
/// (e.g., git not installed). Non-zero exits are captured as `success:false` for the caller to decide — stderr is piped so it does not clutter the user's terminal.
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

/// Keeps git from waiting on a human this app cannot show a prompt to.
///
/// **Measured 2026-08-24, and it is less than it sounds.** With stdin closed the way this app
/// spawns git, a fetch needing a password already fails in 0.3s with "unable to get password from
/// user" — with or without these variables. git notices there is no terminal on its own, so setting
/// them changed nothing on this machine.
///
/// They are kept for the configuration where they *do* differ: a credential helper or `SSH_ASKPASS`
/// that opens a window, which would leave the operation waiting on a dialog nobody expects to see.
/// Cheap insurance, not the defence.
///
/// **The defence is the deadline**, because the failure that actually never ends has nothing to do
/// with credentials: a remote that accepts the connection and then says nothing. Measured in the
/// same session against a non-routable address, git was still running after 20 seconds with no
/// timeout of its own. That is what `run_network_git` bounds.
///
/// `GIT_SSH_COMMAND` is deliberately not set: it would override a user's own `core.sshCommand`, and
/// this app has no business rewriting how someone reaches their own remote.
fn silence_git_credential_prompts(command: &mut Command) {
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "");
}

/// How long a git operation that reaches the network may take before the app stops waiting.
///
/// Generous on purpose: a first `pull` on a large repository over a slow link is legitimately slow,
/// and cutting off real work is worse than waiting. What this bounds is the case that never ends —
/// a remote that accepts the connection and then says nothing. Measured 2026-08-24 against a
/// non-routable address: git was still running after 20 seconds and has no timeout of its own, so
/// before this the screen kept a spinner up for as long as the app stayed open. A credential prompt
/// is *not* that case — git fails on its own in a third of a second when there is no terminal.
const NETWORK_GIT_DEADLINE: std::time::Duration = std::time::Duration::from_secs(120);

/// `run_git` for the three commands that leave this machine.
///
/// Spawns rather than `.output()` so the wait can be given a deadline, and kills the whole attempt
/// when it expires. The error names the elapsed limit, because "it is taking a while" is not
/// something a person can act on and "it gave up after two minutes" is.
fn run_network_git(cwd: &Path, args: &[&str]) -> Result<GitRun, String> {
    use std::io::Read;
    use std::process::Stdio;

    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    silence_git_credential_prompts(&mut command);

    let mut child = command
        .spawn()
        .map_err(|err| coded("git-not-runnable", err))?;

    let started = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = String::new();
                let mut stderr = String::new();
                if let Some(mut pipe) = child.stdout.take() {
                    let _ = pipe.read_to_string(&mut stdout);
                }
                if let Some(mut pipe) = child.stderr.take() {
                    let _ = pipe.read_to_string(&mut stderr);
                }
                return Ok(GitRun {
                    success: status.success(),
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if started.elapsed() >= NETWORK_GIT_DEADLINE {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(coded(
                        "git-network-timeout",
                        format!(
                            "git {} did not finish within {}s",
                            args.first().copied().unwrap_or("command"),
                            NETWORK_GIT_DEADLINE.as_secs()
                        ),
                    ));
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(err) => return Err(coded("git-not-runnable", err)),
        }
    }
}

// ── Repo discovery (no auto init — state only) ──────────────────────────────────
/// Top-level git repo containing the vault. `Ok(None)` if outside a git repo.
pub(crate) fn find_repo_root(vault_dir: &Path) -> Result<Option<PathBuf>, String> {
    let out = run_git(vault_dir, &["rev-parse", "--show-toplevel"])?;
    if !out.success {
        return Ok(None);
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    // Canonicalize the toplevel returned by git — to use the same real path baseline as vault_dir
    // for pathspec calculation (preventing mismatches like /var → /private/var).
    let root = PathBuf::from(trimmed);
    Ok(Some(fs::canonicalize(&root).unwrap_or(root)))
}

/// For commands requiring a repo, such as commit/history/diff/pull. Returns `Err` with
/// "auto init disabled" guidance if outside a repo — Trust Charter ②.
///
/// Note that this statement does *not* auto-init: the `git_init` button users press on screen is a different path (owner decision 2026-07-25). The charter forbids silent execution, but users pressing a button in a folder they chose is not in that category. This function still does not auto-init.
fn require_repo_root(vault_dir: &Path) -> Result<PathBuf, String> {
    match find_repo_root(vault_dir)? {
        Some(root) => Ok(root),
        None => Err(coded("git-repo-missing", "")),
    }
}

/// Vault's pathspec relative to repo_root — "." if vault is the repo root itself.
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

// ── porcelain parsing ─────────────────────────────────────────────────────────
struct PorcelainRow {
    index: char,
    worktree: char,
    path: String,
    renamed_from: Option<String>,
}

fn parse_porcelain(out: &str) -> Vec<PorcelainRow> {
    out.lines()
        .filter_map(|line| {
            // `git status --porcelain` writes `XY <path>`, so byte 3 *should* be a character
            // boundary. It is read through `get` rather than sliced anyway, because the caller
            // is a synchronous Tauri command and Tauri runs those on the macOS main thread: a
            // panic there unwinds through an Objective-C frame and takes the whole app down
            // with SIGABRT. A line this parser does not recognise must be skipped, never fatal.
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

/// `git status --porcelain -- <pathspec>` → array of lines. Returns `Err` on git failure.
fn get_porcelain_status(repo_root: &Path, pathspec: &str) -> Result<Vec<PorcelainRow>, String> {
    let out = run_git(
        repo_root,
        &[
            // Raw UTF-8 paths — git's default core.quotePath C-quotes any
            // non-ASCII path (`"\355\225\234..."`), which this parser would
            // keep literally and every consumer downstream would mangle: the
            // same defect class the CLI fixed by moving to `-z`
            // (bug sweep 2026-09-01). The newline+arrow form stays because the
            // Rust mirror's tests pin it.
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

/// Full repo porcelain without pathspec — guard for staged-outside-vault. Returns empty list on failure.
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

// ── frontmatter kind/slug (lightweight parser) ─────────────────────────────
// Minimal extraction for semantic info — reads only top-level `kind:`/`slug:` from
// the file's leading `---` block. Best-effort that never blocks a commit (on failure,
// proceeds with the path-based slug).
fn read_kind_slug(abs_path: &Path) -> (Option<String>, Option<String>) {
    let Ok(raw) = fs::read_to_string(abs_path) else {
        return (None, None);
    };
    let mut lines = raw.lines();
    if lines.next().map(|l| l.trim_end()) != Some("---") {
        return (None, None);
    }
    let mut kind = None;
    let mut slug = None;
    for line in lines {
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

/// Strips one matching pair of surrounding quotes from a frontmatter scalar.
///
/// Written with `strip_prefix`/`strip_suffix` rather than byte indexing: this runs inside
/// synchronous Tauri commands, which Tauri executes on the macOS main thread, where a panic
/// aborts the process instead of failing one call. These combinators cannot land mid-character.
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

// ── Change summary ──────────────────────────────────────────────────────────────
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

/// One-line semantic commit summary — kind counts + up to 3 representative slugs.
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

/// If a custom message is provided, the auto summary is embedded in the body to preserve semantic context.
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

/// Paths already staged outside the vault pathspec — for protection warnings (not mixed into commits).
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

// ── Graceful failure classification (mirror of git-snapshot.mjs classifyGitError) ──────────────
/// What went wrong, in the only two pieces that survive a language boundary: a
/// **code** the screen looks up in `messages/<locale>.json` under `nativeErrors`,
/// and git's own words as the machine detail behind it.
///
/// The finished sentence used to live here. It could only ever be written in one
/// language, so an English-locale reader met Korean; `errors.rs` explains the whole
/// contract. What could not move to the screen is `note` — git's own first line —
/// because only git knows it, and a failure without "what went wrong" cannot be fixed.
struct GitErrorInfo {
    /// Looked up in `nativeErrors`, and the prefix of the `Err(String)` payload.
    code: &'static str,
    /// git's first stderr line. Machine detail, never prose.
    note: Option<String>,
    /// The command that gets the person unstuck. Deliberately untranslated: it is
    /// typed verbatim into a shell. The localized sentence names it too.
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
        // Which git command failed is a fact only this side knows, so it rides with
        // the note rather than being written into eleven translated sentences.
        note: Some(match first_line {
            Some(line) => format!("git {operation}: {line}"),
            None => format!("git {operation}"),
        }),
        guidance: None,
    }
}

/// The classification as the `Err` payload of `Result<_, String>` — `<code>: <git's words>`.
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

// ── upstream / branch lookup ───────────────────────────────────────────────
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

// ── Result types (consumed by the web GUI) ─────────────────────────────────
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    /// Whether the vault is inside a git repo — the primary signal for the web GUI's button-state decisions.
    initialized: bool,
    /// Absolute path of the repo toplevel (only when initialized).
    repo_root: Option<String>,
    /// Current branch name.
    branch: Option<String>,
    /// upstream ref (e.g. origin/main) — null when absent (signals push is unavailable).
    upstream: Option<String>,
    /// Number of uncommitted changes within the vault scope.
    changed_count: usize,
    /// Paths already staged outside the vault (the snapshot does not touch them — informational).
    staged_outside_vault: Vec<String>,
    /// Number of my steps not yet on the upstream. `None` when there is no upstream.
    ///
    /// Without these two, the screen cannot say "is there anything to send", so the
    /// Push button is either always on or always off — both are lies.
    ahead: Option<usize>,
    /// Number of steps on the upstream that I don't have. `None` when there is no upstream.
    behind: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushOutcome {
    pushed: bool,
    remote_url: Option<String>,
    /// One user-facing line on failure.
    message: Option<String>,
    guidance: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotResult {
    committed: bool,
    /// "no-changes" | null (committed).
    reason: Option<String>,
    commit_hash: Option<String>,
    subject: Option<String>,
    /// One-line semantic-unit auto summary.
    summary: Option<String>,
    counts: SnapshotCounts,
    files: Vec<ChangeEntry>,
    staged_outside_vault: Vec<String>,
    /// Populated only when push was requested (opt-in).
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
    /// Vault files this step touched — carries `kind`/`slug` so the screen can read a
    /// commit as "how did the concepts change". Without this, history is nothing but
    /// commit subject strings, with no way at all to view it at the concept level.
    files: Vec<ChangeEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    count: usize,
    files: Vec<ChangeEntry>,
    /// Text diff of tracked files (new files appear in the list only).
    diff: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFetchResult {
    ok: bool,
    /// upstream ref (e.g. origin/main). Empty string + `ok:false` when absent.
    upstream: String,
    /// Divergence re-measured **right after** the fetch — the screen enables Pull/Push from this value.
    ahead: Option<usize>,
    behind: Option<usize>,
    summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    ok: bool,
    upstream: String,
    /// Last line of the pull result summary (e.g. "Already up to date.").
    summary: String,
}

// ── The #[tauri::command] set ──────────────────────────────────────────────

/// Summary of the vault's git state — initialized or not + branch/upstream + uncommitted
/// change count. The web GUI uses it to decide whether to enable the "snapshot/push/pull"
/// buttons. Outside a repo it reports `initialized:false` instead of an error (auto init forbidden).
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
    })
}

/// How far we have diverged from upstream — `(ahead, behind)`.
///
/// This value is **as of the last fetch**. That is simply how git works: the local
/// side answers with the last state it knows until it asks the remote again. That is
/// why the screen needs a separate `Fetch` for these numbers to refresh.
fn divergence_counts(repo_root: &Path) -> (Option<usize>, Option<usize>) {
    let out = match run_git(
        repo_root,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    ) {
        Ok(o) if o.success => o,
        // If the upstream vanished or the ref is broken, the answer is "unknown" — not 0.
        _ => return (None, None),
    };
    let mut parts = out.stdout.split_whitespace();
    let ahead = parts.next().and_then(|v| v.parse::<usize>().ok());
    let behind = parts.next().and_then(|v| v.parse::<usize>().ok());
    (ahead, behind)
}

/// **Only receives** the remote's latest state — does not touch the working tree.
///
/// Trust charter: same discipline as the only other commands that go over the network
/// (`git_snapshot(push)` · `git_pull`) — runs only when the user presses it. No automatic calls.
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
            // A code, not a sentence: `nativeErrors` holds the wording, and the
            // panel already has `ahead`/`behind` to fill the diverged one in.
            summary: "remote-no-upstream".to_string(),
        });
    };
    let out = run_network_git(&repo_root, &["fetch", "--prune"])?;
    if !out.success {
        // Returning only `message` would mean we erase the reason git told us (`note`)
        // and the next move (`guidance`) — a failure without "what went wrong" cannot be fixed.
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

/// Semantic-unit snapshot that adds + commits only the vault scope. Without `message`,
/// the auto summary is used as the subject. Sends to upstream only when `push` is true (opt-in).
/// No changes to commit is not an error but `committed:false, reason:"no-changes"`.
#[tauri::command(async)]
pub fn git_snapshot(
    vault_path: String,
    message: Option<String>,
    push: Option<bool>,
) -> Result<GitSnapshotResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    if rows.is_empty() {
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
            push: None,
        });
    }

    let changes = build_change_summary(&rows, &repo_root, &vault_dir);
    let auto_summary = format_snapshot_summary(&changes);
    let custom = message.as_deref().map(str::trim).filter(|m| !m.is_empty());
    let subject = custom.unwrap_or(&auto_summary).to_string();
    let full_message = build_commit_message(&subject, &auto_summary, &changes, custom.is_some());

    let full_rows = get_full_porcelain_status(&repo_root);
    let staged_outside = find_staged_outside_vault(&full_rows, &pathspec);

    // Trust charter ④ — first add only untracked new files within the vault scope.
    // Changes/deletions of tracked files are captured by the subsequent pathspec
    // partial-commit without touching the index.
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

    // push only on explicit opt-in — no automatic `-u` setup when there is no upstream (charter ①).
    let push_outcome = if push.unwrap_or(false) {
        Some(run_push(&repo_root))
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

/// The commit already exists locally, so a push failure does not crash as Err;
/// it is delivered as `PushOutcome{pushed:false, ...}` guidance instead.
fn run_push(repo_root: &Path) -> PushOutcome {
    let Some(upstream) = get_upstream_ref(repo_root) else {
        let branch = get_current_branch(repo_root).unwrap_or_else(|| "<branch>".into());
        return PushOutcome {
            pushed: false,
            remote_url: None,
            message: Some(coded("push-no-upstream", "")),
            guidance: Some(format!("git push -u origin {branch}")),
        };
    };
    match run_network_git(repo_root, &["push"]) {
        Ok(out) if out.success => {
            let remote_name = upstream.split('/').next().unwrap_or("origin");
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

/// Summary of recent commits touching the vault path (hash/message/time) — Obsidian
/// Git history parity. Empty list when there are no commits at all.
#[tauri::command]
pub fn git_history(vault_path: String, limit: Option<u32>) -> Result<Vec<GitCommitInfo>, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);
    let max_count = limit.unwrap_or(10).max(1).to_string();
    const SEP: char = '\x1f';
    /*
     * Put the record separator at the **head**. Placed at the tail, the `--name-status`
     * lines get pushed past the separator and attach to the next commit.
     */
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
        // Zero commits (no history yet) and the like — degrade gracefully to an empty list.
        return Ok(Vec::new());
    }
    let trimmed = out.stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
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
                .filter_map(|line| history_change_entry(line, &repo_root, &vault_dir))
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

/// One `--name-status` line (`M\tpath`) into a `ChangeEntry`.
///
/// `kind` is read from **the file on disk right now** — not the blob at that commit.
/// Treating a concept's identity as the same thing over time is more useful for the
/// screen, and running `git show` per commit is not worth the cost. For deleted files,
/// only the slug is derived from the path and `kind` stays empty.
fn history_change_entry(line: &str, repo_root: &Path, vault_dir: &Path) -> Option<ChangeEntry> {
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
        let (k, s) = read_kind_slug(&abs_path);
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

/// File list + text diff of not-yet-committed changes within the vault scope.
#[tauri::command]
pub fn git_diff(vault_path: String) -> Result<GitDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    let changes = build_change_summary(&rows, &repo_root, &vault_dir);

    // Against HEAD when it exists; falls back to the index when it doesn't (zero commits).
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

/// **What one commit actually wrote** — that commit's vault-scope patch.
///
/// Why this is kept separate from `git_diff`: that one looks at the «not yet committed»
/// working tree, while this one looks at one «already named» step. Both the arguments
/// and the results differ, so hanging an `Option` on a single command to make it carry
/// both meanings would leave the call site unable to read from the signature what it
/// is asking.
#[tauri::command]
pub fn git_commit_diff(vault_path: String, hash: String) -> Result<GitDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    // The hash is not user input but a value we just read via `git log`; still, since
    // it arrives as an argument, filter out strings that could be mistaken for options
    // (the `--upload-pack=…` kind).
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

/// git pull from upstream (opt-in transmission). Reports missing upstream / conflict /
/// non-fast-forward as a clean Err without crashing.
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

/// Minimal check that the remote address has a shape git will accept — the gate before
/// user input is handed to the shell. Shell injection itself is impossible because
/// `run_git` uses an argument array, but strings that are not address-shaped (empty
/// value · containing whitespace · flag lookalike) are filtered out here.
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
    // Allow only the four common shapes: scp-like (git@host:path) · https · ssh · file path.
    let looks_scp = trimmed.contains('@') && trimmed.contains(':');
    let looks_url = trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("ssh://")
        || trimmed.starts_with("git://");
    let looks_path = trimmed.starts_with('/') || trimmed.starts_with("file://");
    if !(looks_scp || looks_url || looks_path) {
        return Err(coded("remote-url-unrecognized", ""));
    }
    Ok(trimmed.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInitResult {
    /// Whether a record was started by this call. If it was already a repository, returns false + reason.
    initialized: bool,
    /// "already" (already a repository) | null (just started)
    reason: Option<String>,
    /// Absolute path to the top-level of the created (or existing) repo.
    repo_root: String,
    /// Branch name immediately after start — read via `git symbolic-ref` even before the first commit.
    branch: Option<String>,
    /// Number of changes in the vault scope to be recorded (= changes not yet committed).
    changed_count: usize,
}

/// `git init` called **only when the user presses it directly on screen**.
///
/// Trust charter boundary: what the charter prohibits is *automatic* execution and silent collection. A user
/// pressing a button in a vault folder they chose themselves does not fall into that category (2026-07-25
/// owner decision + Design Guardian ruling). The line this command adheres to:
///
/// - **It only performs init.** It does not chain add/commit/push — it creates an empty repository and
///   leaves the caller in a state of "N changes remaining". Automatic commits are the true
///   charter violation.
/// - **If it is already a repository, it does nothing** (`reason: "already"`). Nested init could
///   interfere with existing history.
/// - No side tasks like remote configuration or user name setup.
#[tauri::command]
pub fn git_init(vault_path: String) -> Result<GitInitResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;

    // If already inside a repo, just inform — do not silently create a nested repository.
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

    // Re-read toplevel immediately after init to obtain the canonical path (differences in symlinks, /var, etc.).
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

// ── restore one document ────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRestoreResult {
    /// Whether the working file was rewritten by this call.
    restored: bool,
    /// Vault-relative path of the one document touched.
    path: String,
    /// `HEAD` or the commit hash the content came from.
    source: String,
    /// What the document was before (`added` / `modified` / `deleted` / `renamed`), `None` when clean.
    previous_status: Option<String>,
}

/// The three frontmatter lines that make a document *the same document* to the rest of the
/// vault. `mcp/src/schema.mjs` owns them: `uid` is immutable and writer-minted, `slug` is what
/// neighbours link to, and `merged_uids` records which documents were folded into this one.
#[derive(Debug, Default, PartialEq, Eq)]
struct DocumentIdentity {
    uid: Option<String>,
    slug: Option<String>,
    merged_uids: bool,
}

/// Reads identity from a document's leading `---` block. Best-effort like `read_kind_slug`:
/// a file without frontmatter has no identity, and two such files compare equal.
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

/// Names the first identity field that would change, in the words the error line carries.
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

/// The document path the command may touch, **as the screen holds it**: repository-relative
/// like every `ChangeEntry.path` from `git_status` and `git_history`. Relative, forward slashes,
/// no `..`, no empty or dot segments, no backslashes, and inside the vault's pathspec.
/// Anything else is refused before git sees it. Returns the normalized repo-relative path.
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

/// `HEAD`, or an abbreviated-to-full hex hash. Refs, ranges and options never reach git.
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

/// Put **one** document back to the content it had at `source` — `HEAD` discards its
/// uncommitted changes, a hash brings that commit's version back as an uncommitted change.
///
/// This is the app's first write to a document's *content*, so it is narrower than git:
/// - the path must resolve inside the vault (`vault_document_path`), and only that path is
///   named to git;
/// - a document git has never committed is not "restored" to `HEAD`, because that would
///   delete it (`restore-untracked`);
/// - a source that does not hold the document is refused (`restore-source-missing`);
/// - a source whose `uid`, `slug` or `merged_uids` differs from the file on disk is refused
///   (`restore-identity-mismatch`), because the rest of the vault links to the current identity
///   and `git restore` is identity-blind (steward review, 2026-09-19).
///
/// Nothing is committed. **Called only from a confirm button** — the trust charter's zero
/// automatic execution is the caller's to hold, and this command chains into nothing.
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
    if let Ok(current) = fs::read_to_string(repo_root.join(&repo_rel)) {
        if let Some(difference) =
            identity_difference(&read_identity(&current), &read_identity(&show.stdout))
        {
            return Err(coded("restore-identity-mismatch", difference));
        }
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
    /// Whether the remote was set by this call.
    ok: bool,
    /// Remote name (always "origin").
    remote: String,
    /// Final remote URL.
    url: String,
    /// If the existing origin was replaced, inform the user of what changed.
    replaced: Option<String>,
}

/// Configure where to push (`origin`) — **only uses addresses entered by the user**. We do not
/// suggest, guess, or auto-detect addresses (Trust charter: zero silent transmission).
///
/// No push is performed — only the address is registered, and the caller sends it via separate actions. This ensures
/// the "sends only when pressed" promise is upheld at the command boundary.
#[tauri::command]
pub fn git_set_remote(vault_path: String, url: String) -> Result<GitSetRemoteResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let clean = validate_remote_url(&url)?;

    let existing = get_remote_url(&repo_root, "origin");
    // If origin already exists, add will fail, so replace with set-url.
    let subcommand = if existing.is_some() { "set-url" } else { "add" };
    let out = run_git(
        &repo_root,
        &["remote", subcommand, "origin", clean.as_str()],
    )?;
    if !out.success {
        let info = classify_git_error(&git_error_text(&out), "remote");
        return Err(classified_error_string(&info));
    }

    // Only return the previous address if it was replaced — the user needs to know what changed.
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
    /// Is git installed on this computer?
    installed: bool,
    /// `git --version` original text (only when installed) — shows the user the facts as they are.
    version: Option<String>,
    /// "macos" | "windows" | "linux" — To select installation instructions by platform.
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

/// Checks **read-only** whether git exists on this computer.
///
/// Why a separate command: until now a missing git surfaced only as the generic
/// error string `run_git`'s spawn failure produces ("cannot run git (check
/// installation)"). From that string the screen **cannot know what guidance to
/// give** — it cannot tell whether the installation or the folder is the problem.
/// Turning it into a typed signal lets the UI pick platform-appropriate install
/// guidance (owner request 2026-07-26).
///
/// **Installs nothing.** We only detect and report; the user installs it in their
/// own terminal — the trust charter's "zero silent execution" holds here too.
/// One historical version of one vault file: when it landed and what it said.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeRevision {
    slug: String,
    iso_time: String,
    content: String,
}

/// Revisions of named vault nodes, newest first, for the summary-freshness check.
///
/// The screen needs to know whether a domain's **description** or its **membership**
/// moved last. Both live in one file, so a timestamp is not enough — the caller has to
/// compare content across versions. This command stays deliberately ignorant of what
/// that content means: it does no frontmatter parsing and knows nothing about
/// containment. Git plumbing lives here; the ontology judgement lives in one TypeScript
/// module that the web build shares, so there is no second copy of the rule to drift.
///
/// Bounded twice over. The caller passes only summary nodes (8 of 83 in the dogfood
/// vault), and `max_revisions` caps the walk per node. A slug with no history is simply
/// absent from the result rather than reported as an error, because a file written but
/// not yet committed is a normal state, not a failure.
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
        // A slug is an address inside the vault, never a way out of it. Anything that
        // could climb the tree or reach an absolute path is dropped rather than escaped,
        // because this value reaches a `git show` argument.
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

/// When one repository path last changed, for the analysis brief's evidence check.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathLastChange {
    /// The key the caller passed, unchanged, so it can be matched back without guessing.
    path: String,
    /// Whether the path exists on disk now — a file or a folder that moved reads `false`.
    exists: bool,
    /// Whether the path is a folder. A folder changes whenever anything under it does, so a
    /// caller treats its change time as weaker evidence than a file's.
    is_dir: bool,
    /// ISO time of the newest commit in the walk window touching the path or anything under
    /// it. `None` when no commit in the window did: uncommitted, or older than the window.
    last_changed_at: Option<String>,
}

/// One screen paint must not spawn one process per concept. The whole answer is one
/// `git log --name-only` walk over a bounded window, matched in memory.
const MAX_EVIDENCE_PATHS: usize = 512;
const EVIDENCE_WALK_COMMITS: &str = "--max-count=3000";

/// Last change per path. `repo_paths` are relative to the repository root — the `path:`
/// values the ontology records for its concepts. `vault_paths` are relative to the vault
/// folder — the concept documents themselves — and are resolved through the vault's own
/// pathspec so the caller never needs to know where the vault sits inside the repository.
///
/// A path is an address, never a way out: anything that could climb the tree, reach an
/// absolute path, or look like an option is dropped rather than escaped, because every
/// value here reaches a `git log` argument.
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

    // (key as the caller wrote it, repository-relative path git is asked about)
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
    for raw in &repo_paths {
        if let Some(clean) = safe_relative_path(raw) {
            push(raw, clean);
        }
    }
    for raw in &vault_paths {
        if let Some(clean) = safe_relative_path(raw) {
            push(raw, format!("{prefix}{clean}"));
        }
    }
    if wanted.is_empty() {
        return Ok(Vec::new());
    }

    const REC: char = '\x1e';
    let format = format!("--pretty=format:{REC}%cI");
    let mut args: Vec<&str> = vec![
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

/// A repository- or vault-relative path the caller may ask git about, or `None`.
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

/// Summary nodes are a small, bounded set by construction (`project` and `domain` only).
/// The cap exists so a malformed caller cannot turn one screen paint into an unbounded
/// number of `git show` processes.
const MAX_FRESHNESS_SLUGS: usize = 64;

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
        // A non-zero exit still means "it did run", so treat git as installed.
        Ok(_) => GitProbe {
            installed: true,
            version: None,
            platform,
        },
        // Spawn failure = the executable is absent.
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
    fn parse_porcelain_reads_rename_source() {
        let rows = parse_porcelain("R  docs/old.md -> docs/new.md\n");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].index, 'R');
        assert_eq!(rows[0].renamed_from.as_deref(), Some("docs/old.md"));
        assert_eq!(rows[0].path, "docs/new.md");
    }

    /// Does one `--name-status` line become a `ChangeEntry`?
    ///
    /// This parsing is what creates the "concepts" of history — if it quietly yields
    /// an empty list here, the screen draws every step as "outside the concepts",
    /// and no error appears anywhere.
    #[test]
    fn history_change_entry_reads_status_code_and_path() {
        let repo = PathBuf::from("/repo");
        let vault = PathBuf::from("/repo/docs");
        let added = history_change_entry("A\tdocs/elements/foo.md", &repo, &vault).unwrap();
        assert_eq!(added.status, "added");
        assert_eq!(added.path, "docs/elements/foo.md");
        // The file is not on disk so the frontmatter cannot be read → path-based slug.
        assert_eq!(added.slug, "elements/foo");
        assert_eq!(added.kind, None);

        assert_eq!(
            history_change_entry("D\tdocs/gone.md", &repo, &vault)
                .unwrap()
                .status,
            "deleted"
        );
        assert_eq!(
            history_change_entry("M\tdocs/x.md", &repo, &vault)
                .unwrap()
                .status,
            "modified"
        );
        // Even with a score attached, as in `R100`, judge by the first character.
        assert_eq!(
            history_change_entry("R100\tdocs/y.md", &repo, &vault)
                .unwrap()
                .status,
            "renamed"
        );
    }

    /// Commit subject lines and file lines must not mix — drop empty/broken lines.
    #[test]
    fn history_change_entry_rejects_lines_without_a_tab() {
        let repo = PathBuf::from("/repo");
        let vault = PathBuf::from("/repo/docs");
        assert!(history_change_entry("", &repo, &vault).is_none());
        assert!(history_change_entry("no tab here", &repo, &vault).is_none());
        assert!(history_change_entry("M\t", &repo, &vault).is_none());
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
        // A dotted segment that is not `..` is an ordinary name.
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
        // A repository path outside the vault's folder is refused even though git could touch it.
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
        // A body-only file on both sides has no identity to disagree about.
        assert_eq!(
            identity_difference(&read_identity("# a"), &read_identity("# b")),
            None
        );
    }

    #[test]
    fn host_platform_is_one_of_the_three_we_guide() {
        // Install guidance differs per platform — an unknown value leaves the UI
        // unable to pick guidance. Pin the value to one of the three.
        assert!(matches!(host_platform(), "macos" | "windows" | "linux"));
    }

    #[test]
    fn git_probe_reports_this_machine_truthfully() {
        // Any environment where this repository's tests run has git — check that the
        // probe states that fact as-is (does not guess).
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
        ] {
            assert_eq!(
                validate_remote_url(url).unwrap(),
                url,
                "should accept {url}"
            );
        }
        // Leading/trailing whitespace is trimmed — pasting is the normal path.
        assert_eq!(
            validate_remote_url("  git@github.com:me/repo.git \n").unwrap(),
            "git@github.com:me/repo.git"
        );
    }

    #[test]
    fn validate_remote_url_rejects_non_addresses() {
        // Empty value · flag lookalike · internal whitespace · unrecognizable shape.
        for bad in [
            "",
            "   ",
            "--upload-pack=evil",
            "git@host:a b",
            "저장소주소",
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
}
