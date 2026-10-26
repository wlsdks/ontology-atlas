use super::*;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub(crate) mod cache;
mod response;
pub(super) use response::FetchError;
use response::PullLookupFailure;

const PR_LIMIT: usize = 40;
const REQUEST_LIMIT: usize = 80;
const PR_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullDescription {
    pub number: u64,
    pub title: String,
    pub body: String,
    pub url: String,
    pub updated_at: String,
    pub fetched_at: String,
    pub digest: String,
    pub integration: String,
    #[serde(default)]
    pub copy_kind: String,
    #[serde(skip)]
    pub(super) merge_commit: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullDescriptions {
    pub status: String,
    pub repository: String,
    pub descriptions: Vec<PullDescription>,
    pub unchecked: usize,
    pub unchecked_commits: Vec<String>,
    pub unlinked: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<PullLookupFailure>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved: Option<cache::SaveReport>,
}

fn github_repository(raw: &str) -> Option<String> {
    let path = raw
        .strip_prefix("https://github.com/")
        .or_else(|| raw.strip_prefix("git@github.com:"))?;
    let path = path
        .trim_end_matches('/')
        .strip_suffix(".git")
        .unwrap_or(path.trim_end_matches('/'));
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|part| {
            part.is_empty()
                || *part == "."
                || *part == ".."
                || !part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
        })
    {
        return None;
    }
    Some(path.to_string())
}
fn source_receipt(
    source_path: &str,
    head: &str,
    tip: &str,
    base: Option<&str>,
    snapshot: &str,
) -> Result<(Identity, Vec<BriefingCommit>), String> {
    let current = picked_identity(source_path)?;
    if current.head != head {
        return Err("stale".into());
    }
    let receipts = RECEIPTS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let receipt = receipts
        .iter()
        .rev()
        .find(|r| {
            r.snapshot == snapshot
                && r.identity.root == current.root
                && r.identity.object == current.object
                && r.identity.head == current.head
                && r.tip == tip
                && r.base.as_deref() == base
        })
        .ok_or("stale")?;
    Ok((current, receipt.commits.clone()))
}
fn repositories(root: &Path) -> Result<Vec<String>, String> {
    let remotes = text_git(root, &["remote"])?;
    let mut result = Vec::new();
    for name in remotes.lines().take(40) {
        if name.starts_with('-') || name.chars().any(char::is_control) {
            continue;
        }
        if let Ok(urls) = text_git(root, &["remote", "get-url", "--all", name]) {
            for repository in urls.lines().filter_map(github_repository) {
                if !result
                    .iter()
                    .any(|r: &String| r.eq_ignore_ascii_case(&repository))
                {
                    result.push(repository);
                }
            }
        }
    }
    Ok(result)
}
#[tauri::command(async)]
pub fn git_briefing_repositories(
    source_path: String,
    head: String,
    tip: String,
    base: Option<String>,
    snapshot: String,
) -> Result<Vec<String>, String> {
    let (before, _) = source_receipt(&source_path, &head, &tip, base.as_deref(), &snapshot)?;
    let result = repositories(&before.root)?;
    if picked_identity(&source_path).ok().as_ref() != Some(&before) {
        return Err("stale".into());
    }
    Ok(result)
}
fn candidates(message: &str) -> Vec<u64> {
    let mut numbers = Vec::new();
    for rest in message.split('#').skip(1) {
        let digits: String = rest
            .chars()
            .take_while(char::is_ascii_digit)
            .take(10)
            .collect();
        if let Ok(number) = digits.parse::<u64>() {
            if number > 0 && !numbers.contains(&number) {
                numbers.push(number);
            }
        }
        if numbers.len() == PR_LIMIT {
            break;
        }
    }
    numbers
}
fn introduced(root: &Path, merge: &str, integration: &str) -> bool {
    if !valid_hash(merge) || !valid_hash(integration) {
        return false;
    }
    if text_git(root, &["merge-base", "--is-ancestor", merge, integration]).is_err() {
        return false;
    }
    let parents = match text_git(root, &["rev-list", "--parents", "-n", "1", integration]) {
        Ok(value) => value,
        Err(_) => return false,
    };
    match parents.split_whitespace().nth(1) {
        Some(parent) => text_git(root, &["merge-base", "--is-ancestor", merge, parent]).is_err(),
        None => true,
    }
}
fn fetch(path: &str, limit: usize, cancelled: &AtomicBool) -> Result<(Value, usize), FetchError> {
    let url = format!("https://api.github.com/repos/{path}");
    let max = limit.min(524_288);
    let max_text = max.to_string();
    let mut command = std::process::Command::new("curl");
    command
        .args([
            "--disable",
            "--silent",
            "--show-error",
            "--fail",
            "--max-time",
            "15",
            "--proto",
            "=https",
            "--max-filesize",
            &max_text,
            "--header",
            "Accept: application/vnd.github+json",
            "--header",
            "X-GitHub-Api-Version: 2022-11-28",
            "--write-out",
            response::TRAILER,
            "--url",
            &url,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(|_| "unavailable")?;
    let stdout = child.stdout.take().ok_or("unavailable")?;
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take((max + response::TRAILER_LIMIT + 1) as u64).read_to_end(&mut bytes);
        let _ = send.send(result.map(|_| bytes));
    });
    let started = std::time::Instant::now();
    let bytes = loop {
        if cancelled.load(Ordering::Relaxed) || started.elapsed() > Duration::from_secs(20) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("unavailable".into());
        }
        match receive.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(bytes)) if bytes.len() <= max + response::TRAILER_LIMIT => break bytes,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("unavailable".into());
            }
        }
    };
    let success = child.wait().map_err(|_| "unavailable")?.success();
    response::parse(&bytes, max, success, chrono::Utc::now().timestamp())
}
pub(super) fn collect(
    root: &Path,
    repository: &str,
    commits: &[BriefingCommit],
    mut get: impl FnMut(&str, usize) -> Result<(Value, usize), FetchError>,
    cancelled: &AtomicBool,
) -> PullDescriptions {
    let mut result = PullDescriptions {
        status: "measured".into(),
        repository: repository.into(),
        descriptions: vec![],
        unchecked: 0,
        unchecked_commits: vec![],
        unlinked: 0,
        failure: None,
        saved: None,
    };
    let (repo, mut bytes) = match get(repository, PR_BYTES) {
        Ok(value) => value,
        Err(error) => {
            result.failure = error.failure();
            result.status = "unavailable".into();
            result.unchecked = commits.len();
            result.unchecked_commits = commits.iter().map(|commit| commit.hash.clone()).collect();
            return result;
        }
    };
    let public = repo["private"] == false
        && repo["full_name"]
            .as_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(repository));
    if !public {
        result.status = "unavailable".into();
        result.unchecked = commits.len();
            result.unchecked_commits = commits.iter().map(|commit| commit.hash.clone()).collect();
        return result;
    }
    let mut requests = 1;
    let mut cache = std::collections::HashMap::new();
    let mut unlinked = HashSet::new();
    let started = std::time::Instant::now();
    for commit in commits {
        if cancelled.load(Ordering::Relaxed) {
            result.status = "cancelled".into();
            return result;
        }
        if result.failure.is_some() {
            result.unchecked += 1;
            result.unchecked_commits.push(commit.hash.clone());
            continue;
        }
        let mut checked = true;
        let mut numbers = candidates(&commit.message);
        if requests < REQUEST_LIMIT
            && bytes < PR_BYTES
            && started.elapsed() < Duration::from_secs(60)
        {
            requests += 1;
            match get(
                &format!("{repository}/commits/{}/pulls?per_page=10", commit.hash),
                PR_BYTES.saturating_sub(bytes),
            ) {
                Ok((value, size)) => {
                    bytes += size;
                    if let Some(associated) = value.as_array() {
                        if associated.len() == 10 {
                            checked = false;
                        }
                        for number in associated.iter().filter_map(|pr| pr["number"].as_u64()) {
                            if number > 0 && !numbers.contains(&number) {
                                numbers.push(number);
                            }
                        }
                    } else {
                        checked = false;
                    }
                }
                Err(error) => {
                    result.failure = error.failure();
                    checked = false;
                }
            }
        } else {
            checked = false;
        }
        for number in numbers {
            if result.failure.is_some() { checked = false; break; }
            if cancelled.load(Ordering::Relaxed) {
                result.status = "cancelled".into();
                return result;
            }
            if result.descriptions.iter().any(|pr| pr.number == number) {
                continue;
            }
            if result.descriptions.len() == PR_LIMIT
                || requests == REQUEST_LIMIT
                || bytes >= PR_BYTES
                || started.elapsed() > Duration::from_secs(60)
            {
                checked = false;
                break;
            }
            if !cache.contains_key(&number) {
                requests += 1;
                match get(
                    &format!("{repository}/pulls/{number}"),
                    PR_BYTES.saturating_sub(bytes),
                ) {
                    Ok((value, size)) => {
                        bytes += size;
                        cache.insert(number, value);
                    }
                    Err(error) => {
                        result.failure = error.failure();
                        checked = false;
                        continue;
                    }
                }
            }
            let pr = &cache[&number];
            let same = pr["base"]["repo"]["full_name"]
                .as_str()
                .is_some_and(|name| name.eq_ignore_ascii_case(repository));
            let merge = pr["merge_commit_sha"].as_str().unwrap_or("");
            if !same || pr["merged"] != true || !introduced(root, merge, &commit.hash) {
                unlinked.insert(number);
                continue;
            }
            let Some(title) = pr["title"].as_str() else {
                checked = false;
                continue;
            };
            let body = pr["body"].as_str().unwrap_or("");
            let Some(updated_at) = pr["updated_at"].as_str() else {
                checked = false;
                continue;
            };
            unlinked.remove(&number);
            result.descriptions.push(PullDescription {
                number,
                title: title.into(),
                body: body.into(),
                url: format!("https://github.com/{repository}/pull/{number}"),
                updated_at: updated_at.into(),
                fetched_at: chrono::Utc::now().to_rfc3339(),
                digest: format!(
                    "{:x}",
                    Sha256::digest(format!("{title}\0{body}\0{updated_at}"))
                ),
                integration: commit.hash.clone(),
                merge_commit: merge.into(),
                copy_kind: "fresh".into(),
            });
        }
        if !checked {
            result.unchecked += 1;
            result.unchecked_commits.push(commit.hash.clone());
        }
    }
    result.unlinked = unlinked.len();
    if result.unchecked > 0 {
        result.status = "partial".into();
    }
    result
}
#[tauri::command]
pub async fn git_briefing_pull_descriptions(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request_id: String,
    preserve_previous: bool,
    source_path: String,
    head: String,
    tip: String,
    base: Option<String>,
    repository: String,
    snapshot: String,
) -> Result<PullDescriptions, String> {
    let mut owned = crate::llm::requests::registry().claim(window.label(), &request_id)?;
    let cancelled = Arc::new(AtomicBool::new(false));
    let worker_cancelled = cancelled.clone();
    let worker = tauri::async_runtime::spawn_blocking(move || {
        let (before, commits) =
            source_receipt(&source_path, &head, &tip, base.as_deref(), &snapshot)?;
        if !repositories(&before.root)?.iter().any(|r| r == &repository) {
            return Err("unavailable".into());
        }
        let ticket = cache::ticket(&app);
        if worker_cancelled.load(Ordering::Acquire) { return Err("cancelled".into()); }
        let mut result = collect(
            &before.root,
            &repository,
            &commits,
            |path, limit| fetch(path, limit, &worker_cancelled),
            &worker_cancelled,
        );
        if picked_identity(&source_path).ok().as_ref() != Some(&before) {
            return Err("stale".into());
        }
        if !repositories(&before.root)?.contains(&repository) { return Err("stale".into()); }
        result.saved = Some(cache::save(&ticket, &before, &result, &commits, &worker_cancelled, preserve_previous));
        Ok(result)
    });
    match futures_util::future::select(Box::pin(worker), Box::pin(&mut owned.receiver)).await {
        futures_util::future::Either::Left((result, _)) => {
            result.map_err(|_| "unavailable".to_string())?
        }
        futures_util::future::Either::Right((_, worker)) => {
            cancelled.store(true, Ordering::Relaxed);
            let _ = worker.await;
            Err("cancelled".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rate_limit_stops_further_network_calls_and_marks_unchecked_commits() {
        let commits: Vec<_> = ["a", "b"].iter().map(|hash| BriefingCommit {
            hash: hash.repeat(40), subject: "Merge #1".into(), message: "Merge #1".into(),
            message_complete: true, committed_at: "2026-10-26T00:00:00Z".into(), paths: vec![],
        }).collect();
        for fail_at in [1, 2, 3] {
            let mut calls = 0;
            let result = collect(Path::new("."), "owner/repo", &commits, |_, _| {
                calls += 1;
                if calls == fail_at { return Err(FetchError::RateLimited(Some("2026-10-26T00:01:00Z".into()))); }
                Ok((if calls == 1 { serde_json::json!({"private":false,"full_name":"owner/repo"}) } else { serde_json::json!([{ "number": 1 }]) }, 32))
            }, &AtomicBool::new(false));
            assert_eq!(calls, fail_at);
            assert_eq!(result.unchecked_commits.len(), commits.len());
            assert_eq!(result.unchecked, commits.len());
            assert_eq!(result.failure.unwrap().kind, "rate-limited");
            assert_eq!(result.status, if fail_at == 1 { "unavailable" } else { "partial" });
        }
    }
    #[test]
    fn remote_identity_never_keeps_credentials_queries_or_other_hosts() {
        assert_eq!(
            github_repository("git@github.com:owner/repo.git"),
            Some("owner/repo".into())
        );
        assert_eq!(
            github_repository("https://github.com/owner/repo.git"),
            Some("owner/repo".into())
        );
        for raw in [
            "https://token@github.com/owner/repo",
            "https://github.com/owner/repo?token=x",
            "https://evil.test/owner/repo",
            "https://github.com/owner/../repo",
        ] {
            assert_eq!(github_repository(raw), None);
        }
        assert_eq!(
            candidates("Merge #2925: message; unrelated #2; repeated #2925"),
            vec![2925, 2]
        );
    }
}
