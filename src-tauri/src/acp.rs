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

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

/// 커밋된 ACP 레지스트리 스냅샷의 항목 하나.
///
/// 목록의 정본은 `src-tauri/src/acp-registry.json` 이고, 그것은
/// `scripts/build-acp-registry.mjs` 가 만든다. **런타임에 받아오지 않는다** —
/// 앱을 켤 때마다 CDN 에 붙는 것은 사용자가 켠 적 없는 통신이고, 비행기
/// 안에서는 목록이 비어 버린다.
#[derive(Debug, Clone, serde::Deserialize)]
pub(crate) struct RegistryAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub website: Option<String>,
    pub license: Option<String>,
    /// 우리가 **실제로 재 본** 것인가. 화면이 안 해 본 것을 해 본 것처럼
    /// 말하지 않기 위한 표시다.
    pub verified: bool,
    /// 그 어댑터가 감싸는 진짜 CLI 의 실행 파일 이름. 모르면 `None` —
    /// 짐작해서 채우면 화면이 없는 이유를 지어내게 된다.
    pub cli: Option<String>,
    /// 번들된 아이콘 경로(`/acp-icons/<id>.svg`). 빌드 때 받아 두므로 앱은
    /// 이미지를 받으러 나가지 않는다.
    pub icon: Option<String>,
    /// 그 벤더의 브랜드 색(`#RRGGBB`). 레지스트리 아이콘은 전부 단색이라
    /// 색은 빌드 스크립트가 따로 붙여 준다. **사람이 확인한 짝만** 값이 있고,
    /// 없으면 화면이 무채색으로 그린다 — 틀린 브랜드 색이 무채색보다 나쁘다.
    #[serde(default, rename = "brandInk")]
    pub brand_ink: Option<String>,
    pub launch: RegistryLaunch,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum RegistryLaunch {
    /// `npx -y <package> <args…>`
    Npx {
        package: String,
        #[serde(default)]
        args: Vec<String>,
    },
    /// `uvx <package> <args…>`
    Uvx {
        package: String,
        #[serde(default)]
        args: Vec<String>,
    },
    /// 사용자가 이미 설치한 실행 파일.
    ///
    /// ⚠️ **여기 주석이 오래 「앱이 대신 받아 오지 않는다」였다** — 2026-08-20
    /// 에 조건부로 바뀌었다(원장 (88)). 대신 설치는 넷을 전부 갖출 때만 한다:
    /// 사용자가 누른다 · 무엇을 실행하는지 먼저 보여 준다 · 앱 전용 자리에만
    /// 깐다 · 버전을 고정한다. 그 조건과 근거는 `.claude/rules/forbidden.md`
    /// 의 「에이전트 도구를 대신 설치해 주는 것」 절에 있다.
    ///
    /// 이 갈래(`Binary`) 자체는 그것과 무관하다 — **이미 PATH 에 있는 것을
    /// 그대로 띄우는** 경우다.
    Binary {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
}

#[derive(Debug, Clone, serde::Deserialize)]
struct RegistrySnapshot {
    agents: Vec<RegistryAgent>,
}

/// 빌드에 박아 넣은 스냅샷. 파일이 깨져 있으면 **빌드가 아니라 실행이** 실패해야
/// 하므로, 여기서 한 번만 파싱하고 실패하면 빈 목록으로 둔다 — 목록이 비면
/// 화면이 「찾은 것이 없다」고 말하지, 잘못된 것을 띄우지 않는다.
fn registry() -> &'static [RegistryAgent] {
    static REGISTRY: std::sync::OnceLock<Vec<RegistryAgent>> = std::sync::OnceLock::new();
    REGISTRY.get_or_init(|| {
        serde_json::from_str::<RegistrySnapshot>(include_str!("acp-registry.json"))
            .map(|s| s.agents)
            .unwrap_or_default()
    })
}

pub(crate) fn registry_agent(id: &str) -> Option<&'static RegistryAgent> {
    registry().iter().find(|a| a.id == id)
}

/// 설정을 격리하는 방법 — **우리가 실제로 재 본 실행기만** 여기 있다.
///
/// 격리는 실행기마다 다른 환경 변수와 자격증명 파일을 알아야 하고, 그것을
/// 짐작으로 채우면 로그인이 조용히 깨진다. 그래서 이 표는 레지스트리가 아니라
/// 실측에서 자란다.
#[derive(Debug, Clone, Copy)]
pub(crate) struct IsolationSpec {
    pub id: &'static str,
    /// 이 실행기가 「설정을 어디서 읽나」를 정하는 환경 변수.
    pub config_env: &'static str,
    /// 그 설정 디렉터리 안의 자격증명 파일 이름. 격리하면 로그인이 깨지므로
    /// 이 파일만 사용자의 원본으로 **링크**한다(복사하지 않는다).
    pub credentials_file: &'static str,
    /// 사용자의 원본 설정 디렉터리(홈 기준 상대 경로).
    pub user_config_dir: &'static str,
}

pub(crate) const ISOLATION: &[IsolationSpec] = &[
    IsolationSpec {
        id: "claude-acp",
        config_env: "CLAUDE_CONFIG_DIR",
        credentials_file: ".credentials.json",
        user_config_dir: ".claude",
    },
];

// ⚠️ **codex 는 여기 없다 — 재 봤더니 안 됐다** (2026-08-16 실측).
//
// `CODEX_HOME` 을 격리한 디렉터리로 돌리고 `approval_policy = "on-request"` ·
// `sandbox_mode = "workspace-write"` 를 적어 두었는데, 세션의 기본 모드는
// `agent` 로 떴고(codex 의 모드 이름은 read-only/agent/agent-full-access 로
// claude 와 아예 다르다) 작업 폴더 **밖**에 파일을 쓰면서 권한 요청이 **0회**
// 였다.
//
// 그래서 등재하지 않는다. 등재해 두면 화면이 「이 도구는 앱이 막아 준다」고
// 말하게 되고, 그건 우리가 확인하지 않은 것을 확인한 것처럼 말하는 것이다.
// codex 를 막으려면 그 도구의 승인 모델을 따로 파야 하고, 그건 다음 조각이다.

fn isolation_for(id: &str) -> Option<&'static IsolationSpec> {
    ISOLATION.iter().find(|s| s.id == id)
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

pub(crate) type LoginProbe<'a> = dyn Fn(&str, &Path, &[&str], &str) -> Option<bool> + 'a;

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
    /// 그 CLI 에 「로그인돼 있나」를 물어본다. `None` = 안 물어봤다(모른다).
    ///
    /// 실물에서는 그 CLI 를 짧게 띄워 **종료 코드만** 본다. 검사에서는 가짜를
    /// 꽂는다 — 이 판정 하나 때문에 검사가 진짜 프로세스를 띄우게 두지 않는다.
    pub login_ok: &'a LoginProbe<'a>,
}

/**
 * 「로그인돼 있나」를 물어보는 명령 — **우리가 실제로 재 본 것만.**
 *
 * ## 왜 필요한가 (2026-08-16 소유자 지적)
 *
 * *"나도 원래 claude code, codex 다 있는데도 각 에이전트에 버튼 눌러서
 * 세팅했었는데? 지금 atlas 는 바로 준비됨이던데 확인이 필요할 듯"*
 *
 * 맞는 지적이었다. 우리 「준비됨」은 **파일이 그 자리에 있나**만 봤다. 그런데
 * 설치는 했지만 로그인은 안 한 사람에게도 그렇게 말하고 있었고, 그 사람이
 * 대화를 열면 `Authentication required` 로 죽는다(이미 실측해 둔 실패다).
 *
 * ⚠️ **출력은 읽지 않는다. 종료 코드만 본다.** `claude auth status` 는 이메일과
 * 조직 ID 까지 돌려준다(실측). 그걸 우리가 읽을 이유가 없고, 읽으면 신뢰
 * 헌장이 막는 종류의 일이 된다 — 화면에 안 띄우더라도 프로세스 메모리에
 * 들어오는 것 자체를 안 한다.
 *
 * 재 본 값(2026-08-16): `claude auth status` 300ms · `codex login status` 45ms,
 * 둘 다 로그인 상태에서 exit 0.
 */
pub(crate) const LOGIN_PROBE: &[(&str, &[&str])] = &[
    ("claude-acp", &["auth", "status"]),
    ("codex-acp", &["login", "status"]),
];

fn login_probe_args(runtime_id: &str) -> Option<&'static [&'static str]> {
    LOGIN_PROBE
        .iter()
        .find(|(id, _)| *id == runtime_id)
        .map(|(_, args)| *args)
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
                    .is_some_and(|w| parts.len() >= w.len() && parts[..w.len()] == w[..])
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
    // `managed_bin` — 앱이 대신 깔아 준 것이 사는 자리. **맨 뒤에 붙는다**:
    // 사용자가 자기 손으로 깐 것이 언제나 이긴다(이 파일의 PATH 순서 계약).
    managed_bin: Option<&Path>,
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

    // 앱이 깐 것은 **맨 뒤**다. 사용자가 자기 손으로 깐 것을 우리가 이기면,
    // 「터미널에선 되는데 앱에서만 다르다」가 그 자리에서 태어난다.
    if let Some(bin) = managed_bin {
        push(bin.to_path_buf(), &mut dirs);
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
    pub description: String,
    pub website: Option<String>,
    pub license: Option<String>,
    /// 우리가 실제로 재 본 것인가.
    pub verified: bool,
    pub icon: Option<String>,
    /// 그 벤더의 브랜드 색. 없으면 화면이 무채색으로 그린다.
    pub brand_ink: Option<String>,
    /// `npx` · `uvx` · `binary`
    pub launch_kind: String,
    /// `ready` · `cli-unknown` · `cli-missing` · `node-missing` · `uvx-missing` · `binary-missing`
    ///
    /// 여섯인 이유는 **각각 사용자가 할 일이 다르기** 때문이다. 「설치됨/아님」
    /// 둘로 뭉개면 화면이 무엇을 하라고 말해야 할지 모른다. 그리고 `cli-unknown`
    /// 은 사용자가 할 일이 아니라 **우리가 할 일**이 남았다는 뜻이다 —
    /// `UNDERLYING_CLI` 에 그 도구의 실행 파일 이름을 적으면 사라진다.
    pub state: String,
    /// 찾아낸 진짜 CLI 절대 경로 (아는 경우만).
    pub cli_path: Option<String>,
    /// 전역 설치된 어댑터/실행 파일 절대 경로. 있으면 npx 를 건너뛴다.
    pub adapter_path: Option<String>,
    /// npx 로 부를 때의 **버전 못 박은** 패키지 이름 (npx 갈래만).
    pub adapter_package: Option<String>,
    /// 이 실행기의 설정을 앱이 격리할 수 있는가. 못 하면 사용자의 전역 설정을
    /// 물려받게 되므로 **권한 관문이 없다** — 화면이 그 사실을 말해야 한다.
    pub isolated: bool,
}

/// **실제로 띄울 프로그램**을 찾는다. 상태 표시와 실행이 같은 답을 쓰게 하는
/// 한 곳이다 — 갈라지면 화면이 「이걸 띄운다」고 말한 것과 다른 것이 뜬다.
///
/// npx 갈래는 전역 설치된 어댑터가 있으면 그것을 쓴다(npx 는 첫 실행이 느리다).
fn resolve_program(
    launch: &RegistryLaunch,
    dirs: &[PathBuf],
    probe: &FsProbe<'_>,
) -> Option<PathBuf> {
    match launch {
        RegistryLaunch::Npx { package, .. } => adapter_bin_name(package)
            .and_then(|bin| resolve_command(&bin, dirs, probe))
            .or_else(|| resolve_command("npx", dirs, probe)),
        RegistryLaunch::Uvx { .. } => resolve_command("uvx", dirs, probe),
        RegistryLaunch::Binary { command, .. } => resolve_command(command, dirs, probe),
    }
}

/// 띄울 방법이 없을 때의 사유 코드 — 실행 방식마다 사용자가 할 일이 다르다.
fn launcher_missing_state(launch: &RegistryLaunch) -> &'static str {
    match launch {
        RegistryLaunch::Npx { .. } => "node-missing",
        RegistryLaunch::Uvx { .. } => "uvx-missing",
        RegistryLaunch::Binary { .. } => "binary-missing",
    }
}

