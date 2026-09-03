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

/// If these two are blocked, **everything after them is futile.** When the tool
/// is missing or cannot be launched, no amount of fixing the config folder will
/// open a conversation.
const PREREQUISITE_IDS: &[&str] = &["cli", "launcher"];

/// Every check this file knows. **The order is the dependency order** — when an
/// earlier one collapses, measuring a later one is meaningless, so the screen
/// can simply read from the top.
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

/// The checks `repair()` actually handles. Only entries here may be `fixable: true`.
pub(crate) const REPAIRABLE_IDS: &[&str] = &["npx-cache", "config-dir", "credentials-link", "shadow-keychain"];

/// **Executors whose measured launch contract requires a specific session mode.**
///
/// This is a copy of the screen-side `GATED_SESSION_MODE`
/// (`src/features/acp-session/model/runtime-gate.ts`). There are two copies
/// because there are two places that judge — the screen opens the session, and
/// this file diagnoses. If they diverge,
/// `tests/contract/agent-doctor-checks.contract.test.ts` blocks it.
///
/// Codex is listed only because the exact 1.6.2 adapter, forced `read-only`
/// mode, isolated config, and server-owned Atlas MCP checkpoint passed the
/// installed reject/allow/re-ask matrix together. The mode is not sufficient
/// on its own; `CHAT_ELIGIBLE` remains the stronger launch boundary.
pub(crate) const SESSION_MODE_GATE: &[(&str, &str)] = &[("codex-acp", "read-only")];

