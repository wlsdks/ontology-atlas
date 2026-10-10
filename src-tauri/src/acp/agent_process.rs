/// Bounded so an adapter that never writes a newline cannot grow the buffer until the
/// app dies; an oversized line is dropped and reported, never truncated into bad JSON.
pub(crate) fn read_bounded_line<R: std::io::BufRead>(
    reader: &mut R,
    max_bytes: usize,
) -> std::io::Result<Option<Vec<u8>>> {
    let mut out: Vec<u8> = Vec::new();
    let mut oversized = false;
    loop {
        let available = match reader.fill_buf() {
            Ok(buf) => buf,
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };
        if available.is_empty() {
            if oversized {
                return Err(line_too_long(max_bytes));
            }
            return Ok(if out.is_empty() { None } else { Some(out) });
        }
        let newline = available.iter().position(|b| *b == b'\n');
        let content = &available[..newline.unwrap_or(available.len())];
        if !oversized && out.len() + content.len() > max_bytes {
            oversized = true;
            out = Vec::new();
        }
        if !oversized {
            out.extend_from_slice(content);
        }
        let consumed = content.len() + usize::from(newline.is_some());
        reader.consume(consumed);
        if newline.is_none() {
            continue;
        }
        if oversized {
            return Err(line_too_long(max_bytes));
        }
        // Lines ending in `\r\n` are accepted too.
        if out.last() == Some(&b'\r') {
            out.pop();
        }
        return Ok(Some(out));
    }
}

fn line_too_long(max_bytes: usize) -> std::io::Error {
    std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        format!("acp line exceeded {max_bytes} bytes"),
    )
}

/// Generous because adapters may send a whole file in one line.
pub(crate) const MAX_LINE_BYTES: usize = 16 * 1024 * 1024;

const GRACEFUL_EXIT_WAIT: std::time::Duration = std::time::Duration::from_millis(1_000);

#[cfg(unix)]
fn process_is_running(pid: u32) -> bool {
    // Signal 0 only checks deliverability.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// A negative PID covers the whole group, so a TERM-ignoring grandchild is seen.
#[cfg(unix)]
fn process_group_is_running(pgid: u32) -> Result<bool, String> {
    if unsafe { libc::kill(-(pgid as i32), 0) } == 0 {
        return Ok(true);
    }
    let err = std::io::Error::last_os_error();
    match err.raw_os_error() {
        Some(libc::ESRCH) => Ok(false),
        // EPERM can appear while a TERMed group is reaped, so it counts as alive until the final signal.
        Some(libc::EPERM) => Ok(true),
        _ => Err(format!("failed to inspect process group {pgid}: {err}")),
    }
}

/// Group first: the adapter spawns CLIs, MCP servers and subagents that would outlive
/// the app. EPERM is not hidden as success, since the leader alone is not the tree.
#[cfg(unix)]
fn signal_group_or_leader(pid: u32, signal: i32) -> Result<(), String> {
    let group = -(pid as i32);
    if unsafe { libc::kill(group, signal) } == 0 {
        return Ok(());
    }
    let group_err = std::io::Error::last_os_error();
    match group_err.raw_os_error() {
        Some(libc::ESRCH) if !process_is_running(pid) => Ok(()),
        Some(libc::ESRCH) => {
            if unsafe { libc::kill(pid as i32, signal) } == 0 {
                return Ok(());
            }
            let leader_err = std::io::Error::last_os_error();
            if leader_err.raw_os_error() == Some(libc::ESRCH) || !process_is_running(pid) {
                return Ok(());
            }
            Err(format!("failed to signal {pid}: {leader_err}"))
        }
        Some(libc::EPERM) => {
            // Keep the error: nothing proves the grandchildren ended.
            if process_is_running(pid) {
                unsafe {
                    libc::kill(pid as i32, signal);
                }
            }
            Err(format!("failed to signal process group {pid}: {group_err}"))
        }
        _ => Err(format!("failed to signal group {pid}: {group_err}")),
    }
}

/// SIGTERM, up to one second, then SIGKILL. Windows uses `taskkill /T` without a
/// Job Object, so a grandchild may remain there.
pub(crate) fn terminate_tree(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        signal_group_or_leader(pid, libc::SIGTERM)?;
        let deadline = std::time::Instant::now() + GRACEFUL_EXIT_WAIT;
        while std::time::Instant::now() < deadline {
            if !process_group_is_running(pid)? {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        signal_group_or_leader(pid, libc::SIGKILL)
    }
    #[cfg(windows)]
    {
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|err| format!("taskkill failed: {err}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("taskkill exited with {status}"))
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        Err("terminate_tree is unsupported on this platform".into())
    }
}

#[cfg(test)]
mod tests;
