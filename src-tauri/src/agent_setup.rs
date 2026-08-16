//! 「에이전트 연결」 — 앱이 자기 번들 안의 MCP 서버를 가리키고, 사용자가 승인한
//! 설정 파일만 디스크에 쓰고, 그 자리에서 실제로 스폰해 검증한다.
//!
//! 왜 앱이 이 일을 하는가: 설치형 앱을 깔아도 에이전트가 붙지 못하는 모순을
//! 끊기 위해서다. 웹은 열린 폴더의 절대 경로를 구조적으로 알 수 없어 실행
//! 가능한 설정을 만들 수 없다 — 데스크톱만 할 수 있는 일이다.
//!
//! 헌장 준수:
//!   * **쓰기는 사용자가 승인한 것만.** 이 모듈은 무엇을 쓸지 계산해서
//!     돌려주기만 하는 `plan_agent_config` 와, 그 계획을 실행하는
//!     `write_agent_config` 로 나뉜다. UI 는 계획을 먼저 보여준다.
//!   * **쓸 수 있는 자리가 닫혀 있다.** 대상은 vault 폴더 또는 그 vault 를
//!     담은 git repo 최상위뿐이고, 파일명은 아래 허용 목록뿐이다. 웹뷰가
//!     임의 절대 경로를 쓰게 두지 않는다.
//!   * **전송 0.** 스폰도 파일 쓰기도 전부 로컬. 네트워크를 쓰지 않는다.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::git::find_repo_root;

/// 번들 안 MCP 서버의 파일명. `scripts/lib/mcp-binary.mjs` 의
/// `MCP_BINARY_NAME` 과 같은 값이어야 한다 — Tauri 의 `externalBin` 이
/// `Contents/MacOS/<이름>` 으로 굽는다.
const MCP_BINARY_NAME: &str = "ontology-atlas-mcp";

fn bundled_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ontology-atlas-mcp.exe"
    } else {
        MCP_BINARY_NAME
    }
}

/// 앱이 사용자 디스크에 쓸 수 있는 파일 — 이 목록 밖은 거절한다.
///
/// **이 목록은 「쓸 수 있는 것」이고 「한 번에 쓰는 것」이 아니다.** 2026-07-30 까지
/// 호출부가 이 목록 전체를 순회해서, 「Claude Code에 연결」 한 번이 Codex 설정까지
/// 썼다. 라벨이 거짓말하는 결함이었고 안 쓰는 도구의 파일이 사용자 git diff 에
/// 떴다 — *"모든 변경이 읽을 수 있는 diff"* 라는 이 제품의 주장에 반한다.
///
/// 이제 어느 파일을 쓸지는 **호출부가 도구별로 고른다**
/// (`src/features/docs-vault-local/lib/agent-clients.ts`). 여기는 보안 경계로 남는다:
/// 목록 밖 경로는 무엇이 요청해도 거절한다.
///
/// `.cursor/mcp.json` 과 `.agents/mcp_config.json` 은 2026-07-30 조사로 추가됐다 —
/// 둘 다 프로젝트 스코프 + `mcpServers` 키라 기존 라이터로 그냥 떨어진다.
/// `.vscode/mcp.json` 은 키가 `servers` 라서 라이터를 하나 더 요구하고, 그 값이
/// 겹침 대비 비싸서 뺐다. 근거: `.qa-scratch/mcp-client-research-2026-07-30.md`.
const ALLOWED_CONFIG_FILES: [&str; 5] = [
    ".mcp.json",
    ".mcp.json.example",
    ".codex/config.toml",
    ".cursor/mcp.json",
    ".agents/mcp_config.json",
];

