use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};

#[derive(Debug, PartialEq)]
pub(crate) enum CaptureError {
    Unavailable,
    TooLarge,
    TimedOut,
}

pub(crate) fn run(
    command: Command,
    limit: Duration,
    max_bytes: u64,
) -> Result<(bool, String), CaptureError> {
    // Synchronous callers also occupy Tauri's workers; this runtime drives its own I/O and timer.
    std::thread::Builder::new()
        .name("bounded-output".into())
        .spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|_| CaptureError::Unavailable)?
                .block_on(capture(command, limit, max_bytes))
        })
        .map_err(|_| CaptureError::Unavailable)?
        .join()
        .map_err(|_| CaptureError::Unavailable)?
}

async fn capture(
    mut command: Command,
    limit: Duration,
    max_bytes: u64,
) -> Result<(bool, String), CaptureError> {
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
        .map_err(|_| CaptureError::Unavailable)?;
    let stdout = child.stdout.take().expect("piped stdout");
    let result = tokio::time::timeout(limit, async {
        let text = read_pipe(stdout, max_bytes).await?;
        let status = child.wait().await.map_err(|_| CaptureError::Unavailable)?;
        Ok((status.success(), text))
    })
    .await;
    let error = match result {
        Ok(Ok(output)) => return Ok(output),
        Ok(Err(error)) => error,
        Err(_) => CaptureError::TimedOut,
    };
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // wait is polled only after EOF, so an inherited pipe cannot release this group's PID early.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    let _ = child.start_kill();
    let _ = child.wait().await;
    Err(error)
}

// O(received bytes) work and O(max_bytes) retained output; probe only one overflow byte.
async fn read_pipe(reader: impl AsyncRead + Unpin, max_bytes: u64) -> Result<String, CaptureError> {
    let mut bytes = Vec::new();
    reader
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| CaptureError::Unavailable)?;
    if bytes.len() as u64 > max_bytes {
        return Err(CaptureError::TooLarge);
    }
    String::from_utf8(bytes).map_err(|_| CaptureError::Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAX_OUTPUT_BYTES: u64 = 1024 * 1024;

    fn run(command: Command, limit: Duration) -> Result<(bool, String), CaptureError> {
        super::run(command, limit, MAX_OUTPUT_BYTES)
    }

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
        assert!(result.is_ok(), "complete output was treated as a timeout");
        let (success, stdout) = result.unwrap();
        assert!(success);
        assert_eq!(stdout.len(), 256 * 1024);
    }

    #[test]
    fn an_inherited_stdout_pipe_does_not_escape_the_deadline() {
        // Windows workers need detachment to survive parent exit; their finite lifetime detects hangs.
        let command = node("const child = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], {detached: process.platform === 'win32', stdio:['ignore', process.stdout, 'ignore']}); child.unref(); process.stdout.write('parent done');");
        let result = run(command, Duration::from_millis(300));
        assert_eq!(result, Err(CaptureError::TimedOut));
    }

    #[test]
    fn oversized_output_is_refused_instead_of_truncated() {
        let script = format!(
            "process.stdout.write(Buffer.alloc({}, 'x'));",
            MAX_OUTPUT_BYTES + 1
        );
        assert!(matches!(
            run(node(&script), Duration::from_secs(5)),
            Err(CaptureError::TooLarge)
        ));
    }

    #[test]
    fn the_reader_stops_after_one_overflow_byte() {
        tauri::async_runtime::block_on(async {
            let bytes = vec![b'x'; MAX_OUTPUT_BYTES as usize * 3];
            let mut remaining = bytes.as_slice();
            assert!(matches!(
                read_pipe(&mut remaining, MAX_OUTPUT_BYTES).await,
                Err(CaptureError::TooLarge)
            ));
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
                Ok((true, "nested".into()))
            );
        });
    }

    #[test]
    fn invalid_utf8_is_unavailable_and_nonzero_exit_is_preserved() {
        assert_eq!(
            run(
                node("process.stdout.write(Buffer.from([255]));"),
                Duration::from_secs(5)
            ),
            Err(CaptureError::Unavailable)
        );
        assert_eq!(
            run(
                node("process.stdout.write('no'); process.exitCode = 7;"),
                Duration::from_secs(5)
            ),
            Ok((false, "no".into()))
        );
    }
}
