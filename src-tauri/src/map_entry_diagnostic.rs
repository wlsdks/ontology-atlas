use serde_json::{json, Value};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Runtime, Webview};

const ENABLE_ENV: &str = "ONTOLOGY_ATLAS_DIAGNOSE_MAP_ENTRY";
const DEFAULT_PACING_ENV: &str = "ONTOLOGY_ATLAS_DIAGNOSE_MAP_ENTRY_DEFAULT_PACING";
const MAIN_WEBVIEW_LABEL: &str = "main";
const PREFIX: &str = "[ontology-atlas-map-entry-diagnostic]";
const OBSERVER_SCRIPT: &str = include_str!("webview_verify/map_entry_observer.js");
const REPORT_QUERY: &str = r#"(() => {
  const diagnostic = window.__ontologyAtlasMapEntryDiagnostic;
  return diagnostic && typeof diagnostic.read === "function"
    ? diagnostic.read()
    : { collectorStatus: "observer_absent", path: location.pathname };
})()"#;
const COLLECTOR_DEADLINE: Duration = Duration::from_secs(48);
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const CALLBACK_DEADLINE: Duration = Duration::from_millis(350);
const REPORT_BYTE_CAP: usize = 220_000;

fn enabled_value(value: Option<std::ffi::OsString>) -> bool {
    value.as_deref() == Some(std::ffi::OsStr::new("1"))
}

fn default_pacing_value(
    diagnostic: Option<std::ffi::OsString>,
    default_pacing: Option<std::ffi::OsString>,
) -> bool {
    enabled_value(diagnostic) && enabled_value(default_pacing)
}

pub(crate) fn enabled_from_env() -> bool {
    enabled_value(std::env::var_os(ENABLE_ENV))
}

pub(crate) fn default_pacing_from_env() -> bool {
    default_pacing_value(
        std::env::var_os(ENABLE_ENV),
        std::env::var_os(DEFAULT_PACING_ENV),
    )
}

fn pacing_label(default_pacing: bool) -> &'static str {
    if default_pacing {
        "wk-default"
    } else {
        "current-override"
    }
}

pub(crate) fn write_pacing_metadata(default_pacing: bool) {
    if enabled_from_env() {
        super::write_verify_line(format!("{PREFIX} pacing={}", pacing_label(default_pacing)));
    }
}

fn trusted_local_url(url: &tauri::Url) -> bool {
    url.scheme() == "tauri"
        && url.host_str() == Some("localhost")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
}

#[derive(Default)]
struct CollectorState {
    callbacks: usize,
    callback_failures: usize,
    parse_errors: usize,
    observer_absent: bool,
    observer_seen: bool,
    document_id: Option<String>,
    installed_at: Option<f64>,
    saw_entry: bool,
}

enum PayloadOutcome {
    Continue,
    Complete(String),
    OverBudget(usize),
}

fn inspect_payload(payload: &str, state: &mut CollectorState) -> PayloadOutcome {
    state.callbacks += 1;
    if payload.len() > REPORT_BYTE_CAP {
        return PayloadOutcome::OverBudget(payload.len());
    }
    let value: Value = match serde_json::from_str(payload) {
        Ok(value) => value,
        Err(_) => {
            state.parse_errors += 1;
            return PayloadOutcome::Continue;
        }
    };
    match value.get("collectorStatus").and_then(Value::as_str) {
        Some("observer_absent") => {
            state.observer_absent = true;
            PayloadOutcome::Continue
        }
        Some("collecting") => {
            let Some(document_id) = value.get("documentId").and_then(Value::as_str) else {
                state.parse_errors += 1;
                return PayloadOutcome::Continue;
            };
            let Some(installed_at) = value.get("installedAt").and_then(Value::as_f64) else {
                state.parse_errors += 1;
                return PayloadOutcome::Continue;
            };
            state.observer_seen = true;
            state.observer_absent = false;
            state.document_id = Some(document_id.to_owned());
            state.installed_at = Some(installed_at);
            state.saw_entry |= value
                .get("sawEntry")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            PayloadOutcome::Continue
        }
        Some("complete") => {
            let Some(document_id) = value.pointer("/report/documentId").and_then(Value::as_str)
            else {
                state.parse_errors += 1;
                return PayloadOutcome::Continue;
            };
            let Some(installed_at) = value.pointer("/report/installedAt").and_then(Value::as_f64)
            else {
                state.parse_errors += 1;
                return PayloadOutcome::Continue;
            };
            state.observer_seen = true;
            state.observer_absent = false;
            state.document_id = Some(document_id.to_owned());
            state.installed_at = Some(installed_at);
            state.saw_entry |= value
                .pointer("/report/sawEntry")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            PayloadOutcome::Complete(payload.to_string())
        }
        _ => {
            state.parse_errors += 1;
            PayloadOutcome::Continue
        }
    }
}