/// 자가 검증 한 판의 예산. 첫 스폰은 macOS 가 서명을 훑느라 느릴 수 있다.
const VERIFY_TIMEOUT: Duration = Duration::from_secs(25);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundledServer {
    /// 번들 바이너리 절대 경로. 없으면 `None`.
    pub path: Option<String>,
    pub available: bool,
    /// 못 찾았을 때 사람이 읽을 수 있는 이유 (진단용, UI 가 그대로 보여준다).
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigTarget {
    /// 실제로 쓰일 절대 경로.
    pub absolute_path: String,
    /// 허용 목록 상의 상대 이름 (`.mcp.json` 등).
    pub file_name: String,
    /// 이 파일이 이미 있는가 — UI 가 "새로 만듦 / 덮어씀"을 정직하게 말하려면 필요.
    pub exists: bool,
    /// 이미 있을 때의 현재 내용. 미리보기 diff 의 왼쪽.
    pub current_contents: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigPlan {
    /// 설정이 놓일 디렉토리 — repo 최상위 또는 vault 폴더 자체.
    pub config_root: String,
    /// `repo-root` | `vault-folder`. 어디에 왜 쓰는지 UI 가 말해야 한다.
    pub root_kind: String,
    pub vault_path: String,
    pub targets: Vec<AgentConfigTarget>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigWrite {
    pub file_name: String,
    pub contents: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigWriteResult {
    pub config_root: String,
    pub written: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpVerifyResult {
    pub ok: bool,
    pub server_version: Option<String>,
    pub tool_count: Option<usize>,
    /// `get_concept` 실호출로 실제 vault 노드가 돌아왔는지 — 부팅만이 아니라
    /// "이 폴더를 읽는다"까지 증명해야 초록 불이다.
    pub sample_slug: Option<String>,
    pub sample_title: Option<String>,
    /// 실패 사유. 가짜 진행바 대신 이 문장을 보여준다.
    pub failure: Option<String>,
}

fn err_str(message: impl Into<String>) -> String {
    message.into()
}

/// 번들 바이너리는 앱 실행 파일의 형제다 (`Contents/MacOS/`). `tauri dev` 도
/// 같은 규칙 — 개발 실행 파일 옆에 복사된다.
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

/// 설정이 놓일 자리를 정한다.
///
/// vault 가 git repo 안이면 **repo 최상위** — Claude Code 등은 프로젝트 루트를
/// 기준으로 `.mcp.json` 을 읽는다. repo 밖 순수 폴더면 **vault 폴더 자체**에
/// 쓰고, UI 가 "이 폴더를 프로젝트로 열어야 한다"고 말한다. (설계 §8 미결
/// 항목의 결정: 홈 설정 `~/.claude.json` 까지 가지 않는다 — 사용자 홈의 전역
/// 설정을 앱이 건드리는 것은 "쓰기는 명시 승인" 원칙에 비해 사정거리가 너무 넓다.)
fn resolve_config_root(vault: &Path) -> (PathBuf, &'static str) {
    match find_repo_root(vault) {
        Ok(Some(root)) => (root, "repo-root"),
        _ => (vault.to_path_buf(), "vault-folder"),
    }
}

fn reject_symbolic_link(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(err_str(format!(
            "refusing to write {} — symbolic links are not config files",
            path.display()
        ))),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(err_str(format!(
            "could not inspect {} before writing: {error}",
            path.display()
        ))),
    }
}

fn inspect_config_write_target(config_root: &Path, absolute: &Path) -> Result<(), String> {
    reject_symbolic_link(absolute)?;
    let parent = absolute
        .parent()
        .ok_or_else(|| err_str("agent config target has no parent directory"))?;
    reject_symbolic_link(parent)?;

    if parent.exists() {
        let canonical_parent = fs::canonicalize(parent).map_err(|error| {
            err_str(format!(
                "could not resolve {} before writing: {error}",
                parent.display()
            ))
        })?;
        if !canonical_parent.starts_with(config_root) {
            return Err(err_str(format!(
                "refusing to write {} — its parent resolves outside {}",
                absolute.display(),
                config_root.display()
            )));
        }
    }
    Ok(())
}

#[cfg(unix)]
fn unix_name(value: &std::ffi::OsStr) -> Result<std::ffi::CString, String> {
    use std::os::unix::ffi::OsStrExt;

    std::ffi::CString::new(value.as_bytes())
        .map_err(|_| err_str("agent config path contains an unsupported NUL byte"))
}

/// 절대 디렉터리를 `/`부터 각 조각별 `openat(O_NOFOLLOW)`로 연다.
///
/// 완성된 경로를 한 번에 `open`하면 마지막 조각만 no-follow여도 그 **부모**가
/// 검사 직후 링크로 바뀔 수 있다. 디렉터리 FD를 한 단계씩 이어 잡으면 이름이
/// 나중에 교체돼도 쓰기는 이미 연 원래 트리 안에 머문다.
#[cfg(unix)]
fn open_absolute_directory_no_follow(path: &Path) -> Result<fs::File, String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    if !path.is_absolute() {
        return Err(err_str("agent config root must be absolute"));
    }

    let slash = std::ffi::CString::new("/").expect("slash contains no NUL");
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
                "agent config root contains an unsupported path component",
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

/// 허용된 상대 설정 경로의 부모를 안정된 디렉터리 FD로 연다. 없는 중간 폴더도
/// 경로 문자열이 아니라 이미 연 부모 FD를 기준으로 만든다.
#[cfg(unix)]
fn open_config_parent(
    config_root: &fs::File,
    relative_path: &str,
) -> Result<(fs::File, std::ffi::CString), String> {
    use std::os::fd::{AsRawFd, FromRawFd};

    let mut parts = Vec::new();
    for component in Path::new(relative_path).components() {
        let std::path::Component::Normal(part) = component else {
            return Err(err_str(
                "agent config target must be a normal relative path",
            ));
        };
        parts.push(part);
    }
    let (file_name, parents) = parts
        .split_last()
        .ok_or_else(|| err_str("agent config target has no file name"))?;
    let mut current = config_root
        .try_clone()
        .map_err(|error| err_str(format!("could not clone config root handle: {error}")))?;

    for part in parents {
        let name = unix_name(part)?;
        let made = unsafe { libc::mkdirat(current.as_raw_fd(), name.as_ptr(), 0o700) };
        if made != 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(err_str(format!(
                    "could not create config directory {:?}: {error}",
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
                "config directory {:?} is a link or is not a directory: {}",
                part,
                std::io::Error::last_os_error()
            )));
        }
        current = unsafe { fs::File::from_raw_fd(next_fd) };
    }

    Ok((current, unix_name(file_name)?))
}

/// 안정된 부모 FD 안에 새 inode를 완성한 뒤 `renameat`으로 이름만 교체한다.
/// 기존 대상이 하드링크여도 그 inode를 truncate하지 않으므로 다른 경로는 불변이다.
#[cfg(unix)]
fn ensure_private_config_temporary(file: &fs::File, stage: &str) -> std::io::Result<()> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.nlink() != 1 {
        return Err(std::io::Error::other(format!(
            "private config temporary file was linked {stage}"
        )));
    }
    Ok(())
}

#[cfg(unix)]
fn write_config_entry_atomically(
    parent: &fs::File,
    file_name: &std::ffi::CStr,
    contents: &str,
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
        let temporary_name = std::ffi::CString::new(format!(
            ".{printable_name}.oatlas-tmp-{}-{nonce:x}-{sequence:x}",
            std::process::id()
        ))
        .expect("generated temporary name contains no NUL");
        let temporary_fd = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                temporary_name.as_ptr(),
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
                0o600,
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
                "could not create a private config temporary file: {error}"
            )));
        }
    }

    let (temporary_name, mut temporary) = created.ok_or_else(|| {
        err_str("could not reserve a private temporary name for the agent config")
    })?;
    let result = (|| -> std::io::Result<()> {
        ensure_private_config_temporary(&temporary, "before writing")?;
        temporary.write_all(contents.as_bytes())?;
        temporary.sync_all()?;
        ensure_private_config_temporary(&temporary, "before commit")?;
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
            "could not atomically replace agent config {}: {error}",
            printable_name
        ))
    })
}