/// 이 기기의 실행기 상태를 전부 판정한다 — 레지스트리에 등재된 모든 항목.
///
/// 판정 순서가 계약이다: **CLI 가 없는 것이 먼저다.** 그게 사용자가 할 일이
/// 더 분명하기 때문이다(그 도구를 설치하라). Node 가 없다는 답은 도구는 있는데
/// 띄울 방법이 없을 때만 유용하다.
pub(crate) fn detect_runtimes(
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
    managed_bin: Option<&Path>,
) -> Vec<AcpRuntimeStatus> {
    let dirs = candidate_bin_dirs(home, path_env, probe, managed_bin);
    // 로그인 확인도 어댑터를 띄울 때와 **같은 PATH** 를 본다. 안 그러면 래퍼가
    // node 를 못 찾아 실패하고, 그 실패가 「로그인 안 됨」으로 읽힌다.
    let child_path = std::env::join_paths(dirs.iter())
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default();

    registry()
        .iter()
        .map(|agent| {
            let cli = agent
                .cli
                .as_deref()
                .and_then(|name| resolve_command(name, &dirs, probe));
            let program = resolve_program(&agent.launch, &dirs, probe);

            /*
             * 도구도 있고 띄울 수도 있다 — 그런데 **로그인은 했나.** 재 본
             * 실행기에만 물어본다(`LOGIN_PROBE`). 안 물어본 것은 `None` 이고,
             * 그건 「로그인 안 됨」이 아니라 「모른다」다.
             */
            let login_ok = cli
                .as_deref()
                .zip(login_probe_args(&agent.id))
                .and_then(|(path, args)| (probe.login_ok)(&agent.id, path, args, &child_path));

            let state = if agent.cli.is_some() && cli.is_none() {
                "cli-missing"
            } else if program.is_none() {
                launcher_missing_state(&agent.launch)
            } else if login_ok == Some(false) {
                /*
                 * 도구는 있는데 로그인이 안 돼 있다. 「준비됨」이라고 말하면
                 * 사용자가 대화를 열어 보고서야 `Authentication required` 를
                 * 만난다 — 화면이 먼저 말해야 하는 것이고, 사용자가 할 일도
                 * 분명하다(그 도구에서 로그인).
                 */
                "login-needed"
            } else if agent.cli.is_none() {
                /*
                 * ⚠️ **여기가 「준비됨」이었다** (2026-08-16 소유자 지적:
                 * *"우리는 지금 이렇게 다 보여서 좀 이상한데"*).
                 *
                 * 이 갈래는 「그 도구가 이 컴퓨터에 있다」가 아니라 **「우리가
                 * 이 어댑터가 무슨 CLI 를 감싸는지 안 적어 뒀다」**는 뜻이다.
                 * `UNDERLYING_CLI` 에 12개만 있어서 나머지 26개는 확인할
                 * 방법 자체가 없는데, npx 가 있다는 이유로 전부 「준비됨」이
                 * 됐다 — 38개 중 20개가 그렇게 초록 배지를 달고 있었다.
                 *
                 * 그건 화면이 **해 본 적 없는 것을 해 본 것처럼 말하는 것**이고,
                 * 이 제품이 「곧 됩니다」를 안 쓰는 것과 같은 규율에 걸린다.
                 * 띄우는 것은 여전히 되므로 목록에서 빼지 않는다 — 상태만
                 * 정직해진다.
                 */
                "cli-unknown"
            } else {
                "ready"
            };

            AcpRuntimeStatus {
                id: agent.id.clone(),
                label: agent.name.clone(),
                description: agent.description.clone(),
                website: agent.website.clone(),
                license: agent.license.clone(),
                verified: agent.verified,
                icon: agent.icon.clone(),
                brand_ink: agent.brand_ink.clone(),
                launch_kind: match agent.launch {
                    RegistryLaunch::Npx { .. } => "npx",
                    RegistryLaunch::Uvx { .. } => "uvx",
                    RegistryLaunch::Binary { .. } => "binary",
                }
                .to_string(),
                state: state.to_string(),
                cli_path: cli.map(to_string_lossy),
                adapter_path: program.map(to_string_lossy),
                adapter_package: match &agent.launch {
                    RegistryLaunch::Npx { package, .. } | RegistryLaunch::Uvx { package, .. } => {
                        Some(package.clone())
                    }
                    RegistryLaunch::Binary { .. } => None,
                },
                isolated: isolation_for(&agent.id).is_some(),
            }
        })
        .collect()
}

/// 실행기 하나를 띄우기 위한 값들을 푼다. 못 띄우면 **사람이 읽을 수 있는
/// 사유 코드**를 돌려준다.
pub(crate) fn resolve_launch(
    runtime_id: &str,
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    probe: &FsProbe<'_>,
    managed_bin: Option<&Path>,
) -> Result<AcpLaunch, String> {
    let agent = registry_agent(runtime_id).ok_or_else(|| format!("unknown-runtime:{runtime_id}"))?;
    let dirs = candidate_bin_dirs(home, path_env, probe, managed_bin);
    let joined = std::env::join_paths(dirs.iter())
        .map_err(|err| format!("path-join-failed:{err}"))?
        .to_string_lossy()
        .to_string();

    if let Some(cli) = agent.cli.as_deref() {
        if resolve_command(cli, &dirs, probe).is_none() {
            return Err(format!("cli-missing:{cli}"));
        }
    }

    match &agent.launch {
        RegistryLaunch::Binary { command, args } => {
            let program = resolve_command(command, &dirs, probe)
                .ok_or_else(|| format!("binary-missing:{command}"))?;
            Ok(AcpLaunch {
                program,
                args: args.clone(),
                path_env: joined,
            })
        }
        RegistryLaunch::Npx { package, args } => {
            // 이미 전역 설치돼 있으면 그것을 쓴다 — npx 는 첫 실행이 느리다.
            // 패키지 이름의 마지막 조각이 대개 실행 파일 이름이다
            // (`@agentclientprotocol/claude-agent-acp@<version>` → `claude-agent-acp`).
            if let Some(installed) =
                adapter_bin_name(package).and_then(|bin| resolve_command(&bin, &dirs, probe))
            {
                return Ok(AcpLaunch {
                    program: installed,
                    args: args.clone(),
                    path_env: joined,
                });
            }
            let npx = resolve_command("npx", &dirs, probe).ok_or("node-missing")?;
            // `-y` 는 「설치할까요?」 프롬프트를 끈다. 우리에겐 답할 사람이 없다 —
            // 물어보면 프로세스가 조용히 멈춘 채로 남는다.
            let mut full = vec!["-y".to_string(), package.clone()];
            full.extend(args.iter().cloned());
            Ok(AcpLaunch {
                program: npx,
                args: full,
                path_env: joined,
            })
        }
        RegistryLaunch::Uvx { package, args } => {
            let uvx = resolve_command("uvx", &dirs, probe).ok_or("uvx-missing")?;
            let mut full = vec![package.clone()];
            full.extend(args.iter().cloned());
            Ok(AcpLaunch {
                program: uvx,
                args: full,
                path_env: joined,
            })
        }
    }
}

fn to_string_lossy(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

/// `@scope/name@1.2.3` · `name@1.2.3` → `name`. 버전과 스코프를 벗긴다.
pub(crate) fn adapter_bin_name(package: &str) -> Option<String> {
    let without_scope = package.rsplit('/').next()?;
    // 스코프 없는 `name@1.2.3` 도 같은 규칙으로 잘린다.
    let name = without_scope.split('@').next().filter(|s| !s.is_empty())?;
    Some(name.to_string())
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

// ─── npx 캐시 자기 치유 ────────────────────────────────────────────────────
//
// ## 왜 (2026-08-19 소유자 실기계)
//
// 첫 실행의 npx 가 어댑터 43MB 를 받다가 중간에 끊기면(사용자가 「멈춘 줄
// 알고」 앱을 끄는 것이 전형) `~/.npm/_npx/<해시>/` 에 **반쯤 만들어진 항목**이
// 남는다 — `node_modules/` 는 101개 패키지로 차 있는데 `package.json` 이 없고
// `node_modules/.bin` 이 빈 상태가 실측이다. npx 는 다음 실행에서 그 항목을
// 재사용하려다 `npm error enoent Could not read package.json` 으로 즉사하고,
// **스스로 낫지 않는다** — 사용자가 그 디렉터리를 손으로 지우기 전까지 매번
// 같은 자리에서 죽는다. 그래서 npx 로 띄우기 **직전에** 그 항목 하나만 검사해
// 깨져 있으면 지운다. 그러면 npx 가 처음부터 다시 받는다.
//
// ## 그 <해시> 를 우리가 어떻게 아는가
//
// npm(libnpmexec)의 공식은 `sha512(<패키지 스펙>)` 의 hex 앞 16자다.
// **실측 검증 (2026-08-19, 소유자 기계의 실제 캐시와 대조)**:
//
// ```text
// sha512("@agentclientprotocol/claude-agent-acp@0.69.0")[..16] = 8757e2301903ae53
//   → 소유자 화면의 npm 오류가 가리킨 바로 그 깨진 디렉터리명
// sha512("@agentclientprotocol/codex-acp@1.4.0")[..16]        = 8adbf6f1a7dec4e5
//   → 같은 기계 ~/.npm/_npx/ 에 살아 있는 항목
// ```
//
// 공식이 어느 날 바뀌면? 우리가 계산한 디렉터리가 그냥 **없을** 뿐이다 —
// 검사는 조용히 통과하고 동작은 오늘과 같다(fail-open). 엉뚱한 것을 지우는
// 방향으로는 틀릴 수 없다: 이 경로는 우리 스펙의 해시로만 만들어지기 때문이다.

/// 자식 npm 이 실제로 볼 npx 캐시 루트.
///
/// 자식 환경은 `sanitized_runtime_environment` 가 `npm_config_*` 를 걷어내므로
/// npm 의 캐시 위치 결정에 남는 입력은 둘뿐이다: ① `$HOME/.npmrc` 의 `cache=`
/// ② 플랫폼 기본값(`~/.npm`, Windows 는 `~/AppData/Local/npm-cache`).
/// 전역/내장 npmrc 의 `cache=` 는 못 본다 — 그 경우 항목을 못 찾고 fail-open.
pub(crate) fn npx_cache_root(home: Option<&Path>) -> Option<PathBuf> {
    let home = home?;
    if let Ok(text) = std::fs::read_to_string(home.join(".npmrc")) {
        for line in text.lines() {
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            // `cache-min=` 같은 다른 열쇠가 `cache` 로 오독되면 엉뚱한 곳을
            // 뒤진다 — 열쇠는 정확히 일치해야 한다.
            if key.trim() != "cache" {
                continue;
            }
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            let base = match value.strip_prefix("~/") {
                Some(rest) => home.join(rest),
                None => PathBuf::from(value),
            };
            return Some(base.join("_npx"));
        }
    }
    let default_cache = if cfg!(windows) {
        home.join("AppData").join("Local").join("npm-cache")
    } else {
        home.join(".npm")
    };
    Some(default_cache.join("_npx"))
}

/// 이 패키지 스펙의 npx 캐시 항목 디렉터리. 공식과 실측 근거는 위 블록 주석.
pub(crate) fn npx_cache_entry_dir(npx_cache_root: &Path, package: &str) -> PathBuf {
    use sha2::{Digest, Sha512};
    let digest = Sha512::digest(package.as_bytes());
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    npx_cache_root.join(&hex[..16])
}

/// npx 캐시 항목 하나의 건강 상태.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum NpxEntryHealth {
    /// 항목이 아직 없다 — 첫 실행이면 npx 가 내려받는다.
    Missing,
    /// npx 가 재사용하거나 **스스로 복구할 수 있는** 모양이다. 건드리지 않는다.
    Usable,
    /// npx 가 스스로 낫지 못하는 모양 — 사유는 사람이 읽는 코드.
    Broken(&'static str),
}

/// npm 이 항목에 남기는 `_npx.packages` 표식이 우리 스펙을 가리키는가.
///
/// 표식이 없으면 소유로 본다 — 이 경로 자체가 우리 스펙의 해시에서 나왔고,
/// 그것이 소유의 증거다. 표식이 **다른** 스펙을 가리키면(해시 공식이 바뀐
/// 미래의 npm 등) 남의 것일 수 있으니 절대 건드리지 않는다.
fn npx_entry_owned(manifest: &serde_json::Value, package: &str) -> bool {
    match manifest
        .get("_npx")
        .and_then(|npx| npx.get("packages"))
        .and_then(|packages| packages.as_array())
    {
        Some(packages) => packages.iter().any(|entry| entry.as_str() == Some(package)),
        None => true,
    }
}

/// 「온전함」 판정. 근거는 실측한 두 상태의 차이다:
///
/// - **살아 있는 항목**(소유자 기계 `8adbf6f1a7dec4e5`): `package.json`(내용은
///   `dependencies` + `_npx.packages`) · `package-lock.json` ·
///   `node_modules/.bin/<실행 파일>` 이 전부 있다.
/// - **깨진 항목**(소유자가 맞은 `8757e2301903ae53`): `node_modules/` 101개
///   패키지, `.bin` 은 **빈 디렉터리**, `package.json` **없음**.
///
/// 그래서 둘을 본다: ① `package.json` 이 읽히고 JSON 으로 파싱되는가 — npx 가
/// 죽는 바로 그 지점이다. ② `node_modules` 가 있는데 `.bin` 이 비어 있는가 —
/// 내려받기는 됐는데 실행 파일 연결 전에 끊긴 상태로, npx 는 「실행할 것을 못
/// 찾겠다」로 멈춘다. 실행 파일 **이름**은 검사하지 않는다 — 패키지마다 bin
/// 이름이 달라서, 이름을 짐작하면 멀쩡한 항목을 매번 지우는 루프가 된다.
/// `package.json` 은 있는데 `node_modules` 가 없는 항목은 npx 가 스스로 다시
/// 설치하므로 Usable 이다.
pub(crate) fn npx_entry_health(entry: &Path, package: &str) -> NpxEntryHealth {
    if !entry.exists() {
        return NpxEntryHealth::Missing;
    }
    let text = match std::fs::read_to_string(entry.join("package.json")) {
        Ok(text) => text,
        Err(_) => return NpxEntryHealth::Broken("package-json-missing"),
    };
    let manifest: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => return NpxEntryHealth::Broken("package-json-unparseable"),
    };
    if !npx_entry_owned(&manifest, package) {
        return NpxEntryHealth::Usable;
    }
    let node_modules = entry.join("node_modules");
    if !node_modules.exists() {
        return NpxEntryHealth::Usable;
    }
    let has_bin = std::fs::read_dir(node_modules.join(".bin"))
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false);
    if !has_bin {
        return NpxEntryHealth::Broken("bin-links-missing");
    }
    NpxEntryHealth::Usable
}