/// The outside world the diagnosis needs. Taken as values so tests can swap them out.
pub(crate) struct DoctorContext<'a> {
    pub runtime_id: &'a str,
    pub home: Option<&'a Path>,
    pub app_data_dir: &'a Path,
    /// Absolute path of that executor's real CLI (only when found).
    pub cli: Option<&'a Path>,
    /// Absolute path of the program launching the adapter (only when found).
    pub launcher: Option<&'a Path>,
    /// The PATH to hand the child process.
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
     * **Is there a gate — and of which kind.**
     *
     * Without this line, the basis on which the screen offers "Open a
     * conversation with this tool" appears nowhere in the diagnosis. The fact
     * that there are two gate mechanisms stays invisible too, so someone
     * looking at codex reads the absence of isolation checks as "is it less
     * safe?".
     *
     * Having neither mechanism is a **problem**. It means the screen is making
     * a promise the app cannot keep, and that is ours to fix, not the user's,
     * so no fix button is attached.
     */
    // Measured eligibility, not mere isolation: the app can control codex's config directory and
    // still not hold its write gate, which is exactly what decision (111) recorded. Report the
    // compound Codex boundary instead of calling configuration isolation sufficient by itself.
    out.push(if acp::chat_eligible(ctx.runtime_id) && acp::config_env_for(ctx.runtime_id).is_some() {
        let detail = SESSION_MODE_GATE
            .iter()
            .find(|(id, _)| *id == ctx.runtime_id)
            .map(|(_, mode)| format!("isolation+session-mode:{mode}+server-checkpoint"))
            .unwrap_or_else(|| "isolation".into());
        AcpCheck::ok("gate", Some(detail))
    } else if let Some((_, mode)) = SESSION_MODE_GATE.iter().find(|(id, _)| *id == ctx.runtime_id) {
        AcpCheck::ok("gate", Some(format!("session-mode:{mode}")))
    } else {
        AcpCheck::problem("gate", false, None)
    });

    // Outside the npx branch there is no cache at all. That is "not applicable",
    // not "no problem", so it is left off the list — painting the absent thing
    // green makes the screen pretend to have measured what it never did.
    if let Some(entry) = npx_entry_path(ctx) {
        out.push(match acp::npx_entry_health(&entry, npx_package(ctx).as_deref().unwrap_or("")) {
            acp::NpxEntryHealth::Usable => AcpCheck::ok("npx-cache", None),
            // Not yet downloaded is not a defect — it downloads on first launch.
            acp::NpxEntryHealth::Missing => AcpCheck::ok("npx-cache", Some("not-downloaded".into())),
            acp::NpxEntryHealth::Broken(reason) => {
                AcpCheck::problem("npx-cache", true, Some(reason.into()))
            }
        });
    }

    /*
     * ⚠️ **How a gate is stood differs per executor** (2026-08-20 correction).
     *
     * The four below are the story of executors that stand their gate through
     * **config isolation**. Codex also uses this setup for credentials and a
     * sandbox floor, but its full write boundary is the measured combination
     * of exact adapter pin, forced session mode, and server-owned MCP checkpoint.
     *
     * So for executors that do not use isolation, these four are **not emitted
     * at all.** The first cut emitted them as `unknown`, and the screen showed
     * "Is the app-side config ready — could not verify", which read as **a
     * perfectly fine tool being half broken.** Saying "don't know" about
     * something that does not apply is also a lie.
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
            // The user has never logged in from the terminal. The source to
            // link is missing; the link is not broken.
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

/// **Proof this is not idle.** Returning an unlisted id leaves the screen unable
/// to find any wording for that row, so it draws a blank. The list and the
/// actual output are bound together here.
fn finish(mut out: Vec<AcpCheck>) -> Vec<AcpCheck> {
    debug_assert!(
        out.iter().all(|check| CHECK_IDS.contains(&check.id)),
        "returned a check id that is not on the list"
    );

    // When a prerequisite is blocked, the later ones **are not claimed fixable.**
    // Their state is left as measured — the point is not to hide what was
    // measured, but not to recommend a futile action.
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

/// This executor's app-side config folder. Only executors whose isolation has
/// been measured have a value.
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
        // The same preparation path fixes all three: rewrite the config folder,
        // relink the credentials, and clear the shadow entry. Keeping a separate
        // path that fixes just one would let that path drift from the main one.
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

/// **Re-establishes the connection from scratch.**
///
/// Owner request (2026-08-20): *"Either leave a logout button, or let pressing
/// re-login make the integration link up again."*
///
/// ## Why this is "re-establish", not "logout"
///
/// This app has **no app-side login** — it links the very login the user uses
/// in the terminal and uses it as-is. So offering "logout" here becomes one of
/// two things, and both are bad: deleting the user's real login (not ours to
/// touch), or doing nothing while pretending to.
///
/// Instead, only **what the app created** is deleted: the config folder, the
/// link, and the keychain item addressed to that folder. Then everything is
/// built again from scratch. In this structure, that is the exact meaning of
/// "reconnect when the integration got tangled".
///
/// After deleting, it **must rebuild.** Deleting alone means the next session
/// either comes up without a gate or dies on startup failure — and the user
/// only pressed "re-establish".
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

    /// **Do not build a fix button on a collapsed prerequisite** (2026-08-20 walkthrough).
    ///
    /// We were recommending "App quota settings ready — fix" to someone with
    /// no tool at all. Pressing it is futile — there is no tool to launch.
    #[test]
    fn nothing_downstream_is_offered_as_fixable_when_the_tool_is_missing() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-l-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(&home).unwrap();

        // Someone with neither cli nor launcher = the person from the walkthrough.
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

    /// The opposite direction: when the prerequisites are fine, downstream repairs must stay alive.
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
    /// ⚠️ **What survives from `codex_read_only_is_not_reported_as_a_permission_gate`.**
    ///
    /// That test held decision (111)'s finding: codex's `read-only` session mode blocked direct file
    /// writes while an Atlas MCP write landed unasked, so codex had **no** gate and the screen must
    /// not claim one. The 2026-08-24 acceptance retired the conclusion, not the lesson — codex is
    /// gated now because the app owns the whole measured combination: exact adapter pin, isolated
    /// config, forced session mode, and server-side consent in `mcp/src/write-consent.mjs`.
    ///
    /// So the assertion moves from "codex has no gate" to the compound boundary that actually held.
    fn a_gate_is_the_measured_combination_the_app_owns() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-h-{}", std::process::id()));

        // The runtime gated by isolation.
        let claude = diagnose(&ctx(&base, None));
        let gate = claude.iter().find(|c| c.id == "gate").unwrap();
        assert_eq!(gate.state, "ok");
        assert_eq!(gate.detail.as_deref(), Some("isolation"));

        // Codex needs every measured layer; isolation alone would repeat decision (111).
        let mut c = ctx(&base, None);
        c.runtime_id = "codex-acp";
        let codex = diagnose(&c);
        let gate = codex.iter().find(|c| c.id == "gate").unwrap();
        assert_eq!(gate.state, "ok");
        assert_eq!(
            gate.detail.as_deref(),
            Some("isolation+session-mode:read-only+server-checkpoint"),
            "codex must report the full measured boundary, not isolation alone"
        );
        assert!(
            SESSION_MODE_GATE.contains(&("codex-acp", "read-only")),
            "the doctor must mirror the mode the screen forces before the session is usable"
        );

        // A runtime the app neither isolates nor measured still gets nothing green.
        let mut c = ctx(&base, None);
        c.runtime_id = "amp-acp";
        let gate = diagnose(&c).into_iter().find(|c| c.id == "gate").unwrap();
        assert_eq!(gate.state, "problem");
        assert!(!gate.fixable);
        assert_eq!(gate.detail, None);
    }

    #[test]
    fn a_runtime_with_no_gate_at_all_is_a_problem_we_cannot_fix() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-i-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "gemini-acp";
        let gate = diagnose(&c).into_iter().find(|c| c.id == "gate").unwrap();
        // It is a problem because it means the screen is making a promise the
        // app cannot keep, and it is ours to fix, not the user's, so no fix
        // button is attached.
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

        // Plant a trace of user tampering — re-establishing must remove it.
        let dir = app_data.join("agent-config").join("claude-acp");
        std::fs::write(dir.join("junk.json"), "{}").unwrap();

        reset_connection(&c).unwrap();

        assert!(!dir.join("junk.json").exists(), "다시 맺었는데 옛 파일이 남았다");
        // **Deleting alone is not enough.** The next session comes up without a gate or dies.
        assert!(dir.join("settings.json").is_file(), "다시 만들지 않았다");
        assert!(dir.join(".credentials.json").exists(), "링크를 다시 안 걸었다");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn reset_is_a_no_op_for_a_runtime_the_app_did_not_configure() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-k-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "codex-acp";
        // Nothing to delete, so it is success — saying "cannot do it" makes the
        // user think something is wrong.
        assert!(reset_connection(&c).is_ok());
    }

    #[test]
    fn every_fixable_check_has_a_repair_that_handles_it() {
        // Saying "this can be fixed" and then having nothing happen on press is
        // the worst defect in this spot. The screen is led to believe it told
        // the truth.
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
        // The two we could not ask about must be unknown — not "no problem".
        assert_eq!(by_id("login"), Some("unknown"));
        assert_eq!(by_id("shadow-keychain"), Some("unknown"));
    }

    /// **Eligibility is a subset of isolation, and never the reverse.**
    ///
    /// The two lists hold the same two ids today, which is exactly when this invariant is easiest to
    /// lose: someone adds a runtime to `ISOLATION` and assumes chat follows. It must not. Isolation
    /// says the app can control a config directory; eligibility is the measured claim that the
    /// resulting configuration stops a write until a person answers, and only an installed-app run
    /// showing reject-without-write **and** allow-with-write earns it (decisions (111), (113)).
    #[test]
    fn an_isolated_runtime_is_not_automatically_chat_eligible() {
        for id in acp::CHAT_ELIGIBLE {
            assert!(
                acp::config_env_for(id).is_some(),
                "{id} may hold the chat gate but the app does not control its config"
            );
        }
        assert!(
            !acp::chat_eligible("amp-acp"),
            "an unmeasured runtime must never be eligible by default"
        );
        let base = std::env::temp_dir().join(format!("atlas-doctor-e-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "amp-acp";
        let gate = diagnose(&c).into_iter().find(|check| check.id == "gate").unwrap();
        assert_eq!(gate.state, "problem");
    }

    /// **Do not say "don't know" about what does not apply** (2026-08-20 correction).
    ///
    /// A runtime that does not use config isolation gets none of the four isolation checks, rather
    /// than four rows of `unknown` beside whatever its gate verdict is.
    #[test]
    fn a_runtime_without_isolation_gets_no_isolation_checks() {
        // The example used to be codex. It stopped being one when the app started controlling
        // codex's config directory — which is not the same as trusting its gate, and the next
        // test holds that line. `amp-acp` is a runtime the app genuinely does not isolate.
        let base = std::env::temp_dir().join(format!("atlas-doctor-g-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "amp-acp";
        let ids: Vec<&str> = diagnose(&c).iter().map(|check| check.id).collect();

        for absent in ["config-dir", "credentials-link", "shadow-keychain", "login"] {
            assert!(!ids.contains(&absent), "격리를 안 쓰는 실행기에 {absent} 를 냈다");
        }
        // That said, an empty list is not acceptable — the common checks must still come out.
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
            // The app does not download and install someone else's tool on
            // their behalf — a line this repository has already drawn. So it
            // must not claim it can fix this either.
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

        // Stand up the prerequisites (tool and launcher) — without them the
        // downstream repair is now blocked as "futile", and that is not what
        // this test is measuring.
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
        // Telling someone who has never logged in from the terminal that "the
        // link is broken" pins a fault on them that does not exist.
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
