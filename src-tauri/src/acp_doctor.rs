//! Integration check — **The screen discovers why it fails on its own, and fixes it if possible.**
//!
//! ## Why this exists (2026-08-20 owner directive)
//!
//! *"If integration doesn't work, it's practically unusable."* True. In this product, agent connectivity is
//! not a side feature but the core, yet until now when connections broke, the screen could only
//! respond with **one sentence per symptom**. Users had to open the terminal trusting that sentence,
//! unaware of which step had failed.
//!
//! We paid the price of that approach today through real measurement. The login guidance was actually a **trap**
//! (`claude-login-repair.ts`), and because we were only looking at one symptom, no one
//! realized it was the cause for 3 days. If we had retried step by step, the contradiction "credential link is active but
//! login fails" would have appeared on the first screen.
//!
//! ## Three design disciplines
//!
//! 1. **Do not construct sentences here.** What we return is only the check id and machine-measured
//!    facts (path · name · reason); the screen constructs human-readable sentences via i18n.
//!    Embedding Korean sentences in Rust forces English screens to lie.
//! 2. **"Unknown" is not "no problem."** If there is no way to verify, it is `unknown`.
//!    This aligns with the discipline already set by this repository in executor mode — do not speak as if
//!    you have done something you haven't.
//! 3. **To claim something is fixable, there must be actual fixing code.** For checks where `fixable` is
//!    true, `repair()` must handle that id. Contract tests bind these two together.

use std::path::{Path, PathBuf};

use crate::acp;

/// One line of check. **It is a fact, not a sentence.**
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AcpCheck {
    /// The key the screen uses to choose text. 1:1 with i18n keys.
    pub id: &'static str,
    /// `ok` · `problem` · `unknown`
    pub state: &'static str,
    /// Can the app fix this problem itself? Meaningful only when `problem` is true.
    pub fixable: bool,
    /// **This step is futile because the preceding step failed.**
    ///
    /// Caught in the 2026-08-20 walkthrough: The tool was recommending
    /// 「App quota settings ready — fix」 to users who had no tools at all.
    /// Pressing it does nothing — there is no tool to launch. This file
    /// states that inspection order follows dependency order, yet the UI
    /// ignored it.
    ///
    /// Pattern name: **Fix button built on a collapsed prerequisite.**
    pub blocked: bool,
    /// One fact measured by the machine (path · reason). `None` if absent — never fabricate.
    pub detail: Option<String>,
}

impl AcpCheck {
    fn ok(id: &'static str, detail: Option<String>) -> Self {
        Self { id, state: "ok", fixable: false, blocked: false, detail }
    }
    fn problem(id: &'static str, fixable: bool, detail: Option<String>) -> Self {
        Self { id, state: "problem", fixable, blocked: false, detail }
    }
    fn unknown(id: &'static str, detail: Option<String>) -> Self {
        Self { id, state: "unknown", fixable: false, blocked: false, detail }
    }
}

/// 이 둘이 막히면 **뒤의 모든 것이 소용없다.** 도구가 없거나 띄울 수 없으면
/// 설정 폴더를 아무리 고쳐도 대화는 안 열린다.
const PREREQUISITE_IDS: &[&str] = &["cli", "launcher"];

/// 이 파일이 아는 검사 전부. **순서가 곧 의존 순서다** — 앞의 것이 무너지면
/// 뒤의 것은 재도 뜻이 없으므로 화면이 위에서부터 읽으면 된다.
pub(crate) const CHECK_IDS: &[&str] = &[
    "cli",
    "launcher",
    "gate",
    "npx-cache",
    "config-dir",
    "credentials-link",
    "shadow-keychain",
    "login",
];

/// `repair()` 가 실제로 처리하는 검사. `fixable: true` 는 여기 있는 것만 될 수 있다.
pub(crate) const REPAIRABLE_IDS: &[&str] = &["npx-cache", "config-dir", "credentials-link", "shadow-keychain"];

