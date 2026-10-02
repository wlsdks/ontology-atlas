use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};

const MAX_OUTPUT_BYTES: u64 = 1024 * 1024;

pub(super) fn run(command: Command, limit: Duration) -> Option<(bool, String)> {
    // Synchronous callers also occupy Tauri's workers; this runtime drives its own I/O and timer.
    std::thread::Builder::new()
        .name("acp-probe".into())
        .spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .ok()?
                .block_on(capture(command, limit))
        })
        .ok()?
        .join()
        .ok()?
}

async fn capture(mut command: Command, limit: Duration) -> Option<(bool, String)> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = tokio::process::Command::from(command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .ok()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let result = tokio::time::timeout(limit, async {
        let text = read_pipe(stdout).await?;
        let status = child.wait().await.ok()?;
        Some((status.success(), text))
    })
    .await;
    if let Ok(Some(output)) = result {
        return Some(output);
    }
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // wait is polled only after EOF, so an inherited pipe cannot release this group's PID early.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    let _ = child.start_kill();
    let _ = child.wait().await;
    None
}

// O(received bytes) work and O(MAX_OUTPUT_BYTES) retained output; probe only one overflow byte.
async fn read_pipe(reader: impl AsyncRead + Unpin) -> Option<String> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_OUTPUT_BYTES + 1)
        .read_to_end(&mut bytes)
        .await
        .ok()?;
    if bytes.len() as u64 > MAX_OUTPUT_BYTES {
        return None;
    }
    String::from_utf8(bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(script: &str) -> Command {
        let mut command = Command::new("node");
        command.args(["-e", script]);
        command
    }

    #[test]
    fn complete_output_larger_than_a_pipe_is_drained_before_waiting() {
        let result = run(
            node("process.stdout.write(Buffer.alloc(256 * 1024, 'x'));"),
            Duration::from_secs(5),
        );
        assert!(result.is_some(), "complete output was treated as a timeout");
        let (success, stdout) = result.unwrap();
        assert!(success);
        assert_eq!(stdout.len(), 256 * 1024);
    }

    #[test]
    fn an_inherited_stdout_pipe_does_not_escape_the_deadline() {
        // Windows workers need detachment to survive parent exit; their finite lifetime detects hangs.
        let command = node("const child = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], {detached: process.platform === 'win32', stdio:['ignore', process.stdout, 'ignore']}); child.unref(); process.stdout.write('parent done');");
        let result = run(command, Duration::from_millis(300));
        assert!(result.is_none(), "inherited pipe completed inside deadline: {result:?}");
    }

    #[test]
    fn oversized_output_is_refused_instead_of_truncated() {
        let script = format!(
            "process.stdout.write(Buffer.alloc({}, 'x'));",
            MAX_OUTPUT_BYTES + 1
        );
        assert!(run(node(&script), Duration::from_secs(5)).is_none());
    }

    #[test]
    fn the_reader_stops_after_one_overflow_byte() {
        tauri::async_runtime::block_on(async {
            let bytes = vec![b'x'; MAX_OUTPUT_BYTES as usize * 3];
            let mut remaining = bytes.as_slice();
            assert!(read_pipe(&mut remaining).await.is_none());
            assert!(bytes.len() - remaining.len() <= MAX_OUTPUT_BYTES as usize + 1);
        });
    }

    #[test]
    fn exact_budget_output_is_returned_whole() {
        let script = format!(
            "process.stdout.write(Buffer.alloc({}, 'x'));",
            MAX_OUTPUT_BYTES
        );
        let (success, stdout) =
            run(node(&script), Duration::from_secs(5)).expect("complete budget-sized output");
        assert!(success);
        assert_eq!(stdout.len(), MAX_OUTPUT_BYTES as usize);
    }

    #[test]
    fn a_synchronous_probe_can_run_from_a_tauri_async_worker() {
        tauri::async_runtime::block_on(async {
            assert_eq!(
                run(
                    node("process.stdout.write('nested');"),
                    Duration::from_secs(5)
                ),
                Some((true, "nested".into()))
            );
        });
    }
}
