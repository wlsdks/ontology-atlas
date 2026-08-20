//! 연동 점검 — **왜 안 되는지를 화면이 스스로 알아내고, 고칠 수 있으면 고친다.**
//!
//! ## 왜 있나 (2026-08-20 소유자 지시)
//!
//! *"연동이 안 되면 사실상 못 쓰는 거잖아."* 맞다. 이 제품에서 에이전트 연결은
//! 곁가지가 아니라 본체이고, 그런데 지금까지 연결이 깨졌을 때 화면이 할 수 있는
//! 일은 **한 가지 증상에 한 문장씩** 답하는 것뿐이었다. 사용자는 어느 단계가
//! 무너졌는지 모른 채 그 문장을 믿고 터미널을 열어야 했다.
//!
//! 그 방식의 대가를 오늘 실측으로 치렀다. 로그인 안내가 실은 **덫**이었는데
//! (`claude-login-repair.ts`), 증상 하나만 보고 있었기 때문에 3일 동안 아무도
//! 그것이 원인인 줄 몰랐다. 단계별로 재 봤으면 「자격증명 링크는 걸려 있는데
//! 로그인은 안 됨」이라는 모순이 첫 화면에 보였을 것이다.
//!
//! ## 설계 규율 셋
//!
//! 1. **여기서는 문장을 만들지 않는다.** 돌려주는 것은 검사 id 와 기계가 잰
//!    사실(경로 · 이름 · 사유)뿐이고, 사람이 읽는 문장은 화면이 i18n 으로 만든다.
//!    Rust 에 한국어 문장을 박으면 영어 화면이 거짓말을 하게 된다.
//! 2. **모르는 것은 「문제 없음」이 아니다.** 확인할 방법이 없으면 `unknown` 이다.
//!    이 저장소가 실행기 상태에서 이미 정한 규율과 같다 — 안 해 본 것을 해 본
//!    것처럼 말하지 않는다.
//! 3. **고칠 수 있다고 말하려면 실제로 고치는 코드가 있어야 한다.** `fixable` 이
//!    참인 검사는 `repair()` 가 그 id 를 반드시 처리한다. 계약 테스트가 그 둘을
//!    묶는다.

use std::path::{Path, PathBuf};

use crate::acp;

/// 검사 한 줄. **문장이 아니라 사실이다.**
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AcpCheck {
    /// 화면이 문구를 고르는 열쇠. i18n 키와 1:1.
    pub id: &'static str,
    /// `ok` · `problem` · `unknown`
    pub state: &'static str,
    /// 앱이 이 문제를 스스로 고칠 수 있나. `problem` 일 때만 뜻이 있다.
    pub fixable: bool,
    /// 기계가 잰 사실 한 조각(경로 · 사유). 없으면 `None` — 지어내지 않는다.
    pub detail: Option<String>,
}

impl AcpCheck {
    fn ok(id: &'static str, detail: Option<String>) -> Self {
        Self { id, state: "ok", fixable: false, detail }
    }
    fn problem(id: &'static str, fixable: bool, detail: Option<String>) -> Self {
        Self { id, state: "problem", fixable, detail }
    }
    fn unknown(id: &'static str, detail: Option<String>) -> Self {
        Self { id, state: "unknown", fixable: false, detail }
    }
}

/// 이 파일이 아는 검사 전부. **순서가 곧 의존 순서다** — 앞의 것이 무너지면
/// 뒤의 것은 재도 뜻이 없으므로 화면이 위에서부터 읽으면 된다.
pub(crate) const CHECK_IDS: &[&str] = &[
    "cli",
    "launcher",
    "npx-cache",
    "config-dir",
    "credentials-link",
    "shadow-keychain",
    "login",
];

/// `repair()` 가 실제로 처리하는 검사. `fixable: true` 는 여기 있는 것만 될 수 있다.
pub(crate) const REPAIRABLE_IDS: &[&str] = &["npx-cache", "config-dir", "credentials-link", "shadow-keychain"];

