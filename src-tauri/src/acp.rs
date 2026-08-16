//! ACP 하네스 — 사용자가 이미 설치한 코딩 에이전트를 앱 안에서 부르기 위한 층.
//!
//! 이 파일이 맡는 것은 **찾기**다: 어느 실행기가 이 기기에 실제로 있는지, 그리고
//! 그것을 띄우려면 어떤 절대 경로를 써야 하는지. 프로토콜(JSON-RPC) 해석은 여기
//! 없다 — 화면이 있는 쪽이 한다.
//!
//! ## 왜 PATH 를 직접 다시 만드는가 (2026-08-16 실측)
//!
//! 터미널에서 `which node` 가 답한다고 해서 **앱**이 찾을 수 있는 게 아니다.
//! macOS 에서 Finder·Dock 으로 띄운 앱은 셸 초기화 파일(`.zshrc` 등)을 거치지
//! 않으므로, 버전 관리자가 심어 둔 경로가 통째로 없다. 이 기기 실측:
//!
//! ```text
//! node · npx · codex → /Users/<나>/.nvm/versions/node/v24.16.0/bin/
//! claude            → /Users/<나>/.local/bin/
//! ```
//!
//! 둘 다 GUI 앱의 기본 PATH 밖이다. 그래서 「없다」고 말하면 그건 거짓말이 되고,
//! 사용자는 방금 터미널에서 쓰던 도구를 앱이 못 찾는 화면을 본다.
//!
//! **그렇다고 셸을 띄워 PATH 를 캐내지는 않는다.** 로그인 셸을 실행하면 사용자의
//! 셸 설정을 통째로 돌리는 것이라 무엇이 실행될지 우리가 모른다. 대신 **이름이
//! 알려진 자리**만 뒤진다 — 무엇을 뒤지는지 코드에 다 적혀 있고, 그 목록이
//! 곧 검사 대상이다.
//!
//! ## 왜 버전을 못 박은 npx 인가
//!
//! 어댑터(`claude-agent-acp` · `codex-acp`)는 CLI 와 별개 프로그램이다. 사용자에게
//! `npm i -g` 를 시키지 않으려면 둘 중 하나다 — 앱이 자체 Node 런타임과 어댑터를
//! 통째로 안고 있거나(참고 제품은 이 길로 1.06GB 를 쓴다), 있는 Node 로 `npx` 를
//! 부르거나. 후자를 고르되 **버전을 못 박는다**: 못 박지 않으면 어느 날 어댑터가
//! 올라가면서 앱이 조용히 다른 프로토콜을 말하게 된다.
//!
//! 이미 설치돼 있으면 그걸 그대로 쓴다 — npx 는 첫 실행이 느리다.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// 앱이 부를 수 있는 실행기 한 종류.
#[derive(Debug, Clone, Copy)]
pub(crate) struct AcpRuntimeSpec {
    /// 화면·설정이 쓰는 안정된 식별자.
    pub id: &'static str,
    /// 사람이 읽는 이름.
    pub label: &'static str,
    /// 사용자가 이미 깔아 둔 CLI 의 실행 파일 이름.
    pub cli: &'static str,
    /// 어댑터가 전역 설치돼 있을 때의 실행 파일 이름.
    pub adapter_bin: &'static str,
    /// 설치돼 있지 않을 때 `npx` 로 부를 **버전 못 박은** 패키지.
    pub adapter_package: &'static str,
    /// 이 실행기가 「설정을 어디서 읽나」를 정하는 환경 변수.
    pub config_env: &'static str,
    /// 그 설정 디렉터리 안의 자격증명 파일 이름. 격리하면 로그인이 깨지므로
    /// 이 파일만 사용자의 원본으로 **링크**한다(복사하지 않는다).
    pub credentials_file: &'static str,
    /// 사용자의 원본 설정 디렉터리(홈 기준 상대 경로).
    pub user_config_dir: &'static str,
}

/// 앱이 띄우는 세션에 넣는 설정. **사용자의 전역 설정을 물려받지 않는다.**
///
/// 2026-08-16 실측: 소유자의 `~/.claude/settings.json` 은 `defaultMode: auto` 에
/// `Bash(*)` · `Write(*)` · `Edit(*)` 를 포함해 15개를 미리 허용해 두고 있었다.
/// 그 설정을 물려받은 세션은 작업 폴더 **밖**에 파일을 쓰면서 **한 번도 묻지
/// 않았고**, 터미널까지 실행했다. 세션 모드를 「직접 확인」으로 바꿔도 같았다 —
/// 미리 허용된 것은 모드와 무관하게 통과하기 때문이다.
///
/// 격리한 설정으로 같은 것을 시키니 권한 요청이 왔고, 거절하니 파일이 안 생겼다.
/// **관문은 프로토콜이 주는 게 아니라 이 설정이 만든다.**
const ISOLATED_CLAUDE_SETTINGS: &str = r#"{
  "permissions": {
    "defaultMode": "default",
    "allow": [],
    "deny": [],
    "ask": []
  }
}
"#;

/// 이번 조각이 부르는 실행기.
///
/// **claude 하나로 시작한다**(결정 원장 2026-08-16). codex 는 같은 자리에 이미
/// 등록해 두되, 화면에 내보낼지는 다음 조각에서 정한다 — 목록에 두 줄이 있어야
/// 「하나만 특별 대우하는 코드」가 생기지 않는다.
pub(crate) const RUNTIMES: &[AcpRuntimeSpec] = &[
    AcpRuntimeSpec {
        id: "claude",
        label: "Claude Code",
        cli: "claude",
        adapter_bin: "claude-agent-acp",
        adapter_package: "@agentclientprotocol/claude-agent-acp@0.68.0",
        config_env: "CLAUDE_CONFIG_DIR",
        credentials_file: ".credentials.json",
        user_config_dir: ".claude",
    },
    AcpRuntimeSpec {
        id: "codex",
        label: "Codex",
        cli: "codex",
        adapter_bin: "codex-acp",
        adapter_package: "@agentclientprotocol/codex-acp@1.3.0",
        // codex 는 다음 조각이다. 값만 등재해 두어 「하나만 특별 대우하는 코드」가
        // 생기지 않게 한다 — 격리 동작은 아직 실측하지 않았다.
        config_env: "CODEX_HOME",
        credentials_file: "auth.json",
        user_config_dir: ".codex",
    },
];

/// 파일시스템을 어떻게 들여다볼지 — 테스트가 진짜 디스크 없이 판정할 수 있게
/// 주입한다. 「이 기기에 무엇이 있나」를 검사가 기기에 의존해서 물으면, 그
/// 검사는 개발자 기계에서만 초록이 된다.
pub(crate) struct FsProbe<'a> {
    /// 실행 파일로 쓸 수 있는 것이 그 자리에 있는가.
    pub is_executable: &'a dyn Fn(&Path) -> bool,
    /// 디렉터리의 바로 아래 이름들 (없으면 빈 목록).
    pub list_dir: &'a dyn Fn(&Path) -> Vec<String>,
    /// 작은 텍스트 파일 읽기 (없으면 None). nvm 이 「기본 버전」을 적어 두는
    /// 파일 하나를 읽는 데만 쓴다.
    pub read_text: &'a dyn Fn(&Path) -> Option<String>,
}

