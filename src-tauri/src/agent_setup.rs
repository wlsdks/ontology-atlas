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

    let mut written = Vec::new();
    for write in &writes {
        let absolute = config_root.join(&write.file_name);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| err_str(format!("could not create {}: {e}", parent.display())))?;
        }
        fs::write(&absolute, &write.contents)
            .map_err(|e| err_str(format!("could not write {}: {e}", absolute.display())))?;
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
