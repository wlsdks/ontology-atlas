//! Points agents at the bundled MCP server and verifies it in place: the web build
//! cannot know an open folder's absolute path. Spawning is local; no network.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::Serialize;

/// Must match `MCP_BINARY_NAME` in `scripts/lib/packaging/mcp-binary.mjs`; Tauri's `externalBin`
/// bakes it into Contents/MacOS.
const MCP_BINARY_NAME: &str = "ontology-atlas-mcp";

fn bundled_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ontology-atlas-mcp.exe"
    } else {
        MCP_BINARY_NAME
    }
}

/// The first spawn can be slow while macOS scans the signature.
const VERIFY_TIMEOUT: Duration = Duration::from_secs(25);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundledServer {
    pub path: Option<String>,
    pub available: bool,
    /// Diagnostic; the UI shows it verbatim.
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpVerifyResult {
    pub ok: bool,
    pub server_version: Option<String>,
    pub tool_count: Option<usize>,
    /// Green only after a real `get_concept` proves this folder is readable.
    pub sample_slug: Option<String>,
    pub sample_title: Option<String>,
    /// Shown instead of a fake progress bar.
    pub failure: Option<String>,
}

fn err_str(message: impl Into<String>) -> String {
    message.into()
}

/// A sibling of the app executable; `tauri dev` copies it next to the dev executable.
pub(crate) fn resolve_bundled_binary() -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| err_str(format!("could not resolve the app executable: {e}")))?;
    let dir = exe
        .parent()
        .ok_or_else(|| err_str("the app executable has no parent directory"))?;
    Ok(dir.join(bundled_binary_name()))
}

#[tauri::command]
pub fn mcp_bundled_server() -> BundledServer {
    match resolve_bundled_binary() {
        Ok(path) if path.is_file() => BundledServer {
            path: Some(path.to_string_lossy().into_owned()),
            available: true,
            reason: None,
        },
        Ok(path) => BundledServer {
            path: None,
            available: false,
            reason: Some(format!(
                "The bundled MCP server is missing at {}. Rebuild with `pnpm mcp:build-binary`.",
                path.display()
            )),
        },
        Err(reason) => BundledServer {
            path: None,
            available: false,
            reason: Some(reason),
        },
    }
}

fn canonical_dir(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err(err_str("vault path must be absolute"));
    }
    let canonical = fs::canonicalize(&path)
        .map_err(|e| err_str(format!("could not resolve {}: {e}", path.display())))?;
    if !canonical.is_dir() {
        return Err(err_str(format!(
            "{} is not a directory",
            canonical.display()
        )));
    }
    Ok(canonical)
}

fn rpc_line(id: u64, method: &str, params: serde_json::Value) -> String {
    format!(
        "{}\n",
        serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
    )
}

/// Runs `initialize`, `tools/list` and one `get_concept`, because a live process
/// that cannot read the vault must not show green.
#[tauri::command(async)]
pub fn verify_mcp_server(vault_path: String, sample_slug: Option<String>) -> McpVerifyResult {
    // The bundled MCP is spawned against this folder; only a granted vault may be one.
    let gated = crate::canonical_root(&vault_path)
        .and_then(|root| verify_inner(&root.to_string_lossy(), sample_slug.as_deref()));
    match gated {
        Ok(result) => result,
        Err(failure) => McpVerifyResult {
            ok: false,
            server_version: None,
            tool_count: None,
            sample_slug: None,
            sample_title: None,
            failure: Some(failure),
        },
    }
}

fn verify_inner(vault_path: &str, sample_slug: Option<&str>) -> Result<McpVerifyResult, String> {
    let vault = canonical_dir(vault_path)?;
    let binary = resolve_bundled_binary()?;
    if !binary.is_file() {
        return Err(err_str(format!(
            "The bundled MCP server is missing at {}.",
            binary.display()
        )));
    }

    let mut child = crate::child_process::no_console::hide_console(&mut Command::new(&binary))
        .env("OATLAS_VAULT", &vault)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            err_str(format!(
                "could not start the bundled MCP server ({}): {e}",
                binary.display()
            ))
        })?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| err_str("the MCP server did not expose stdin"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| err_str("the MCP server did not expose stdout"))?;

    let slug = sample_slug.unwrap_or("project").to_string();
    let requests = [
        rpc_line(
            1,
            "initialize",
            serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "ontology-atlas-app", "version": "1" }
            }),
        ),
        rpc_line(2, "tools/list", serde_json::json!({})),
        rpc_line(
            3,
            "tools/call",
            serde_json::json!({ "name": "get_concept", "arguments": { "slug": slug } }),
        ),
    ];

    let writer = thread::spawn(move || {
        for request in requests {
            if stdin.write_all(request.as_bytes()).is_err() {
                return;
            }
            let _ = stdin.flush();
            thread::sleep(Duration::from_millis(120));
        }
    });

    let (tx, rx) = mpsc::channel::<serde_json::Value>();
    let reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                if tx.send(value).is_err() {
                    return;
                }
            }
        }
    });

    let mut server_version = None;
    let mut tool_count = None;
    let mut sample_title = None;
    let mut resolved_slug = None;
    let mut failure = None;
    let deadline = std::time::Instant::now() + VERIFY_TIMEOUT;

    while std::time::Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        let Ok(message) = rx.recv_timeout(remaining) else {
            break;
        };
        let id = message.get("id").and_then(serde_json::Value::as_u64);
        if let Some(error) = message.get("error") {
            failure = Some(format!(
                "the MCP server answered with an error: {}",
                error
                    .get("message")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("unknown")
            ));
            break;
        }
        match id {
            Some(1) => {
                server_version = message
                    .pointer("/result/serverInfo/version")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
            }
            Some(2) => {
                tool_count = message
                    .pointer("/result/tools")
                    .and_then(serde_json::Value::as_array)
                    .map(Vec::len);
            }
            Some(3) => {
                let is_error = message
                    .pointer("/result/isError")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false);
                if is_error {
                    failure = Some(
                        "the server started but could not read a concept from this folder — is the vault path right?"
                            .to_string(),
                    );
                } else {
                    let payload = message
                        .pointer("/result/content/0/text")
                        .and_then(serde_json::Value::as_str)
                        .and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok());
                    if let Some(payload) = payload {
                        resolved_slug = payload
                            .get("slug")
                            .and_then(serde_json::Value::as_str)
                            .map(str::to_string);
                        sample_title = payload
                            .pointer("/frontmatter/title")
                            .and_then(serde_json::Value::as_str)
                            .map(str::to_string);
                    }
                }
                break;
            }
            _ => {}
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    drop(rx);
    let _ = writer.join();
    let _ = reader.join();

    if failure.is_none() && server_version.is_none() {
        failure = Some(
            "the bundled MCP server did not answer within 25 seconds — the operating system may have blocked it."
                .to_string(),
        );
    }

    let ok = failure.is_none() && tool_count.unwrap_or(0) > 0 && resolved_slug.is_some();
    Ok(McpVerifyResult {
        ok,
        server_version,
        tool_count,
        sample_slug: resolved_slug,
        sample_title,
        failure: if ok {
            None
        } else {
            failure.or_else(|| {
                Some("the bundled MCP server answered, but the check did not complete.".to_string())
            })
        },
    })
}