/// 진단에 필요한 바깥 세계. 테스트가 갈아 끼울 수 있게 값으로 받는다.
pub(crate) struct DoctorContext<'a> {
    pub runtime_id: &'a str,
    pub home: Option<&'a Path>,
    pub app_data_dir: &'a Path,
    /// 그 실행기의 진짜 CLI 절대 경로 (찾았을 때만).
    pub cli: Option<&'a Path>,
    /// 어댑터를 띄우는 프로그램 절대 경로 (찾았을 때만).
    pub launcher: Option<&'a Path>,
    /// 자식에게 줄 PATH.
    pub path_env: &'a str,
    /// 앱 몫 설정 폴더가 로그아웃 상태인가. `None` 이면 물어보지 못했다.
    pub isolated_logged_out: Option<bool>,
    /// 그 폴더 앞으로 난 키체인 항목이 있나. `None` 이면 확인할 수 없는 OS.
    pub shadow_present: Option<bool>,
}

/// 지금 상태를 검사 목록으로 만든다. **아무것도 고치지 않는다.**
pub(crate) fn diagnose(ctx: &DoctorContext<'_>) -> Vec<AcpCheck> {
    let mut out = Vec::new();

    out.push(match ctx.cli {
        Some(path) => AcpCheck::ok("cli", Some(path.display().to_string())),
        None => AcpCheck::problem("cli", false, None),
    });

    out.push(match ctx.launcher {
        Some(path) => AcpCheck::ok("launcher", Some(path.display().to_string())),
        None => AcpCheck::problem("launcher", false, None),
    });

    // npx 갈래가 아니면 캐시 자체가 없다. 「문제 없음」이 아니라 「해당 없음」이라
    // 목록에서 뺀다 — 없는 것을 초록으로 그리면 화면이 안 재 본 것을 잰 척한다.
    if let Some(entry) = npx_entry_path(ctx) {
        out.push(match acp::npx_entry_health(&entry, npx_package(ctx).as_deref().unwrap_or("")) {
            acp::NpxEntryHealth::Usable => AcpCheck::ok("npx-cache", None),
            // 아직 안 받은 것은 결함이 아니다 — 처음 띄울 때 받는다.
            acp::NpxEntryHealth::Missing => AcpCheck::ok("npx-cache", Some("not-downloaded".into())),
            acp::NpxEntryHealth::Broken(reason) => {
                AcpCheck::problem("npx-cache", true, Some(reason.into()))
            }
        });
    }

    /*
     * ⚠️ **관문을 세우는 방식이 실행기마다 다르다** (2026-08-20 정정).
     *
     * 아래 넷은 **설정 격리**로 관문을 세우는 실행기의 이야기다. codex 는 그
     * 방식이 안 먹혀서(격리한 `CODEX_HOME` 을 읽기는 하는데 승인 정책만
     * 어댑터가 덮어쓴다) 대신 **세션 모드 `read-only`** 로 관문을 세운다 —
     * 실측으로 확인된 다른 길이지 관문이 없는 것이 아니다
     * (`src/features/acp-session/model/runtime-gate.ts`).
     *
     * 그래서 격리를 안 쓰는 실행기에는 이 넷을 **아예 안 낸다.** 처음 판은
     * `unknown` 으로 냈는데, 화면에 「앱 몫 설정이 준비됐나 — 확인 못 했어요」가
     * 떠서 **멀쩡한 도구가 반쯤 고장 난 것처럼** 읽혔다. 해당 없는 것을 「모른다」
     * 라고 말하는 것도 거짓말이다.
     */
    let isolated = isolated_dir(ctx);
    let Some(dir) = isolated.clone() else {
        return finish(out);
    };
    out.push(if dir.join("settings.json").is_file() {
        AcpCheck::ok("config-dir", Some(dir.display().to_string()))
    } else {
        AcpCheck::problem("config-dir", true, Some(dir.display().to_string()))
    });

    if let (Some(dir), Some(home)) = (&isolated, ctx.home) {
        let spec_user_dir = home.join(".claude");
        let source = spec_user_dir.join(".credentials.json");
        let link = dir.join(".credentials.json");
        out.push(if !source.exists() {
            // 사용자가 터미널에서 로그인한 적이 없다. 링크할 원본이 없는 것이지
            // 링크가 깨진 것이 아니다.
            AcpCheck::unknown("credentials-link", None)
        } else if std::fs::read_link(&link).ok().as_deref() == Some(source.as_path()) {
            AcpCheck::ok("credentials-link", Some(link.display().to_string()))
        } else {
            AcpCheck::problem("credentials-link", true, Some(link.display().to_string()))
        });
    }

    out.push(match ctx.shadow_present {
        Some(true) => AcpCheck::problem("shadow-keychain", true, None),
        Some(false) => AcpCheck::ok("shadow-keychain", None),
        None => AcpCheck::unknown("shadow-keychain", None),
    });

    out.push(match ctx.isolated_logged_out {
        Some(true) => AcpCheck::problem("login", false, None),
        Some(false) => AcpCheck::ok("login", None),
        None => AcpCheck::unknown("login", None),
    });

    finish(out)
}

