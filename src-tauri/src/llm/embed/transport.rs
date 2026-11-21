// curl with the same stdin-only config as chat, plus three lines: no proxy (an
// environment proxy would carry vault text off the machine), http and https only,
// and the pinned address. curl follows no redirect without `--location`, and the
// caller refuses any 3xx.

use super::super::curl::{curl_argv_with_timeout, curl_config_for, run_curl_until};
use super::EmbedError;
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

pub(super) struct Request<'a> {
    pub url: &'a str,
    pub body: Option<&'a str>,
    pub timeout: &'static str,
    pub pin: Option<&'a str>,
    /// A moment the request may not outlast, besides its own `timeout`; a question's one limit.
    pub deadline: Option<Instant>,
}

/// Bounds on a streamed answer: all bytes, the longest silence, the whole time.
#[derive(Debug, Clone, Copy)]
pub(crate) struct StreamLimits {
    pub max_bytes: u64,
    pub idle: Duration,
    pub total: Duration,
}

pub(super) trait Transport: Send + Sync {
    /// Status and body; a body over 4 MiB is an error, not a truncation.
    fn send(&self, request: &Request<'_>) -> Result<(u16, String), EmbedError>;
    /// `send` that answers `Cancelled` soon after `cancel` turns true; a transport that cannot
    /// stop a request in flight looks at it only before sending.
    fn send_until(
        &self,
        request: &Request<'_>,
        cancel: &AtomicBool,
    ) -> Result<(u16, String), EmbedError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(EmbedError::Cancelled);
        }
        self.send(request)
    }
    /// Hands each body line to `on_line` until the stream ends, `on_line` returns
    /// false (then `None`), `cancel` turns true or a limit is passed; returns the
    /// status.
    fn stream(
        &self,
        request: &Request<'_>,
        limits: &StreamLimits,
        cancel: &AtomicBool,
        on_line: &mut dyn FnMut(&str) -> bool,
    ) -> Result<Option<u16>, EmbedError>;
}

pub(super) struct CurlTransport;

pub(super) fn curl_config(request: &Request<'_>) -> String {
    let headers = match request.body {
        Some(_) => vec![("Content-Type".to_string(), "application/json".to_string())],
        None => vec![],
    };
    let mut config = curl_config_for(request.url, &headers, request.body);
    config.push_str("noproxy = \"*\"\n");
    config.push_str("proto = \"=http,https\"\n");
    if let Some(pin) = request.pin {
        config.push_str(&format!("resolve = \"{pin}\"\n"));
    }
    config
}

fn curl_error(message: String) -> EmbedError {
    if message.starts_with("timed-out:") {
        EmbedError::TimedOut
    } else if message.contains("stdout_limit_bytes") {
        EmbedError::ResponseTooLarge
    } else if message == "cancelled" {
        EmbedError::Cancelled
    } else {
        EmbedError::Request(message)
    }
}

/// A pull reports progress many times a second; no single line is longer.
const MAX_STREAM_LINE_BYTES: u64 = 64 * 1024;

struct KillOnDrop(Child);

impl Drop for KillOnDrop {
    fn drop(&mut self) {
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            let _ = self.0.kill();
        }
        let _ = self.0.wait();
    }
}

impl Transport for CurlTransport {
    fn send(&self, request: &Request<'_>) -> Result<(u16, String), EmbedError> {
        if request
            .deadline
            .is_some_and(|deadline| Instant::now() >= deadline)
        {
            return Err(EmbedError::TimedOut);
        }
        run_curl_until(
            curl_argv_with_timeout(request.timeout),
            &curl_config(request),
            None,
            request.deadline,
        )
        .map_err(curl_error)
    }