fn deadline_line(state: &CollectorState) -> String {
    let status = if state.callbacks == 0 || state.callback_failures == state.callbacks {
        "callback_failure"
    } else if state.parse_errors > 0
        && state.parse_errors + state.callback_failures == state.callbacks
    {
        "parse_error"
    } else if state.observer_absent {
        "observer_absent"
    } else if state.saw_entry {
        "collector_timeout_after_entry"
    } else {
        "no_observed_entry"
    };
    format!(
        "{PREFIX} {}",
        json!({
            "collectorStatus": status,
            "callbacks": state.callbacks,
            "callbackFailures": state.callback_failures,
            "parseErrors": state.parse_errors,
            "sawEntry": state.saw_entry,
        })
    )
}

fn terminal_line(trusted_origin_seen: bool, state: &CollectorState) -> String {
    if trusted_origin_seen {
        deadline_line(state)
    } else {
        format!(
            "{PREFIX} {}",
            json!({ "collectorStatus": "untrusted_or_missing_local_origin", "webview": MAIN_WEBVIEW_LABEL })
        )
    }
}

fn collect<R: Runtime>(webview: Webview<R>) {
    let started = Instant::now();
    let mut state = CollectorState::default();
    let mut ready = false;
    let mut trusted_origin_seen = false;

    while started.elapsed() < COLLECTOR_DEADLINE {
        let trusted = webview
            .url()
            .map(|url| trusted_local_url(&url))
            .unwrap_or(false);
        if !trusted {
            std::thread::sleep(POLL_INTERVAL);
            continue;
        }
        trusted_origin_seen = true;
        let poll_started = Instant::now();
        let (sender, receiver) = mpsc::sync_channel(1);
        if webview
            .eval_with_callback(REPORT_QUERY, move |result| {
                let _ = sender.send(result);
            })
            .is_err()
        {
            state.callback_failures += 1;
            state.callbacks += 1;
        } else {
            match receiver.recv_timeout(CALLBACK_DEADLINE) {
                Ok(payload) => match inspect_payload(&payload, &mut state) {
                    PayloadOutcome::Continue => {
                        if state.observer_seen && !ready {
                            super::write_verify_line(format!(
                                "{PREFIX} {}",
                                json!({
                                    "collectorStatus": "ready",
                                    "webview": MAIN_WEBVIEW_LABEL,
                                    "origin": "tauri://localhost",
                                    "documentId": state.document_id,
                                    "installedAt": state.installed_at,
                                })
                            ));
                            ready = true;
                        }
                    }
                    PayloadOutcome::Complete(payload) => {
                        if !ready {
                            super::write_verify_line(format!(
                                "{PREFIX} {}",
                                json!({
                                    "collectorStatus": "ready",
                                    "webview": MAIN_WEBVIEW_LABEL,
                                    "origin": "tauri://localhost",
                                    "documentId": state.document_id,
                                    "installedAt": state.installed_at,
                                })
                            ));
                        }
                        super::write_verify_line(format!("{PREFIX} {payload}"));
                        return;
                    }
                    PayloadOutcome::OverBudget(bytes) => {
                        super::write_verify_line(format!(
                            "{PREFIX} {}",
                            json!({ "collectorStatus": "over_budget_report", "encodedBytes": bytes, "cap": REPORT_BYTE_CAP })
                        ));
                        return;
                    }
                },
                Err(_) => {
                    state.callback_failures += 1;
                    state.callbacks += 1;
                }
            }
        }
        if let Some(remaining) = POLL_INTERVAL.checked_sub(poll_started.elapsed()) {
            std::thread::sleep(remaining);
        }
    }

    super::write_verify_line(terminal_line(trusted_origin_seen, &state));
}