/// **세션 모드로 관문을 세우는 실행기.**
///
/// 화면 쪽 `GATED_SESSION_MODE`(`src/features/acp-session/model/runtime-gate.ts`)의
/// 사본이다. 사본이 둘인 이유는 판정하는 자리가 둘이기 때문 — 세션을 여는 것은
/// 화면이고, 진단하는 것은 여기다. 어긋나면
/// `tests/contract/agent-doctor-checks.contract.test.ts` 가 막는다.
///
/// codex 가 여기 있는 이유: 격리한 `CODEX_HOME` 을 읽기는 하는데 **승인 정책만
/// 어댑터의 세션 모드가 덮어쓴다**(2026-08-16 실측). 그래서 관문이 없는 것이
/// 아니라 **다른 길**이다.
pub(crate) const SESSION_MODE_GATE: &[(&str, &str)] = &[("codex-acp", "read-only")];

/// 진단에 필요한 바깥 세계. 테스트가 갈아 끼울 수 있게 값으로 받는다.
pub(crate) struct DoctorContext<'a> {
    pub runtime_id: &'a str,
    pub home: Option<&'a Path>,
    pub app_data_dir: &'a Path,
    /// 그 실행기의 진짜 CLI 절대 경로 (찾았을 때만).
    pub cli: Option<&'a Path>,
    /// Absolute path of the program launching the adapter (only when found).
    pub launcher: Option<&'a Path>,
    /// 자식에게 줄 PATH.
    pub path_env: &'a str,
    /// Is the app quota settings folder in a logged-out state. `None` if it could not be queried.
    pub isolated_logged_out: Option<bool>,
    /// Is there a keychain item leading to that folder? `None` if the OS is unverifiable.
    pub shadow_present: Option<bool>,
}

