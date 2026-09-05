//! 「Agent Connection」 — The app points to its bundled MCP server and verifies it in place.
//!
//! Why the app does this: To break the contradiction where installed apps fail to attach agents.
//! Web cannot structurally know absolute paths of open folders, so it cannot launch the bundled
//! server against one directly.
//!
//! Charter compliance:
//!   * **Zero transmission.** Spawning is local. No network usage.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::Serialize;

/// Filename of the bundled MCP server. Must match `MCP_BINARY_NAME` in
/// `scripts/lib/mcp-binary.mjs` — Tauri's `externalBin` bakes it into
/// `Contents/MacOS/<name>`.
const MCP_BINARY_NAME: &str = "ontology-atlas-mcp";

fn bundled_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ontology-atlas-mcp.exe"
    } else {
        MCP_BINARY_NAME
    }
}

/// Budget for one round of self-verification. The first spawn can be slow while macOS scans the signature.
const VERIFY_TIMEOUT: Duration = Duration::from_secs(25);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundledServer {
    /// Absolute path of the bundled binary. `None` when it is missing.
    pub path: Option<String>,
    pub available: bool,
    /// Human-readable reason when it could not be found (diagnostic; the UI shows it verbatim).
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpVerifyResult {
    pub ok: bool,
    pub server_version: Option<String>,
    pub tool_count: Option<usize>,
    /// Whether a real vault node came back from an actual `get_concept` call — the light
    /// turns green only after proving "it reads this folder", not merely that it booted.
    pub sample_slug: Option<String>,
    pub sample_title: Option<String>,
    /// Failure reason. This sentence is shown instead of a fake progress bar.
    pub failure: Option<String>,
}

fn err_str(message: impl Into<String>) -> String {
    message.into()
}

/// The bundled binary is a sibling of the app executable (`Contents/MacOS/`). `tauri dev`
/// follows the same rule — it is copied next to the dev executable.
fn resolve_bundled_binary() -> Result<PathBuf, String> {
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

#[cfg(unix)]
fn unix_name(value: &std::ffi::OsStr) -> Result<std::ffi::CString, String> {
    use std::os::unix::ffi::OsStrExt;

    std::ffi::CString::new(value.as_bytes())
        .map_err(|_| err_str("agent config path contains an unsupported NUL byte"))
}

/// Opens absolute directories piece by piece from `/` using `openat(O_NOFOLLOW)`.
///
/// Opening the completed path at once with `open` means only the last piece is no-follow, so its **parent**
/// could be swapped to a link immediately after inspection. By chaining directory FDs one step at a time,
/// even if names are later replaced, writes remain within the originally opened tree.
#[cfg(unix)]
pub(crate) fn open_absolute_directory_no_follow(path: &Path) -> Result<fs::File, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    if !path.is_absolute() {
        return Err(err_str("native write root must be absolute"));
    }

    // A `c"…"` literal, not `CString::new("/").expect(…)`. The `expect` could never fire, but
    // the callers here are synchronous Tauri commands, which Tauri runs on the macOS main
    // thread — a panic there aborts the app rather than failing one call, so the crate keeps
    // no panicking step on that path even when the input is a constant.
    let slash = c"/";
    let root_fd = unsafe {
        libc::open(
            slash.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if root_fd < 0 {
        return Err(err_str(format!(
            "could not open filesystem root safely: {}",
            std::io::Error::last_os_error()
        )));
    }
    let mut current = unsafe { fs::File::from_raw_fd(root_fd) };

    for component in path.components() {
        let std::path::Component::Normal(part) = component else {
            if matches!(component, std::path::Component::RootDir) {
                continue;
            }
            return Err(err_str(
                "native write root contains an unsupported path component",
            ));
        };
        let name = unix_name(part)?;
        let next_fd = unsafe {
            libc::openat(
                current.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        };
        if next_fd < 0 {
            return Err(err_str(format!(
                "could not open {} without following links: {}",
                path.display(),
                std::io::Error::last_os_error()
            )));
        }
        current = unsafe { fs::File::from_raw_fd(next_fd) };
    }

    Ok(current)
}

/// Creates and opens relative directories under a stable root FD piece by piece with no-follow.
#[cfg(unix)]
pub(crate) fn open_or_create_relative_directory(
    root: &fs::File,
    relative_path: &Path,
    create_mode: libc::mode_t,
) -> Result<fs::File, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    let mut current = root
        .try_clone()
        .map_err(|error| err_str(format!("could not clone root directory handle: {error}")))?;
    for component in relative_path.components() {
        let std::path::Component::Normal(part) = component else {
            return Err(err_str("directory target must be a normal relative path"));
        };
        let name = unix_name(part)?;
        let made = unsafe { libc::mkdirat(current.as_raw_fd(), name.as_ptr(), create_mode) };
        if made != 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(err_str(format!(
                    "could not create target directory {:?}: {error}",
                    part
                )));
            }
        }
        let next_fd = unsafe {
            libc::openat(
                current.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        };
        if next_fd < 0 {
            return Err(err_str(format!(
                "target directory {:?} is a link or is not a directory: {}",
                part,
                std::io::Error::last_os_error()
            )));
        }
        current = unsafe { fs::File::from_raw_fd(next_fd) };
    }

    Ok(current)
}

/// Opens the parent of allowed relative config paths using a stable directory FD. Missing intermediate folders
/// are created based on the already-opened parent FD, not the path string.
#[cfg(unix)]
pub(crate) fn open_entry_parent(
    config_root: &fs::File,
    relative_path: &str,
) -> Result<(fs::File, std::ffi::CString), String> {
    let target = Path::new(relative_path);
    if !target.is_relative() {
        return Err(err_str("agent config target must be relative"));
    }
    let file_name = target
        .file_name()
        .ok_or_else(|| err_str("agent config target has no file name"))?;
    let parent = target.parent().unwrap_or_else(|| Path::new(""));
    let parent = open_or_create_relative_directory(config_root, parent, 0o700)?;
    Ok((parent, unix_name(file_name)?))
}

/// Completes a new inode within the stable parent FD and replaces only the name via `renameat`.
/// Even if the existing target is a hardlink, its inode is not truncated, so other paths remain unchanged.
#[cfg(unix)]
fn ensure_private_temporary(file: &fs::File, stage: &str) -> std::io::Result<()> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.nlink() != 1 {
        return Err(std::io::Error::other(format!(
            "private temporary file was linked {stage}"
        )));
    }
    Ok(())
}

#[cfg(unix)]
pub(crate) fn write_entry_atomically(
    parent: &fs::File,
    file_name: &std::ffi::CStr,
    contents: &str,
    create_mode: libc::mode_t,
) -> Result<(), String> {
    write_entry_bytes_atomically(parent, file_name, contents.as_bytes(), create_mode)
}

/// The same guarded write for bytes that are not text.
///
/// A raw source imported into `sources/` is a PDF, a spreadsheet, a scan — never a
/// string. It has to reach disk through **this** path and not `fs::write`, because every
/// protection here is about the parent directory rather than the content: the write goes
/// through an already-open parent descriptor, `O_NOFOLLOW` refuses a symlink planted at
/// the name, and the rename is atomic, so a torn file is never left in a person's folder.
/// Splitting text off as a thin caller keeps one implementation of that guarantee.
pub(crate) fn write_entry_bytes_atomically(
    parent: &fs::File,
    file_name: &std::ffi::CStr,
    contents: &[u8],
    create_mode: libc::mode_t,
) -> Result<(), String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    static TEMP_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| err_str(error.to_string()))?
        .as_nanos();
    let printable_name = file_name.to_string_lossy();
    let mut created = None;

    for _ in 0..64 {
        let sequence = TEMP_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        // `file_name` is a `&CStr`, so `printable_name` cannot contain an interior NUL and this
        // conversion cannot fail. It is still an error rather than a panic: the callers are
        // synchronous Tauri commands, and Tauri runs those on the macOS main thread, where an
        // unwinding panic aborts the whole app instead of failing the one write.
        let temporary_name = match std::ffi::CString::new(format!(
            ".{printable_name}.oatlas-tmp-{}-{nonce:x}-{sequence:x}",
            std::process::id()
        )) {
            Ok(name) => name,
            Err(_) => {
                return Err(err_str(
                    "temporary file name contained an unsupported NUL byte",
                ))
            }
        };
        let temporary_fd = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                temporary_name.as_ptr(),
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
                create_mode as libc::c_uint,
            )
        };
        if temporary_fd >= 0 {
            created = Some((temporary_name, unsafe {
                fs::File::from_raw_fd(temporary_fd)
            }));
            break;
        }
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(err_str(format!(
                "could not create a private temporary file: {error}"
            )));
        }
    }

    let (temporary_name, mut temporary) = created.ok_or_else(|| {
        err_str("could not reserve a private temporary name for the native write")
    })?;
    let result = (|| -> std::io::Result<()> {
        ensure_private_temporary(&temporary, "before writing")?;
        temporary.write_all(contents)?;
        temporary.sync_all()?;
        ensure_private_temporary(&temporary, "before commit")?;
        let renamed = unsafe {
            libc::renameat(
                parent.as_raw_fd(),
                temporary_name.as_ptr(),
                parent.as_raw_fd(),
                file_name.as_ptr(),
            )
        };
        if renamed != 0 {
            return Err(std::io::Error::last_os_error());
        }
        parent.sync_all()
    })();

    if result.is_err() {
        let _ = unsafe { libc::unlinkat(parent.as_raw_fd(), temporary_name.as_ptr(), 0) };
    }
    result.map_err(|error| {
        err_str(format!(
            "could not atomically replace {}: {error}",
            printable_name
        ))
    })
}