    fn send_until(
        &self,
        request: &Request<'_>,
        cancel: &AtomicBool,
    ) -> Result<(u16, String), EmbedError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(EmbedError::Cancelled);
        }
        run_curl_until(
            curl_argv_with_timeout(request.timeout),
            &curl_config(request),
            Some(cancel),
            request.deadline,
        )
        .map_err(curl_error)
    }

    fn stream(
        &self,
        request: &Request<'_>,
        limits: &StreamLimits,
        cancel: &AtomicBool,
        on_line: &mut dyn FnMut(&str) -> bool,
    ) -> Result<Option<u16>, EmbedError> {
        use std::io::Write;
        let mut config = curl_config(request);
        config.push_str("speed-limit = 1\n");
        config.push_str(&format!("speed-time = {}\n", limits.idle.as_secs().max(1)));
        config.push_str(&format!("max-time = {}\n", limits.total.as_secs().max(1)));
        config.push_str(&format!("connect-timeout = {}\n", request.timeout));
        let mut child = KillOnDrop(
            crate::process::no_console::hide_console(&mut Command::new("curl"))
                .args([
                    "--disable",
                    "--silent",
                    "--show-error",
                    "--no-buffer",
                    "--write-out",
                    "\n%{http_code}",
                    "--config",
                    "-",
                ])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|err| EmbedError::Request(err.to_string()))?,
        );
        let mut stdin = child
            .0
            .stdin
            .take()
            .ok_or_else(|| EmbedError::Request("stdin".into()))?;
        stdin
            .write_all(config.as_bytes())
            .map_err(|err| EmbedError::Request(err.to_string()))?;
        drop(stdin);
        let stdout = child
            .0
            .stdout
            .take()
            .ok_or_else(|| EmbedError::Request("stdout".into()))?;
        let stderr = child
            .0
            .stderr
            .take()
            .ok_or_else(|| EmbedError::Request("stderr".into()))?;
        let stderr_reader = std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.take(64 * 1024).read_to_string(&mut text);
            text
        });
        let (lines_tx, lines_rx) = mpsc::channel::<Result<String, EmbedError>>();
        let max_bytes = limits.max_bytes;
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut seen: u64 = 0;
            loop {
                let mut line = Vec::new();
                let read = (&mut reader)
                    .take(MAX_STREAM_LINE_BYTES + 1)
                    .read_until(b'\n', &mut line);
                seen = seen.saturating_add(line.len() as u64);
                match read {
                    Ok(0) => return,
                    Ok(_) if line.len() as u64 > MAX_STREAM_LINE_BYTES || seen > max_bytes => {
                        let _ = lines_tx.send(Err(EmbedError::ResponseTooLarge));
                        return;
                    }
                    Ok(_) => {
                        let text = String::from_utf8_lossy(&line).trim().to_string();
                        if lines_tx.send(Ok(text)).is_err() {
                            return;
                        }
                    }
                    Err(err) => {
                        let _ = lines_tx.send(Err(EmbedError::Request(err.to_string())));
                        return;
                    }
                }
            }
        });

        // The last non-empty line is curl's `--write-out` status; hold each line
        // back by one so it is never handed to `on_line`.
        let mut held: Option<String> = None;
        let started = Instant::now();
        let mut heard = Instant::now();
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err(EmbedError::Cancelled);
            }
            if heard.elapsed() > limits.idle || started.elapsed() > limits.total {
                return Err(EmbedError::TimedOut);
            }
            match lines_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(line)) if line.is_empty() => heard = Instant::now(),
                Ok(Ok(line)) => {
                    heard = Instant::now();
                    if let Some(previous) = held.replace(line) {
                        if !on_line(&previous) {
                            return Ok(None);
                        }
                    }
                }
                Ok(Err(error)) => return Err(error),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        let status = child
            .0
            .wait()
            .map_err(|err| EmbedError::Request(err.to_string()))?;
        let stderr = stderr_reader.join().unwrap_or_default();
        if !status.success() {
            return Err(match status.code() {
                Some(28) => EmbedError::TimedOut,
                _ => EmbedError::Request(crate::errors::squeeze(&stderr)),
            });
        }
        held.as_deref()
            .and_then(|line| line.parse::<u16>().ok())
            .map(Some)
            .ok_or_else(|| EmbedError::Request("no-status".into()))
    }
}