/// nvm 이 설치한 Node 들의 `bin` 디렉터리 — **사용자가 쓰기로 한 버전이 앞**.
///
/// nvm 은 버전마다 디렉터리를 따로 두고 셸이 그중 하나만 PATH 에 넣는다. 앱은 그
/// 셸을 안 거치므로 직접 골라야 하는데, **최신을 고르는 것은 틀린 답이다.**
///
/// 이 기기 실측(2026-08-16)이 그것을 바로 보여 줬다: `claude` 가 `v22.15.0` 의
/// bin 에만 남아 있고 사용자의 실제 `claude` 는 `~/.local/bin` 이다. 버전
/// 디렉터리는 전역 설치한 CLI 의 **낡은 사본이 쌓이는 자리**라, 아무 버전이나
/// 뒤지면 사용자의 셸이 절대 쓰지 않을 바이너리를 집는다.
///
/// 그래서 순서는 ① `~/.nvm/alias/default` 가 가리키는 버전 ② 나머지를 숫자
/// 내림차순. 그리고 이 목록은 후보의 **맨 뒤**에 붙는다(`candidate_bin_dirs`).
fn nvm_bin_dirs(home: &Path, probe: &FsProbe<'_>) -> Vec<PathBuf> {
    let root = home.join(".nvm");
    let versions = root.join("versions").join("node");
    let mut found: Vec<(Vec<u64>, String, PathBuf)> = (probe.list_dir)(&versions)
        .into_iter()
        .filter_map(|name| {
            let parts = parse_version(&name)?;
            let dir = versions.join(&name).join("bin");
            Some((parts, name, dir))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));

    // `alias/default` 는 `v24.16.0` 처럼 정확한 버전일 수도, `lts/*` 나 `24`
    // 처럼 느슨한 표기일 수도 있다. 정확히 맞거나 접두사로 맞으면 그것을 앞으로.
    let default = (probe.read_text)(&root.join("alias").join("default"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(default) = default {
        let wanted = parse_version(&default);
        if let Some(at) = found.iter().position(|(parts, name, _)| {
            name == &default
                || name.trim_start_matches('v') == default.trim_start_matches('v')
                || wanted
                    .as_ref()
                    .is_some_and(|w| parts.len() >= w.len() && &parts[..w.len()] == &w[..])
        }) {
            let chosen = found.remove(at);
            found.insert(0, chosen);
        }
    }

    found.into_iter().map(|(_, _, dir)| dir).collect()
}

/// `v24.16.0` → `[24, 16, 0]`. 숫자로 못 읽으면 후보에서 뺀다.
fn parse_version(name: &str) -> Option<Vec<u64>> {
    let trimmed = name.strip_prefix('v').unwrap_or(name);
    let parts: Vec<u64> = trimmed
        .split('.')
        .map(|p| p.parse::<u64>().ok())
        .collect::<Option<Vec<u64>>>()?;
    if parts.is_empty() {
        None
    } else {
        Some(parts)
    }
}

/// 실행 파일을 찾을 후보 디렉터리 — **앞에 있을수록 먼저 본다**.
///
/// 순서가 계약이다: 상속받은 `PATH` 가 항상 먼저다. 사용자가 자기 셸에서 무엇을
/// 쓰기로 했든 그 선택이 우리 추측을 이긴다. 잘 알려진 자리는 **PATH 가 비어 있을
/// 때를 메우는 보충**이지 덮어쓰기가 아니다.
pub(crate) fn candidate_bin_dirs(
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let push = |dir: PathBuf, dirs: &mut Vec<PathBuf>| {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    };

    if let Some(path) = path_env {
        for entry in std::env::split_paths(path) {
            if !entry.as_os_str().is_empty() {
                push(entry, &mut dirs);
            }
        }
    }

    #[cfg(windows)]
    {
        // Windows 는 버전 관리자보다 설치 프로그램이 흔하다. npm 전역 shim 자리와
        // 표준 설치 경로만 보탠다.
        if let Some(appdata) = std::env::var_os("APPDATA") {
            push(PathBuf::from(appdata).join("npm"), &mut dirs);
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            push(
                PathBuf::from(local).join("Programs").join("nodejs"),
                &mut dirs,
            );
        }
    }

    #[cfg(not(windows))]
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        push(PathBuf::from(dir), &mut dirs);
    }

    if let Some(home) = home {
        // 한 자리에 하나만 사는 디렉터리가 먼저다.
        for rel in [
            ".local/bin", // claude 공식 설치 스크립트의 기본 자리
            ".bun/bin",
            ".volta/bin",
            ".asdf/shims",
            ".local/share/mise/shims",
            ".npm-global/bin",
            ".yarn/bin",
        ] {
            push(home.join(rel), &mut dirs);
        }
        // nvm 버전 디렉터리는 **맨 뒤**다 — 전역 설치한 CLI 의 낡은 사본이
        // 버전마다 쌓이는 자리라, 앞에 두면 사용자의 셸이 절대 안 쓰는
        // 바이너리를 집는다(2026-08-16 이 기기에서 실제로 그랬다).
        for dir in nvm_bin_dirs(home, probe) {
            push(dir, &mut dirs);
        }
    }

    dirs
}

/// 이름 하나를 절대 경로로 푼다. 못 찾으면 `None` — **추측한 경로를 돌려주지
/// 않는다.** 없는 경로를 돌려주면 실패가 실행 시점으로 미뤄지고, 그때 나오는
/// 오류는 사용자가 읽을 수 없는 것이 된다.
pub(crate) fn resolve_command(
    name: &str,
    dirs: &[PathBuf],
    probe: &FsProbe<'_>,
) -> Option<PathBuf> {
    #[cfg(windows)]
    let names: Vec<String> = ["", ".cmd", ".exe", ".bat"]
        .iter()
        .map(|ext| format!("{name}{ext}"))
        .collect();
    #[cfg(not(windows))]
    let names: Vec<String> = vec![name.to_string()];

    for dir in dirs {
        for candidate in &names {
            let path = dir.join(candidate);
            if (probe.is_executable)(&path) {
                return Some(path);
            }
        }
    }
    None
}

/// 실행기 하나의 준비 상태 — 화면이 그대로 그린다.
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AcpRuntimeStatus {
    pub id: String,
    pub label: String,
    /// `ready` · `cli-missing` · `node-missing`
    pub state: String,
    /// 찾아낸 CLI 절대 경로 (없으면 null).
    pub cli_path: Option<String>,
    /// 전역 설치된 어댑터 절대 경로. 있으면 npx 를 건너뛴다.
    pub adapter_path: Option<String>,
    /// 어댑터가 없을 때 쓸 npx 절대 경로.
    pub npx_path: Option<String>,
    /// npx 로 부를 때의 버전 못 박은 패키지 이름.
    pub adapter_package: String,
}

/// 이 기기의 실행기 상태를 전부 판정한다.
///
/// 판정은 셋뿐이고 **각각 다음 행동이 다르다**: `ready` 는 바로 쓸 수 있고,
/// `cli-missing` 은 사용자가 그 도구를 설치해야 하고, `node-missing` 은 도구는
/// 있는데 어댑터를 띄울 방법이 없다(Node 설치 또는 어댑터 전역 설치). 「설치됨/
/// 아님」 두 값으로 뭉개면 화면이 무엇을 하라고 말해야 할지 모른다.
pub(crate) fn detect_runtimes(
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
) -> Vec<AcpRuntimeStatus> {
    let dirs = candidate_bin_dirs(home, path_env, probe);
    let npx = resolve_command("npx", &dirs, probe);

    RUNTIMES
        .iter()
        .map(|spec| {
            let cli = resolve_command(spec.cli, &dirs, probe);
            let adapter = resolve_command(spec.adapter_bin, &dirs, probe);
            let state = if cli.is_none() {
                "cli-missing"
            } else if adapter.is_none() && npx.is_none() {
                "node-missing"
            } else {
                "ready"
            };
            AcpRuntimeStatus {
                id: spec.id.to_string(),
                label: spec.label.to_string(),
                state: state.to_string(),
                cli_path: cli.map(to_string_lossy),
                adapter_path: adapter.map(to_string_lossy),
                npx_path: npx.clone().map(to_string_lossy),
                adapter_package: spec.adapter_package.to_string(),
            }
        })
        .collect()
}

fn to_string_lossy(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

/// 어댑터를 실제로 띄울 때 쓰는 값 한 벌.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AcpLaunch {
    /// 절대 경로. 이름으로 띄우지 않는다 — 이름은 자식이 어떤 PATH 를 보느냐에
    /// 따라 다른 것을 가리킬 수 있다.
    pub program: PathBuf,
    pub args: Vec<String>,
    /// 자식에게 줄 `PATH`.
    ///
    /// **이게 없으면 절반만 푼 것이다.** 우리가 어댑터를 절대 경로로 띄워도,
    /// 그 어댑터는 다시 진짜 CLI(`claude`)를 **이름으로** 찾는다. 부모가 못
    /// 찾던 그 PATH 를 자식에게 그대로 물려주면 어댑터가 같은 자리에서 막힌다.
    pub path_env: String,
}

/// 실행기 하나를 띄우기 위한 값들을 푼다. 못 띄우면 **사람이 읽을 수 있는
/// 이유**를 돌려준다 — 이 문자열은 화면이 그대로 쓰지 않고 사유 판정에만 쓴다.
pub(crate) fn resolve_launch(
    runtime_id: &str,
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
) -> Result<AcpLaunch, String> {
    let spec = RUNTIMES
        .iter()
        .find(|s| s.id == runtime_id)
        .ok_or_else(|| format!("unknown-runtime:{runtime_id}"))?;

    let dirs = candidate_bin_dirs(home, path_env, probe);
    let joined = std::env::join_paths(dirs.iter())
        .map_err(|err| format!("path-join-failed:{err}"))?
        .to_string_lossy()
        .to_string();

    if resolve_command(spec.cli, &dirs, probe).is_none() {
        return Err(format!("cli-missing:{}", spec.cli));
    }

    // 이미 깔린 어댑터가 있으면 그것 — npx 는 첫 실행이 느리고 네트워크를 탄다.
    if let Some(adapter) = resolve_command(spec.adapter_bin, &dirs, probe) {
        return Ok(AcpLaunch {
            program: adapter,
            args: Vec::new(),
            path_env: joined,
        });
    }

    let npx = resolve_command("npx", &dirs, probe).ok_or_else(|| "node-missing".to_string())?;
    Ok(AcpLaunch {
        program: npx,
        // `-y` 는 「설치할까요?」 프롬프트를 끈다. 우리에겐 답할 사람이 없다 —
        // 물어보면 프로세스가 조용히 멈춘 채로 남는다.
        args: vec!["-y".to_string(), spec.adapter_package.to_string()],
        path_env: joined,
    })
}

/// 앱이 관리하는 설정 디렉터리를 준비하고 그 경로를 준다.
///
/// **왜 격리하는가는 `ISOLATED_CLAUDE_SETTINGS` 주석에 있다.** 여기서는 그 결정을
/// 디스크에 만드는 일만 한다:
///
/// 1. `<앱 데이터>/agent-config/<실행기>/` 를 만든다.
/// 2. 우리 설정을 **매번 다시 쓴다.** 사용자가 그 파일을 고쳐서 관문을 열어 둔 채
///    잊는 일이 없도록 — 이 디렉터리는 사용자의 설정 자리가 아니라 앱의 것이다.
/// 3. 자격증명은 **링크만 건다.** 격리하면 로그인이 깨지는데(실측:
///    `Authentication required`), 비밀을 앱 폴더로 복사하는 것은 헌장이 막는
///    종류의 일이다. 링크는 디스크에 보이고 원본이 하나로 유지된다.
///
/// 원본 자격증명이 없으면 링크를 만들지 않고 그냥 둔다 — 그때는 사용자가 아직
/// 그 도구에 로그인하지 않은 것이고, 화면이 그렇게 말해야 한다.
pub(crate) fn prepare_isolated_config(
    runtime_id: &str,
    app_data_dir: &Path,
    home: Option<&Path>,
) -> Result<PathBuf, String> {
    let spec = RUNTIMES
        .iter()
        .find(|s| s.id == runtime_id)
        .ok_or_else(|| format!("unknown-runtime:{runtime_id}"))?;

    let dir = app_data_dir.join("agent-config").join(spec.id);
    std::fs::create_dir_all(&dir).map_err(|err| format!("config-dir-failed:{err}"))?;

    if spec.id == "claude" {
        std::fs::write(dir.join("settings.json"), ISOLATED_CLAUDE_SETTINGS)
            .map_err(|err| format!("settings-write-failed:{err}"))?;
    }

    if let Some(home) = home {
        let source = home.join(spec.user_config_dir).join(spec.credentials_file);
        let link = dir.join(spec.credentials_file);
        if source.exists() {
            link_credentials(&source, &link)?;
        }
    }

    Ok(dir)
}

/// 이 실행기의 「설정을 어디서 읽나」 환경 변수 이름.
pub(crate) fn config_env_for(runtime_id: &str) -> Option<&'static str> {
    RUNTIMES
        .iter()
        .find(|s| s.id == runtime_id)
        .map(|s| s.config_env)
}