/// **놀고 있지 않다는 증거.** 등재되지 않은 id 를 돌려주면 화면이 그 줄에 대해
/// 아무 문구도 못 찾아 빈 칸을 그린다. 목록과 실제 산출을 여기서 묶는다.
fn finish(out: Vec<AcpCheck>) -> Vec<AcpCheck> {
    debug_assert!(
        out.iter().all(|check| CHECK_IDS.contains(&check.id)),
        "등재되지 않은 검사 id 를 돌려줬다"
    );
    out
}

/// 이 실행기의 앱 몫 설정 폴더. 격리를 재 본 실행기만 값이 있다.
fn isolated_dir(ctx: &DoctorContext<'_>) -> Option<PathBuf> {
    acp::config_env_for(ctx.runtime_id)?;
    Some(ctx.app_data_dir.join("agent-config").join(ctx.runtime_id))
}

fn npx_package(ctx: &DoctorContext<'_>) -> Option<String> {
    match &acp::registry_agent(ctx.runtime_id)?.launch {
        acp::RegistryLaunch::Npx { package, .. } => Some(package.clone()),
        _ => None,
    }
}

fn npx_entry_path(ctx: &DoctorContext<'_>) -> Option<PathBuf> {
    let package = npx_package(ctx)?;
    let root = acp::npx_cache_root(ctx.home)?;
    Some(acp::npx_cache_entry_dir(&root, &package))
}