#[cfg(unix)]
fn write_config_contents(
    config_root: &fs::File,
    relative_path: &str,
    contents: &str,
) -> Result<(), String> {
    let (parent, file_name) = open_config_parent(config_root, relative_path)?;
    write_config_entry_atomically(&parent, &file_name, contents)
}

#[cfg(not(unix))]
fn write_config_contents(path: &Path, contents: &str) -> Result<(), String> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    let mut file = options
        .open(path)
        .map_err(|error| err_str(format!("could not write {}: {error}", path.display())))?;
    file.write_all(contents.as_bytes())
        .map_err(|error| err_str(format!("could not write {}: {error}", path.display())))
}

#[tauri::command]
pub fn plan_agent_config(vault_path: String) -> Result<AgentConfigPlan, String> {
    let vault = canonical_dir(&vault_path)?;
    let (config_root, root_kind) = resolve_config_root(&vault);

    let targets = ALLOWED_CONFIG_FILES
        .iter()
        .map(|file_name| {
            let absolute = config_root.join(file_name);
            let current_contents = fs::read_to_string(&absolute).ok();
            AgentConfigTarget {
                absolute_path: absolute.to_string_lossy().into_owned(),
                file_name: (*file_name).to_string(),
                exists: current_contents.is_some(),
                current_contents,
            }
        })
        .collect();

    Ok(AgentConfigPlan {
        config_root: config_root.to_string_lossy().into_owned(),
        root_kind: root_kind.to_string(),
        vault_path: vault.to_string_lossy().into_owned(),
        targets,
    })
}