/// 자격증명 링크를 건다. 이미 올바른 곳을 가리키면 그대로 둔다.
fn link_credentials(source: &Path, link: &Path) -> Result<(), String> {
    if let Ok(existing) = std::fs::read_link(link) {
        if existing == source {
            return Ok(());
        }
    }
    // 남아 있던 것은 지운다 — 예전 홈으로 가는 끊긴 링크가 남으면 로그인이
    // 깨진 채로 「설정은 있는데 왜 안 되지」가 된다.
    let _ = std::fs::remove_file(link);

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, link)
            .map_err(|err| format!("credentials-link-failed:{err}"))
    }
    #[cfg(windows)]
    {
        // Windows 의 심볼릭 링크는 권한이 필요하다. 실패하면 링크 없이 진행하고
        // (로그인 화면이 뜨는 것이 조용히 비밀을 복사하는 것보다 낫다) 사유를
        // 그대로 올린다.
        std::os::windows::fs::symlink_file(source, link)
            .map_err(|err| format!("credentials-link-failed:{err}"))
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (source, link);
        Err("credentials-link-unsupported".into())
    }
}

/// 권한 요청 하나를 우리 정책으로 판정한다.
///
/// ## 왜 제목이 아니라 경로로 보나
///
/// 실측(2026-08-16)에서 권한 요청의 제목은 볼트 **안**이면 상대 경로
/// (`Write meeting-notes.md`), **밖**이면 절대 경로였다. 그 차이로 판정하면 문구가
/// 조금만 바뀌어도 정책이 조용히 뒤집힌다. 같은 요청의 원문에
/// `toolCall.rawInput.file_path` 가 절대 경로로 들어 있으므로 그것으로 판정한다.
///
/// 경로를 못 찾으면 **묻는다.** 모르는 것을 허용으로 기울이면, 판단할 수 없는
/// 요청일수록 그냥 통과하게 된다.
pub(crate) fn permission_verdict(vault_root: &Path, file_path: Option<&str>) -> PermissionVerdict {
    let Some(raw) = file_path else {
        return PermissionVerdict::Ask;
    };
    let resolved = resolve_for_comparison(Path::new(raw));
    let root = resolve_for_comparison(vault_root);
    if resolved.starts_with(&root) {
        PermissionVerdict::AllowInsideVault
    } else {
        PermissionVerdict::Ask
    }
}

