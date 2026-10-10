//! Agent connection diagnosis in dependency order. Returns check ids and measured
//! facts, never sentences (the screen localizes); unverifiable is `unknown`, and `fixable`
//! requires a `repair()` arm, which contract tests bind.

use std::path::{Path, PathBuf};

use crate::acp;

/// A fact, not a sentence.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AcpCheck {
    /// The i18n key, 1:1.
    pub id: &'static str,
    /// `ok` · `problem` · `unknown`
    pub state: &'static str,
    /// Meaningful only for `problem`.
    pub fixable: bool,
    /// A failed prerequisite makes this step futile, so no fix button is offered.
    pub blocked: bool,
    /// `None` when absent; never fabricated.
    pub detail: Option<String>,
}

impl AcpCheck {
    fn ok(id: &'static str, detail: Option<String>) -> Self {
        Self {
            id,
            state: "ok",
            fixable: false,
            blocked: false,
            detail,
        }
    }
    fn problem(id: &'static str, fixable: bool, detail: Option<String>) -> Self {
        Self {
            id,
            state: "problem",
            fixable,
            blocked: false,
            detail,
        }
    }
    fn unknown(id: &'static str, detail: Option<String>) -> Self {
        Self {
            id,
            state: "unknown",
            fixable: false,
            blocked: false,
            detail,
        }
    }
}

/// When these fail, every later check is futile.
const PREREQUISITE_IDS: &[&str] = &["cli", "launcher"];

/// Dependency order: the screen reads from the top.
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

/// Only these may be `fixable: true`.
pub(crate) const REPAIRABLE_IDS: &[&str] = &[
    "npx-cache",
    "config-dir",
    "credentials-link",
    "shadow-keychain",
];

/// Copy of `GATED_SESSION_MODE` in `src/features/acp-session/model/runtime-gate.ts`, held
/// by `tests/contract/agent-doctor-checks.contract.test.ts` against drift. Codex's `read-only`
/// is a vault-scoped write sandbox, so Git history is the undo.
pub(crate) const SESSION_MODE_GATE: &[(&str, &str)] = &[("codex-acp", "read-only")];

/// Values so tests can swap them.
pub(crate) struct DoctorContext<'a> {
    pub runtime_id: &'a str,
    pub home: Option<&'a Path>,
    pub app_data_dir: &'a Path,
    pub cli: Option<&'a Path>,
    pub launcher: Option<&'a Path>,
    pub path_env: &'a str,
    /// `None` if it could not be queried.
    pub isolated_logged_out: Option<bool>,
    /// `None` if the OS cannot verify it.
    pub shadow_present: Option<bool>,
}

/// Does not fix anything.
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

    // With neither mechanism the gate is a `problem`, ours to fix rather than the user's, so no fix button.
    // Controlling codex's config directory is not holding its write gate (decision
    // (111)); report the compound boundary instead.
    out.push(
        if acp::registry::chat_eligible(ctx.runtime_id) && acp::isolation::config_env_for(ctx.runtime_id).is_some() {
            let detail = SESSION_MODE_GATE
                .iter()
                .find(|(id, _)| *id == ctx.runtime_id)
                .map(|(_, mode)| format!("isolation+session-mode:{mode}+server-checkpoint"))
                .unwrap_or_else(|| "isolation".into());
            AcpCheck::ok("gate", Some(detail))
        } else if let Some((_, mode)) = SESSION_MODE_GATE
            .iter()
            .find(|(id, _)| *id == ctx.runtime_id)
        {
            AcpCheck::ok("gate", Some(format!("session-mode:{mode}")))
        } else {
            AcpCheck::problem("gate", false, None)
        },
    );

    // No cache outside npx is not applicable, so it is left off rather than shown green.
    if let Some(entry) = npx_entry_path(ctx) {
        out.push(
            match acp::npx_cache::npx_entry_health(&entry, npx_package(ctx).as_deref().unwrap_or("")) {
                acp::npx_cache::NpxEntryHealth::Usable => AcpCheck::ok("npx-cache", None),
                // Not yet downloaded is fine: it downloads on first launch.
                acp::npx_cache::NpxEntryHealth::Missing => {
                    AcpCheck::ok("npx-cache", Some("not-downloaded".into()))
                }
                acp::npx_cache::NpxEntryHealth::Broken(reason) => {
                    AcpCheck::problem("npx-cache", true, Some(reason.into()))
                }
            },
        );
    }

    // The four isolation checks are emitted only for isolating executors; `unknown`
    // for something that does not apply would read as a half-broken tool.
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
            // Never logged in from the terminal: nothing to link, not a broken link.
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

