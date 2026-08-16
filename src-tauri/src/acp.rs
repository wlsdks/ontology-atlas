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
}

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
    },
    AcpRuntimeSpec {
        id: "codex",
        label: "Codex",
        cli: "codex",
        adapter_bin: "codex-acp",
        adapter_package: "@agentclientprotocol/codex-acp@1.3.0",
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
}

/// nvm 이 설치한 Node 들의 `bin` 디렉터리 — **최신 버전이 앞**.
///
/// nvm 은 버전마다 디렉터리를 따로 두고 셸이 그중 하나를 PATH 에 넣는다. 앱은 그
/// 셸을 안 거치므로 직접 골라야 한다. 정렬은 **자연스러운 숫자 순서**로 한다 —
/// 문자열 정렬은 `v9` 를 `v24` 보다 뒤에 둔다.
fn nvm_bin_dirs(home: &Path, probe: &FsProbe<'_>) -> Vec<PathBuf> {
    let versions = home.join(".nvm").join("versions").join("node");
    let mut found: Vec<(Vec<u64>, PathBuf)> = (probe.list_dir)(&versions)
        .into_iter()
        .filter_map(|name| {
            let parts = parse_version(&name)?;
            Some((parts, versions.join(&name).join("bin")))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().map(|(_, dir)| dir).collect()
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
        // nvm 은 버전 디렉터리를 훑어야 하므로 따로 얹는다.
        for dir in nvm_bin_dirs(home, probe) {
            push(dir, &mut dirs);
        }
        for rel in [
            ".local/bin",       // claude 공식 설치 스크립트의 기본 자리
            ".bun/bin",
            ".volta/bin",
            ".asdf/shims",
            ".local/share/mise/shims",
            ".npm-global/bin",
            ".yarn/bin",
        ] {
            push(home.join(rel), &mut dirs);
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

/// 실제 디스크를 보는 기본 프로브.
pub(crate) fn real_probe() -> (
    impl Fn(&Path) -> bool,
    impl Fn(&Path) -> Vec<String>,
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
    (is_executable, list_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn probe_with<'a>(
        files: &'a HashSet<PathBuf>,
        dirs: &'a std::collections::HashMap<PathBuf, Vec<String>>,
    ) -> (impl Fn(&Path) -> bool + 'a, impl Fn(&Path) -> Vec<String> + 'a) {
        (
            move |p: &Path| files.contains(p),
            move |p: &Path| dirs.get(p).cloned().unwrap_or_default(),
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
        let (is_exec, list) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
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
        let (is_exec, list) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
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

    #[test]
    fn resolve_command_returns_none_instead_of_a_guessed_path() {
        // 없는 경로를 돌려주면 실패가 실행 시점으로 미뤄지고, 그때 사용자가 보는
        // 것은 우리가 쓴 문장이 아니라 OS 의 오류다.
        let files = HashSet::new();
        let dirs = empty_dirs();
        let (is_exec, list) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
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
        let (is_exec, list) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
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
            let (is_exec, list) = probe_with(&files, &dirs);
            let probe = FsProbe {
                is_executable: &is_exec,
                list_dir: &list,
            };
            let out = detect_runtimes(None, None, &probe);
            assert!(out.iter().all(|r| r.state == "cli-missing"));
        }

        // ② CLI 는 있는데 npx 도 어댑터도 없다 → 띄울 방법이 없다.
        files.insert(PathBuf::from("/usr/local/bin/claude"));
        let (is_exec, list) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
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
        let (is_exec, list) = probe_with(&files, &dirs);
        let probe = FsProbe {
            is_executable: &is_exec,
            list_dir: &list,
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