/// `fixable` 이 참이라고 말한 것만 여기 온다. **말한 것을 실제로 한다.**
pub(crate) fn repair(ctx: &DoctorContext<'_>, check_id: &str) -> Result<(), String> {
    if !REPAIRABLE_IDS.contains(&check_id) {
        return Err(format!("not-repairable:{check_id}"));
    }
    match check_id {
        // 셋 다 같은 준비 경로가 고친다: 설정 폴더를 다시 쓰고, 자격증명을 다시
        // 링크하고, 그림자 항목을 걷는다. 하나만 골라 고치는 길을 따로 두면
        // 그 길이 본 경로와 어긋난다.
        "config-dir" | "credentials-link" | "shadow-keychain" => acp::prepare_isolated_config(
            ctx.runtime_id,
            ctx.app_data_dir,
            ctx.home,
            ctx.cli,
            ctx.path_env,
        )
        .map(|_| ())
        .map_err(|reason| format!("repair-failed:{reason}")),
        "npx-cache" => {
            let entry = npx_entry_path(ctx).ok_or_else(|| "repair-failed:no-npx-entry".to_string())?;
            std::fs::remove_dir_all(&entry).map_err(|err| format!("repair-failed:{err}"))
        }
        other => Err(format!("not-repairable:{other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx<'a>(app_data: &'a Path, home: Option<&'a Path>) -> DoctorContext<'a> {
        DoctorContext {
            runtime_id: "claude-acp",
            home,
            app_data_dir: app_data,
            cli: None,
            launcher: None,
            path_env: "",
            isolated_logged_out: None,
            shadow_present: None,
        }
    }

    #[test]
    fn every_fixable_check_has_a_repair_that_handles_it() {
        // 「고칠 수 있어요」라고 말해 놓고 누르면 아무 일도 안 나는 것이 이
        // 자리에서 가장 나쁜 결함이다. 화면은 사실을 말했다고 믿게 된다.
        for id in REPAIRABLE_IDS {
            assert!(
                CHECK_IDS.contains(id),
                "고칠 수 있다고 등재했는데 검사 목록에 없다: {id}"
            );
        }
    }

    #[test]
    fn repair_refuses_ids_it_cannot_handle() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-a-{}", std::process::id()));
        let c = ctx(&base, None);
        assert!(repair(&c, "login").unwrap_err().starts_with("not-repairable"));
        assert!(repair(&c, "cli").unwrap_err().starts_with("not-repairable"));
        assert!(repair(&c, "made-up").unwrap_err().starts_with("not-repairable"));
    }

    #[test]
    fn unknown_is_never_reported_as_ok() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-b-{}", std::process::id()));
        let checks = diagnose(&ctx(&base, None));
        let by_id = |id: &str| checks.iter().find(|c| c.id == id).map(|c| c.state);
        // 물어보지 못한 둘은 unknown 이어야 한다 — 「문제 없음」이 아니다.
        assert_eq!(by_id("login"), Some("unknown"));
        assert_eq!(by_id("shadow-keychain"), Some("unknown"));
    }

    /// **해당 없는 것을 「모른다」라고 말하지 않는다** (2026-08-20 정정).
    ///
    /// codex 는 설정 격리가 아니라 세션 모드로 관문을 세운다. 그런데 첫 판은
    /// 격리 검사 넷을 `unknown` 으로 냈고, 화면에 「앱 몫 설정이 준비됐나 —
    /// 확인 못 했어요」가 떠서 멀쩡한 도구가 반쯤 고장 난 것처럼 읽혔다.
    #[test]
    fn a_runtime_without_isolation_gets_no_isolation_checks() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-g-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "codex-acp";
        let ids: Vec<&str> = diagnose(&c).iter().map(|check| check.id).collect();

        for absent in ["config-dir", "credentials-link", "shadow-keychain", "login"] {
            assert!(!ids.contains(&absent), "격리를 안 쓰는 실행기에 {absent} 를 냈다");
        }
        // 그렇다고 빈 목록이면 안 된다 — 공통 검사는 그대로 나와야 한다.
        assert!(ids.contains(&"cli"), "공통 검사까지 사라졌다");
        assert!(ids.contains(&"launcher"));
    }

    #[test]
    fn missing_cli_and_launcher_are_problems_but_not_fixable_by_us() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-c-{}", std::process::id()));
        let checks = diagnose(&ctx(&base, None));
        for id in ["cli", "launcher"] {
            let check = checks.iter().find(|c| c.id == id).unwrap();
            assert_eq!(check.state, "problem");
            // 남의 도구를 앱이 대신 받아서 설치하지 않는다 — 이 저장소가 이미
            // 정해 둔 선이다. 그러니 고칠 수 있다고 말해서도 안 된다.
            assert!(!check.fixable, "{id} 를 앱이 고칠 수 있다고 말하고 있다");
        }
    }

    #[test]
    fn config_dir_problem_is_fixable_and_the_repair_actually_fixes_it() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-d-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let app_data = base.join("appdata");
        let home = base.join("home");
        std::fs::create_dir_all(&home).unwrap();

        let c = ctx(&app_data, Some(&home));
        let before = diagnose(&c);
        let cfg = before.iter().find(|c| c.id == "config-dir").unwrap();
        assert_eq!(cfg.state, "problem", "설정 폴더가 없는데 문제로 안 봤다");
        assert!(cfg.fixable);

        repair(&c, "config-dir").unwrap();

        let after = diagnose(&c);
        assert_eq!(
            after.iter().find(|c| c.id == "config-dir").unwrap().state,
            "ok",
            "고쳤다고 했는데 다시 재 보니 그대로다"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn credentials_link_is_unknown_when_there_is_nothing_to_link() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-e-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let app_data = base.join("appdata");
        let checks = diagnose(&ctx(&app_data, Some(&home)));
        // 터미널에서 로그인한 적이 없는 사람에게 「링크가 깨졌다」고 말하면
        // 없는 잘못을 뒤집어씌우는 것이다.
        assert_eq!(
            checks.iter().find(|c| c.id == "credentials-link").unwrap().state,
            "unknown"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn credentials_link_becomes_ok_after_repair() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-f-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude").join(".credentials.json"), "{}").unwrap();

        let app_data = base.join("appdata");
        let c = ctx(&app_data, Some(&home));
        assert_eq!(
            diagnose(&c).iter().find(|c| c.id == "credentials-link").unwrap().state,
            "problem"
        );
        repair(&c, "credentials-link").unwrap();
        assert_eq!(
            diagnose(&c).iter().find(|c| c.id == "credentials-link").unwrap().state,
            "ok"
        );
        let _ = std::fs::remove_dir_all(&base);
    }
}
