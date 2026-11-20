// One GET per call through curl, which follows no redirect without `--location`,
// so the caller checks each Location's host first. `--disable` skips ~/.curlrc, no
// proxy is used, and the request carries only Host and, when resuming, Range.

use super::super::EmbedError;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

/// `Content-Range: bytes <start>-<end>/<total>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ContentRange {
    pub start: u64,
    pub end: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Head {
    pub status: u16,
    pub location: Option<String>,
    pub content_length: Option<u64>,
    pub content_range: Option<ContentRange>,
}

/// Receives one response: the head first, then the body in order.
pub(crate) trait Sink {
    /// `Ok(false)` ends the request after the head (a redirect, say).
    fn head(&mut self, head: &Head) -> Result<bool, EmbedError>;
    fn body(&mut self, chunk: &[u8]) -> Result<(), EmbedError>;
}

pub(crate) trait Fetch: Send + Sync {
    /// GETs `url` from byte `from` (a Range header when above 0) without
    /// following redirects. Returns `Cancelled` once `cancel` turns true.
    fn get(
        &self,
        url: &str,
        from: u64,
        cancel: &AtomicBool,
        sink: &mut dyn Sink,
    ) -> Result<(), EmbedError>;
}

const MAX_HEAD_BYTES: usize = 64 * 1024;
const CHUNK_BYTES: usize = 256 * 1024;

pub(crate) struct CurlFetch {
    /// curl's `proto` value: `=https` outside tests.
    pub protocols: &'static str,
    pub connect_timeout: Duration,
    /// The longest a transfer may stay below one byte a second.
    pub idle: Duration,
}

pub(crate) const HTTPS_ONLY: CurlFetch = CurlFetch {
    protocols: "=https",
    connect_timeout: Duration::from_secs(20),
    idle: Duration::from_secs(60),
};

fn quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            // A newline would end the config line and start another option.
            '\r' | '\n' => {}
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

impl CurlFetch {
    pub(crate) fn config(&self, url: &str, from: u64) -> String {
        let mut config = format!("url = {}\n", quote(url));
        if from > 0 {
            config.push_str(&format!("header = \"Range: bytes={from}-\"\n"));
        }
        // An empty value removes the header curl would otherwise add.
        config.push_str("header = \"User-Agent:\"\n");
        config.push_str("header = \"Accept:\"\n");
        config.push_str("noproxy = \"*\"\n");
        config.push_str(&format!("proto = \"{}\"\n", self.protocols));
        // A Location may hold `[1-9999]`, which curl would otherwise expand into requests.
        config.push_str("globoff\n");
        config.push_str(&format!(
            "connect-timeout = {}\n",
            self.connect_timeout.as_secs().max(1)
        ));
        config.push_str("speed-limit = 1\n");
        config.push_str(&format!("speed-time = {}\n", self.idle.as_secs().max(1)));
        config
    }
}

struct KillOnDrop(Child);

impl Drop for KillOnDrop {
    fn drop(&mut self) {
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            let _ = self.0.kill();
        }
        let _ = self.0.wait();
    }
}

fn request_error(error: impl std::fmt::Display) -> EmbedError {
    EmbedError::Request(crate::errors::squeeze(&error.to_string()))
}