/// 이 시작이 npx 갈래인가 — 그렇다면 못 박은 패키지 스펙을 돌려준다.
/// `resolve_launch` 가 npx 폴백에서 만드는 모양(`npx -y <스펙> …`) 그대로를 본다.
pub(crate) fn npx_launch_package(launch: &AcpLaunch) -> Option<&str> {
    let stem = launch.program.file_stem()?.to_str()?;
    if !stem.eq_ignore_ascii_case("npx") {
        return None;
    }
    match launch.args.as_slice() {
        [flag, package, ..] if flag == "-y" => Some(package),
        _ => None,
    }
}

/// 이 시작이 npx 갈래면 그 캐시 항목의 경로 — 진행 표시가 크기를 잴 자리다.
pub(crate) fn npx_cache_entry_for_launch(
    launch: &AcpLaunch,
    home: Option<&Path>,
) -> Option<PathBuf> {
    let package = npx_launch_package(launch)?;
    Some(npx_cache_entry_dir(&npx_cache_root(home)?, package))
}

/// npx 시작 직전 검사의 결과 — 화면이 무엇을 말할지가 여기서 갈린다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum NpxCachePreflight {
    /// npx 를 쓰지 않는 시작(전역 어댑터·binary·uvx) — 볼 것이 없다.
    NotNpx,
    /// 홈을 몰라 캐시를 못 봤다 — 종전과 같이 그냥 띄운다(fail-open).
    CacheUnknown,
    /// 항목이 살아 있다 — 내려받기 없이 바로 뜬다.
    CacheReady,
    /// 항목이 아직 없다 — npx 가 처음으로 내려받는다(수십 MB).
    FirstDownload,
    /// 깨진 항목을 지웠다 — npx 가 처음부터 다시 내려받는다.
    HealedBrokenEntry { reason: &'static str },
    /// 깨졌는데 지우지 못했다 — 그대로 두면 종전과 똑같이 실패한다.
    /// 화면이 진단으로라도 알 수 있게 사유를 올린다.
    HealFailed {
        reason: &'static str,
        error: String,
    },
}

/// npx 로 띄우기 직전에 캐시 항목을 검사하고, 깨져 있으면 **그 항목 하나만**
/// 지운다. `_npx` 전체를 지우면 사용자의 다른 npx 도구가 전부 다시 받게 되므로
/// 범위는 항목 하나다.
pub(crate) fn preflight_npx_cache(launch: &AcpLaunch, home: Option<&Path>) -> NpxCachePreflight {
    let Some(package) = npx_launch_package(launch) else {
        return NpxCachePreflight::NotNpx;
    };
    let Some(root) = npx_cache_root(home) else {
        return NpxCachePreflight::CacheUnknown;
    };
    let entry = npx_cache_entry_dir(&root, package);
    match npx_entry_health(&entry, package) {
        NpxEntryHealth::Missing => NpxCachePreflight::FirstDownload,
        NpxEntryHealth::Usable => NpxCachePreflight::CacheReady,
        NpxEntryHealth::Broken(reason) => match std::fs::remove_dir_all(&entry) {
            Ok(()) => NpxCachePreflight::HealedBrokenEntry { reason },
            Err(err) => NpxCachePreflight::HealFailed {
                reason,
                error: err.to_string(),
            },
        },
    }
}

/// 디렉터리 아래 파일 크기의 합(바이트). 내려받기 진행 표시가 「지금까지 몇 MB」
/// 를 재는 데 쓴다 — 전체 크기는 우리가 정직하게 알 수 없으므로(패키지마다
/// 다르고 어디에도 못 박혀 있지 않다) 받은 만큼만 말한다. 심볼릭 링크는
/// 따라가지 않는다.
pub(crate) fn dir_size_bytes(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        let Ok(metadata) = entry.path().symlink_metadata() else {
            continue;
        };
        if metadata.is_dir() {
            total += dir_size_bytes(&entry.path());
        } else if metadata.is_file() {
            total += metadata.len();
        }
    }
    total
}

/// 부모 셸의 임의 설정·자격증명을 받지 않고도 **구독 로그인**으로 동작하는 것을
/// 실측한 실행기. 다른 36종까지 짐작으로 비우면 환경 API 키만 쓰는 도구를 조용히
/// 망가뜨리므로, 검증한 범위에서만 자란다.
const SANITIZED_ENV_RUNTIMES: &[&str] = &["claude-acp", "codex-acp"];

/// GUI 앱이 재구축할 수 없거나 구독 로그인·기업망에 필요한 운영체제 환경.
///
/// 이 목록은 강한 샌드박스가 아니다. HOME 과 프록시를 보존하므로 자식은 여전히
/// 사용자 파일과 네트워크를 쓸 수 있다. 여기서 막는 것은 부모 프로세스에 우연히
/// 실린 API 키·라우팅·동적 로더 입력이 세션의 인증/실행 경계를 조용히 바꾸는 일이다.
const SHARED_RUNTIME_ENV: &[&str] = &[
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "TZ",
    "USER",
    "USERNAME",
    "LOGNAME",
    "SHELL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
];

fn runtime_environment_key_allowed(runtime_id: &str, key: &OsStr) -> bool {
    // Windows 환경 이름은 대소문자를 구분하지 않는다. 같은 정책을 모든 플랫폼에서
    // 쓰면 `OpenAI_Api_Key` 같은 혼합 표기도 Windows에서 빠뜨리지 않는다.
    let normalized = key.to_string_lossy().to_ascii_uppercase();
    SHARED_RUNTIME_ENV.contains(&normalized.as_str())
        || normalized.starts_with("LC_")
        || (runtime_id == "codex-acp"
            && matches!(normalized.as_str(), "CODEX_HOME" | "CODEX_CA_CERTIFICATE"))
}

/// 검증한 구독 실행기에 전달할 명시적 환경. `None`은 미검증 실행기의 기존 상속을
/// 유지한다는 뜻이고, 빈 `Some`은 전부 지운다는 뜻이므로 둘을 합치지 않는다.
pub(crate) fn sanitized_runtime_environment(
    runtime_id: &str,
    inherited: impl IntoIterator<Item = (OsString, OsString)>,
) -> Option<Vec<(OsString, OsString)>> {
    if !SANITIZED_ENV_RUNTIMES.contains(&runtime_id) {
        return None;
    }

    Some(
        inherited
            .into_iter()
            .filter(|(key, _)| runtime_environment_key_allowed(runtime_id, key))
            .collect(),
    )
}

/// 세션 시작과 로그인 확인이 **같은 환경 정책**을 쓰게 하는 단일 진입점.
pub(crate) fn apply_runtime_environment(
    command: &mut std::process::Command,
    runtime_id: &str,
    child_path: &str,
) {
    if let Some(environment) = sanitized_runtime_environment(runtime_id, std::env::vars_os()) {
        command.env_clear();
        command.envs(environment);
    }
    // PATH 는 부모 값을 허용 목록으로 통과시키지 않고, 우리가 실제 실행기와 CLI를
    // 찾을 때 만든 경로로 마지막에 덮는다.
    command.env("PATH", child_path);
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
    cli: Option<&Path>,
    path_env: &str,
) -> Result<PathBuf, String> {
    // 격리를 아직 실측하지 않은 실행기는 **격리하지 않는다고 정직하게 알린다.**
    // 짐작한 환경 변수로 설정을 옮기면 로그인이 조용히 깨지고, 사용자는 왜
    // 안 되는지 알 수 없다.
    let spec = isolation_for(runtime_id)
        .ok_or_else(|| format!("isolation-unsupported:{runtime_id}"))?;

    let dir = app_data_dir.join("agent-config").join(spec.id);
    std::fs::create_dir_all(&dir).map_err(|err| format!("config-dir-failed:{err}"))?;

    if spec.id == "claude-acp" {
        std::fs::write(dir.join("settings.json"), ISOLATED_CLAUDE_SETTINGS)
            .map_err(|err| format!("settings-write-failed:{err}"))?;
    }

    if let Some(home) = home {
        let source = home.join(spec.user_config_dir).join(spec.credentials_file);
        let link = dir.join(spec.credentials_file);
        if source.exists() {
            link_credentials(&source, &link)?;
            // 링크가 실제로 걸린 뒤에만 그림자를 걷는다 — 링크할 원본이 없으면
            // 앱 몫 항목이 유일한 자격증명일 수 있고, 그걸 지우면 멀쩡한 로그인을
            // 우리가 깨는 것이 된다.
            clear_shadowing_credentials(&dir, cli, path_env);
        }
    }

    Ok(dir)
}

/// Claude Code 가 자격증명을 넣는 **키체인 항목 이름**.
///
/// 형식은 `Claude Code-credentials-<설정폴더 절대경로의 sha256 앞 8자>` 다.
/// 2026-08-20 실측으로 두 자리를 확인했다 — `~/.claude` → `ce4c8c26`,
/// 앱 전용 폴더 → `85f2eaa5`. 테스트가 그 두 값을 그대로 못박는다.
pub(crate) fn claude_credentials_service(config_dir: &Path) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(config_dir.to_string_lossy().as_bytes());
    format!("Claude Code-credentials-{}", &hex_lower(&digest)[..8])
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// 앱 전용 폴더 앞으로 만들어진 키체인 항목을 걷는다.
///
/// ## 왜 이것이 필요한가 (2026-08-20 실측)
///
/// 이 앱은 Claude 를 전용 설정 폴더로 띄우고, 로그인이 갈라지지 않게
/// `.credentials.json` 을 사용자의 것으로 **링크**한다. 그 설계는 실제로
/// 동작한다 — 키체인 항목이 없는 새 폴더에 링크만 걸고 `claude auth status`
/// 를 물으면 `loggedIn: true` 가 나온다(사용자 계정 그대로).
///
/// 문제는 **Claude Code 가 키체인을 파일보다 먼저 본다**는 것이다. 그래서 그
/// 폴더 앞으로 항목이 한 번 생기면 링크는 그 순간부터 읽히지 않는다. 그리고
/// 항목은 딱 한 경로로 생긴다 — 사람이 그 폴더로 로그인했을 때. 2026-08-17 에
/// 넣은 안내가 정확히 그것을 시켰고(`CLAUDE_CONFIG_DIR=<앱 폴더> claude /login`),
/// 그 토큰이 회전되면 죽고, 죽으면 화면이 같은 안내를 다시 했다.
/// **안내가 덫을 만들고 있었다.**
///
/// 실측: 그 항목을 지우자 같은 폴더가 곧바로 `loggedIn: true` 로 돌아왔다.
/// 그래서 고치는 방향은 「앱 몫으로 로그인하라」가 아니라 「앱 몫 항목을
/// 없애라」다.
///
/// 실패해도 조용히 넘어간다 — 지우지 못하면 종전대로 문제 카드가 뜨고,
/// 사용자는 아무것도 잃지 않는다. 반대로 여기서 실패를 시작 실패로 올리면
/// 키체인 접근이 막힌 환경에서 앱이 아예 안 뜬다.
fn clear_shadowing_credentials(config_dir: &Path, cli: Option<&Path>, path_env: &str) {
    #[cfg(target_os = "macos")]
    {
        let service = claude_credentials_service(config_dir);
        // 있는지부터 본다. 없을 때 지우기를 부르면 macOS 가 승인 창을 띄울 수
        // 있는데, 평소(항목 없음)에 창이 뜨는 것은 관문이 아니라 마찰이다.
        let mut find = std::process::Command::new("security");
        find.args(["find-generic-password", "-s", &service]);
        // 항목이 없으면 `security` 는 곧바로 비어 있는 출력으로 끝난다.
        // 있으면 `svce` 줄이 나오므로 그것으로 존재를 판정한다.
        let found = bounded_output(find, KEYCHAIN_PROBE_TIMEOUT);
        if !found.map(|out| out.contains(&service)).unwrap_or(false) {
            return;
        }

        // **그 항목이 아직 통하면 손대지 않는다.**
        //
        // 앱 몫 로그인만 살아 있는 사람이 있을 수 있다 — 종전 안내대로 앱
        // 폴더에 로그인하고 그 뒤로 터미널을 안 쓴 경우다. 그 사람의 항목을
        // 지우면 우리가 멀쩡한 로그인을 깨는 것이 된다. 그래서 「죽었나」를
        // 시각이 아니라 **직접 물어서** 판정한다 — 시각은 실패한 갱신 시도로도
        // 새로 찍혀서 죽은 항목이 계속 최신으로 보일 수 있다.
        //
        // 못 물어보면(CLI 를 못 찾음) 아무것도 안 한다. 모르는 채로 지우는 것이
        // 이 자리에서 가장 나쁜 선택이다.
        let Some(cli) = cli else {
            return;
        };
        let mut probe = std::process::Command::new(cli);
        probe
            .args(["auth", "status"])
            .env("PATH", path_env)
            .env("CLAUDE_CONFIG_DIR", config_dir);
        let Some(stdout) = bounded_output(probe, LOGIN_PROBE_TIMEOUT) else {
            return;
        };
        if !claude_status_is_logged_out(&stdout) {
            return;
        }

        let _ = std::process::Command::new("security")
            .args(["delete-generic-password", "-s", &service])
            .output();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (config_dir, cli, path_env);
    }
}