pub(crate) fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("map_entry_diagnostic")
        .js_init_script(OBSERVER_SCRIPT)
        .on_webview_ready(|webview| {
            if webview.label() != MAIN_WEBVIEW_LABEL {
                return;
            }
            tauri::async_runtime::spawn_blocking(move || collect(webview));
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_flag_only_enables_one() {
        for value in [
            None,
            Some(""),
            Some("0"),
            Some("true"),
            Some("yes"),
            Some(" 1"),
            Some("1 "),
        ] {
            assert!(
                !enabled_value(value.map(Into::into)),
                "unexpectedly enabled by {value:?}"
            );
        }
        assert!(enabled_value(Some("1".into())));
    }

    #[test]
    fn default_pacing_requires_both_exact_flags() {
        let false_values = [
            None,
            Some(""),
            Some("0"),
            Some("true"),
            Some(" 1"),
            Some("1 "),
        ];
        for primary in false_values {
            assert!(!default_pacing_value(
                primary.map(Into::into),
                Some("1".into())
            ));
        }
        for secondary in false_values {
            assert!(!default_pacing_value(
                Some("1".into()),
                secondary.map(Into::into)
            ));
        }
        assert!(default_pacing_value(Some("1".into()), Some("1".into())));
    }

    #[test]
    fn pacing_metadata_uses_neutral_variant_names() {
        assert_eq!(pacing_label(false), "current-override");
        assert_eq!(pacing_label(true), "wk-default");
    }

    #[test]
    fn only_exact_local_app_origin_is_trusted() {
        assert!(trusted_local_url(&"tauri://localhost/ko/".parse().unwrap()));
        for url in [
            "https://tauri.localhost/ko/",
            "http://tauri.localhost/ko/",
            "tauri://user@localhost/ko/",
            "tauri://localhost:123/ko/",
            "tauri://localhost.evil.test/ko/",
            "tauri://evil.localhost/ko/",
            "https://example.com/",
        ] {
            assert!(!trusted_local_url(&url.parse().unwrap()), "trusted {url}");
        }
    }

    #[test]
    fn collector_negative_outcomes_remain_distinct() {
        let mut absent = CollectorState::default();
        assert!(matches!(
            inspect_payload(r#"{"collectorStatus":"observer_absent"}"#, &mut absent),
            PayloadOutcome::Continue
        ));
        assert!(deadline_line(&absent).contains("observer_absent"));

        let callbacks = CollectorState {
            callbacks: 3,
            callback_failures: 3,
            ..Default::default()
        };
        assert!(deadline_line(&callbacks).contains("callback_failure"));

        let mut malformed = CollectorState::default();
        assert!(matches!(
            inspect_payload("not-json", &mut malformed),
            PayloadOutcome::Continue
        ));
        assert!(deadline_line(&malformed).contains("parse_error"));

        let collecting = CollectorState {
            callbacks: 2,
            saw_entry: false,
            ..Default::default()
        };
        assert!(deadline_line(&collecting).contains("no_observed_entry"));
        let after_entry = CollectorState {
            callbacks: 2,
            saw_entry: true,
            ..Default::default()
        };
        assert!(deadline_line(&after_entry).contains("collector_timeout_after_entry"));

        assert!(terminal_line(false, &CollectorState::default())
            .contains("untrusted_or_missing_local_origin"));
        assert!(terminal_line(true, &absent).contains("observer_absent"));
        assert!(terminal_line(true, &callbacks).contains("callback_failure"));
    }

    #[test]
    fn complete_and_over_budget_reports_are_terminal() {
        let mut state = CollectorState::default();
        assert!(matches!(
            inspect_payload(
                r#"{"collectorStatus":"complete","report":{"documentId":"doc-1","installedAt":1.5,"sawEntry":true}}"#,
                &mut state
            ),
            PayloadOutcome::Complete(_)
        ));
        assert!(state.observer_seen);
        assert_eq!(state.document_id.as_deref(), Some("doc-1"));
        assert_eq!(state.installed_at, Some(1.5));
        assert!(matches!(
            inspect_payload(&"x".repeat(REPORT_BYTE_CAP + 1), &mut state),
            PayloadOutcome::OverBudget(bytes) if bytes == REPORT_BYTE_CAP + 1
        ));
    }

    #[test]
    fn scripts_are_fixed_and_contain_no_invoke_bridge() {
        assert!(OBSERVER_SCRIPT.contains("readyStateAtInstall"));
        assert!(REPORT_QUERY.contains("__ontologyAtlasMapEntryDiagnostic"));
        for forbidden in [
            "__TAURI__.core.invoke",
            "addEventListener('message'",
            "localStorage",
            "sessionStorage",
        ] {
            assert!(
                !OBSERVER_SCRIPT.contains(forbidden),
                "observer contains {forbidden}"
            );
            assert!(
                !REPORT_QUERY.contains(forbidden),
                "query contains {forbidden}"
            );
        }
    }
}
