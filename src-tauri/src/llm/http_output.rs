use std::io::{self, Read, Write};
use std::process::{Command, Output, Stdio};
const MAX_STDOUT_BYTES: usize = 4 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;

#[derive(Debug)]
pub(super) enum CaptureError {
    Request(io::Error),
    Response(io::Error),
}
struct ChildGuard(std::process::Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            let _ = self.0.kill();
        }
        let _ = self.0.wait();
    }
}
// O(received bytes) work and O(limit) retained bytes per pipe.
fn read_pipe(reader: impl Read, limit: usize, stream: &str) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader.take(limit as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{stream}_limit_bytes={limit}"),
        ));
    }
    Ok(bytes)
}
pub(super) fn capture(mut command: Command, input: &[u8]) -> Result<Output, CaptureError> {
    let mut child = ChildGuard(
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(CaptureError::Request)?,
    );
    let stdout = child.0.stdout.take().expect("piped stdout");
    let stderr = child.0.stderr.take().expect("piped stderr");
    let out = std::thread::spawn(move || read_pipe(stdout, MAX_STDOUT_BYTES, "stdout"));
    let err = std::thread::spawn(move || read_pipe(stderr, MAX_STDERR_BYTES, "stderr"));
    let input_result = child.0.stdin.take().expect("piped stdin").write_all(input);
    if input_result.is_err() {
        let _ = child.0.kill();
    }
    let status = child.0.wait();
    if status.is_err() {
        let _ = child.0.kill();
        let _ = child.0.wait();
    }
    let stdout = out
        .join()
        .map_err(|_| CaptureError::Response(io::Error::other("stdout_reader_panicked")))?;
    let stderr = err
        .join()
        .map_err(|_| CaptureError::Response(io::Error::other("stderr_reader_panicked")))?;
    input_result.map_err(CaptureError::Request)?;
    Ok(Output {
        status: status.map_err(CaptureError::Response)?,
        stdout: stdout.map_err(CaptureError::Response)?,
        stderr: stderr.map_err(CaptureError::Response)?,
    })
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
    fn input_and_both_complete_output_streams_survive() {
        let result = capture(node("process.stdin.on('data', c => process.stdout.write(c)); process.stderr.write('diagnostic');"), b"input").unwrap();
        assert!(result.status.success());
        assert_eq!(result.stdout, b"input");
        assert_eq!(result.stderr, b"diagnostic");
    }
    #[test]
    fn an_oversized_successful_response_is_refused() {
        let result = capture(
            node(&format!(
                "process.stdout.write(Buffer.alloc({}));",
                MAX_STDOUT_BYTES + 1
            )),
            b"",
        );
        assert!(
            matches!(result, Err(CaptureError::Response(error)) if error.kind() == io::ErrorKind::InvalidData)
        );
    }
    #[test]
    fn oversized_diagnostics_are_refused() {
        let result = capture(
            node(&format!(
                "process.stderr.write(Buffer.alloc({}));",
                MAX_STDERR_BYTES + 1
            )),
            b"",
        );
        assert!(
            matches!(result, Err(CaptureError::Response(error)) if error.kind() == io::ErrorKind::InvalidData)
        );
    }
    #[test]
    fn both_streams_can_fill_their_budget_without_deadlock() {
        let result = capture(
            node(&format!(
                "process.stderr.write(Buffer.alloc({})); process.stdout.write(Buffer.alloc({}));",
                MAX_STDERR_BYTES, MAX_STDOUT_BYTES
            )),
            b"",
        )
        .unwrap();
        assert!(result.status.success());
        assert_eq!(result.stderr.len(), MAX_STDERR_BYTES);
        assert_eq!(result.stdout.len(), MAX_STDOUT_BYTES);
    }
    #[test]
    fn exit_status_is_retained_with_the_diagnostics() {
        let result = capture(
            node("process.stderr.write('refused'); process.exitCode=7;"),
            b"",
        )
        .unwrap();
        assert_eq!(result.status.code(), Some(7));
        assert_eq!(result.stderr, b"refused");
    }

    #[test]
    fn oversized_input_is_not_read_past_the_overflow_probe() {
        let mut input = io::Cursor::new(vec![0; 4096]);
        assert!(read_pipe(&mut input, 64, "stdout").is_err());
        assert!(input.position() <= 65);
    }

    #[test]
    fn a_missing_program_is_a_request_failure() {
        assert!(matches!(
            capture(Command::new("atlas-nonexistent-curl-fixture"), b""),
            Err(CaptureError::Request(error)) if error.kind() == io::ErrorKind::NotFound
        ));
    }
}