/// 명령 하나를 **시간을 묶어서** 돌리고 표준출력을 돌려준다.
///
/// 왜 `Command::output()` 을 그냥 쓰지 않나: 그건 자식이 끝날 때까지 **영원히**
/// 기다린다. 여기서 부르는 것들(`security` · 실행기 CLI)은 키체인이 잠겨 있거나
/// 래퍼가 네트워크를 물면 안 끝날 수 있고, 그러면 세션 시작이 통째로 멈춘다 —
/// 화면에는 아무 설명 없이 「띄우는 중」만 남는다. 같은 부류의 결함을 CI 준비
/// 스텝에서 이미 한 번 겪었다(2026-08-20, apt 가 20분을 먹었다).
///
/// 못 띄우거나 상한을 넘기면 `None` — 「실패」가 아니라 **모른다**다.
fn bounded_output(mut command: std::process::Command, limit: std::time::Duration) -> Option<String> {
    use std::io::Read;
    use std::process::Stdio;

    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let deadline = std::time::Instant::now() + limit;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(_) => return None,
        }
    }

    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    Some(out)
}

/// 그 폴더 앞으로 난 키체인 항목을 **조건 없이** 지운다.
///
/// `clear_shadowing_credentials` 와 다른 점: 저쪽은 「아직 통하면 손대지
/// 않는다」를 지키지만, 여기는 사용자가 **직접 「다시 맺기」를 눌렀을 때**만
/// 불린다. 그때는 통하든 말든 지우는 것이 그 버튼의 뜻이다.
pub(crate) fn remove_shadow_credentials(config_dir: &Path) {
    #[cfg(target_os = "macos")]
    {
        let service = claude_credentials_service(config_dir);
        let mut find = std::process::Command::new("security");
        find.args(["find-generic-password", "-s", &service]);
        if !bounded_output(find, KEYCHAIN_PROBE_TIMEOUT)
            .map(|out| out.contains(&service))
            .unwrap_or(false)
        {
            return;
        }
        let mut del = std::process::Command::new("security");
        del.args(["delete-generic-password", "-s", &service]);
        let _ = bounded_output(del, KEYCHAIN_PROBE_TIMEOUT);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = config_dir;
    }
}

/// 앱 몫 설정 폴더가 **로그아웃 상태인가.** 못 물어보면 `None`(모른다).
///
/// 화면의 「준비됨」 배지는 오래 **사용자 폴더**를 재고 있었다. 그래서 앱이 실제로
/// 쓰는 폴더가 로그아웃인데도 초록이었고, 사용자는 대화를 열어 보고서야 그것을
/// 알았다(2026-08-20 실측). 재야 할 자리는 앱이 쓰는 그 폴더다.
pub(crate) fn probe_isolated_logged_out(
    cli: &Path,
    config_dir: &Path,
    path_env: &str,
) -> Option<bool> {
    let mut command = std::process::Command::new(cli);
    command
        .args(["auth", "status"])
        .env("PATH", path_env)
        .env("CLAUDE_CONFIG_DIR", config_dir);
    let stdout = bounded_output(command, LOGIN_PROBE_TIMEOUT)?;
    // 파싱조차 못 하면 「로그인됨」도 「로그아웃」도 아니다.
    serde_json::from_str::<serde_json::Value>(stdout.trim())
        .ok()?
        .get("loggedIn")?
        .as_bool()
        .map(|logged_in| !logged_in)
}

/// 그 폴더 앞으로 난 키체인 항목이 있나. macOS 밖에서는 `None`(볼 수 없다).
pub(crate) fn shadow_credentials_present(config_dir: &Path) -> Option<bool> {
    #[cfg(target_os = "macos")]
    {
        let service = claude_credentials_service(config_dir);
        let mut find = std::process::Command::new("security");
        find.args(["find-generic-password", "-s", &service]);
        let out = bounded_output(find, KEYCHAIN_PROBE_TIMEOUT)?;
        Some(out.contains(&service))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = config_dir;
        None
    }
}

/// `claude auth status` 의 JSON 이 **로그아웃 상태**라고 말하는가.
///
/// 모르겠으면 `false` 다 — 판정하지 못한 것을 「죽었다」로 읽으면 멀쩡한
/// 로그인을 지우게 된다. 그래서 `loggedIn` 이 명시적으로 `false` 일 때만 참이다.
pub(crate) fn claude_status_is_logged_out(stdout: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(stdout.trim()) else {
        return false;
    };
    value.get("loggedIn") == Some(&serde_json::Value::Bool(false))
}


/// 이 실행기의 「설정을 어디서 읽나」 환경 변수 이름.
pub(crate) fn config_env_for(runtime_id: &str) -> Option<&'static str> {
    isolation_for(runtime_id).map(|s| s.config_env)
}