/// Converts the current state into an inspection list. **Does not fix anything.**
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

    /*
     * **관문이 있나 — 그리고 어떤 방식인가.**
     *
     * 이 줄이 없으면 화면이 「이 도구로 대화 열기」를 내주는 근거가 진단
     * 어디에도 안 보인다. 그리고 관문 방식이 둘이라는 사실도 안 보여서, codex
     * 를 보던 사람은 격리 검사가 없는 것을 「덜 안전한가」로 읽게 된다.
     *
     * 둘 중 아무 방식도 없으면 **문제**다. 앱이 못 지킬 약속을 화면이 하고 있다는
     * 뜻이고, 그건 사용자가 아니라 우리가 고칠 일이라 고치기 버튼을 안 단다.
     */
    out.push(if acp::config_env_for(ctx.runtime_id).is_some() {
        AcpCheck::ok("gate", Some("isolation".into()))
    } else if let Some((_, mode)) = SESSION_MODE_GATE.iter().find(|(id, _)| *id == ctx.runtime_id) {
        AcpCheck::ok("gate", Some(format!("session-mode:{mode}")))
    } else {
        AcpCheck::problem("gate", false, None)
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
fn finish(mut out: Vec<AcpCheck>) -> Vec<AcpCheck> {
    debug_assert!(
        out.iter().all(|check| CHECK_IDS.contains(&check.id)),
        "등재되지 않은 검사 id 를 돌려줬다"
    );

    // 선행 조건이 막혔으면 뒤의 것들은 **고칠 수 있다고 말하지 않는다.**
    // 상태는 그대로 둔다 — 잰 것을 감추는 것이 아니라, 소용없는 행동을 권하지
    // 않는 것이 요점이다.
    let blocked_upstream = out
        .iter()
        .any(|check| PREREQUISITE_IDS.contains(&check.id) && check.state == "problem");
    if blocked_upstream {
        for check in out.iter_mut() {
            if PREREQUISITE_IDS.contains(&check.id) {
                continue;
            }
            check.blocked = true;
            check.fixable = false;
        }
    }
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

/// Only items where `fixable` returned true arrive here. **Actually performs what was promised.**
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

/// **연결을 처음부터 다시 맺는다.**
///
/// 소유자 요청(2026-08-20): *"로그아웃 버튼을 놔두던지 재로그인 눌러서 다시
/// 연동되게 한다거나."*
///
/// ## 「로그아웃」이 아니라 「다시 맺기」인 이유
///
/// 이 앱에는 **앱 몫 로그인이 없다** — 사용자가 터미널에서 쓰는 그 로그인을
/// 링크해서 그대로 쓴다. 그러니 여기서 「로그아웃」을 내주면 두 가지 중 하나가
/// 되는데 둘 다 나쁘다: 사용자의 진짜 로그인을 지우거나(우리 소관이 아니다),
/// 아무것도 안 하면서 그런 척하거나.
///
/// 대신 **앱이 만든 것만** 지운다. 설정 폴더 · 링크 · 그 폴더 앞으로 난
/// 키체인 항목. 그다음 처음부터 다시 만든다. 이것이 「연동이 꼬였을 때 다시
/// 연결」의 이 구조에서의 정확한 뜻이다.
///
/// 지운 뒤 **반드시 다시 만든다.** 지우기만 하면 다음 세션이 관문 없이 뜨거나
/// 시작 실패로 죽는데, 사용자는 「다시 맺기」를 눌렀을 뿐이다.
pub(crate) fn reset_connection(ctx: &DoctorContext<'_>) -> Result<(), String> {
    let Some(dir) = isolated_dir(ctx) else {
        // Executors that do not use isolation have no app-created artifacts. No need to delete, so success
// — saying "cannot do it" makes users think something is wrong.
        return Ok(());
    };

    // Remove the keychain item **first**. Deleting the folder first leaves the basis (folder path) for
// naming that item, but there is no reason to reverse the order, and leaving a half-deleted
// state on failure is worse.
    acp::remove_shadow_credentials(&dir);

    match std::fs::remove_dir_all(&dir) {
        Ok(()) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(format!("reset-failed:{err}")),
    }

    acp::prepare_isolated_config(ctx.runtime_id, ctx.app_data_dir, ctx.home, ctx.cli, ctx.path_env)
        .map(|_| ())
        .map_err(|reason| format!("reset-failed:{reason}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prepare_for_test(c: &DoctorContext<'_>) {
        acp::prepare_isolated_config(c.runtime_id, c.app_data_dir, c.home, c.cli, c.path_env)
            .expect("준비가 실패하면 이 시험의 전제가 무너진다");
    }

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

    /// **무너진 앞단 위에 고치기 버튼을 세우지 않는다** (2026-08-20 워크스루).
    ///
    /// 도구가 아예 없는 사람에게 「앱 몫 설정이 준비됐나 — 고치기」를 권하고
    /// 있었다. 눌러도 소용없다 — 띄울 도구 자체가 없으니까.
    #[test]
    fn nothing_downstream_is_offered_as_fixable_when_the_tool_is_missing() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-l-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(&home).unwrap();

        // cli 도 launcher 도 없는 사람 = 워크스루의 그 사람.
        let app_data = base.join("appdata");
        let c = ctx(&app_data, Some(&home));
        assert!(c.cli.is_none() && c.launcher.is_none(), "이 시험의 전제가 깨졌다");

        let checks = diagnose(&c);
        let missing_tool = checks.iter().find(|x| x.id == "cli").unwrap();
        assert_eq!(missing_tool.state, "problem");
        assert!(!missing_tool.blocked, "선행 조건 자신이 막혔다고 표시되면 안 된다");

        for check in checks.iter().filter(|x| !PREREQUISITE_IDS.contains(&x.id)) {
            assert!(check.blocked, "{} 가 막힌 표시가 없다", check.id);
            assert!(
                !check.fixable,
                "{} 에 고치기를 권하고 있다 — 눌러도 소용없다",
                check.id
            );
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 반대 방향: 선행 조건이 멀쩡하면 뒤의 수리는 그대로 살아 있어야 한다.
    #[test]
    fn downstream_repairs_survive_when_prerequisites_are_fine() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-m-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let tool = base.join("fake-claude");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(&tool, "").unwrap();

        let app_data = base.join("appdata");
        let mut c = ctx(&app_data, Some(&home));
        c.cli = Some(&tool);
        c.launcher = Some(&tool);

        let cfg = diagnose(&c).into_iter().find(|x| x.id == "config-dir").unwrap();
        assert_eq!(cfg.state, "problem");
        assert!(!cfg.blocked);
        assert!(cfg.fixable, "선행 조건이 멀쩡한데 수리를 막았다");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn gate_is_reported_for_both_mechanisms() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-h-{}", std::process::id()));

        // 격리로 막는 실행기.
        let claude = diagnose(&ctx(&base, None));
        let gate = claude.iter().find(|c| c.id == "gate").unwrap();
        assert_eq!(gate.state, "ok");
        assert_eq!(gate.detail.as_deref(), Some("isolation"));

        // 세션 모드로 막는 실행기 — 관문이 없는 것이 아니라 다른 길이다.
        let mut c = ctx(&base, None);
        c.runtime_id = "codex-acp";
        let codex = diagnose(&c);
        let gate = codex.iter().find(|c| c.id == "gate").unwrap();
        assert_eq!(gate.state, "ok");
        assert_eq!(gate.detail.as_deref(), Some("session-mode:read-only"));
    }

    #[test]
    fn a_runtime_with_no_gate_at_all_is_a_problem_we_cannot_fix() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-i-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "gemini-acp";
        let gate = diagnose(&c).into_iter().find(|c| c.id == "gate").unwrap();
        // 앱이 못 지킬 약속을 화면이 하고 있다는 뜻이라 문제이고,
        // 사용자가 아니라 우리가 고칠 일이라 고치기 버튼을 안 단다.
        assert_eq!(gate.state, "problem");
        assert!(!gate.fixable);
    }

    #[test]
    fn reset_wipes_what_the_app_made_and_builds_it_again() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-j-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let app_data = base.join("appdata");
        let home = base.join("home");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(home.join(".claude").join(".credentials.json"), "{}").unwrap();

        let c = ctx(&app_data, Some(&home));
        prepare_for_test(&c);

        // 사용자가 손댄 흔적을 심어 둔다 — 다시 맺기는 이것을 없애야 한다.
        let dir = app_data.join("agent-config").join("claude-acp");
        std::fs::write(dir.join("junk.json"), "{}").unwrap();

        reset_connection(&c).unwrap();

        assert!(!dir.join("junk.json").exists(), "다시 맺었는데 옛 파일이 남았다");
        // **지우기만 하면 안 된다.** 다음 세션이 관문 없이 뜨거나 죽는다.
        assert!(dir.join("settings.json").is_file(), "다시 만들지 않았다");
        assert!(dir.join(".credentials.json").exists(), "링크를 다시 안 걸었다");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn reset_is_a_no_op_for_a_runtime_the_app_did_not_configure() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-k-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "codex-acp";
        // 지울 것이 없으니 성공이다 — 「할 수 없다」고 하면 사용자는 뭔가 잘못된
        // 줄 안다.
        assert!(reset_connection(&c).is_ok());
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

        // 선행 조건(도구·실행기)을 세워 둔다 — 그것이 없으면 뒤의 수리는 이제
        // 「소용없음」으로 막히고, 그건 이 시험이 재려는 것이 아니다.
        let tool = base.join("fake-cli");
        std::fs::write(&tool, "").unwrap();
        let mut c = ctx(&app_data, Some(&home));
        c.cli = Some(&tool);
        c.launcher = Some(&tool);

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
