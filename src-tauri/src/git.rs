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

// ── Vault path validation (absolute path injection defense) ─────────────────────────────────
// vault_path comes from JS (web GUI). Confirm existence + directory,
// canonicalize to resolve symbolic links/relative pieces into real paths, then use as git's
// cwd. Since pathspecs are calculated relative to repo_root, add/commit leaks outside the vault
// are fundamentally impossible.
pub(crate) fn validate_vault_dir(vault_path: &str) -> Result<PathBuf, String> {
    if vault_path.trim().is_empty() {
        return Err("vault 경로가 비어 있어요.".into());
    }
    let path = PathBuf::from(vault_path);
    let metadata =
        fs::metadata(&path).map_err(|_| "vault 경로가 존재하지 않아요.".to_string())?;
    if !metadata.is_dir() {
        return Err("vault 경로가 디렉토리가 아니에요.".into());
    }
    fs::canonicalize(&path).map_err(|err| format!("vault 경로를 확정할 수 없어요: {err}"))
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
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|err| format!("git 을 실행할 수 없어요 (설치 확인): {err}"))?;
    Ok(GitRun {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
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
        None => Err("아직 이 폴더의 기록을 시작하지 않았어요. 발자취 화면에서 '기록 시작하기' 를 누르면 시작할 수 있어요.".into()),
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
        .filter(|line| line.len() >= 3)
        .map(|line| {
            let bytes = line.as_bytes();
            let index = bytes[0] as char;
            let worktree = bytes[1] as char;
            // The first 3 bytes (status 2 + space 1) are always ASCII → byte 3 is a char boundary.
            let rest = &line[3..];
            let mut renamed_from = None;
            let mut path = rest.to_string();
            if let Some(arrow) = rest.find(" -> ") {
                renamed_from = Some(rest[..arrow].to_string());
                path = rest[arrow + 4..].to_string();
            }
            PorcelainRow {
                index,
                worktree,
                path,
                renamed_from,
            }
        })
        .collect()
}

/// `git status --porcelain -- <pathspec>` → array of lines. Returns `Err` on git failure.
fn get_porcelain_status(repo_root: &Path, pathspec: &str) -> Result<Vec<PorcelainRow>, String> {
    let out = run_git(
        repo_root,
        &[
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--",
            pathspec,
        ],
    )?;
    if !out.success {
        return Err(format!(
            "git status 실패: {}",
            first_nonempty_line(&out.stderr).unwrap_or_else(|| "unknown error".into())
        ));
    }
    Ok(parse_porcelain(&out.stdout))
}

/// Full repo porcelain without pathspec — guard for staged-outside-vault. Returns empty list on failure.
fn get_full_porcelain_status(repo_root: &Path) -> Vec<PorcelainRow> {
    match run_git(
        repo_root,
        &["status", "--porcelain", "--untracked-files=all"],
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

fn unquote(value: &str) -> String {
    let bytes = value.as_bytes();
    if value.len() >= 2
        && ((bytes[0] == b'"' && bytes[value.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[value.len() - 1] == b'\''))
    {
        value[1..value.len() - 1].to_string()
    } else {
        value.to_string()
    }
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
struct GitErrorInfo {
    #[allow(dead_code)]
    reason: &'static str,
    message: String,
    note: Option<String>,
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
            reason: "push-non-fast-forward",
            message: "원격이 앞섰어요 — `git pull` 후 다시 스냅샷하세요.".into(),
            note: Some("커밋은 이미 로컬에 기록됨".into()),
            guidance: Some("git pull".into()),
        };
    }

    if text.contains("gpg failed to sign")
        || text.contains("signing failed")
        || (text.contains("gpg") && text.contains("sign"))
    {
        return GitErrorInfo {
            reason: "gpg-sign-failed",
            message: "커밋 서명(gpg)에 실패했어요 — 서명 키를 확인하세요.".into(),
            note: first_line,
            guidance: Some("git config commit.gpgsign false   # 서명을 끄고 다시 스냅샷".into()),
        };
    }

    if text.contains("cannot do a partial commit") {
        return GitErrorInfo {
            reason: "merge-in-progress",
            message: "머지/리베이스가 진행 중이라 vault 범위만 커밋할 수 없어요 — 진행 중인 작업을 먼저 마치거나 중단하세요.".into(),
            note: None,
            guidance: Some("git status   # 진행 중 상태 확인".into()),
        };
    }

    if text.contains("conflict") || text.contains("automatic merge failed") {
        return GitErrorInfo {
            reason: "pull-conflict",
            message: "pull 중 충돌이 났어요 — 충돌 파일을 해결한 뒤 커밋하세요.".into(),
            note: None,
            guidance: Some("git status   # 충돌 파일 확인".into()),
        };
    }

    if text.contains("would be overwritten") || text.contains("overwritten by merge") {
        return GitErrorInfo {
            reason: "local-changes",
            message: "커밋 안 된 로컬 변경이 있어 막혔어요 — 먼저 스냅샷으로 커밋하거나 stash 하세요."
                .into(),
            note: None,
            guidance: None,
        };
    }

    if text.contains("no tracking information")
        || text.contains("couldn't find remote ref")
        || text.contains("no such remote")
    {
        return GitErrorInfo {
            reason: "no-upstream",
            message: "이 브랜치에 연결된 원격이 없어요 — 먼저 upstream 을 설정하세요.".into(),
            note: None,
            guidance: Some("git push -u origin <branch>".into()),
        };
    }

    if text.contains("repository not found")
        || text.contains("could not read from remote")
        || text.contains("does not appear to be a git repository")
    {
        return GitErrorInfo {
            reason: "remote-unreachable",
            message: "원격 저장소에 닿지 못했어요 — 주소가 맞는지, 접근 권한이 있는지 확인하세요.".into(),
            note: first_line,
            guidance: Some("git remote -v   # 등록된 주소 확인".into()),
        };
    }

    if text.contains("authentication failed")
        || text.contains("permission denied")
        || text.contains("could not read username")
    {
        return GitErrorInfo {
            reason: "remote-auth",
            message: "원격 인증에 실패했어요 — 자격 증명을 확인하세요.".into(),
            note: first_line,
            guidance: None,
        };
    }

    if text.contains("pre-commit") || text.contains("commit-msg") || text.contains("hook") {
        return GitErrorInfo {
            reason: "pre-commit-hook",
            message: "커밋 훅이 스냅샷을 거부했어요 — 훅이 보고한 문제를 고친 뒤 다시 스냅샷하세요.".into(),
            note: first_line,
            guidance: None,
        };
    }

    if operation == "commit" {
        return GitErrorInfo {
            reason: "commit-rejected",
            message: "커밋이 거부됐어요 (커밋 훅이 막았을 수 있어요).".into(),
            note: first_line,
            guidance: None,
        };
    }
    GitErrorInfo {
        reason: "git-command-failed",
        message: format!("git {operation} 명령이 실패했어요."),
        note: first_line,
        guidance: None,
    }
}

/// The classification result as a one-line user-facing string — the Err payload of Result<_, String>.
fn classified_error_string(info: &GitErrorInfo) -> String {
    let mut out = info.message.clone();
    if let Some(note) = &info.note {
        out.push_str(&format!(" ({note})"));
    }
    if let Some(guidance) = &info.guidance {
        out.push_str(&format!(" → {guidance}"));
    }
    out
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
#[tauri::command]
pub fn git_fetch(vault_path: String) -> Result<GitFetchResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let Some(upstream) = get_upstream_ref(&repo_root) else {
        return Ok(GitFetchResult {
            ok: false,
            upstream: String::new(),
            ahead: None,
            behind: None,
            summary: "보낼 곳이 아직 없어요".to_string(),
        });
    };
    let out = run_git(&repo_root, &["fetch", "--prune"])?;
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
            (Some(0), Some(0)) => "원격과 같아요".to_string(),
            (a, b) => format!(
                "내 걸음 {}개 · 원격 걸음 {}개",
                a.unwrap_or(0),
                b.unwrap_or(0)
            ),
        },
    })
}