/// 실행기가 설정 격리를 지원하면 **반드시** 준비하고, 실패는 시작 실패로 올린다.
///
/// `None` 은 검증되지 않은 실행기에 격리를 지어내지 않는다는 뜻이다. 반대로
/// `config_env_for()` 가 값을 돌려준 실행기는 화면이 이미 「관문 있음」이라고
/// 말하므로, 준비 실패 뒤 비격리 상태로 띄우는 선택지는 없다.
pub(crate) fn prepare_runtime_isolation(
    runtime_id: &str,
    app_data_dir: &Path,
    home: Option<&Path>,
    cli: Option<&Path>,
    path_env: &str,
) -> Result<Option<(&'static str, PathBuf)>, String> {
    let Some(env) = config_env_for(runtime_id) else {
        return Ok(None);
    };
    let dir = prepare_isolated_config(runtime_id, app_data_dir, home, cli, path_env)
        .map_err(|reason| format!("isolation-failed:{reason}"))?;
    Ok(Some((env, dir)))
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
    let raw = Path::new(raw);
    // 권한 경계의 루트는 호출자가 꾸며 낸 문자열이 아니라 `acp_start` 가 확인한
    // 절대 디렉터리여야 한다. 빈 경로는 현재 작업 폴더로, `/` 는 모든 절대
    // 경로의 조상으로 해석되므로 둘 중 하나라도 허용하면 관문 전체가 열린다.
    if !vault_root.is_absolute() || !raw.is_absolute() {
        return PermissionVerdict::Ask;
    }
    let Ok(root) = std::fs::canonicalize(vault_root) else {
        return PermissionVerdict::Ask;
    };
    // `acp_start` 가 저장한 정규 경로와 지금 해소되는 대상이 달라졌다면 세션
    // 시작 뒤 루트 경로가 링크로 바뀐 것이다. 새 대상을 같은 볼트로 승격하지
    // 않는다 — 권한 경계는 세션 수명 동안 움직이지 않는다.
    if root != vault_root || !root.is_dir() || root.parent().is_none() {
        return PermissionVerdict::Ask;
    }
    let resolved = resolve_for_comparison(raw);
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

/// 그룹 리더가 이미 회수된 뒤에도 **그 PGID에 구성원이 남았는지** 확인한다.
///
/// `kill(pid, 0)`은 리더 하나만 본다. 음수 PID는 프로세스 그룹 전체를 뜻하므로,
/// TERM을 무시한 손자까지 사라졌는지는 이 판정으로만 알 수 있다.
#[cfg(unix)]
fn process_group_is_running(pgid: u32) -> Result<bool, String> {
    if unsafe { libc::kill(-(pgid as i32), 0) } == 0 {
        return Ok(true);
    }
    let err = std::io::Error::last_os_error();
    match err.raw_os_error() {
        Some(libc::ESRCH) => Ok(false),
        // EPERM은 「없다」가 아니다. macOS에서는 방금 TERM을 받은 그룹이
        // 회수되는 짧은 구간에도 보일 수 있으므로 grace 동안은 살아 있는 것으로
        // 보고 다시 확인한다. 최종 신호에서도 EPERM이면 그때 오류로 올린다.
        Some(libc::EPERM) => Ok(true),
        _ => Err(format!("failed to inspect process group {pgid}: {err}")),
    }
}

/// 프로세스 **그룹**에 신호를 보낸다. 그룹으로 못 보내면 리더에게라도 보낸다.
///
/// 그룹이 먼저인 이유: 어댑터는 자기 자식(진짜 CLI · MCP 서버 · 서브에이전트)을
/// 또 띄운다. 리더만 죽이면 손자들이 고아로 남아 **앱을 끈 뒤에도 계속 돈다.**
/// 참고 제품에서 유휴 에이전트 3개가 92 프로세스 · 7.1GB 를 쓰고 있는 것을
/// 실측했다 — 그 트리를 확실히 끝내는 것이 이 함수의 존재 이유다.
///
/// 그룹이 이미 사라졌는데 리더만 다른 그룹에 남은 `ESRCH` 갈래에서는 리더에게
/// 폴백한다. `EPERM`이면 리더 신호를 최선으로 시도하되 성공으로 숨기지 않는다 —
/// 리더 하나를 끝낸 것은 트리 전체를 끝낸 증거가 아니기 때문이다.
#[cfg(unix)]
fn signal_group_or_leader(pid: u32, signal: i32) -> Result<(), String> {
    let group = -(pid as i32);
    if unsafe { libc::kill(group, signal) } == 0 {
        return Ok(());
    }
    let group_err = std::io::Error::last_os_error();
    match group_err.raw_os_error() {
        Some(libc::ESRCH) if !process_is_running(pid) => {
            Ok(()) // 그룹도 리더도 이미 끝났다 — 실패가 아니다.
        }
        Some(libc::ESRCH) => {
            if unsafe { libc::kill(pid as i32, signal) } == 0 {
                return Ok(());
            }
            let leader_err = std::io::Error::last_os_error();
            if leader_err.raw_os_error() == Some(libc::ESRCH) || !process_is_running(pid)
            {
                return Ok(());
            }
            Err(format!("failed to signal {pid}: {leader_err}"))
        }
        Some(libc::EPERM) => {
            // 리더라도 끝내 보지만, 손자를 끝냈다는 증거는 없으므로 오류는 유지한다.
            if process_is_running(pid) {
                unsafe {
                    libc::kill(pid as i32, signal);
                }
            }
            Err(format!(
                "failed to signal process group {pid}: {group_err}"
            ))
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
            if !process_group_is_running(pid)? {
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

pub(crate) type RealProbe = (
    fn(&Path) -> bool,
    fn(&Path) -> Vec<String>,
    fn(&Path) -> Option<String>,
    fn(&str, &Path, &[&str], &str) -> Option<bool>,
);

/// 실제 디스크를 보는 기본 프로브.
pub(crate) fn real_probe() -> RealProbe {
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
    /*
     * 로그인 여부는 그 CLI 에게 **직접 물어본다.** 그 자리의 파일을 뜯어보지
     * 않는다 — 자격증명 파일의 모양은 벤더가 언제든 바꾸고, 우리가 그걸 읽는
     * 것 자체가 신뢰 헌장이 막는 종류의 일이다.
     *
     * **종료 코드만** 본다(0 = 로그인됨). 출력은 파이프로 버린다: `claude auth
     * status` 는 이메일과 조직 ID 를 돌려주는데(실측) 우리가 그것을 프로세스
     * 메모리에 들일 이유가 없다.
     *
     * 못 띄우거나 시간이 지나면 `None` — 「로그인 안 됨」이 아니라 **모른다**다.
     * 모르는 것을 「안 됨」으로 적으면 멀쩡한 도구를 못 쓰게 만든다.
     */
    let login_ok =
        |runtime_id: &str, path: &Path, args: &[&str], child_path: &str| -> Option<bool> {
            use std::process::{Command, Stdio};
            let mut command = Command::new(path);
            command
                .args(args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            /*
             * ⚠️ **자식에게 우리가 다시 만든 PATH 를 준다** (2026-08-16 검수에서
             * 적발). 종전에는 앱이 상속받은 환경 그대로 띄웠는데, 이 파일 맨 위가
             * 적어 둔 바로 그 이유로 그건 절반만 푼 것이다 — Finder 로 띄운 앱의
             * PATH 에는 nvm 자리가 없고, `claude` 는 node 를 이름으로 찾는 래퍼다.
             * 그러면 「종료 코드 ≠ 0」이 나오고 우리는 그걸 **로그인 안 됨**으로
             * 읽어서, 멀쩡히 로그인된 도구를 목록에서 통째로 지웠다.
             */
            apply_runtime_environment(&mut command, runtime_id, child_path);
            let mut child = command.spawn().ok()?;

            // 응답이 없으면 기다리다 화면이 멈춘다. 실측값(claude 300ms · codex
            // 45ms)의 여러 배를 상한으로 두고, 넘으면 끝내고 「모른다」로 답한다.
            let deadline = std::time::Instant::now() + LOGIN_PROBE_TIMEOUT;
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => return Some(status.success()),
                    Ok(None) => {
                        if std::time::Instant::now() >= deadline {
                            let _ = child.kill();
                            let _ = child.wait();
                            return None;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(20));
                    }
                    Err(_) => return None,
                }
            }
        };

    (is_executable, list_dir, read_text, login_ok)
}

/// 로그인 확인에 기다려 주는 시간. 실측(claude 300ms · codex 45ms)의 여러 배다 —
/// 넉넉하되, 응답이 없는 도구 때문에 목록이 멈추지는 않게.
const LOGIN_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// 키체인을 들여다보는 데 주는 상한. `security` 는 보통 수십 ms 에 끝나지만,
/// 키체인이 잠겨 있으면 잠금 해제 창을 띄우고 사람이 답할 때까지 기다린다 —
/// 그 기다림이 세션 시작을 잡아먹으면 안 된다.
const KEYCHAIN_PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// **앱이 대신 깔아 줄 수 있는 CLI** — 넷을 다 갖춘 것만 등재한다.
///
/// 근거와 조건: 원장 2026-08-20 (88) · `.claude/rules/forbidden.md` 의
/// 「에이전트 도구를 대신 설치해 주는 것」 절.
///
/// **버전을 고정한다.** `@latest` 로 두면 같은 앱이 어제와 오늘 다른 것을 깔고,
/// 그러면 「앱에서만 다르게 동작한다」가 재현 불가능한 형태로 온다.
///
/// **전역이 아니라 앱 전용 자리에 깐다** — `--prefix <app-data>/managed-node`.
/// 사용자의 전역 npm 도 시스템 PATH 도 안 건드리고, 그 폴더를 지우면 흔적이
/// 남지 않는다.
pub(crate) const INSTALLABLE_CLI: &[(&str, &str)] = &[
    ("claude-acp", "@anthropic-ai/claude-code@2.1.236"),
    ("codex-acp", "@openai/codex@0.66.0"),
];

pub(crate) fn installable_package(runtime_id: &str) -> Option<&'static str> {
    INSTALLABLE_CLI
        .iter()
        .find(|(id, _)| *id == runtime_id)
        .map(|(_, pkg)| *pkg)
}

/// 앱 전용 설치 자리. 여기 밖으로는 한 바이트도 안 쓴다.
pub(crate) fn managed_cli_prefix(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("managed-node")
}

/// 그 자리에 깔린 실행 파일들이 사는 곳 — PATH 후보에 더해진다.
pub(crate) fn managed_cli_bin_dir(app_data_dir: &Path) -> PathBuf {
    managed_cli_prefix(app_data_dir).join("bin")
}

/// **화면이 먼저 보여 줄 명령 원문.** 누르기 전에 이것이 그대로 화면에 있다 —
/// 「무엇을 실행하는지 먼저 보여 준다」가 조건 ②다.
pub(crate) fn managed_install_command(runtime_id: &str, app_data_dir: &Path) -> Option<String> {
    let package = installable_package(runtime_id)?;
    Some(format!(
        "npm install --prefix {} --global {package}",
        managed_cli_prefix(app_data_dir).display()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::ffi::OsString;

    fn npx_package(runtime_id: &str) -> &'static str {
        match &registry_agent(runtime_id)
            .unwrap_or_else(|| panic!("missing registry agent: {runtime_id}"))
            .launch
        {
            RegistryLaunch::Npx { package, .. } => package,
            _ => panic!("runtime is not backed by npx: {runtime_id}"),
        }
    }

    fn sample_parent_environment() -> Vec<(OsString, OsString)> {
        [
            ("HOME", "/home/me"),
            ("USERPROFILE", "C:\\Users\\me"),
            ("TMPDIR", "/tmp/runtime"),
            ("LANG", "ko_KR.UTF-8"),
            ("LC_CTYPE", "UTF-8"),
            ("HTTPS_PROXY", "http://proxy.example"),
            ("NO_PROXY", "localhost"),
            ("SSL_CERT_FILE", "/etc/company-ca.pem"),
            ("NODE_EXTRA_CA_CERTS", "/etc/node-ca.pem"),
            ("CODEX_HOME", "/home/me/.codex-custom"),
            ("CODEX_CA_CERTIFICATE", "/etc/codex-ca.pem"),
            ("OPENAI_API_KEY", "openai-secret"),
            ("CODEX_ACCESS_TOKEN", "codex-secret"),
            ("ANTHROPIC_API_KEY", "anthropic-secret"),
            ("ANTHROPIC_BASE_URL", "https://redirect.example"),
            ("GH_TOKEN", "github-secret"),
            ("AWS_SECRET_ACCESS_KEY", "aws-secret"),
            ("NODE_OPTIONS", "--require=/tmp/inject.cjs"),
            ("DYLD_INSERT_LIBRARIES", "/tmp/inject.dylib"),
            ("BASH_ENV", "/tmp/inject.sh"),
            ("SSH_AUTH_SOCK", "/tmp/agent.sock"),
            ("ATLAS_TEST_SECRET", "ambient-secret"),
        ]
        .into_iter()
        .map(|(key, value)| (OsString::from(key), OsString::from(value)))
        .collect()
    }

    fn environment_keys(environment: &[(OsString, OsString)]) -> HashSet<String> {
        environment
            .iter()
            .map(|(key, _)| key.to_string_lossy().to_ascii_uppercase())
            .collect()
    }

    #[test]
    fn verified_subscription_runtimes_drop_ambient_credentials_and_injection_inputs() {
        for runtime_id in ["claude-acp", "codex-acp"] {
            let environment =
                sanitized_runtime_environment(runtime_id, sample_parent_environment())
                    .expect("verified subscription runtime must use an explicit environment");
            let keys = environment_keys(&environment);

            for preserved in [
                "HOME",
                "USERPROFILE",
                "TMPDIR",
                "LANG",
                "LC_CTYPE",
                "HTTPS_PROXY",
                "NO_PROXY",
                "SSL_CERT_FILE",
                "NODE_EXTRA_CA_CERTS",
            ] {
                assert!(keys.contains(preserved), "{runtime_id}: lost {preserved}");
            }
            for blocked in [
                "OPENAI_API_KEY",
                "CODEX_ACCESS_TOKEN",
                "ANTHROPIC_API_KEY",
                "ANTHROPIC_BASE_URL",
                "GH_TOKEN",
                "AWS_SECRET_ACCESS_KEY",
                "NODE_OPTIONS",
                "DYLD_INSERT_LIBRARIES",
                "BASH_ENV",
                "SSH_AUTH_SOCK",
                "ATLAS_TEST_SECRET",
            ] {
                assert!(!keys.contains(blocked), "{runtime_id}: inherited {blocked}");
            }
        }
    }

    #[test]
    fn explicit_environment_profiles_exist_only_for_verified_login_probes() {
        assert!(!SANITIZED_ENV_RUNTIMES.is_empty());
        for runtime_id in SANITIZED_ENV_RUNTIMES {
            let agent = registry_agent(runtime_id).expect("environment profile needs a registry row");
            assert!(agent.verified, "{runtime_id}: unverified runtime got an environment profile");
            assert!(
                LOGIN_PROBE.iter().any(|(id, _)| id == runtime_id),
                "{runtime_id}: environment was changed without a measured login probe"
            );
        }
    }

    #[test]
    fn codex_keeps_its_cached_login_location_and_ca_without_forwarding_tokens() {
        let environment = sanitized_runtime_environment("codex-acp", sample_parent_environment())
            .expect("codex must use an explicit environment");
        let keys = environment_keys(&environment);
        assert!(keys.contains("CODEX_HOME"));
        assert!(keys.contains("CODEX_CA_CERTIFICATE"));

        let claude = sanitized_runtime_environment("claude-acp", sample_parent_environment())
            .expect("claude must use an explicit environment");
        let claude_keys = environment_keys(&claude);
        assert!(!claude_keys.contains("CODEX_HOME"));
        assert!(!claude_keys.contains("CODEX_CA_CERTIFICATE"));
    }

    #[test]
    fn environment_policy_is_case_insensitive_and_does_not_invent_profiles() {
        let mixed_case = vec![
            (OsString::from("cOdEx_HoMe"), OsString::from("custom")),
            (OsString::from("OpenAI_Api_Key"), OsString::from("secret")),
        ];
        let codex = sanitized_runtime_environment("codex-acp", mixed_case)
            .expect("codex must use an explicit environment");
        let keys = environment_keys(&codex);
        assert!(keys.contains("CODEX_HOME"));
        assert!(!keys.contains("OPENAI_API_KEY"));

        assert!(sanitized_runtime_environment("gemini", sample_parent_environment()).is_none());
    }

    #[test]
    fn applied_runtime_environment_clears_command_overrides_before_spawn() {
        let mut command = std::process::Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "acp::tests::runtime_environment_probe_child",
                "--nocapture",
            ])
            .env("ATLAS_TEST_SECRET", "must-not-cross")
            .env("NODE_OPTIONS", "--require=/tmp/inject.cjs")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        apply_runtime_environment(&mut command, "claude-acp", "/atlas/verified/bin");
        // 테스트 자식임을 알리는 값은 정책을 적용한 **뒤**에만 넣는다. 정책 전에
        // 넣으면 env_clear가 없을 때도 자식이 안 떠서 검사가 거짓 초록이 된다.
        command.env("ATLAS_ENV_PROBE_CHILD", "1");

        let output = command.output().unwrap();
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(output.status.success(), "stdout={stdout}\nstderr={stderr}");
        assert!(stdout.contains("PATH=/atlas/verified/bin"), "{stdout}");
        assert!(!stdout.contains("ATLAS_TEST_SECRET="), "{stdout}");
        assert!(!stdout.contains("NODE_OPTIONS="), "{stdout}");
    }

    #[test]
    fn runtime_environment_probe_child() {
        if std::env::var_os("ATLAS_ENV_PROBE_CHILD").is_none() {
            return;
        }
        let mut environment: Vec<_> = std::env::vars_os()
            .map(|(key, value)| format!("{}={}", key.to_string_lossy(), value.to_string_lossy()))
            .collect();
        environment.sort();
        println!("{}", environment.join("\n"));
    }

    pub(super) type ProbeClosures<'a> = (
        Box<dyn Fn(&Path) -> bool + 'a>,
        Box<dyn Fn(&Path) -> Vec<String> + 'a>,
        Box<dyn Fn(&Path) -> Option<String> + 'a>,
    );

    pub(super) fn probe_with<'a>(
        files: &'a HashSet<PathBuf>,
        dirs: &'a std::collections::HashMap<PathBuf, Vec<String>>,
    ) -> ProbeClosures<'a> {
        (
            Box::new(move |p: &Path| files.contains(p)),
            Box::new(move |p: &Path| dirs.get(p).cloned().unwrap_or_default()),
            Box::new(move |_: &Path| None),
        )
    }

    pub(super) fn empty_dirs() -> std::collections::HashMap<PathBuf, Vec<String>> {
        std::collections::HashMap::new()
    }

    fn test_bin_dir() -> PathBuf {
        PathBuf::from("/atlas-test-bin")
    }

    fn test_bin(name: &str) -> PathBuf {
        test_bin_dir().join(name)
    }

    fn test_path_env() -> OsString {
        std::env::join_paths([test_bin_dir()]).unwrap()
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
            login_ok: &|_, _, _, _| None,
        };
        let path = std::env::join_paths([PathBuf::from("/from/path")]).unwrap();
        let out = candidate_bin_dirs(Some(Path::new("/home/me")), Some(&path), &probe, None);
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
            login_ok: &|_, _, _, _| None,
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
    #[cfg(not(windows))]
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
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(Some(Path::new("/home/me")), None, &probe, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
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
            login_ok: &|_, _, _, _| None,
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
            login_ok: &|_, _, _, _| None,
        };
        assert_eq!(
            resolve_command("claude", &[PathBuf::from("/usr/bin")], &probe),
            None
        );
    }

    #[cfg(not(windows))]
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
            login_ok: &|_, _, _, _| None,
        };

        // PATH 는 GUI 앱이 받는 최소한만 — 여기에 아무것도 없다.
        let path = std::env::join_paths([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap();
        let out = detect_runtimes(Some(Path::new("/home/me")), Some(&path), &probe, None);

        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "ready", "PATH 밖에 있어도 찾아야 한다");
        assert_eq!(
            claude.cli_path.as_deref(),
            Some("/home/me/.local/bin/claude")
        );
        assert_eq!(
            claude.adapter_path.as_deref(),
            Some("/home/me/.nvm/versions/node/v24.16.0/bin/npx"),
            "설치된 어댑터가 없으면 npx 로 띄운다"
        );
        assert_eq!(
            claude.adapter_package.as_deref(),
            Some(npx_package("claude-acp")),
            "탐지 결과는 현재 레지스트리에 못 박힌 패키지를 그대로 내놓아야 한다"
        );

        let codex = out.iter().find(|r| r.id == "codex-acp").unwrap();
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
                login_ok: &|_, _, _, _| None,
            };
            let out = detect_runtimes(None, None, &probe, None);
            let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
            assert_eq!(claude.state, "cli-missing", "CLI 부재가 먼저다 — 할 일이 더 분명하다");
        }

        // ② CLI 는 있는데 npx 도 어댑터도 없다 → 띄울 방법이 없다.
        files.insert(test_bin("claude"));
        let path_env = test_path_env();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "node-missing");
        assert_eq!(
            claude.cli_path,
            Some(test_bin("claude").to_string_lossy().to_string())
        );
    }

    /// **여기 있다 ≠ 로그인돼 있다.**
    ///
    /// 2026-08-16 소유자 지적: *"나도 원래 claude code, codex 다 있는데도 각
    /// 에이전트에 버튼 눌러서 세팅했었는데? 지금 atlas 는 바로 준비됨이던데
    /// 확인이 필요할 듯"*. 맞았다 — 우리 「준비됨」은 파일 존재만 봤고, 설치는
    /// 했지만 로그인은 안 한 사람도 그렇게 불렀다. 그 사람이 대화를 열면
    /// `Authentication required` 로 죽는다(이미 실측해 둔 실패다).
    #[test]
    fn installed_but_not_logged_in_is_not_ready() {
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(test_bin("claude"));
        files.insert(test_bin("npx"));
        let path_env = test_path_env();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);

        // ① 로그인돼 있다 → 준비됨.
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| Some(true),
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "ready");

        // ② 로그인이 안 돼 있다 → **준비됨이 아니다.** 할 일이 분명한 다른 상태다.
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| Some(false),
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(
            claude.state, "login-needed",
            "설치만 하고 로그인 안 한 사람에게 준비됐다고 말하면, 그 사람은 대화를 열어 보고서야 안다",
        );

        // ③ **모르면 「안 됨」으로 적지 않는다.** 물어보지 못한 것을 실패로 세면
        //    멀쩡한 도구를 못 쓰게 만든다.
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "ready");
    }

    /// 로그인 확인은 **재 본 실행기에만** 물어본다.
    #[test]
    fn we_only_ask_about_runtimes_we_measured() {
        use std::cell::RefCell;
        let asked: RefCell<Vec<String>> = RefCell::new(Vec::new());
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(test_bin("npx"));
        for (id, _) in LOGIN_PROBE {
            let cli = registry()
                .iter()
                .find(|a| &a.id == id)
                .and_then(|a| a.cli.clone())
                .unwrap();
            files.insert(test_bin(&cli));
        }
        // 재 보지 않은 것도 하나 깔아 둔다 — 그것에는 안 물어봐야 한다.
        files.insert(test_bin("gemini"));
        let path_env = test_path_env();

        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, path: &Path, _, _| {
                asked.borrow_mut().push(path.to_string_lossy().to_string());
                Some(true)
            },
        };
        detect_runtimes(None, Some(path_env.as_os_str()), &probe, None);

        let asked = asked.borrow();
        assert_eq!(asked.len(), LOGIN_PROBE.len(), "물어본 횟수가 표와 다르다: {asked:?}");
        assert!(
            !asked.iter().any(|p| Path::new(p).file_name().is_some_and(|name| name == "gemini")),
            "재 보지 않은 도구에 물어봤다 — 그 도구에서 그 인자가 무슨 뜻인지 모른다",
        );
    }

    /// 로그인 확인도 **어댑터를 띄울 때와 같은 PATH** 를 본다.
    ///
    /// 2026-08-16 검수에서 적발: 종전에는 앱이 상속받은 환경 그대로 띄웠다.
    /// 이 파일 맨 위가 적어 둔 그대로, Finder 로 띄운 앱의 PATH 에는 nvm 자리가
    /// 없다 — `claude` 는 node 를 이름으로 찾는 래퍼라 거기서 실패하고, 우리는
    /// 그 실패를 **로그인 안 됨**으로 읽어 멀쩡한 도구를 목록에서 지웠다.
    #[test]
    fn login_probe_gets_the_same_path_we_launch_with() {
        use std::cell::RefCell;

        let seen: RefCell<Vec<String>> = RefCell::new(Vec::new());
        let mut files: HashSet<PathBuf> = HashSet::new();
        for (id, _) in LOGIN_PROBE {
            let cli = registry()
                .iter()
                .find(|a| &a.id == id)
                .and_then(|a| a.cli.clone())
                .unwrap();
            files.insert(PathBuf::from(format!("/nvm/bin/{cli}")));
        }

        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let path_env = std::env::join_paths([PathBuf::from("/nvm/bin")]).unwrap();
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, child_path: &str| {
                seen.borrow_mut().push(child_path.to_string());
                Some(true)
            },
        };
        detect_runtimes(None, Some(path_env.as_os_str()), &probe, None);

        let seen = seen.borrow();
        assert!(!seen.is_empty(), "아무에게도 안 물어봤다 — 탐지기가 죽었다");
        assert!(
            seen.iter().all(|p| p.contains("/nvm/bin")),
            "찾은 자리를 자식에게 안 물려줬다: {seen:?}",
        );
    }

    /// **띄울 수 있다 ≠ 그 도구가 여기 있다.**
    ///
    /// 2026-08-16 소유자 지적(*"이렇게 다 보여서 좀 이상한데"*)의 뿌리. 우리가
    /// 무슨 CLI 를 감싸는지 안 적어 둔 실행기는 확인할 방법이 없는데, npx 만
    /// 있으면 전부 「준비됨」이 됐다 — 38개 중 20개가 그랬다.
    ///
    /// 이 검사는 **개수**를 못 박지 않는다(레지스트리가 자라면 바뀐다).
    /// 못 박는 것은 규칙 하나다: **CLI 이름을 모르면 「준비됨」이라고 말하지
    /// 않는다.**
    #[test]
    fn we_do_not_call_a_runtime_ready_when_we_never_checked_for_it() {
        // npx 는 있고, 아는 CLI 는 하나도 없는 기기.
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(test_bin("npx"));
        let path_env = test_path_env();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None);

        for status in &out {
            let agent = registry().iter().find(|a| a.id == status.id).unwrap();
            if agent.cli.is_none() {
                /*
                 * 띄울 방법이 없으면 그 사유가 먼저다(`binary-missing` 등) —
                 * 그것도 정직한 답이다. 잡아야 하는 것은 **「준비됨」이라고
                 * 말하는 것** 하나다.
                 */
                assert_ne!(
                    status.state, "ready",
                    "{}: 감싸는 CLI 를 모르는데 준비됐다고 말한다 — 확인한 적 없는 것이다",
                    status.id,
                );
            } else {
                // 아는 CLI 인데 이 기기에 없다 → 사용자가 할 일이 분명하다.
                assert_eq!(status.state, "cli-missing", "{}", status.id);
            }
        }

        // 그리고 이 상황에서 「준비됨」은 **하나도 없어야** 한다.
        assert_eq!(
            out.iter().filter(|s| s.state == "ready").count(),
            0,
            "아는 CLI 가 하나도 없는 기기인데 준비됨이 있다",
        );
        // 검사가 빈 집합 위에서 돌고 있지 않은지도 본다.
        assert!(
            out.iter().filter(|s| s.state == "cli-unknown").count() > 0,
            "cli-unknown 이 0 이면 이 검사는 아무것도 안 지키고 있다",
        );
    }

    #[test]
    fn an_installed_adapter_wins_over_npx() {
        // npx 는 첫 실행이 느리다. 이미 깔려 있으면 그걸 쓴다.
        let files: HashSet<PathBuf> = ["claude", "claude-agent-acp", "npx"]
        .iter()
        .map(|name| test_bin(name))
        .collect();
        let path_env = test_path_env();
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, Some(path_env.as_os_str()), &probe, None);
        let claude = out.iter().find(|r| r.id == "claude-acp").unwrap();
        assert_eq!(claude.state, "ready");
        assert_eq!(
            claude.adapter_path,
            Some(test_bin("claude-agent-acp").to_string_lossy().to_string()),
            "설치된 어댑터를 찾아냈어야 한다"
        );
    }

    #[test]
    fn launch_prefers_an_installed_adapter_and_falls_back_to_pinned_npx() {
        let mut files: HashSet<PathBuf> = ["claude", "npx"]
            .iter()
            .map(|name| test_bin(name))
            .collect();
        let dirs = empty_dirs();
        let path_env = test_path_env();

        {
            let (is_exec, list, read) = probe_with(&files, &dirs);
            let probe = FsProbe {
                is_executable: &is_exec,
                list_dir: &list,
                read_text: &read,
                login_ok: &|_, _, _, _| None,
            };
            let launch = resolve_launch(
                "claude-acp",
                None,
                Some(path_env.as_os_str()),
                &probe,
            None,
            )
            .unwrap();
            assert_eq!(launch.program, test_bin("npx"));
            assert_eq!(
                launch.args,
                vec![
                    "-y".to_string(),
                    npx_package("claude-acp").to_string()
                ],
                "설치돼 있지 않으면 버전 못 박은 npx 로 띄운다"
            );
        }

        files.insert(test_bin("claude-agent-acp"));
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let launch = resolve_launch(
            "claude-acp",
            None,
            Some(path_env.as_os_str()),
            &probe,
            None,
        )
        .unwrap();
        assert_eq!(launch.program, test_bin("claude-agent-acp"));
        assert!(launch.args.is_empty(), "설치돼 있으면 npx 를 건너뛴다");
    }

    #[cfg(not(windows))]
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
            login_ok: &|_, _, _, _| None,
        };
        let launch = resolve_launch("claude-acp", Some(Path::new("/home/me")), None, &probe,
            None,
        ).unwrap();
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
        let path_env = test_path_env();

        // CLI 가 없다 — 사용자가 그 도구를 깔아야 한다.
        let none: HashSet<PathBuf> = HashSet::new();
        let (is_exec, list, read) = probe_with(&none, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        assert!(resolve_launch("claude-acp", None, Some(path_env.as_os_str()), &probe,
            None,
        )
            .unwrap_err()
            .starts_with("cli-missing:"));

        // CLI 는 있는데 띄울 방법이 없다 — 다른 처방이 필요하다.
        let cli_only: HashSet<PathBuf> = [test_bin("claude")].into_iter().collect();
        let (is_exec, list, read) = probe_with(&cli_only, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        assert_eq!(
            resolve_launch("claude-acp", None, Some(path_env.as_os_str()), &probe,
            None,
        ).unwrap_err(),
            "node-missing"
        );

        // 모르는 실행기를 조용히 통과시키지 않는다.
        assert!(resolve_launch("nope", None, Some(path_env.as_os_str()), &probe,
            None,
        )
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
        let leader_pid = child.id();
        // 실제 앱과 같이 별도 wait 스레드가 리더를 회수한다. 리더를 이 함수 뒤에
        // 회수하면 macOS에서 죽은 그룹 리더가 EPERM 과도 상태로 남아, 앱에 없는
        // 수명 조건을 시험하게 된다.
        let reaper = std::thread::spawn(move || child.wait());
        terminate_tree(leader_pid).expect("트리를 끝내지 못했다");
        let _ = reaper.join();
        assert!(
            wait_until_gone(grandchild, std::time::Duration::from_secs(3)),
            "손자 {grandchild} 가 살아남았다 — 앱을 꺼도 계속 도는 상태"
        );
    }

    /// 리더가 먼저 회수돼도 같은 그룹의 손자가 남아 있으면 강제 종료까지 간다.
    ///
    /// 실제 앱에는 자식을 기다리는 별도 스레드가 있으므로 SIGTERM 직후 리더 PID는
    /// 사라질 수 있다. 그 순간 리더만 확인하면 TERM을 무시한 손자는 살아 있는데
    /// 트리가 끝났다고 오판한다.
    #[cfg(unix)]
    #[test]
    fn terminate_tree_escalates_after_the_group_leader_is_reaped() {
        use std::io::{BufRead, BufReader};
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};

        let mut leader = Command::new("/bin/sh")
            .arg("-c")
            // 안쪽 sh 가 TERM 무시 설정을 끝낸 뒤 자기 pid 를 알린다. 바깥 sh 는
            // 기본 TERM 동작을 유지하므로 그룹 TERM 때 리더만 먼저 끝난다.
            .arg("/bin/sh -c 'trap \"\" TERM; echo $$; while :; do sleep 1; done' & wait")
            .stdout(Stdio::piped())
            .process_group(0)
            .spawn()
            .expect("테스트 프로세스 그룹을 띄우지 못했다");
        let leader_pid = leader.id();
        let mut out = BufReader::new(leader.stdout.take().unwrap());
        let mut line = String::new();
        out.read_line(&mut line).unwrap();
        let grandchild: u32 = line
            .trim()
            .parse()
            .expect("TERM 무시 손자의 pid 를 못 읽었다");
        assert_eq!(
            unsafe { libc::getpgid(grandchild as i32) },
            leader_pid as i32,
            "손자가 리더의 프로세스 그룹을 떠나면 이 검사는 다른 조건을 잰다"
        );

        assert_eq!(unsafe { libc::kill(-(leader_pid as i32), libc::SIGTERM) }, 0);
        let _ = leader.wait();
        assert!(
            process_is_running(grandchild),
            "손자가 TERM을 무시하지 않아 조기 반환 조건을 만들지 못했다"
        );

        let result = terminate_tree(leader_pid);
        let gone_before_cleanup =
            wait_until_gone(grandchild, std::time::Duration::from_millis(250));
        // RED에서도 프로세스를 남기지 않는다. 구현이 놓쳤으면 원래 PGID 전체를
        // 여기서 정리한 뒤에만 assertion을 실패시킨다.
        if !gone_before_cleanup {
            unsafe {
                libc::kill(-(leader_pid as i32), libc::SIGKILL);
            }
            let _ = wait_until_gone(grandchild, std::time::Duration::from_secs(3));
        }

        result.expect("남은 프로세스 그룹을 끝내지 못했다");
        assert!(
            gone_before_cleanup,
            "리더가 사라졌다는 이유로 반환해 TERM을 무시한 손자 {grandchild}가 남았다"
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

    /// **플랫폼 중립으로 짠다.** 처음에는 `/bin/echo` · `/bin/sleep` 을 썼는데
    /// Windows 러너에는 그 경로가 없어서 `spawn` 이 실패하고, 그 실패가
    /// 「상한이 잘 듣는다」와 구별되지 않았다(2026-08-20 CI 에서 적발).
    /// 지금은 이 저장소가 어디서든 갖고 있는 것으로 띄운다 — 우리 자신을 돌리는
    /// `cargo` 의 테스트 바이너리가 아니라, 빌드에 이미 필요한 `node` 다.
    fn node_command(script: &str) -> std::process::Command {
        let mut cmd = std::process::Command::new("node");
        cmd.args(["-e", script]);
        cmd
    }

    #[test]
    fn bounded_output_returns_stdout_when_the_command_finishes() {
        let out = bounded_output(
            node_command("process.stdout.write('hello')"),
            std::time::Duration::from_secs(20),
        );
        assert_eq!(out.as_deref().map(str::trim), Some("hello"));
    }

    #[test]
    fn bounded_output_returns_none_when_the_program_does_not_exist() {
        // 이 갈래가 중요하다: Windows 에서 `/bin/echo` 를 쓰던 테스트가 정확히
        // 여기로 떨어졌는데, 상한 테스트는 None 을 기대하므로 **초록으로**
        // 통과했다. 못 띄운 것과 상한에 걸린 것이 같은 값이라 그렇다.
        let cmd = std::process::Command::new("oatlas-no-such-program-anywhere");
        assert!(bounded_output(cmd, std::time::Duration::from_secs(5)).is_none());
    }

    #[test]
    fn bounded_output_kills_a_command_that_never_finishes() {
        // 상한이 안 먹으면 이 테스트가 30초를 잡아먹어 그 자체로 실패한다 —
        // 「죽였다」를 벽시계로도 증명한다.
        let started = std::time::Instant::now();
        let out = bounded_output(
            node_command("setTimeout(() => {}, 30000)"),
            std::time::Duration::from_millis(400),
        );
        assert!(out.is_none(), "안 끝나는 명령이 값을 돌려줬다");
        assert!(
            started.elapsed() < std::time::Duration::from_secs(15),
            "상한이 안 먹었다: {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn logged_out_is_only_true_when_the_tool_says_so() {
        // `claude auth status` 의 실제 출력(2026-08-20 실측) 두 갈래.
        let out = r#"{"loggedIn": false, "authMethod": "none", "apiProvider": "firstParty"}"#;
        assert!(claude_status_is_logged_out(out));

        let ok = r#"{"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "max"}"#;
        assert!(!claude_status_is_logged_out(ok));
    }

    #[test]
    fn unknown_status_is_never_read_as_logged_out() {
        // 판정하지 못한 것을 「죽었다」로 읽으면 멀쩡한 로그인을 지우게 된다.
        for noise in ["", "not json", "{}", r#"{"loggedIn": null}"#, r#"{"loggedIn": "false"}"#] {
            assert!(
                !claude_status_is_logged_out(noise),
                "모르는 출력을 로그아웃으로 읽었다: {noise:?}"
            );
        }
    }

    /// **조건 ③④가 명령 자체에 박혀 있는가** (원장 2026-08-20 (88)).
    ///
    /// 이 문자열이 곧 화면이 보여 주는 것이고 곧 실행되는 것이다. 여기서
    /// `--prefix` 가 빠지면 사용자의 전역 npm 에 깔리고, 버전이 빠지면 같은
    /// 앱이 어제와 오늘 다른 것을 깐다.
    #[test]
    fn install_command_is_pinned_and_confined_to_our_own_prefix() {
        let app_data = Path::new("/tmp/atlas-app-data");
        let cmd = managed_install_command("claude-acp", app_data).unwrap();

        // ⚠️ 기대값을 POSIX 경로로 박아 두면 Windows 에서만 빨개진다(CI 실측).
        // 같은 API 로 만들어 비교한다 — 재는 것은 구분자가 아니라 **그 자리에
        // 우리 prefix 가 들어가는가**다.
        let expected_prefix = managed_cli_prefix(app_data);
        assert!(
            cmd.contains(&format!("--prefix {}", expected_prefix.display())),
            "{cmd}"
        );
        assert!(cmd.contains("managed-node"), "{cmd}");
        assert!(cmd.contains("@anthropic-ai/claude-code@"), "{cmd}");
        // 버전이 붙어 있어야 한다 — `@latest` 나 버전 없는 이름은 고정이 아니다.
        assert!(!cmd.contains("@latest"), "{cmd}");
        let package = installable_package("claude-acp").unwrap();
        assert!(
            package.rsplit('@').next().is_some_and(|v| v.chars().next().is_some_and(|c| c.is_ascii_digit())),
            "버전이 고정되지 않았다: {package}"
        );
    }

    #[test]
    fn only_measured_runtimes_can_be_installed_for_the_user() {
        // 등재되지 않은 것에 설치를 제안하면, 화면이 우리가 확인한 적 없는
        // 패키지를 사용자 기계에 깔겠다고 말하는 것이 된다.
        assert!(managed_install_command("gemini-acp", Path::new("/tmp/x")).is_none());
        assert!(installable_package("gemini-acp").is_none());
        for (id, _) in INSTALLABLE_CLI {
            assert!(registry_agent(id).is_some(), "{id} 가 레지스트리에 없다");
        }
    }

    #[test]
    fn managed_bin_dir_is_last_so_the_users_own_tool_wins() {
        // 사용자가 자기 손으로 깐 것을 우리가 이기면 「터미널에선 되는데
        // 앱에서만 다르다」가 그 자리에서 태어난다.
        let probe = FsProbe {
            is_executable: &|_: &Path| true,
            list_dir: &|_: &Path| Vec::new(),
            read_text: &|_: &Path| None,
            login_ok: &|_: &str, _: &Path, _: &[&str], _: &str| None,
        };
        let managed = PathBuf::from("/app-data/managed-node/bin");
        let path = std::env::join_paths([Path::new("/usr/local/bin")]).unwrap();
        let dirs = candidate_bin_dirs(None, Some(&path), &probe, Some(&managed));

        assert_eq!(dirs.last(), Some(&managed), "앱이 깐 자리가 맨 뒤가 아니다");
        assert!(dirs.len() > 1);
    }

    #[test]
    fn claude_keychain_service_matches_the_two_measured_items() {
        // 2026-08-20 소유자 기계 실측. 이 두 값이 어긋나면 그림자 걷기가
        // 엉뚱한 항목을 겨냥하게 되고, 그러면 아무것도 안 고치면서 남의
        // 키체인 항목을 지우려 들 수 있다.
        assert_eq!(
            claude_credentials_service(Path::new("/Users/stark/.claude")),
            "Claude Code-credentials-ce4c8c26"
        );
        assert_eq!(
            claude_credentials_service(Path::new(
                "/Users/stark/Library/Application Support/dev.jinan.ontology-atlas/agent-config/claude-acp"
            )),
            "Claude Code-credentials-85f2eaa5"
        );
    }

    #[test]
    fn claude_keychain_service_is_stable_and_path_sensitive() {
        let a = claude_credentials_service(Path::new("/tmp/a"));
        let b = claude_credentials_service(Path::new("/tmp/b"));
        assert_ne!(a, b, "경로가 다르면 항목 이름도 달라야 한다");
        assert_eq!(a, claude_credentials_service(Path::new("/tmp/a")));
        assert!(a.starts_with("Claude Code-credentials-"));
        assert_eq!(a.len(), "Claude Code-credentials-".len() + 8);
    }

    #[test]
    fn prepare_isolated_config_writes_our_settings_and_links_credentials() {
        let base = std::env::temp_dir().join(format!("atlas-acp-cfg-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let app_data = base.join("appdata");
        let home = base.join("home");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude").join(".credentials.json"), "{\"t\":1}").unwrap();

        let dir = prepare_isolated_config("claude-acp", &app_data, Some(&home), None, "").unwrap();
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
        let dir2 = prepare_isolated_config("claude-acp", &app_data, Some(&home), None, "").unwrap();
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
        let dir = prepare_isolated_config("claude-acp", &base.join("appdata"), Some(&home), None, "").unwrap();
        assert!(!dir.join(".credentials.json").exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn guarded_runtime_isolation_failure_blocks_launch_preparation() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("atlas-acp-gate-{nonce}"));
        std::fs::create_dir_all(&base).unwrap();
        let app_data_file = base.join("not-a-directory");
        std::fs::write(&app_data_file, "blocked").unwrap();

        let error = prepare_runtime_isolation("claude-acp", &app_data_file, None, None, "").unwrap_err();
        assert!(
            error.starts_with("isolation-failed:config-dir-failed:"),
            "격리 준비 실패가 시작 실패로 올라오지 않았다: {error}"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn unguarded_runtime_does_not_invent_an_isolation_requirement() {
        let isolation = prepare_runtime_isolation(
            "gemini-acp",
            Path::new("/path/that/does/not/need/to/exist"),
            None,
            None,
            "",
        )
        .unwrap();
        assert!(isolation.is_none());
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
        let session_root = std::fs::canonicalize(&vault).unwrap();

        assert_eq!(
            permission_verdict(
                &session_root,
                Some(vault.join("notes.md").to_str().unwrap())
            ),
            PermissionVerdict::AllowInsideVault
        );
        assert_eq!(
            permission_verdict(
                &session_root,
                Some(outside.join("notes.md").to_str().unwrap())
            ),
            PermissionVerdict::Ask,
            "볼트 밖은 반드시 물어야 한다"
        );
        assert_eq!(
            permission_verdict(&session_root, Some("../escape.md")),
            PermissionVerdict::Ask,
            "상대 경로로 올라가는 것도 밖이다"
        );
        assert_eq!(
            permission_verdict(&session_root, None),
            PermissionVerdict::Ask,
            "경로를 모르면 묻는다 — 판단할 수 없는 것을 통과시키지 않는다"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn permission_policy_rejects_invalid_vault_roots_instead_of_allowing_everything() {
        let base = std::env::temp_dir().join(format!(
            "atlas-acp-invalid-root-{}",
            std::process::id()
        ));
        let outside = base.join("outside.md");
        let not_a_directory = base.join("not-a-directory");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(&outside, "outside").unwrap();
        std::fs::write(&not_a_directory, "file").unwrap();

        for invalid_root in [
            Path::new(""),
            Path::new("relative-vault"),
            Path::new("/"),
            base.join("missing").as_path(),
            not_a_directory.as_path(),
        ] {
            assert_eq!(
                permission_verdict(invalid_root, Some(outside.to_str().unwrap())),
                PermissionVerdict::Ask,
                "유효하지 않은 볼트 루트 {invalid_root:?} 는 어떤 경로도 자동 허용하면 안 된다"
            );
        }

        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn permission_policy_rejects_a_session_root_replaced_by_an_outside_symlink() {
        let base = std::env::temp_dir().join(format!(
            "atlas-acp-replaced-root-{}",
            std::process::id()
        ));
        let vault = base.join("vault");
        let outside = base.join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let session_root = std::fs::canonicalize(&vault).unwrap();
        let secret = outside.join("secret.md");
        std::fs::write(&secret, "outside").unwrap();

        std::fs::remove_dir(&vault).unwrap();
        std::os::unix::fs::symlink(&outside, &vault).unwrap();

        assert_eq!(
            permission_verdict(&session_root, Some(secret.to_str().unwrap())),
            PermissionVerdict::Ask,
            "세션 시작 뒤 루트 경로가 외부 링크로 바뀌어도 새 대상을 볼트로 받아들이면 안 된다"
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
        let session_root = std::fs::canonicalize(&vault).unwrap();
        let real = outside.join("secret.md");
        std::fs::write(&real, "x").unwrap();
        let trap = vault.join("looks-inside.md");
        std::os::unix::fs::symlink(&real, &trap).unwrap();

        assert_eq!(
            permission_verdict(&session_root, Some(trap.to_str().unwrap())),
            PermissionVerdict::Ask,
            "볼트 안처럼 보이는 링크가 밖을 가리키면 안이 아니다"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn the_registry_snapshot_is_loaded_and_every_entry_can_be_launched() {
        // 스냅샷이 안 읽히면 목록이 비고, 그러면 이 검사들은 「빈 집합 위에서」
        // 통과한다. 그 상태를 먼저 막는다.
        let agents = registry();
        assert!(agents.len() >= 20, "레지스트리 스냅샷이 비었거나 너무 작다: {}", agents.len());

        for agent in agents {
            assert!(!agent.id.is_empty() && !agent.name.is_empty());
            match &agent.launch {
                RegistryLaunch::Npx { package, .. } => {
                    // 버전을 못 박지 않으면 어느 날 어댑터가 올라가면서 앱이
                    // 조용히 다른 프로토콜을 말하게 된다.
                    assert!(
                        package.contains('@')
                            && package
                                .rsplit('@')
                                .next()
                                .is_some_and(|v| v.chars().next().is_some_and(|c| c.is_ascii_digit())),
                        "{} 의 npx 패키지에 버전이 없다: {package}",
                        agent.id
                    );
                    assert!(adapter_bin_name(package).is_some(), "{}: 실행 파일 이름을 못 뽑는다", agent.id);
                }
                RegistryLaunch::Uvx { package, .. } => assert!(!package.is_empty()),
                RegistryLaunch::Binary { command, .. } => {
                    assert!(!command.is_empty());
                    assert!(!command.starts_with("./"), "{}: `./` 가 안 벗겨졌다", agent.id);
                }
            }
        }
    }

    #[test]
    fn every_isolation_entry_points_at_a_real_registry_agent() {
        // 격리 표가 레지스트리에 없는 id 를 가리키면, 그 실행기는 영원히
        // 「격리 못 함」으로 남으면서 아무도 못 알아챈다.
        for spec in ISOLATION {
            assert!(
                registry_agent(spec.id).is_some(),
                "격리 표의 {} 가 레지스트리에 없다",
                spec.id
            );
            assert!(!spec.config_env.is_empty() && !spec.credentials_file.is_empty());
        }
    }

    #[test]
    fn adapter_bin_name_strips_scope_and_version() {
        assert_eq!(
            adapter_bin_name("@agentclientprotocol/claude-agent-acp@0.68.0").as_deref(),
            Some("claude-agent-acp")
        );
        assert_eq!(adapter_bin_name("codex-acp@1.3.0").as_deref(), Some("codex-acp"));
        assert_eq!(adapter_bin_name("plain").as_deref(), Some("plain"));
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
        let (is_executable, list_dir, read_text, login_ok) = real_probe();
        let probe = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &login_ok,
        };
        let home = std::env::var_os("HOME").map(PathBuf::from);
        // GUI 앱이 받는 빈약한 PATH 를 흉내 낸다 — 터미널 PATH 를 쓰면 이 진단이
        // 정작 재려던 것을 못 잰다.
        let gui_path = std::env::join_paths([PathBuf::from("/usr/bin"), PathBuf::from("/bin")]).unwrap();
        for r in detect_runtimes(home.as_deref(), Some(&gui_path), &probe, None) {
            println!("{:>8} · {:<14} cli={:?} adapter={:?} verified={:?}", r.state, r.id, r.cli_path, r.adapter_path, r.verified);
        }
        println!("--- launch ---");
        for id in ["claude-acp", "codex-acp"] {
            match resolve_launch(id, home.as_deref(), Some(&gui_path), &probe, None) {
                Ok(l) => println!("{id}: {:?} {:?}", l.program, l.args),
                Err(e) => println!("{id}: 실패 {e}"),
            }
        }
    }
}

#[cfg(test)]
mod timing_probe {
    use super::*;

    /// 진짜 디스크로 **얼마나 걸리나** — 진단용, `--ignored` 로만 돈다.
    #[test]
    #[ignore]
    fn how_slow_is_detect() {
        let home = std::env::var_os("HOME").map(PathBuf::from);
        let path = std::env::var_os("PATH");
        let (is_executable, list_dir, read_text, login_ok) = real_probe();

        let skip = |_: &str, _: &Path, _: &[&str], _: &str| None;
        let fast = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &skip,
        };
        let t = std::time::Instant::now();
        let out = detect_runtimes(home.as_deref(), path.as_deref(), &fast, None);
        println!("확인 없이: {:?} · {}개", t.elapsed(), out.len());

        let full = FsProbe {
            is_executable: &is_executable,
            list_dir: &list_dir,
            read_text: &read_text,
            login_ok: &login_ok,
        };
        let t = std::time::Instant::now();
        let out = detect_runtimes(home.as_deref(), path.as_deref(), &full, None);
        println!("확인 포함: {:?} · {}개", t.elapsed(), out.len());
    }
}

#[cfg(test)]
mod newcomer_view {
    use super::tests::{empty_dirs, probe_with};
    use super::*;
    use std::collections::HashSet;

    /// **아무것도 안 깔린 사람에게 화면이 뭐라고 하나** — 진단용.
    /// 소유자 질문(2026-08-16): *"안 쓰던 사람은 어떻게 나오지?"*
    #[test]
    #[ignore]
    fn what_a_newcomer_sees() {
        let files: HashSet<PathBuf> = HashSet::new(); // 아무것도 없다
        let dirs = empty_dirs();
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, None, &probe, None);
        let mut by_state: std::collections::BTreeMap<&str, Vec<&str>> = Default::default();
        for s in &out {
            by_state.entry(s.state.as_str()).or_default().push(&s.id);
        }
        println!("── 아무것도 안 깔린 기계 ──");
        for (state, ids) in &by_state {
            println!("  {state:16} {}개  예: {}", ids.len(), ids.iter().take(3).cloned().collect::<Vec<_>>().join(", "));
        }
        println!("  → 「이 컴퓨터에서 확인됐어요」 = {}개",
                 out.iter().filter(|s| s.state == "ready").count());

        // ② node 만 있는 사람 (개발자라면 흔하다)
        let mut files: HashSet<PathBuf> = HashSet::new();
        files.insert(PathBuf::from("/usr/local/bin/npx"));
        let (is_exec, list, read) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
            read_text: &read,
            login_ok: &|_, _, _, _| None,
        };
        let out = detect_runtimes(None, None, &probe, None);
        println!("── npx 만 있는 기계 ──");
        let mut by_state: std::collections::BTreeMap<&str, usize> = Default::default();
        for s in &out { *by_state.entry(s.state.as_str()).or_default() += 1; }
        for (state, n) in &by_state { println!("  {state:16} {n}개"); }
        println!("  → 「확인됐어요」 = {}개", out.iter().filter(|s| s.state == "ready").count());
    }
}

// ─── npx 캐시 자기 치유 검사 ──────────────────────────────────────────────
//
// 게이트 규율: 아래 검사들은 「깨진 캐시」를 임시 디렉터리에 **실측 그대로**
// 재현한다(2026-08-19 소유자 기계에서 관찰한 모양 — node_modules 는 차 있고
// .bin 은 비어 있고 package.json 은 없다). 치유 로직을 무력화하면 빨간불이
// 되는 것을 확인하고 넣었다.
#[cfg(test)]
mod npx_cache_tests {
    use super::*;

    /// 시험용 캐시 항목을 원하는 모양으로 만든다.
    struct EntryShape {
        package_json: Option<&'static str>,
        node_modules: bool,
        bin_entries: &'static [&'static str],
    }

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "atlas-acp-npx-{tag}-{}-{}",
            std::process::id(),
            ACP_SESSION_TEST_NONCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    static ACP_SESSION_TEST_NONCE: std::sync::atomic::AtomicU64 =
        std::sync::atomic::AtomicU64::new(0);

    fn build_entry(entry: &Path, shape: &EntryShape) {
        std::fs::create_dir_all(entry).unwrap();
        if let Some(text) = shape.package_json {
            std::fs::write(entry.join("package.json"), text).unwrap();
        }
        if shape.node_modules {
            let bin = entry.join("node_modules").join(".bin");
            std::fs::create_dir_all(&bin).unwrap();
            std::fs::create_dir_all(
                entry
                    .join("node_modules")
                    .join("@agentclientprotocol")
                    .join("claude-agent-acp"),
            )
            .unwrap();
            for name in shape.bin_entries {
                std::fs::write(bin.join(name), "#!/bin/sh\n").unwrap();
            }
        }
    }

    const CLAUDE_SPEC: &str = "@agentclientprotocol/claude-agent-acp@0.69.0";
    const HEALTHY_MANIFEST: &str = r#"{
  "dependencies": { "@agentclientprotocol/claude-agent-acp": "^0.69.0" },
  "_npx": { "packages": ["@agentclientprotocol/claude-agent-acp@0.69.0"] }
}"#;

    fn npx_launch(package: &str) -> AcpLaunch {
        AcpLaunch {
            program: PathBuf::from("/home/me/.nvm/versions/node/v24.16.0/bin/npx"),
            args: vec!["-y".to_string(), package.to_string()],
            path_env: String::new(),
        }
    }

    #[test]
    fn entry_dir_matches_npms_observed_hashes() {
        // 공식(sha512 hex 앞 16자)을 **소유자 기계에서 실측한 두 값**에 못
        // 박는다. 하나는 소유자 화면의 npm 오류가 가리킨 바로 그 깨진 디렉터리,
        // 하나는 같은 기계에 살아 있던 codex 항목이다. 공식이 흔들리면 치유가
        // 조용히 아무것도 안 하게 되므로, 여기가 가장 먼저 터져야 한다.
        let root = PathBuf::from("/Users/me/.npm/_npx");
        assert_eq!(
            npx_cache_entry_dir(&root, CLAUDE_SPEC),
            root.join("8757e2301903ae53"),
        );
        assert_eq!(
            npx_cache_entry_dir(&root, "@agentclientprotocol/codex-acp@1.4.0"),
            root.join("8adbf6f1a7dec4e5"),
        );
    }

    #[test]
    fn spots_the_owners_broken_cache_shape() {
        // 실측 그대로: node_modules 는 차 있고 .bin 은 비어 있고 package.json 없음.
        let dir = scratch("broken");
        let entry = dir.join("8757e2301903ae53");
        build_entry(
            &entry,
            &EntryShape {
                package_json: None,
                node_modules: true,
                bin_entries: &[],
            },
        );
        assert_eq!(
            npx_entry_health(&entry, CLAUDE_SPEC),
            NpxEntryHealth::Broken("package-json-missing"),
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_a_completed_install() {
        // 살아 있는 항목의 실측 모양(package.json + _npx 표식 + .bin 연결).
        let dir = scratch("healthy");
        let entry = dir.join("entry");
        build_entry(
            &entry,
            &EntryShape {
                package_json: Some(HEALTHY_MANIFEST),
                node_modules: true,
                bin_entries: &["claude-agent-acp"],
            },
        );
        assert_eq!(npx_entry_health(&entry, CLAUDE_SPEC), NpxEntryHealth::Usable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn spots_unlinked_bins_and_unparseable_manifests() {
        // 내려받기는 끝났는데 실행 파일 연결 전에 끊긴 상태 —
        // npx 는 「실행할 것을 못 찾겠다」로 멈추고 스스로 낫지 않는다.
        let dir = scratch("nobin");
        let entry = dir.join("entry");
        build_entry(
            &entry,
            &EntryShape {
                package_json: Some(HEALTHY_MANIFEST),
                node_modules: true,
                bin_entries: &[],
            },
        );
        assert_eq!(
            npx_entry_health(&entry, CLAUDE_SPEC),
            NpxEntryHealth::Broken("bin-links-missing"),
        );
        // 반쪽 JSON — 쓰다가 끊긴 package.json 도 같은 막다른 길이다.
        std::fs::write(entry.join("package.json"), "{\"dependencies\": {").unwrap();
        assert_eq!(
            npx_entry_health(&entry, CLAUDE_SPEC),
            NpxEntryHealth::Broken("package-json-unparseable"),
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn leaves_a_foreign_entry_alone() {
        // _npx 표식이 **다른** 스펙을 가리키면 남의 캐시일 수 있다 —
        // 깨진 듯 보여도(빈 .bin) 절대 지우지 않는다.
        let dir = scratch("foreign");
        let entry = dir.join("entry");
        build_entry(
            &entry,
            &EntryShape {
                package_json: Some(r#"{ "_npx": { "packages": ["somebody-else@9.9.9"] } }"#),
                node_modules: true,
                bin_entries: &[],
            },
        );
        assert_eq!(npx_entry_health(&entry, CLAUDE_SPEC), NpxEntryHealth::Usable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn preflight_removes_only_the_broken_entry() {
        // 홈 전체를 흉내 낸다: 우리 항목은 깨져 있고, 옆에는 남의 항목이 산다.
        let home = scratch("home");
        let root = npx_cache_root(Some(&home)).unwrap();
        let ours = npx_cache_entry_dir(&root, CLAUDE_SPEC);
        build_entry(
            &ours,
            &EntryShape {
                package_json: None,
                node_modules: true,
                bin_entries: &[],
            },
        );
        let neighbor = root.join("deadbeefdeadbeef");
        build_entry(
            &neighbor,
            &EntryShape {
                package_json: Some(r#"{ "_npx": { "packages": ["other@1.0.0"] } }"#),
                node_modules: true,
                bin_entries: &["other"],
            },
        );

        let verdict = preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home));
        assert_eq!(
            verdict,
            NpxCachePreflight::HealedBrokenEntry {
                reason: "package-json-missing"
            },
        );
        assert!(!ours.exists(), "깨진 항목은 지워져야 한다");
        assert!(
            neighbor.join("node_modules").join(".bin").join("other").exists(),
            "옆의 남의 항목은 그대로여야 한다 — 범위는 항목 하나다"
        );

        // 지운 뒤의 다음 시작은 「처음 내려받기」다 — 화면이 그렇게 말할 근거.
        assert_eq!(
            preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home)),
            NpxCachePreflight::FirstDownload,
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn preflight_reports_a_ready_cache_and_ignores_non_npx_launches() {
        let home = scratch("ready");
        let root = npx_cache_root(Some(&home)).unwrap();
        build_entry(
            &npx_cache_entry_dir(&root, CLAUDE_SPEC),
            &EntryShape {
                package_json: Some(HEALTHY_MANIFEST),
                node_modules: true,
                bin_entries: &["claude-agent-acp"],
            },
        );
        assert_eq!(
            preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home)),
            NpxCachePreflight::CacheReady,
        );

        // 전역 어댑터로 뜨는 시작은 npx 캐시와 무관하다.
        let installed = AcpLaunch {
            program: PathBuf::from("/usr/local/bin/claude-agent-acp"),
            args: vec![],
            path_env: String::new(),
        };
        assert_eq!(
            preflight_npx_cache(&installed, Some(&home)),
            NpxCachePreflight::NotNpx,
        );
        // 홈을 모르면 캐시를 못 본다 — 종전과 같이 그냥 띄운다.
        assert_eq!(
            preflight_npx_cache(&npx_launch(CLAUDE_SPEC), None),
            NpxCachePreflight::CacheUnknown,
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn cache_root_honors_the_users_npmrc_override() {
        let home = scratch("npmrc");
        // `cache-min` 같은 이웃 열쇠에 속으면 엉뚱한 곳을 뒤진다.
        std::fs::write(
            home.join(".npmrc"),
            "cache-min=999\ncache = ~/custom-cache\n",
        )
        .unwrap();
        assert_eq!(
            npx_cache_root(Some(&home)),
            Some(home.join("custom-cache").join("_npx")),
        );

        // npmrc 가 없으면 플랫폼 기본값.
        let plain = scratch("plainhome");
        let expected = if cfg!(windows) {
            plain.join("AppData").join("Local").join("npm-cache").join("_npx")
        } else {
            plain.join(".npm").join("_npx")
        };
        assert_eq!(npx_cache_root(Some(&plain)), Some(expected));
        let _ = std::fs::remove_dir_all(&home);
        let _ = std::fs::remove_dir_all(&plain);
    }

    #[test]
    fn dir_size_counts_files_under_the_entry() {
        let dir = scratch("size");
        std::fs::create_dir_all(dir.join("a").join("b")).unwrap();
        std::fs::write(dir.join("a").join("one"), vec![0u8; 1000]).unwrap();
        std::fs::write(dir.join("a").join("b").join("two"), vec![0u8; 500]).unwrap();
        assert_eq!(dir_size_bytes(&dir), 1500);
        assert_eq!(dir_size_bytes(&dir.join("missing")), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