fn rpc_line(id: u64, method: &str, params: serde_json::Value) -> String {
    format!(
        "{}\n",
        serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
    )
}

/// Self-verification immediately after button press. `initialize` → `tools/list` → 1 `get_concept`.
///
/// Why go to actual invocation here: If only boot is checked, the system reports "server is up but cannot read this folder"
/// with a green light. What users want to know is not whether the process is alive, but **whether their vault is readable**.
#[tauri::command(async)]
pub fn verify_mcp_server(vault_path: String, sample_slug: Option<String>) -> McpVerifyResult {
    match verify_inner(&vault_path, sample_slug.as_deref()) {
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

    let mut child = Command::new(&binary)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn an_open_config_parent_cannot_be_redirected_by_a_later_symlink_swap() {
        use std::os::unix::fs::symlink;

        let base =
            std::env::temp_dir().join(format!("oa-agent-setup-parent-race-{}", std::process::id()));
        let vault = base.join("vault");
        let original_parent = vault.join(".codex-original");
        let outside = base.join("outside");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(vault.join(".codex")).unwrap();
        fs::create_dir_all(&outside).unwrap();

        let canonical_vault = fs::canonicalize(&vault).unwrap();
        let root = open_absolute_directory_no_follow(&canonical_vault).unwrap();
        let (parent, file_name) = open_entry_parent(&root, ".codex/config.toml").unwrap();

        // Swap names after inspect/opening the parent. Re-opening with string paths
        // would write to outside/config.toml, but the already-opened parent FD holds the original directory.
        fs::rename(vault.join(".codex"), &original_parent).unwrap();
        symlink(&outside, vault.join(".codex")).unwrap();
        write_entry_atomically(&parent, &file_name, "inside", 0o600).unwrap();

        assert!(!outside.join("config.toml").exists());
        assert_eq!(
            fs::read_to_string(original_parent.join("config.toml")).unwrap(),
            "inside"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_config_temporary_is_not_eligible_for_commit() {
        let base =
            std::env::temp_dir().join(format!("oa-agent-setup-temp-link-{}", std::process::id()));
        let temporary = base.join("temporary");
        let outside_link = base.join("outside-link");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        fs::write(&temporary, "").unwrap();
        fs::hard_link(&temporary, &outside_link).unwrap();

        let file = fs::File::open(&temporary).unwrap();
        let error = ensure_private_temporary(&file, "before commit").unwrap_err();
        assert!(error.to_string().contains("linked before commit"));
        let _ = fs::remove_dir_all(&base);
    }
}