#[tauri::command]
pub fn write_agent_config(
    vault_path: String,
    writes: Vec<AgentConfigWrite>,
) -> Result<AgentConfigWriteResult, String> {
    let vault = canonical_dir(&vault_path)?;
    let (config_root, _) = resolve_config_root(&vault);

    // 허용 목록 검사를 **쓰기 전에 전부** 한다 — 하나라도 거절이면 아무것도
    // 쓰지 않는다. 절반만 쓰인 설정은 진단이 가장 어려운 상태다.
    for write in &writes {
        if !ALLOWED_CONFIG_FILES.contains(&write.file_name.as_str()) {
            return Err(err_str(format!(
                "refusing to write {} — only {} are allowed",
                write.file_name,
                ALLOWED_CONFIG_FILES.join(", ")
            )));
        }
    }

    let targets: Vec<PathBuf> = writes
        .iter()
        .map(|write| config_root.join(&write.file_name))
        .collect();
    // 파일이나 부모가 이미 링크라면 다른 설정을 하나도 쓰기 전에 전부 거절한다.
    for absolute in &targets {
        inspect_config_write_target(&config_root, absolute)?;
    }

    #[cfg(unix)]
    let config_root_handle = open_absolute_directory_no_follow(&config_root)?;

    let mut written = Vec::new();
    for (write, absolute) in writes.iter().zip(targets) {
        #[cfg(not(unix))]
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| err_str(format!("could not create {}: {e}", parent.display())))?;
        }
        // 부모를 만든 뒤에도 다시 본다. Unix의 실제 생성/쓰기는 아래에서 안정된
        // 디렉터리 FD를 쓰므로 이 검사는 일괄 사전 거절과 진단을 위한 방어층이다.
        inspect_config_write_target(&config_root, &absolute)?;

        #[cfg(unix)]
        write_config_contents(&config_root_handle, &write.file_name, &write.contents)?;
        #[cfg(not(unix))]
        write_config_contents(&absolute, &write.contents)?;
        written.push(absolute.to_string_lossy().into_owned());
    }

    Ok(AgentConfigWriteResult {
        config_root: config_root.to_string_lossy().into_owned(),
        written,
    })
}

fn rpc_line(id: u64, method: &str, params: serde_json::Value) -> String {
    format!(
        "{}\n",
        serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
    )
}

