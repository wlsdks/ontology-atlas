use super::http_output;
use crate::errors::coded;
use std::process::Command;

/// Derived from the URL so the audit `host` and the screen never drift from the real target.
pub(super) fn host_of(url: &str) -> &str {
    let without_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_scheme)
}

/// No secret on argv; URL, headers and body go via stdin.
pub(crate) fn curl_argv_with_timeout(timeout_seconds: &'static str) -> [&'static str; 9] {
    [
        // Only as the first argument does curl skip ~/.curlrc, whose entries could add
        // redirects or proxies that move the key.
        "--disable",
        "--silent",
        "--show-error",
        "--max-time",
        timeout_seconds,
        "--write-out",
        "\n%{http_code}",
        "--config",
        "-",
    ]
}

pub(super) fn curl_argv() -> [&'static str; 9] {
    curl_argv_with_timeout("20")
}

fn curl_quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

/// Keys and vault excerpts travel only here, never argv or temp files.
pub(crate) fn curl_config_for(
    url: &str,
    headers: &[(String, String)],
    body: Option<&str>,
) -> String {
    let mut config = format!("url = {}\n", curl_quote(url));
    for (name, value) in headers {
        config.push_str(&format!(
            "header = {}\n",
            curl_quote(&format!("{name}: {value}"))
        ));
    }
    if let Some(body) = body {
        config.push_str("request = \"POST\"\n");
        config.push_str(&format!("data = {}\n", curl_quote(body)));
    }
    config
}

/// Codes, not sentences, so the screen can branch and translate; matching prose
/// would turn a vault-write failure into "check your network".
pub(super) const AUDIT_BLOCKED_PREFIX: &str = "audit-blocked:";
const TIMED_OUT_PREFIX: &str = "timed-out:";

fn curl_failure_message(code: Option<i32>, stderr: &str) -> String {
    match code {
        Some(6) => coded("host-not-found", ""),
        Some(7) => coded("connection-refused", ""),
        // Written out because the screen matches `timed-out:` by prefix and needs the colon.
        Some(28) => format!("{TIMED_OUT_PREFIX} curl exit 28"),
        Some(35) | Some(60) => coded("tls-failed", ""),
        _ if stderr.is_empty() => coded("no-response", ""),
        _ => coded("no-response", stderr),
    }
}

pub(crate) fn run_curl(argv: [&'static str; 9], config: &str) -> Result<(u16, String), String> {
    let mut command = Command::new("curl");
    command.args(argv);
    let output = http_output::capture(command, config.as_bytes()).map_err(|err| match err {
        http_output::CaptureError::Request(err) => coded("request-failed", err),
        http_output::CaptureError::Response(err) => coded("no-response", err),
        http_output::CaptureError::Cancelled => coded("cancelled", ""),
    })?;
    interpret_curl_output(
        output.status.code(),
        output.status.success(),
        &String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr).trim(),
    )
}

/// Checks the exit code first: curl prints `000` on connection failure, which would
/// read as a fabricated HTTP 0.
pub(super) fn interpret_curl_output(
    exit_code: Option<i32>,
    success: bool,
    stdout: &str,
    stderr: &str,
) -> Result<(u16, String), String> {
    if !success {
        return Err(curl_failure_message(exit_code, stderr));
    }
    let (body, status_text) = match stdout.rsplit_once('\n') {
        Some(parts) => parts,
        None => ("", stdout),
    };
    let status: u16 = status_text
        .trim()
        .parse()
        .map_err(|_| curl_failure_message(exit_code, stderr))?;
    Ok((status, body.to_string()))
}

#[cfg(test)]
mod tests;