/// 두 경로를 **같은 잣대로** 만든다.
///
/// 그냥 `canonicalize` 만 쓰면 안 되는 이유가 둘이다:
///
/// 1. **쓰려는 파일은 대개 아직 없다.** 없는 경로는 `canonicalize` 가 실패하므로
///    원본이 그대로 남는데, 볼트 루트는 존재해서 정규화된다. macOS 에서 그
///    비대칭이 바로 사고가 된다 — `/var/...` 가 `/private/var/...` 로 바뀌어,
///    **볼트 안인데 밖으로 판정**된다(2026-08-16 이 검사가 잡았다).
/// 2. 그렇다고 정규화를 아예 안 하면 볼트 안의 심볼릭 링크가 밖을 가리키는
///    경우를 「안」으로 세게 된다.
///
/// 그래서 **존재하는 가장 깊은 조상까지 정규화하고 나머지는 이어 붙인다.**
/// 존재하는 부분은 링크가 풀리고, 아직 없는 부분은 이름 그대로 남는다.
fn resolve_for_comparison(path: &Path) -> PathBuf {
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return canonical;
    }
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor = path;
    loop {
        if let Ok(canonical) = std::fs::canonicalize(cursor) {
            let mut out = canonical;
            for part in rest.iter().rev() {
                out.push(part);
            }
            return out;
        }
        match (cursor.file_name(), cursor.parent()) {
            (Some(name), Some(parent)) => {
                rest.push(name.to_os_string());
                cursor = parent;
            }
            // 더 올라갈 곳이 없다 — 정규화할 수 있는 조상이 하나도 없는
            // 경로다(상대 경로 등). 원본 그대로 비교한다.
            _ => return path.to_path_buf(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PermissionVerdict {
    /// 볼트 안이라 앱이 대신 허용한다.
    AllowInsideVault,
    /// 사용자에게 묻는다.
    Ask,
}

/// 한 줄을 읽되 **길이에 상한을 둔다**.
///
/// 어댑터가 개행 없이 끝없이 쓰면 표준 `read_line` 은 버퍼를 무한히 키우다가
/// 앱을 통째로 죽인다. 남이 만든 프로그램의 출력을 신뢰하지 않는다는 뜻이고,
/// 상한을 넘으면 그 줄을 **버리고 사실대로 알린다** — 조용히 잘라 내면 JSON 이
/// 반쪽이 된 채로 파서에 들어가서 더 이해하기 어려운 고장이 된다.
///
/// `Ok(None)` 은 스트림 끝. `Err` 는 상한 초과 또는 입출력 오류.
pub(crate) fn read_bounded_line<R: std::io::BufRead>(
    reader: &mut R,
    max_bytes: usize,
) -> std::io::Result<Option<Vec<u8>>> {
    let mut out: Vec<u8> = Vec::new();
    loop {
        let available = match reader.fill_buf() {
            Ok(buf) => buf,
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };
        if available.is_empty() {
            return Ok(if out.is_empty() { None } else { Some(out) });
        }
        match available.iter().position(|b| *b == b'\n') {
            Some(at) => {
                if out.len() + at > max_bytes {
                    reader.consume(at + 1);
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        format!("acp line exceeded {max_bytes} bytes"),
                    ));
                }
                out.extend_from_slice(&available[..at]);
                reader.consume(at + 1);
                // `\r\n` 으로 끝나는 줄도 받아 준다.
                if out.last() == Some(&b'\r') {
                    out.pop();
                }
                return Ok(Some(out));
            }
            None => {
                let len = available.len();
                if out.len() + len > max_bytes {
                    reader.consume(len);
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        format!("acp line exceeded {max_bytes} bytes"),
                    ));
                }
                out.extend_from_slice(available);
                reader.consume(len);
            }
        }
    }
}

/// 한 줄의 상한. 어댑터는 파일 내용을 통째로 실어 보내기도 하므로 넉넉해야
/// 하지만, 무한이어서는 안 된다.
pub(crate) const MAX_LINE_BYTES: usize = 16 * 1024 * 1024;

/// 얌전히 끝나기를 기다리는 시간. 넘으면 강제로 끝낸다.
const GRACEFUL_EXIT_WAIT: std::time::Duration = std::time::Duration::from_millis(1_000);