impl Fetch for CurlFetch {
    fn get(
        &self,
        url: &str,
        from: u64,
        cancel: &AtomicBool,
        sink: &mut dyn Sink,
    ) -> Result<(), EmbedError> {
        let mut child = KillOnDrop(
            crate::no_console::hide_console(&mut Command::new("curl"))
                .args([
                    "--disable",
                    "--silent",
                    "--show-error",
                    "--no-buffer",
                    "--include",
                    "--config",
                    "-",
                ])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(request_error)?,
        );
        let mut stdin = child
            .0
            .stdin
            .take()
            .ok_or_else(|| EmbedError::Request("stdin".into()))?;
        stdin
            .write_all(self.config(url, from).as_bytes())
            .map_err(request_error)?;
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

        // A bounded channel: a slow disk holds curl back instead of filling memory.
        let (tx, rx) = mpsc::sync_channel::<Result<Piece, EmbedError>>(4);
        std::thread::spawn(move || read_response(stdout, &tx));

        let mut wants_body = true;
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err(EmbedError::Cancelled);
            }
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(Piece::Head(head))) => {
                    if !sink.head(&head)? {
                        wants_body = false;
                        break;
                    }
                }
                Ok(Ok(Piece::Body(chunk))) => sink.body(&chunk)?,
                Ok(Err(error)) => return Err(error),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        if !wants_body {
            return Ok(());
        }
        let status = child.0.wait().map_err(request_error)?;
        let stderr = stderr_reader.join().unwrap_or_default();
        if status.success() {
            Ok(())
        } else {
            Err(match status.code() {
                Some(28) => EmbedError::TimedOut,
                // Could not resolve the host, or could not connect to it.
                Some(6 | 7) => EmbedError::NoDirectConnection,
                _ => EmbedError::Request(crate::errors::squeeze(&stderr)),
            })
        }
    }
}

enum Piece {
    Head(Head),
    Body(Vec<u8>),
}

fn read_response(stdout: impl Read, tx: &mpsc::SyncSender<Result<Piece, EmbedError>>) {
    let mut reader = BufReader::with_capacity(CHUNK_BYTES, stdout);
    let head = match read_head(&mut reader) {
        Ok(Some(head)) => head,
        Ok(None) => return,
        Err(error) => {
            let _ = tx.send(Err(error));
            return;
        }
    };
    if tx.send(Ok(Piece::Head(head))).is_err() {
        return;
    }
    loop {
        let mut chunk = vec![0u8; CHUNK_BYTES];
        match reader.read(&mut chunk) {
            Ok(0) => return,
            Ok(read) => {
                chunk.truncate(read);
                if tx.send(Ok(Piece::Body(chunk))).is_err() {
                    return;
                }
            }
            Err(error) => {
                let _ = tx.send(Err(request_error(error)));
                return;
            }
        }
    }
}

/// `None` when curl wrote nothing (it failed before a response).
fn read_head(reader: &mut impl BufRead) -> Result<Option<Head>, EmbedError> {
    let mut lines = Vec::new();
    let mut seen = 0usize;
    loop {
        let mut line = Vec::new();
        let read = reader
            .by_ref()
            .take((MAX_HEAD_BYTES - seen + 1) as u64)
            .read_until(b'\n', &mut line)
            .map_err(request_error)?;
        if read == 0 {
            return if lines.is_empty() {
                Ok(None)
            } else {
                Err(EmbedError::ResponseInvalid("head"))
            };
        }
        seen += read;
        if seen > MAX_HEAD_BYTES {
            return Err(EmbedError::ResponseTooLarge);
        }
        let text = String::from_utf8_lossy(&line).trim_end().to_string();
        if text.is_empty() {
            if lines.is_empty() {
                continue;
            }
            return parse_head(&lines).map(Some);
        }
        lines.push(text);
    }
}

pub(crate) fn parse_head(lines: &[String]) -> Result<Head, EmbedError> {
    let status = lines
        .first()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or(EmbedError::ResponseInvalid("status"))?;
    let mut head = Head {
        status,
        ..Head::default()
    };
    for line in lines.iter().skip(1) {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match name.trim().to_ascii_lowercase().as_str() {
            "location" => head.location = Some(value.to_string()),
            "content-length" => head.content_length = value.parse().ok(),
            "content-range" => head.content_range = parse_content_range(value),
            _ => {}
        }
    }
    Ok(head)
}

fn parse_content_range(value: &str) -> Option<ContentRange> {
    let rest = value.strip_prefix("bytes ")?;
    let (span, total) = rest.split_once('/')?;
    let (start, end) = span.split_once('-')?;
    Some(ContentRange {
        start: start.trim().parse().ok()?,
        end: end.trim().parse().ok()?,
        total: total.trim().parse().ok()?,
    })
}
