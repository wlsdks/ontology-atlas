use super::*;

pub(super) struct Page {
    pub(super) value: Value,
    pub(super) link: String,
    pub(super) bytes: usize,
}

#[derive(Debug)]
pub(super) enum PageError {
    Unavailable,
    RateLimited(Option<String>),
    Oversized,
    Cancelled,
    Deadline,
}

pub(super) fn next_page(
    link: &str,
    repository: &str,
    repository_id: u64,
    page: usize,
    size: usize,
) -> Result<bool, ()> {
    if link.is_empty() {
        return Ok(false);
    }
    let prefix = format!("https://api.github.com/repos/{repository}/pulls?");
    let id_prefix = format!("https://api.github.com/repositories/{repository_id}/pulls?");
    let mut found = false;
    for entry in link.split(',') {
        let (target, params) = entry.trim().split_once(';').ok_or(())?;
        let target = target
            .trim()
            .strip_prefix('<')
            .and_then(|s| s.strip_suffix('>'))
            .ok_or(())?;
        let rel = params
            .trim()
            .strip_prefix("rel=\"")
            .and_then(|s| s.strip_suffix('"'))
            .ok_or(())?;
        if !matches!(rel, "first" | "last" | "next" | "prev") {
            return Err(());
        }
        if rel != "next" {
            continue;
        }
        if found {
            return Err(());
        }
        let query = target
            .strip_prefix(&prefix)
            .or_else(|| target.strip_prefix(&id_prefix))
            .ok_or(())?;
        let mut pairs = BTreeMap::new();
        for pair in query.split('&') {
            let (key, value) = pair.split_once('=').ok_or(())?;
            if pairs.insert(key, value).is_some() {
                return Err(());
            }
        }
        if pairs.len() != 5
            || pairs.get("state") != Some(&"all")
            || pairs.get("sort") != Some(&"updated")
            || pairs.get("direction") != Some(&"desc")
            || pairs.get("per_page").and_then(|n| n.parse::<usize>().ok()) != Some(size)
            || pairs.get("page").and_then(|n| n.parse::<usize>().ok()) != page.checked_add(1)
        {
            return Err(());
        }
        found = true;
    }
    Ok(found)
}

pub(super) fn page_path(repository: &str, size: usize, page: usize) -> String {
    format!("{repository}/pulls?state=all&sort=updated&direction=desc&per_page={size}&page={page}")
}

pub(super) fn local_git(
    root: &Path,
    args: &[&str],
    deadline: Instant,
    cancelled: &AtomicBool,
) -> Result<String, String> {
    if cancelled.load(Ordering::Acquire) {
        return Err("cancelled".into());
    }
    if Instant::now() >= deadline {
        return Err("deadline".into());
    }
    let mut command = hardened_base_command();
    command
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .env("LC_ALL", "C")
        .args(with_diff_family_guard(args))
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(|_| "unavailable")?;
    let stdout = child.stdout.take().ok_or("unavailable")?;
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let output = stdout.take(4097).read_to_end(&mut bytes);
        let _ = send.send(output.map(|_| bytes));
    });
    let bytes = loop {
        if cancelled.load(Ordering::Acquire) || Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(if cancelled.load(Ordering::Acquire) {
                "cancelled"
            } else {
                "deadline"
            }
            .into());
        }
        match receive.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(bytes)) if bytes.len() <= 4096 => break bytes,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("unavailable".into());
            }
        }
    };
    let status = loop {
        if cancelled.load(Ordering::Acquire) || Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(if cancelled.load(Ordering::Acquire) {
                "cancelled"
            } else {
                "deadline"
            }
            .into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => return Err("unavailable".into()),
        }
    };
    if !status.success() {
        return Err("unavailable".into());
    }
    String::from_utf8(bytes)
        .map(|value| value.trim().into())
        .map_err(|_| "unavailable".into())
}

pub(super) fn identity_until(
    source_path: &str,
    deadline: Instant,
    cancelled: &AtomicBool,
) -> Result<Identity, String> {
    let root = crate::canonical_source_root(source_path).map_err(|_| "unavailable")?;
    let top = local_git(
        &root,
        &["rev-parse", "--show-toplevel"],
        deadline,
        cancelled,
    )?;
    if fs::canonicalize(top).ok().as_ref() != Some(&root) {
        return Err("unavailable".into());
    }
    let head = local_git(
        &root,
        &["rev-parse", "--verify", "HEAD"],
        deadline,
        cancelled,
    )?;
    let metadata = fs::metadata(&root).map_err(|_| "unavailable")?;
    #[cfg(unix)]
    let object = {
        use std::os::unix::fs::MetadataExt;
        (metadata.dev(), metadata.ino())
    };
    #[cfg(not(unix))]
    let object = (0, 0);
    Ok(Identity {
        scope: SourceScope::Picked,
        root,
        head,
        object,
    })
}

pub(super) fn repositories_until(
    root: &Path,
    deadline: Instant,
    cancelled: &AtomicBool,
) -> Result<Vec<String>, String> {
    let remotes = local_git(root, &["remote"], deadline, cancelled)?;
    let mut result = Vec::new();
    for name in remotes.lines().take(40) {
        if name.starts_with('-') || name.chars().any(char::is_control) {
            continue;
        }
        match local_git(
            root,
            &["remote", "get-url", "--all", name],
            deadline,
            cancelled,
        ) {
            Ok(urls) => {
                for repository in urls.lines().filter_map(github_repository) {
                    if !result
                        .iter()
                        .any(|name: &String| name.eq_ignore_ascii_case(&repository))
                    {
                        result.push(repository);
                    }
                }
            }
            Err(error) if error == "deadline" || error == "cancelled" => return Err(error),
            Err(_) => continue,
        }
    }
    Ok(result)
}