#[cfg(unix)]
fn process_is_running(pid: u32) -> bool {
    // 신호 0 은 「보내지 않고 보낼 수 있는지만 확인」이다.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// 프로세스 **그룹**에 신호를 보낸다. 그룹으로 못 보내면 리더에게라도 보낸다.
///
/// 그룹이 먼저인 이유: 어댑터는 자기 자식(진짜 CLI · MCP 서버 · 서브에이전트)을
/// 또 띄운다. 리더만 죽이면 손자들이 고아로 남아 **앱을 끈 뒤에도 계속 돈다.**
/// 참고 제품에서 유휴 에이전트 3개가 92 프로세스 · 7.1GB 를 쓰고 있는 것을
/// 실측했다 — 그 트리를 확실히 끝내는 것이 이 함수의 존재 이유다.
///
/// 폴백이 필요한 이유: macOS 에서 자손 하나가 다른 그룹으로 옮겨 갔거나 권한이
/// 다르면 그룹 신호가 `EPERM` 으로 실패한다. 그때 아무것도 안 하면 우리가 띄운
/// 프로세스가 그대로 남는다.
#[cfg(unix)]
fn signal_group_or_leader(pid: u32, signal: i32) -> Result<(), String> {
    let group = -(pid as i32);
    if unsafe { libc::kill(group, signal) } == 0 {
        return Ok(());
    }
    let group_err = std::io::Error::last_os_error();
    if !process_is_running(pid) {
        return Ok(()); // 이미 끝났다 — 실패가 아니다.
    }
    match group_err.raw_os_error() {
        Some(libc::EPERM) | Some(libc::ESRCH) => {
            if unsafe { libc::kill(pid as i32, signal) } == 0 {
                return Ok(());
            }
            let leader_err = std::io::Error::last_os_error();
            if leader_err.raw_os_error() == Some(libc::ESRCH) || !process_is_running(pid) {
                return Ok(());
            }
            Err(format!("failed to signal {pid}: {leader_err}"))
        }
        _ => Err(format!("failed to signal group {pid}: {group_err}")),
    }
}

/// 하네스와 **그것이 띄운 모든 것**을 끝낸다.
///
/// 순서: 얌전히(SIGTERM) → 최대 1초 기다림 → 강제로(SIGKILL). 어댑터가 자기
/// 자식을 정리할 틈을 주되, 안 끝나면 기다리지 않는다.
///
/// ⚠️ **Windows 는 이 조각의 범위 밖이다**(결정 원장 2026-08-16). Windows 에는
/// 프로세스 그룹이 없어서 Job Object 로 트리를 소유해야 하는데, 그건 별도
/// 조각이다. 그때까지 Windows 는 `taskkill /T` 로 트리를 끝내려 시도하고,
/// 그것이 실패하면 손자가 남을 수 있다 — 모르는 척하지 않고 여기 적어 둔다.
pub(crate) fn terminate_tree(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        signal_group_or_leader(pid, libc::SIGTERM)?;
        let deadline = std::time::Instant::now() + GRACEFUL_EXIT_WAIT;
        while std::time::Instant::now() < deadline {
            if !process_is_running(pid) {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        signal_group_or_leader(pid, libc::SIGKILL)
    }
    #[cfg(windows)]
    {
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|err| format!("taskkill failed: {err}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("taskkill exited with {status}"))
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        Err("terminate_tree is unsupported on this platform".into())
    }
}

/// 실제 디스크를 보는 기본 프로브.
pub(crate) fn real_probe() -> (
    impl Fn(&Path) -> bool,
    impl Fn(&Path) -> Vec<String>,
    impl Fn(&Path) -> Option<String>,
) {
    let is_executable = |path: &Path| -> bool {
        let Ok(meta) = std::fs::metadata(path) else {
            return false;
        };
        if !meta.is_file() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            meta.permissions().mode() & 0o111 != 0
        }
        #[cfg(not(unix))]
        {
            true
        }
    };
    let list_dir = |path: &Path| -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(path) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect()
    };
    // nvm 의 `alias/default` 한 줄만 읽는다. 임의 파일을 읽는 통로가 아니다.
    let read_text = |path: &Path| -> Option<String> {
        let meta = std::fs::metadata(path).ok()?;
        if !meta.is_file() || meta.len() > 4096 {
            return None;
        }
        std::fs::read_to_string(path).ok()
    };
    (is_executable, list_dir, read_text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn probe_with<'a>(
        files: &'a HashSet<PathBuf>,
        dirs: &'a std::collections::HashMap<PathBuf, Vec<String>>,
    ) -> (
        impl Fn(&Path) -> bool + 'a,
        impl Fn(&Path) -> Vec<String> + 'a,
        impl Fn(&Path) -> Option<String> + 'a,
    ) {
        (
            move |p: &Path| files.contains(p),
            move |p: &Path| dirs.get(p).cloned().unwrap_or_default(),
            move |_: &Path| None,
        )
    }

    fn empty_dirs() -> std::collections::HashMap<PathBuf, Vec<String>> {
        std::collections::HashMap::new()
    }

    #[test]
    fn path_entries_come_before_our_guesses() {
        // 사용자가 자기 셸에서 고른 것이 우리 추측을 이긴다. 순서가 뒤집히면
        // 두 버전이 깔린 기계에서 앱이 사용자가 안 고른 쪽을 쓴다.
        let files = HashSet::new();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        let path = std::env::join_paths([PathBuf::from("/from/path")]).unwrap();
        let out = candidate_bin_dirs(Some(Path::new("/home/me")), Some(&path), &probe);
        assert_eq!(out.first(), Some(&PathBuf::from("/from/path")));
        assert!(out.len() > 1, "잘 알려진 자리도 뒤에 붙어야 한다");
    }

    #[test]
    fn nvm_versions_are_offered_newest_first() {
        // 실측 사고 지점: 이 기기의 node 는 nvm 아래에만 있다. 문자열 정렬이면
        // v9 가 v24 보다 뒤로 가서 낡은 Node 를 먼저 집는다.
        let files = HashSet::new();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec![
                "v9.11.2".into(),
                "v24.16.0".into(),
                "v20.11.1".into(),
                "not-a-version".into(),
            ],
        );
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        let out = nvm_bin_dirs(Path::new("/home/me"), &probe);
        assert_eq!(
            out,
            vec![
                PathBuf::from("/home/me/.nvm/versions/node/v24.16.0/bin"),
                PathBuf::from("/home/me/.nvm/versions/node/v20.11.1/bin"),
                PathBuf::from("/home/me/.nvm/versions/node/v9.11.2/bin"),
            ],
            "숫자 순서로 내림차순이어야 하고, 버전이 아닌 이름은 빠져야 한다"
        );
    }

    /// 2026-08-16 실측이 잡아낸 결함. 처음엔 nvm 디렉터리를 후보 앞쪽에 두고
    /// 「최신 버전 먼저」로 골랐는데, 이 기기에서 `claude` 가 **낡은 v22 의
    /// bin 에만** 남아 있어서 사용자의 셸이 절대 안 쓰는 사본을 집었다
    /// (실제 `claude` 는 `~/.local/bin`). 버전 디렉터리는 전역 설치한 CLI 의
    /// 사본이 쌓이는 자리라 그렇다.
    #[test]
    fn a_stale_copy_in_an_old_nvm_version_does_not_beat_the_real_one() {
        let files: HashSet<PathBuf> = [
            "/home/me/.local/bin/claude",                        // 진짜
            "/home/me/.nvm/versions/node/v22.15.0/bin/claude",   // 낡은 사본
            "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec!["v22.15.0".into(), "v24.16.0".into()],
        );
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        let out = detect_runtimes(Some(Path::new("/home/me")), None, &probe);
        let claude = out.iter().find(|r| r.id == "claude").unwrap();
        assert_eq!(
            claude.cli_path.as_deref(),
            Some("/home/me/.local/bin/claude"),
            "낡은 nvm 사본을 집었다 — 사용자의 셸이 쓰는 것과 다른 바이너리다"
        );
    }

    /// nvm 이 「기본」이라고 적어 둔 버전이 최신보다 먼저다. 사용자가 일부러
    /// 낮은 버전을 쓰고 있는데 우리가 최신을 집으면, 그 프로젝트가 도는 Node 와
    /// 다른 Node 로 어댑터를 띄우게 된다.
    #[test]
    fn the_nvm_default_alias_wins_over_the_newest_version() {
        let files: HashSet<PathBuf> = [
            "/home/me/.nvm/versions/node/v20.11.1/bin/npx",
            "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec!["v20.11.1".into(), "v24.16.0".into()],
        );
        let alias = PathBuf::from("/home/me/.nvm/alias/default");
        let is_exec = |p: &Path| files.contains(p);
        let list = |p: &Path| dirs.get(p).cloned().unwrap_or_default();
        let read = |p: &Path| {
            if p == alias.as_path() {
                Some("v20.11.1\n".to_string())
            } else {
                None
            }
        };
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        let out = nvm_bin_dirs(Path::new("/home/me"), &probe);
        assert_eq!(
            out.first(),
            Some(&PathBuf::from("/home/me/.nvm/versions/node/v20.11.1/bin")),
            "기본으로 지정한 버전이 앞에 와야 한다"
        );
    }

    #[test]
    fn resolve_command_returns_none_instead_of_a_guessed_path() {
        // 없는 경로를 돌려주면 실패가 실행 시점으로 미뤄지고, 그때 사용자가 보는
        // 것은 우리가 쓴 문장이 아니라 OS 의 오류다.
        let files = HashSet::new();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        assert_eq!(
            resolve_command("claude", &[PathBuf::from("/usr/bin")], &probe),
            None
        );
    }

    #[test]
    fn detects_a_runtime_that_lives_only_under_nvm() {
        // 이 기기 실측 그대로: codex 와 npx 는 nvm 아래, claude 는 ~/.local/bin.
        // 둘 다 GUI 앱의 기본 PATH 밖이다.
        let files: HashSet<PathBuf> = [
            "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
            "/home/me/.nvm/versions/node/v24.16.0/bin/codex",
            "/home/me/.local/bin/claude",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec!["v24.16.0".into()],
        );
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };

        // PATH 는 GUI 앱이 받는 최소한만 — 여기에 아무것도 없다.
        let path = std::env::join_paths([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap();
        let out = detect_runtimes(Some(Path::new("/home/me")), Some(&path), &probe);

        let claude = out.iter().find(|r| r.id == "claude").unwrap();
        assert_eq!(claude.state, "ready", "PATH 밖에 있어도 찾아야 한다");
        assert_eq!(
            claude.cli_path.as_deref(),
            Some("/home/me/.local/bin/claude")
        );
        assert_eq!(
            claude.npx_path.as_deref(),
            Some("/home/me/.nvm/versions/node/v24.16.0/bin/npx")
        );
        assert!(
            claude.adapter_package.ends_with("@0.68.0"),
            "어댑터 버전은 못 박혀 있어야 한다: {}",
            claude.adapter_package
        );

        let codex = out.iter().find(|r| r.id == "codex").unwrap();
        assert_eq!(codex.state, "ready");
    }

    #[test]
    fn missing_cli_and_missing_node_are_different_answers() {
        // 「설치됨/아님」 두 값으로 뭉개면 화면이 무엇을 하라고 말할지 모른다.
        let mut files: HashSet<PathBuf> = HashSet::new();
        let dirs = empty_dirs();

        {
            // ① 아무것도 없다 → CLI 부터 없다.
            let (is_exec, list, read) = probe_with(&files, &dirs);
            let probe = FsProbe {
                is_executable: &is_exec,
                list_dir: &list,
                read_text: &read,
            };
            let out = detect_runtimes(None, None, &probe);
            assert!(out.iter().all(|r| r.state == "cli-missing"));
        }

        // ② CLI 는 있는데 npx 도 어댑터도 없다 → 띄울 방법이 없다.
        files.insert(PathBuf::from("/usr/local/bin/claude"));
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        let out = detect_runtimes(None, None, &probe);
        let claude = out.iter().find(|r| r.id == "claude").unwrap();
        assert_eq!(claude.state, "node-missing");
        assert_eq!(claude.cli_path.as_deref(), Some("/usr/local/bin/claude"));
    }

    #[test]
    fn an_installed_adapter_wins_over_npx() {
        // npx 는 첫 실행이 느리다. 이미 깔려 있으면 그걸 쓴다.
        let files: HashSet<PathBuf> = [
            "/usr/local/bin/claude",
            "/usr/local/bin/claude-agent-acp",
            "/usr/local/bin/npx",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        let out = detect_runtimes(None, None, &probe);
        let claude = out.iter().find(|r| r.id == "claude").unwrap();
        assert_eq!(claude.state, "ready");
        assert_eq!(
            claude.adapter_path.as_deref(),
            Some("/usr/local/bin/claude-agent-acp"),
            "설치된 어댑터를 찾아냈어야 한다"
        );
    }

    #[test]
    fn launch_prefers_an_installed_adapter_and_falls_back_to_pinned_npx() {
        let mut files: HashSet<PathBuf> = ["/usr/local/bin/claude", "/usr/local/bin/npx"]
            .iter()
            .map(PathBuf::from)
            .collect();
        let dirs = empty_dirs();

        {
            let (is_exec, list, read) = probe_with(&files, &dirs);
            let probe = FsProbe {
                is_executable: &is_exec,
                list_dir: &list,
                read_text: &read,
            };
            let launch = resolve_launch("claude", None, None, &probe).unwrap();
            assert_eq!(launch.program, PathBuf::from("/usr/local/bin/npx"));
            assert_eq!(
                launch.args,
                vec![
                    "-y".to_string(),
                    "@agentclientprotocol/claude-agent-acp@0.68.0".to_string()
                ],
                "설치돼 있지 않으면 버전 못 박은 npx 로 띄운다"
            );
        }

        files.insert(PathBuf::from("/usr/local/bin/claude-agent-acp"));
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        let launch = resolve_launch("claude", None, None, &probe).unwrap();
        assert_eq!(
            launch.program,
            PathBuf::from("/usr/local/bin/claude-agent-acp")
        );
        assert!(launch.args.is_empty(), "설치돼 있으면 npx 를 건너뛴다");
    }

    #[test]
    fn launch_hands_the_child_a_path_that_can_find_the_real_cli() {
        // 절반만 푼 상태를 막는 검사다. 우리가 어댑터를 절대 경로로 띄워도
        // 그 어댑터는 다시 `claude` 를 **이름으로** 찾는다 — 부모가 못 찾던
        // PATH 를 그대로 물려주면 어댑터가 같은 자리에서 막힌다.
        let files: HashSet<PathBuf> = [
            "/home/me/.local/bin/claude",
            "/home/me/.nvm/versions/node/v24.16.0/bin/npx",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let mut dirs = empty_dirs();
        dirs.insert(
            PathBuf::from("/home/me/.nvm/versions/node"),
            vec!["v24.16.0".into()],
        );
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        let launch = resolve_launch("claude", Some(Path::new("/home/me")), None, &probe).unwrap();
        assert!(
            launch.path_env.contains("/home/me/.local/bin"),
            "자식 PATH 에 CLI 가 있는 자리가 없다: {}",
            launch.path_env
        );
        assert!(
            launch
                .path_env
                .contains("/home/me/.nvm/versions/node/v24.16.0/bin"),
            "자식 PATH 에 node 자리가 없다: {}",
            launch.path_env
        );
    }

    #[test]
    fn launch_reports_which_half_is_missing() {
        let dirs = empty_dirs();

        // CLI 가 없다 — 사용자가 그 도구를 깔아야 한다.
        let none: HashSet<PathBuf> = HashSet::new();
        let (is_exec, list, read) = probe_with(&none, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        assert!(resolve_launch("claude", None, None, &probe)
            .unwrap_err()
            .starts_with("cli-missing:"));

        // CLI 는 있는데 띄울 방법이 없다 — 다른 처방이 필요하다.
        let cli_only: HashSet<PathBuf> = ["/usr/local/bin/claude"].iter().map(PathBuf::from).collect();
        let (is_exec, list, read) = probe_with(&cli_only, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
        };
        assert_eq!(
            resolve_launch("claude", None, None, &probe).unwrap_err(),
            "node-missing"
        );

        // 모르는 실행기를 조용히 통과시키지 않는다.
        assert!(resolve_launch("nope", None, None, &probe)
            .unwrap_err()
            .starts_with("unknown-runtime:"));
    }

    #[test]
    fn bounded_line_reader_splits_lines_and_tolerates_crlf() {
        let mut input = std::io::BufReader::new(&b"{\"a\":1}\n{\"b\":2}\r\n"[..]);
        assert_eq!(
            read_bounded_line(&mut input, 1024).unwrap().as_deref(),
            Some(&b"{\"a\":1}"[..])
        );
        assert_eq!(
            read_bounded_line(&mut input, 1024).unwrap().as_deref(),
            Some(&b"{\"b\":2}"[..])
        );
        assert_eq!(read_bounded_line(&mut input, 1024).unwrap(), None);
    }

    #[test]
    fn bounded_line_reader_refuses_an_endless_line_instead_of_eating_memory() {
        // 남이 만든 프로그램의 출력을 신뢰하지 않는다. 개행 없이 계속 쓰면
        // 표준 read_line 은 버퍼를 무한히 키우다가 앱을 통째로 죽인다.
        let flood = vec![b'x'; 4096];
        let mut input = std::io::BufReader::new(&flood[..]);
        let err = read_bounded_line(&mut input, 64).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn bounded_line_reader_drops_the_oversized_line_and_keeps_reading() {
        // 잘라서 넘기면 반쪽 JSON 이 파서에 들어가 더 이해하기 어려운 고장이
        // 된다. 그 줄만 버리고 다음 줄부터 이어 간다.
        let mut data = vec![b'x'; 200];
        data.push(b'\n');
        data.extend_from_slice(b"{\"ok\":true}\n");
        let mut input = std::io::BufReader::new(&data[..]);
        assert!(read_bounded_line(&mut input, 64).is_err());
        assert_eq!(
            read_bounded_line(&mut input, 64).unwrap().as_deref(),
            Some(&b"{\"ok\":true}"[..]),
            "상한을 넘긴 줄 하나 때문에 세션 전체가 죽으면 안 된다"
        );
    }

    /// 손자가 죽을 때까지 기다린다 — 신호는 즉시 도착하지만 회수는 비동기다.
    #[cfg(unix)]
    fn wait_until_gone(pid: u32, within: std::time::Duration) -> bool {
        let deadline = std::time::Instant::now() + within;
        while std::time::Instant::now() < deadline {
            if !process_is_running(pid) {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        !process_is_running(pid)
    }

    /// 진짜 프로세스를 띄워서 트리 정리를 잰다.
    ///
    /// 이 검사가 없으면 「죽인다」는 우리 주장일 뿐이다. 실제로 참고 제품에서
    /// 유휴 에이전트 3개가 92 프로세스 · 7.1GB 로 떠 있는 것을 봤다 — 남는
    /// 프로세스는 이론이 아니라 관측된 일이다.
    #[cfg(unix)]
    #[test]
    fn terminate_tree_reaps_grandchildren_that_a_naive_kill_would_orphan() {
        use std::io::{BufRead, BufReader};
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};

        // 「어댑터가 자기 자식을 또 띄운다」를 최소로 재현한다: sh 가 sleep 을
        // 배경으로 띄우고 그 pid 를 알려 준 뒤 자기도 잔다.
        let spawn_tree = || {
            let mut child = Command::new("/bin/sh")
                .arg("-c")
                .arg("sleep 30 & echo $!; sleep 30")
                .stdout(Stdio::piped())
                .process_group(0)
                .spawn()
                .expect("sh 를 띄우지 못했다");
            let mut out = BufReader::new(child.stdout.take().unwrap());
            let mut line = String::new();
            out.read_line(&mut line).unwrap();
            let grandchild: u32 = line.trim().parse().expect("손자 pid 를 못 읽었다");
            (child, grandchild)
        };

        // ① 순진하게 자식만 죽이면 손자는 살아남는다 — 이게 우리가 피하려는 것.
        {
            let (mut child, grandchild) = spawn_tree();
            assert!(process_is_running(grandchild));
            child.kill().unwrap();
            let _ = child.wait();
            assert!(
                process_is_running(grandchild),
                "이 검사의 전제가 깨졌다 — 순진한 kill 이 손자까지 죽였다면 \
                 이 플랫폼에서는 트리 정리가 필요 없다는 뜻이다"
            );
            // 남긴 채로 두지 않는다.
            let _ = terminate_tree(grandchild);
        }

        // ② 그룹째 끝내면 손자도 함께 끝난다.
        let (mut child, grandchild) = spawn_tree();
        assert!(process_is_running(grandchild));
        terminate_tree(child.id()).expect("트리를 끝내지 못했다");
        let _ = child.wait();
        assert!(
            wait_until_gone(grandchild, std::time::Duration::from_secs(3)),
            "손자 {grandchild} 가 살아남았다 — 앱을 꺼도 계속 도는 상태"
        );
    }

    /// 이미 끝난 프로세스를 끝내라고 해도 오류가 아니다. 앱 종료 경로에서
    /// 이것이 실패로 취급되면 종료가 시끄러워지고, 사용자는 자기가 뭘
    /// 잘못했는지 모른 채 대화상자를 본다.
    #[cfg(unix)]
    #[test]
    fn terminating_an_already_dead_process_is_not_an_error() {
        use std::process::{Command, Stdio};
        let mut child = Command::new("/bin/sh")
            .arg("-c")
            .arg("exit 0")
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let pid = child.id();
        let _ = child.wait();
        assert!(terminate_tree(pid).is_ok());
    }

    /// 이 검사가 지키는 것: 앱이 띄우는 세션은 사용자의 전역 설정을 물려받지
    /// 않는다. 실측(2026-08-16)에서 물려받은 세션은 볼트 밖에 파일을 쓰면서
    /// **한 번도 묻지 않았다** — 소유자의 설정이 `Bash(*)`·`Write(*)` 를 미리
    /// 허용해 두고 있었기 때문이다.
    #[test]
    fn isolated_config_never_inherits_a_permissive_allow_list() {
        let settings: serde_json::Value = serde_json::from_str(ISOLATED_CLAUDE_SETTINGS)
            .expect("격리 설정이 올바른 JSON 이어야 한다");
        let perms = &settings["permissions"];
        assert_eq!(perms["defaultMode"], "default", "모델이 알아서 승인하면 관문이 없다");
        for key in ["allow", "deny", "ask"] {
            assert_eq!(
                perms[key].as_array().map(|a| a.len()),
                Some(0),
                "{key} 가 비어 있지 않다 — 미리 허용된 것은 모드와 무관하게 통과한다"
            );
        }
    }

    #[test]
    fn prepare_isolated_config_writes_our_settings_and_links_credentials() {
        let base = std::env::temp_dir().join(format!("atlas-acp-cfg-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let app_data = base.join("appdata");
        let home = base.join("home");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude").join(".credentials.json"), "{\"t\":1}").unwrap();

        let dir = prepare_isolated_config("claude", &app_data, Some(&home)).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("settings.json")).unwrap(),
            ISOLATED_CLAUDE_SETTINGS
        );
        #[cfg(unix)]
        {
            let link = dir.join(".credentials.json");
            assert_eq!(
                std::fs::read_link(&link).unwrap(),
                home.join(".claude").join(".credentials.json"),
                "자격증명은 복사가 아니라 링크여야 한다"
            );
        }

        // 사용자가 우리 설정을 고쳐 관문을 열어 둔 채 잊는 일을 막는다 —
        // 이 디렉터리는 앱의 것이고 매번 다시 쓴다.
        std::fs::write(dir.join("settings.json"), "{\"permissions\":{\"allow\":[\"Bash(*)\"]}}").unwrap();
        let dir2 = prepare_isolated_config("claude", &app_data, Some(&home)).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir2.join("settings.json")).unwrap(),
            ISOLATED_CLAUDE_SETTINGS,
            "다시 준비할 때 우리 설정으로 되돌아와야 한다"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn prepare_isolated_config_without_credentials_does_not_invent_a_link() {
        // 로그인하지 않은 사용자에게 끊긴 링크를 만들어 주면 「설정은 있는데 왜
        // 안 되지」가 된다. 그냥 두고 화면이 로그인하라고 말해야 한다.
        let base = std::env::temp_dir().join(format!("atlas-acp-nocred-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let dir = prepare_isolated_config("claude", &base.join("appdata"), Some(&home)).unwrap();
        assert!(!dir.join(".credentials.json").exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn permission_policy_reads_the_path_not_the_title() {
        // 실측: 볼트 안이면 제목이 상대 경로, 밖이면 절대 경로였다. 문구로
        // 판정하면 문구가 바뀌는 날 정책이 조용히 뒤집힌다.
        let base = std::env::temp_dir().join(format!("atlas-acp-perm-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();

        assert_eq!(
            permission_verdict(&vault, Some(vault.join("notes.md").to_str().unwrap())),
            PermissionVerdict::AllowInsideVault
        );
        assert_eq!(
            permission_verdict(&vault, Some(outside.join("notes.md").to_str().unwrap())),
            PermissionVerdict::Ask,
            "볼트 밖은 반드시 물어야 한다"
        );
        assert_eq!(
            permission_verdict(&vault, Some("../escape.md")),
            PermissionVerdict::Ask,
            "상대 경로로 올라가는 것도 밖이다"
        );
        assert_eq!(
            permission_verdict(&vault, None),
            PermissionVerdict::Ask,
            "경로를 모르면 묻는다 — 판단할 수 없는 것을 통과시키지 않는다"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_inside_the_vault_pointing_out_is_not_inside() {
        let base = std::env::temp_dir().join(format!("atlas-acp-link-{}", std::process::id()));
        let vault = base.join("vault");
        let outside = base.join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let real = outside.join("secret.md");
        std::fs::write(&real, "x").unwrap();
        let trap = vault.join("looks-inside.md");
        std::os::unix::fs::symlink(&real, &trap).unwrap();

        assert_eq!(
            permission_verdict(&vault, Some(trap.to_str().unwrap())),
            PermissionVerdict::Ask,
            "볼트 안처럼 보이는 링크가 밖을 가리키면 안이 아니다"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn the_runtime_catalog_is_not_empty_and_pins_every_adapter() {
        // 목록이 비면 탐지는 통과하면서 아무것도 안 찾는다 — 빈 집합 위에서
        // 도는 게이트는 게이트가 아니다.
        assert!(!RUNTIMES.is_empty());
        for spec in RUNTIMES {
            assert!(
                spec.adapter_package.contains('@') && spec.adapter_package.rsplit('@').next().is_some_and(|v| v.chars().next().is_some_and(|c| c.is_ascii_digit())),
                "{} 의 어댑터 버전이 못 박혀 있지 않다: {}",
                spec.id,
                spec.adapter_package
            );
        }
    }
}

#[cfg(test)]
mod real_machine_probe {
    use super::*;

    /// 진짜 디스크로 재는 진단용 — `cargo test -- --ignored --nocapture` 로만 돈다.
    /// 기계마다 답이 다르므로 단언하지 않고 **보여 준다**.
    #[test]
    #[ignore]
    fn show_what_this_machine_has() {
        let (is_executable, list_dir, read_text) = real_probe();
        let probe = FsProbe { is_executable: &is_executable, list_dir: &list_dir, read_text: &read_text };
        let home = std::env::var_os("HOME").map(PathBuf::from);
        // GUI 앱이 받는 빈약한 PATH 를 흉내 낸다 — 터미널 PATH 를 쓰면 이 진단이
        // 정작 재려던 것을 못 잰다.
        let gui_path = std::env::join_paths([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap();
        for r in detect_runtimes(home.as_deref(), Some(&gui_path), &probe) {
            println!("{:>8} · {:<14} cli={:?} adapter={:?} npx={:?}", r.state, r.id, r.cli_path, r.adapter_path, r.npx_path);
        }
        println!("--- launch ---");
        for id in ["claude", "codex"] {
            match resolve_launch(id, home.as_deref(), Some(&gui_path), &probe) {
                Ok(l) => println!("{id}: {:?} {:?}", l.program, l.args),
                Err(e) => println!("{id}: 실패 {e}"),
            }
        }
    }
}