/// An unlisted id would leave the screen with no wording, so output is bound to the list.
fn finish(mut out: Vec<AcpCheck>) -> Vec<AcpCheck> {
    debug_assert!(
        out.iter().all(|check| CHECK_IDS.contains(&check.id)),
        "returned a check id that is not on the list"
    );

    // Behind a blocked prerequisite, later checks keep their measured state but are
    // not claimed fixable.
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

/// Only executors with measured isolation have one.
fn isolated_dir(ctx: &DoctorContext<'_>) -> Option<PathBuf> {
    acp::isolation::config_env_for(ctx.runtime_id)?;
    Some(ctx.app_data_dir.join("agent-config").join(ctx.runtime_id))
}

fn npx_package(ctx: &DoctorContext<'_>) -> Option<String> {
    match &acp::registry::registry_agent(ctx.runtime_id)?.launch {
        acp::registry::RegistryLaunch::Npx { package, .. } => Some(package.clone()),
        _ => None,
    }
}

fn npx_entry_path(ctx: &DoctorContext<'_>) -> Option<PathBuf> {
    let package = npx_package(ctx)?;
    let root = acp::npx_cache::npx_cache_root(ctx.home)?;
    Some(acp::npx_cache::npx_cache_entry_dir(&root, &package))
}

pub(crate) fn repair(ctx: &DoctorContext<'_>, check_id: &str) -> Result<(), String> {
    if !REPAIRABLE_IDS.contains(&check_id) {
        return Err(format!("not-repairable:{check_id}"));
    }
    match check_id {
        // One preparation path fixes all three, so a separate fix cannot drift from it.
        "config-dir" | "credentials-link" | "shadow-keychain" => acp::isolation::prepare_isolated_config(
            ctx.runtime_id,
            ctx.app_data_dir,
            ctx.home,
            ctx.cli,
            ctx.path_env,
        )
        .map(|_| ())
        .map_err(|reason| format!("repair-failed:{reason}")),
        "npx-cache" => {
            let entry =
                npx_entry_path(ctx).ok_or_else(|| "repair-failed:no-npx-entry".to_string())?;
            std::fs::remove_dir_all(&entry).map_err(|err| format!("repair-failed:{err}"))
        }
        other => Err(format!("not-repairable:{other}")),
    }
}

/// There is no app-side login, so this deletes only what the app created (config
/// folder, link, keychain item) and rebuilds, or the next session starts without
/// a gate or fails.
pub(crate) fn reset_connection(ctx: &DoctorContext<'_>) -> Result<(), String> {
    let Some(dir) = isolated_dir(ctx) else {
        // Nothing app-created to delete, so success.
        return Ok(());
    };

    acp::isolation::remove_shadow_credentials(&dir);

    match std::fs::remove_dir_all(&dir) {
        Ok(()) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(format!("reset-failed:{err}")),
    }

    acp::isolation::prepare_isolated_config(
        ctx.runtime_id,
        ctx.app_data_dir,
        ctx.home,
        ctx.cli,
        ctx.path_env,
    )
    .map(|_| ())
    .map_err(|reason| format!("reset-failed:{reason}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prepare_for_test(c: &DoctorContext<'_>) {
        acp::isolation::prepare_isolated_config(c.runtime_id, c.app_data_dir, c.home, c.cli, c.path_env)
            .expect("setup must succeed for this test to hold");
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

    /// No fix button on a collapsed prerequisite.
    #[test]
    fn nothing_downstream_is_offered_as_fixable_when_the_tool_is_missing() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-l-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(&home).unwrap();

        let app_data = base.join("appdata");
        let c = ctx(&app_data, Some(&home));
        assert!(
            c.cli.is_none() && c.launcher.is_none(),
            "the test precondition does not hold"
        );

        let checks = diagnose(&c);
        let missing_tool = checks.iter().find(|x| x.id == "cli").unwrap();
        assert_eq!(missing_tool.state, "problem");
        assert!(
            !missing_tool.blocked,
            "a prerequisite must not mark itself blocked"
        );

        for check in checks.iter().filter(|x| !PREREQUISITE_IDS.contains(&x.id)) {
            assert!(check.blocked, "{} is not marked blocked", check.id);
            assert!(!check.fixable, "{} offers a fix that cannot work", check.id);
        }
        let _ = std::fs::remove_dir_all(&base);
    }

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

        let cfg = diagnose(&c)
            .into_iter()
            .find(|x| x.id == "config-dir")
            .unwrap();
        assert_eq!(cfg.state, "problem");
        assert!(!cfg.blocked);
        assert!(cfg.fixable, "repair is blocked although prerequisites hold");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    /// Codex is gated only by the measured combination the app owns: adapter pin,
    /// isolated config, forced session mode and consent in `mcp/src/write-consent.mjs`.
    fn a_gate_is_the_measured_combination_the_app_owns() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-h-{}", std::process::id()));

        let claude = diagnose(&ctx(&base, None));
        let gate = claude.iter().find(|c| c.id == "gate").unwrap();
        assert_eq!(gate.state, "ok");
        assert_eq!(gate.detail.as_deref(), Some("isolation"));

        // Isolation alone would repeat decision (111).
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

        let dir = app_data.join("agent-config").join("claude-acp");
        std::fs::write(dir.join("junk.json"), "{}").unwrap();

        reset_connection(&c).unwrap();

        assert!(
            !dir.join("junk.json").exists(),
            "the old file survived relinking"
        );
        // Deleting alone leaves the next session without a gate.
        assert!(
            dir.join("settings.json").is_file(),
            "settings.json was not recreated"
        );
        assert!(
            dir.join(".credentials.json").exists(),
            "the link was not recreated"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn reset_is_a_no_op_for_a_runtime_the_app_did_not_configure() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-k-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "codex-acp";
        assert!(reset_connection(&c).is_ok());
    }

    #[test]
    fn every_fixable_check_has_a_repair_that_handles_it() {
        for id in REPAIRABLE_IDS {
            assert!(
                CHECK_IDS.contains(id),
                "listed as fixable but missing from checks: {id}"
            );
        }
    }

    #[test]
    fn repair_refuses_ids_it_cannot_handle() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-a-{}", std::process::id()));
        let c = ctx(&base, None);
        assert!(repair(&c, "login")
            .unwrap_err()
            .starts_with("not-repairable"));
        assert!(repair(&c, "cli").unwrap_err().starts_with("not-repairable"));
        assert!(repair(&c, "made-up")
            .unwrap_err()
            .starts_with("not-repairable"));
    }

    #[test]
    fn unknown_is_never_reported_as_ok() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-b-{}", std::process::id()));
        let checks = diagnose(&ctx(&base, None));
        let by_id = |id: &str| checks.iter().find(|c| c.id == id).map(|c| c.state);
        assert_eq!(by_id("login"), Some("unknown"));
        assert_eq!(by_id("shadow-keychain"), Some("unknown"));
    }

    /// Eligibility is a subset of isolation: only an installed-app run showing
    /// reject-without-write and allow-with-write earns it (decisions (111), (113)).
    #[test]
    fn an_isolated_runtime_is_not_automatically_chat_eligible() {
        for id in acp::registry::CHAT_ELIGIBLE {
            assert!(
                acp::isolation::config_env_for(id).is_some(),
                "{id} may hold the chat gate but the app does not control its config"
            );
        }
        assert!(
            !acp::registry::chat_eligible("amp-acp"),
            "an unmeasured runtime must never be eligible by default"
        );
        let base = std::env::temp_dir().join(format!("atlas-doctor-e-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "amp-acp";
        let gate = diagnose(&c)
            .into_iter()
            .find(|check| check.id == "gate")
            .unwrap();
        assert_eq!(gate.state, "problem");
    }

    /// A runtime without isolation gets none of the four isolation checks.
    #[test]
    fn a_runtime_without_isolation_gets_no_isolation_checks() {
        // `amp-acp` is a runtime the app does not isolate.
        let base = std::env::temp_dir().join(format!("atlas-doctor-g-{}", std::process::id()));
        let mut c = ctx(&base, None);
        c.runtime_id = "amp-acp";
        let ids: Vec<&str> = diagnose(&c).iter().map(|check| check.id).collect();

        for absent in ["config-dir", "credentials-link", "shadow-keychain", "login"] {
            assert!(
                !ids.contains(&absent),
                "emitted {absent} for a runner without isolation"
            );
        }
        assert!(ids.contains(&"cli"), "the shared checks disappeared");
        assert!(ids.contains(&"launcher"));
    }

    #[test]
    fn missing_cli_and_launcher_are_problems_but_not_fixable_by_us() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-c-{}", std::process::id()));
        let checks = diagnose(&ctx(&base, None));
        for id in ["cli", "launcher"] {
            let check = checks.iter().find(|c| c.id == id).unwrap();
            assert_eq!(check.state, "problem");
            // The app never installs someone else's tool for them.
            assert!(!check.fixable, "{id} claims the app can fix it");
        }
    }

    #[test]
    fn config_dir_problem_is_fixable_and_the_repair_actually_fixes_it() {
        let base = std::env::temp_dir().join(format!("atlas-doctor-d-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let app_data = base.join("appdata");
        let home = base.join("home");
        std::fs::create_dir_all(&home).unwrap();

        // Prerequisites stand so the downstream repair is not blocked.
        let tool = base.join("fake-cli");
        std::fs::write(&tool, "").unwrap();
        let mut c = ctx(&app_data, Some(&home));
        c.cli = Some(&tool);
        c.launcher = Some(&tool);

        let before = diagnose(&c);
        let cfg = before.iter().find(|c| c.id == "config-dir").unwrap();
        assert_eq!(
            cfg.state, "problem",
            "a missing config folder is not reported as a problem"
        );
        assert!(cfg.fixable);

        repair(&c, "config-dir").unwrap();

        let after = diagnose(&c);
        assert_eq!(
            after.iter().find(|c| c.id == "config-dir").unwrap().state,
            "ok",
            "the fix reported success but a recheck shows no change"
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
        assert_eq!(
            checks
                .iter()
                .find(|c| c.id == "credentials-link")
                .unwrap()
                .state,
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
            diagnose(&c)
                .iter()
                .find(|c| c.id == "credentials-link")
                .unwrap()
                .state,
            "problem"
        );
        repair(&c, "credentials-link").unwrap();
        assert_eq!(
            diagnose(&c)
                .iter()
                .find(|c| c.id == "credentials-link")
                .unwrap()
                .state,
            "ok"
        );
        let _ = std::fs::remove_dir_all(&base);
    }
}