pub(super) fn fetch(
    path: &str,
    limit: usize,
    deadline: Instant,
    cancelled: &AtomicBool,
) -> Result<Page, PageError> {
    if cancelled.load(Ordering::Acquire) {
        return Err(PageError::Cancelled);
    }
    let remaining = deadline
        .checked_duration_since(Instant::now())
        .ok_or(PageError::Deadline)?;
    let timeout = format!("{:.3}", remaining.as_secs_f64().min(15.0));
    let url = format!("https://api.github.com/repos/{path}");
    let format = format!("{LIST_TRAILER}{}", response::TRAILER);
    let max = limit.to_string();
    let mut child = public_curl(&url, &timeout, &max, &format)
        .spawn()
        .map_err(|_| PageError::Unavailable)?;
    let stdout = child.stdout.take().ok_or(PageError::Unavailable)?;
    let stderr = child.stderr.take().ok_or(PageError::Unavailable)?;
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    let (send_meta, receive_meta) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let read = stdout.take((limit + 1) as u64).read_to_end(&mut bytes);
        let _ = send.send(read.map(|_| bytes));
    });
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let read = stderr
            .take((LINK_BYTES + response::TRAILER_LIMIT + 2049) as u64)
            .read_to_end(&mut bytes);
        let _ = send_meta.send(read.map(|_| bytes));
    });
    let bytes = loop {
        if cancelled.load(Ordering::Acquire) || Instant::now() >= deadline {
            let cancelled = cancelled.load(Ordering::Acquire);
            let _ = child.kill();
            let _ = child.wait();
            return Err(if cancelled {
                PageError::Cancelled
            } else {
                PageError::Deadline
            });
        }
        match receive.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(bytes)) if bytes.len() <= limit => break bytes,
            Ok(Ok(_)) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(PageError::Oversized);
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(PageError::Unavailable);
            }
        }
    };
    let status = loop {
        if cancelled.load(Ordering::Acquire) || Instant::now() >= deadline {
            let cancelled = cancelled.load(Ordering::Acquire);
            let _ = child.kill();
            let _ = child.wait();
            return Err(if cancelled {
                PageError::Cancelled
            } else {
                PageError::Deadline
            });
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => return Err(PageError::Unavailable),
        }
    };
    if status.code() == Some(63) {
        return Err(PageError::Oversized);
    }
    let metadata = loop {
        if cancelled.load(Ordering::Acquire) || Instant::now() >= deadline {
            return Err(if cancelled.load(Ordering::Acquire) {
                PageError::Cancelled
            } else {
                PageError::Deadline
            });
        }
        match receive_meta.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(bytes)) if bytes.len() <= LINK_BYTES + response::TRAILER_LIMIT + 2048 => {
                break bytes
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            _ => return Err(PageError::Unavailable),
        }
    };
    parse_response(&bytes, &metadata, limit, status.success())
}

pub(super) fn public_curl(
    url: &str,
    timeout: &str,
    max: &str,
    trailer: &str,
) -> std::process::Command {
    let mut command = std::process::Command::new("/usr/bin/curl");
    command
        .env_clear()
        .env("LC_ALL", "C")
        .args([
            "--disable",
            "--silent",
            "--show-error",
            "--fail",
            "--request",
            "GET",
            "--noproxy",
            "*",
            "--max-time",
            timeout,
            "--proto",
            "=https",
            "--max-filesize",
            max,
            "--header",
            "Accept: application/vnd.github+json",
            "--header",
            "X-GitHub-Api-Version: 2022-11-28",
            "--write-out",
            trailer,
            "--url",
            url,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

pub(super) fn parse_response(
    body: &[u8],
    metadata: &[u8],
    max: usize,
    success: bool,
) -> Result<Page, PageError> {
    let marker = b"\nATLAS_LINK\t";
    let split = metadata
        .windows(marker.len())
        .rposition(|part| part == marker)
        .ok_or(PageError::Unavailable)?;
    let tail = &metadata[split + marker.len()..];
    let http = tail
        .windows(b"\nATLAS_HTTP\t".len())
        .position(|part| part == b"\nATLAS_HTTP\t")
        .ok_or(PageError::Unavailable)?;
    let link = std::str::from_utf8(&tail[..http]).map_err(|_| PageError::Unavailable)?;
    if link.len() > LINK_BYTES || link.contains(['\n', '\r', '\t']) {
        return Err(PageError::Unavailable);
    }
    if body.len() > max {
        return Err(PageError::Oversized);
    }
    let mut framed = Vec::with_capacity(body.len() + tail.len() - http);
    framed.extend_from_slice(body);
    framed.extend_from_slice(&tail[http..]);
    match response::parse(&framed, max, success, chrono::Utc::now().timestamp()) {
        Ok((value, size)) => Ok(Page {
            value,
            link: link.into(),
            bytes: size,
        }),
        Err(FetchError::RateLimited(at)) => Err(PageError::RateLimited(at)),
        Err(_) => Err(PageError::Unavailable),
    }
}
