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

// ── frontmatter kind/slug (경량 파서) ──────────────────────────────────────
// 의미 정보용 최소 추출 — 파일 선두 `---` 블록에서 top-level `kind:`/`slug:`만
// 읽는다. 커밋을 막지 않는 best-effort(실패해도 경로 기반 slug 로 진행).
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

/// 분류 결과를 사용자용 한 줄 문자열로 — Result<_, String> 의 Err 페이로드.
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

// ── upstream / 브랜치 조회 ─────────────────────────────────────────────────
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

// ── 결과 타입 (웹 GUI 가 소비) ─────────────────────────────────────────────
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    /// vault 가 git repo 안인가 — 웹 GUI 버튼 상태 판단의 1차 신호.
    initialized: bool,
    /// repo 최상위 절대경로 (initialized 일 때만).
    repo_root: Option<String>,
    /// 현재 브랜치명.
    branch: Option<String>,
    /// upstream ref (예: origin/main) — 없으면 null(push 불가 안내).
    upstream: Option<String>,
    /// vault 범위의 미커밋 변경 수.
    changed_count: usize,
    /// vault 밖에 이미 staged 된 경로(스냅샷이 건드리지 않음 — 정보용).
    staged_outside_vault: Vec<String>,
    /// upstream 에 아직 안 간 내 걸음 수. upstream 이 없으면 `None`.
    ///
    /// 이 둘이 없으면 화면은 「보낼 게 있는지」를 말할 수 없어 Push 버튼이
    /// 항상 켜져 있거나 항상 꺼져 있다 — 둘 다 거짓말이다.
    ahead: Option<usize>,
    /// upstream 에는 있고 내게 없는 걸음 수. upstream 이 없으면 `None`.
    behind: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushOutcome {
    pushed: bool,
    remote_url: Option<String>,
    /// 실패 시 사용자용 한 줄.
    message: Option<String>,
    guidance: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotResult {
    committed: bool,
    /// "no-changes" | null(커밋됨).
    reason: Option<String>,
    commit_hash: Option<String>,
    subject: Option<String>,
    /// 의미 단위 auto 요약 한 줄.
    summary: Option<String>,
    counts: SnapshotCounts,
    files: Vec<ChangeEntry>,
    staged_outside_vault: Vec<String>,
    /// push 를 요청(opt-in)했을 때만 채워짐.
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
    /// 이 걸음이 건드린 vault 파일 — `kind`/`slug` 가 실려 있어 화면이 커밋을
    /// 「개념이 어떻게 변했나」로 읽을 수 있다. 이게 없으면 이력은 커밋 제목
    /// 문자열일 뿐이고, 개념 단위로 볼 방법이 아예 없다.
    files: Vec<ChangeEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    count: usize,
    files: Vec<ChangeEntry>,
    /// 추적 파일의 텍스트 diff (신규 파일은 목록으로만).
    diff: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFetchResult {
    ok: bool,
    /// upstream ref (예: origin/main). 없으면 빈 문자열 + `ok:false`.
    upstream: String,
    /// fetch **직후** 다시 잰 갈라짐 — 화면이 이 값으로 Pull/Push 를 켠다.
    ahead: Option<usize>,
    behind: Option<usize>,
    summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    ok: bool,
    upstream: String,
    /// pull 결과 요약 마지막 줄 (예: "Already up to date.").
    summary: String,
}

// ── #[tauri::command] 세트 ─────────────────────────────────────────────────

/// vault 의 git 상태 요약 — 초기화 여부 + 브랜치/upstream + 미커밋 변경 수.
/// 웹 GUI 가 "스냅샷/push/pull" 버튼 활성화를 판단하는 데 쓴다. repo 밖이면
/// 에러가 아니라 `initialized:false` 로 알린다(자동 init 금지).
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

/// upstream 과 얼마나 갈라졌나 — `(ahead, behind)`.
///
/// 이 값은 **마지막 fetch 시점 기준**이다. git 이 원래 그렇다: 로컬은 원격을
/// 다시 물어보기 전까지 자기가 아는 마지막 상태로 답한다. 그래서 화면에
/// `Fetch` 가 따로 있어야 이 숫자가 갱신된다.
fn divergence_counts(repo_root: &Path) -> (Option<usize>, Option<usize>) {
    let out = match run_git(
        repo_root,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    ) {
        Ok(o) if o.success => o,
        // upstream 이 사라졌거나 참조가 깨졌으면 「모른다」 — 0 이 아니다.
        _ => return (None, None),
    };
    let mut parts = out.stdout.split_whitespace();
    let ahead = parts.next().and_then(|v| v.parse::<usize>().ok());
    let behind = parts.next().and_then(|v| v.parse::<usize>().ok());
    (ahead, behind)
}

/// 원격의 최신 상태를 **받아만 온다** — 작업 트리는 건드리지 않는다.
///
/// 신뢰 헌장: 네트워크를 타는 유일한 다른 명령(`git_snapshot(push)`·`git_pull`)
/// 과 같은 규율이다 — 사용자가 누를 때만 돈다. 자동 호출 금지.
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
        // `message` 만 돌려주면 git 이 말해 준 이유(`note`)와 다음 수(`guidance`)를
        // 우리가 지우는 셈이다 — 「무엇이 잘못됐는지」 없는 실패는 못 고친다.
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

/// vault 범위만 add + commit 하는 의미 단위 스냅샷. `message` 없으면 auto
/// 요약을 subject 로 쓴다. `push` 가 true 일 때만 upstream 으로 전송(opt-in).
/// 커밋할 변경이 없으면 에러가 아니라 `committed:false, reason:"no-changes"`.
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

    // 신뢰 헌장 ④ — vault 범위의 untracked 신규 파일만 먼저 add. tracked 파일의
    // 변경/삭제는 이어지는 pathspec partial-commit 이 index 를 건드리지 않고 담는다.
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

    // push 는 opt-in 명시일 때만 — upstream 없으면 자동 `-u` 설정 안 함(헌장 ①).
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

/// 커밋은 이미 로컬에 있으므로 push 실패는 Err 로 크래시시키지 않고
/// `PushOutcome{pushed:false, ...}` 안내로 담는다.
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

/// vault 경로에 닿은 최근 커밋 요약(해시/메시지/시간) — 옵시디언 Git 히스토리
/// 패리티. 커밋이 하나도 없으면 빈 목록.
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
     * 레코드 구분자를 **머리에** 둔다. 꼬리에 두면 `--name-status` 줄이 구분자
     * 뒤로 밀려 다음 커밋의 것으로 붙는다.
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
        // 커밋 0개(아직 히스토리 없음) 등 — 빈 목록으로 우아하게.
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

/// `--name-status` 한 줄(`M\tpath`)을 `ChangeEntry` 로.
///
/// `kind` 는 **지금 디스크의 파일**에서 읽는다 — 그 커밋 시점의 blob 이 아니다.
/// 개념의 정체는 시간이 지나도 같은 것으로 다루는 편이 화면에 유용하고,
/// 커밋마다 `git show` 를 도는 비용을 치를 값이 없다. 지워진 파일은 경로에서
/// 슬러그만 얻고 `kind` 는 비운다.
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

/// 아직 커밋 안 된 vault 범위 변경의 파일 목록 + 텍스트 diff.
#[tauri::command]
pub fn git_diff(vault_path: String) -> Result<GitDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    let rows = get_porcelain_status(&repo_root, &pathspec)?;
    let changes = build_change_summary(&rows, &repo_root, &vault_dir);

    // HEAD 있으면 HEAD 기준, 없으면(커밋 0개) index 기준으로 폴백.
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

/// **한 커밋이 실제로 쓴 것** — 그 커밋의 vault 범위 patch.
///
/// `git_diff` 와 갈라 둔 이유: 저쪽은 «아직 커밋 안 된» 작업 트리를 보고,
/// 이쪽은 «이미 이름이 붙은» 한 걸음을 본다. 인자도 결과도 다르므로 한
/// 명령에 `Option` 을 달아 두 뜻을 겸하게 하면 호출부가 무엇을 묻는지
/// 시그니처로 못 읽는다.
#[tauri::command]
pub fn git_commit_diff(vault_path: String, hash: String) -> Result<GitDiffResult, String> {
    let vault_dir = validate_vault_dir(&vault_path)?;
    let repo_root = require_repo_root(&vault_dir)?;
    let pathspec = vault_pathspec(&repo_root, &vault_dir);

    // 해시는 사용자 입력이 아니라 우리가 방금 `git log` 로 읽은 값이지만,
    // 인자로 오는 이상 옵션으로 오해될 문자열은 거른다(`--upload-pack=…` 류).
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

/// upstream 에서 git pull (opt-in 전송). upstream 없음/충돌/비-fast-forward 를
/// 크래시 없이 깔끔한 Err 로 안내한다.
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

/// 원격 주소가 git 이 받아들일 형태인지 최소 검사 — 사용자 입력을 셸에 넘기기
/// 전 게이트. `run_git` 이 인자 배열을 쓰므로 셸 인젝션 자체는 불가능하지만,
/// 형태가 아닌 문자열(빈 값·공백 포함·플래그 흉내)은 여기서 거른다.
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
    // 흔한 4형태만 허용: scp-like(git@host:path) · https · ssh · file 경로.
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

/// git 이 이 컴퓨터에 있는지 **읽기 전용**으로 확인한다.
///
/// 왜 별 커맨드인가: 지금까지 git 미설치는 `run_git` 의 spawn 실패가 만든
/// 일반 에러 문자열로만 드러났다("git 을 실행할 수 없어요 (설치 확인)").
/// 화면은 그 문자열로 **무엇을 안내해야 할지 알 수 없다** — 설치가 문제인지
/// 폴더가 문제인지 구분이 안 된다. 타입화된 신호로 바꿔 UI 가 플랫폼에 맞는
/// 설치 안내를 고를 수 있게 한다(소유자 요청 2026-07-26).
///
/// **아무것도 설치하지 않는다.** 우리는 감지하고 알려줄 뿐이고, 설치는
/// 사용자가 자기 터미널에서 한다 — 신뢰 헌장의 "조용한 실행 0" 이 여기서도
/// 유지된다.
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
        // non-zero exit 도 "실행은 됐다" 이므로 설치는 된 것으로 본다.
        Ok(_) => GitProbe { installed: true, version: None, platform },
        // spawn 실패 = 실행 파일이 없다.
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

    /// `--name-status` 한 줄이 `ChangeEntry` 가 되는가.
    ///
    /// 이 파싱이 이력의 「개념」을 만든다 — 여기서 조용히 빈 목록이 나오면
    /// 화면은 모든 걸음을 「개념 밖」으로 그리고, 아무 에러도 안 난다.
    #[test]
    fn history_change_entry_reads_status_code_and_path() {
        let repo = PathBuf::from("/repo");
        let vault = PathBuf::from("/repo/docs");
        let added = history_change_entry("A\tdocs/elements/foo.md", &repo, &vault).unwrap();
        assert_eq!(added.status, "added");
        assert_eq!(added.path, "docs/elements/foo.md");
        // 디스크에 없는 파일이라 frontmatter 를 못 읽는다 → 경로 기반 슬러그.
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
        // `R100` 처럼 점수가 붙어도 첫 글자로 판정한다.
        assert_eq!(
            history_change_entry("R100\tdocs/y.md", &repo, &vault)
                .unwrap()
                .status,
            "renamed"
        );
    }

    /// 커밋 제목 줄과 파일 줄이 섞이면 안 된다 — 빈/깨진 줄은 버린다.
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
        // 설치 안내는 플랫폼별로 다르다 — 알 수 없는 값이 나오면 UI 가 안내를
        // 못 고른다. 셋 중 하나임을 고정한다.
        assert!(matches!(host_platform(), "macos" | "windows" | "linux"));
    }

    #[test]
    fn git_probe_reports_this_machine_truthfully() {
        // 이 저장소에서 테스트가 도는 환경은 git 이 있다 — probe 가 그 사실을
        // 그대로 말하는지(추측하지 않는지) 확인한다.
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
        // 앞뒤 공백은 다듬는다 — 붙여넣기가 정상 경로다.
        assert_eq!(
            validate_remote_url("  git@github.com:me/repo.git \n").unwrap(),
            "git@github.com:me/repo.git"
        );
    }

    #[test]
    fn validate_remote_url_rejects_non_addresses() {
        // 빈 값 · 플래그 흉내 · 내부 공백 · 형태 불명.
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