/// Semantic-unit snapshot that adds + commits only the vault scope. Without `message`,
/// the auto summary is used as the subject. Sends to upstream only when `push` is true (opt-in).
/// No changes to commit is not an error but `committed:false, reason:"no-changes"`.
#[tauri::command]
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
    let full_message =
        build_commit_message(&subject, &auto_summary, &changes, custom.is_some());

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
            message: Some("push 실패 — 이 브랜치에 upstream 이 없어요. 커밋은 로컬에 기록됨.".into()),
            guidance: Some(format!("git push -u origin {branch}")),
        };
    };
    match run_git(repo_root, &["push"]) {
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
                message: Some(info.message),
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
pub fn git_history(
    vault_path: String,
    limit: Option<u32>,
) -> Result<Vec<GitCommitInfo>, String> {
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
    let diff = if out.success { out.stdout } else { String::new() };

    Ok(GitDiffResult {
        count: 0,
        files: Vec::new(),
        diff,
    })
}

/// git pull from upstream (opt-in transmission). Reports missing upstream / conflict /
/// non-fast-forward as a clean Err without crashing.
#[tauri::command]
pub fn git_pull(vault_path: String) -> Result<GitPullResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;

    let Some(upstream) = get_upstream_ref(&repo_root) else {
        let branch = get_current_branch(&repo_root).unwrap_or_else(|| "<branch>".into());
        return Err(format!(
            "이 브랜치에 연결된 원격이 없어요 — 먼저 upstream 을 설정하세요. → git push -u origin {branch}"
        ));
    };

    let out = run_git(&repo_root, &["pull"])?;
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
        return Err("보낼 주소를 입력해 주세요.".into());
    }
    if trimmed.starts_with('-') {
        return Err("주소가 '-' 로 시작할 수 없어요.".into());
    }
    if trimmed.chars().any(char::is_whitespace) {
        return Err("주소에 공백이 들어 있어요. 저장소 주소만 붙여 주세요.".into());
    }
    // Allow only the four common shapes: scp-like (git@host:path) · https · ssh · file path.
    let looks_scp = trimmed.contains('@') && trimmed.contains(':');
    let looks_url = trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("ssh://")
        || trimmed.starts_with("git://");
    let looks_path = trimmed.starts_with('/') || trimmed.starts_with("file://");
    if !(looks_scp || looks_url || looks_path) {
        return Err(
            "주소 형태를 알아볼 수 없어요. 예: git@github.com:내이름/저장소.git".into(),
        );
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
    let root = find_repo_root(&vault_dir)?.ok_or_else(|| {
        "기록을 시작했지만 저장소를 다시 찾지 못했어요. 폴더 권한을 확인해 주세요.".to_string()
    })?;
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
    let out = run_git(&repo_root, &["remote", subcommand, "origin", clean.as_str()])?;
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
#[tauri::command]
pub fn git_probe() -> GitProbe {
    let platform = host_platform().to_string();
    match Command::new("git").arg("--version").output() {
        Ok(out) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            GitProbe {
                installed: true,
                version: if version.is_empty() { None } else { Some(version) },
                platform,
            }
        }
        // A non-zero exit still means "it did run", so treat git as installed.
        Ok(_) => GitProbe { installed: true, version: None, platform },
        // Spawn failure = the executable is absent.
        Err(_) => GitProbe { installed: false, version: None, platform },
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
        let msg = build_commit_message("my subject", "ontology snapshot: +1 concept (a)", &changes, true);
        assert!(msg.starts_with("my subject\n\n"));
        assert!(msg.contains("ontology snapshot: +1 concept (a)"));
        assert!(msg.contains("  A  docs/a.md"));
    }

    #[test]
    fn classify_git_error_detects_non_fast_forward() {
        let info = classify_git_error("! [rejected] main -> main (non-fast-forward)", "push");
        assert_eq!(info.reason, "push-non-fast-forward");
        assert!(info.guidance.as_deref() == Some("git pull"));
    }

    #[test]
    fn classify_git_error_detects_hook_rejection() {
        let info = classify_git_error("pre-commit hook failed", "commit");
        assert_eq!(info.reason, "pre-commit-hook");
    }

    #[test]
    fn classify_git_error_commit_fallback() {
        let info = classify_git_error("something weird happened", "commit");
        assert_eq!(info.reason, "commit-rejected");
    }

    #[test]
    fn validate_vault_dir_rejects_missing_path() {
        let err = validate_vault_dir("/path/does/not/exist/atlas").unwrap_err();
        assert!(!err.is_empty());
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
            assert_eq!(validate_remote_url(url).unwrap(), url, "should accept {url}");
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
        for bad in ["", "   ", "--upload-pack=evil", "git@host:a b", "저장소주소"] {
            assert!(
                validate_remote_url(bad).is_err(),
                "should reject {bad:?}"
            );
        }
    }

    #[test]
    fn read_kind_slug_extracts_frontmatter_fields() {
        let dir = std::env::temp_dir().join(format!("atlas-git-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("node.md");
        fs::write(&file, "---\nkind: capability\nslug: \"my-cap\"\n---\n# Body\n").unwrap();
        let (kind, slug) = read_kind_slug(&file);
        assert_eq!(kind.as_deref(), Some("capability"));
        assert_eq!(slug.as_deref(), Some("my-cap"));
        let _ = fs::remove_dir_all(&dir);
    }
}