/// 버튼 직후의 자가 검증. `initialize` → `tools/list` → `get_concept` 1건.
///
/// 여기서 실호출까지 가는 이유: 부팅만 확인하면 "서버는 떴는데 이 폴더를 못
/// 읽는" 상태를 초록 불로 보고하게 된다. 사용자가 알고 싶은 것은 프로세스가
/// 살아있는지가 아니라 **자기 vault 가 읽히는지**다.
#[tauri::command]
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

    #[test]
    fn allowed_config_files_cover_the_three_client_surfaces() {
        assert!(ALLOWED_CONFIG_FILES.contains(&".mcp.json"));
        assert!(ALLOWED_CONFIG_FILES.contains(&".codex/config.toml"));
        // 개수를 하드코딩하지 않는다 — 목록이 늘 때마다 이 줄이 빨개지고, 그건
        // "계약이 깨졌다" 가 아니라 "숫자를 안 고쳤다" 라서 신호가 아니다.
        // 지켜야 할 것은 **개수가 아니라 구성**이다.
        assert!(ALLOWED_CONFIG_FILES.len() >= 3);
    }

    #[test]
    fn write_agent_config_refuses_paths_outside_the_allow_list() {
        let dir = std::env::temp_dir().join(format!("oa-agent-setup-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let error = write_agent_config(
            dir.to_string_lossy().into_owned(),
            vec![AgentConfigWrite {
                file_name: "../../.zshrc".into(),
                contents: "boom".into(),
            }],
        )
        .unwrap_err();
        assert!(error.contains("refusing to write"));
        assert!(!dir.join("../../.zshrc").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_agent_config_still_writes_an_allowed_nested_file() {
        let base =
            std::env::temp_dir().join(format!("oa-agent-setup-allowed-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let result = write_agent_config(
            base.to_string_lossy().into_owned(),
            vec![AgentConfigWrite {
                file_name: ".codex/config.toml".into(),
                contents: "[mcp_servers.ontology-atlas]".into(),
            }],
        )
        .unwrap();

        let root = PathBuf::from(result.config_root);
        assert_eq!(
            fs::read_to_string(root.join(".codex/config.toml")).unwrap(),
            "[mcp_servers.ontology-atlas]"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn write_agent_config_refuses_an_allowed_file_that_links_outside() {
        use std::os::unix::fs::symlink;

        let base = std::env::temp_dir().join(format!("oa-agent-setup-link-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside.json");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&vault).unwrap();
        fs::write(&outside, "keep-me").unwrap();
        symlink(&outside, vault.join(".mcp.json")).unwrap();

        let error = write_agent_config(
            vault.to_string_lossy().into_owned(),
            vec![AgentConfigWrite {
                file_name: ".mcp.json".into(),
                contents: "overwrite".into(),
            }],
        )
        .unwrap_err();

        assert!(error.contains("refusing to write"));
        assert_eq!(fs::read_to_string(&outside).unwrap(), "keep-me");
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn write_agent_config_does_not_modify_an_outside_hard_link_target() {
        let base =
            std::env::temp_dir().join(format!("oa-agent-setup-hardlink-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside.json");
        let config = vault.join(".mcp.json");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&vault).unwrap();
        fs::write(&outside, "keep-me").unwrap();
        fs::hard_link(&outside, &config).unwrap();

        write_agent_config(
            vault.to_string_lossy().into_owned(),
            vec![AgentConfigWrite {
                file_name: ".mcp.json".into(),
                contents: "replacement".into(),
            }],
        )
        .unwrap();

        assert_eq!(fs::read_to_string(&outside).unwrap(), "keep-me");
        assert_eq!(fs::read_to_string(&config).unwrap(), "replacement");
        let _ = fs::remove_dir_all(&base);
    }

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
        let (parent, file_name) = open_config_parent(&root, ".codex/config.toml").unwrap();

        // 검사/부모 open 뒤 이름을 바꿔치기한다. 문자열 경로로 다시 open하면
        // outside/config.toml을 쓰지만, 이미 연 부모 FD는 원래 디렉터리를 붙든다.
        fs::rename(vault.join(".codex"), &original_parent).unwrap();
        symlink(&outside, vault.join(".codex")).unwrap();
        write_config_entry_atomically(&parent, &file_name, "inside").unwrap();

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
        let error = ensure_private_config_temporary(&file, "before commit").unwrap_err();
        assert!(error.to_string().contains("linked before commit"));
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn write_agent_config_refuses_an_allowed_parent_directory_that_links_outside() {
        use std::os::unix::fs::symlink;

        let base =
            std::env::temp_dir().join(format!("oa-agent-setup-parent-link-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, vault.join(".codex")).unwrap();

        let error = write_agent_config(
            vault.to_string_lossy().into_owned(),
            vec![AgentConfigWrite {
                file_name: ".codex/config.toml".into(),
                contents: "overwrite".into(),
            }],
        )
        .unwrap_err();

        assert!(error.contains("refusing to write"));
        assert!(!outside.join("config.toml").exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn plan_agent_config_falls_back_to_the_vault_folder_outside_a_repo() {
        let dir = std::env::temp_dir().join(format!("oa-agent-plan-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let plan = plan_agent_config(dir.to_string_lossy().into_owned()).unwrap();
        // /tmp is not a git repository, so the plan must land inside the vault.
        assert_eq!(plan.root_kind, "vault-folder");
        assert_eq!(plan.targets.len(), ALLOWED_CONFIG_FILES.len());
        assert!(plan.targets.iter().all(|t| !t.exists));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plan_agent_config_rejects_relative_paths() {
        assert!(plan_agent_config("relative/path".into()).is_err());
    }
}
