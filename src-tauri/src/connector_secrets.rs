//! Keychain entries for MCP connector tokens, apart from the frozen provider list
//! in secrets.rs. The WebView writes a `__atlasSecretRef` reference, never a value, and
//! an unresolvable reference stops the session rather than attaching an empty token.

use keyring::Entry;
use serde::Serialize;
use serde_json::Value;

use crate::errors::coded;
use crate::secrets::{is_cleared, Step};

/// Distinct from the provider service so this group can be deleted alone.
const SERVICE: &str = "Ontology Atlas Connectors";

pub(crate) const SECRET_REF_KEY: &str = "__atlasSecretRef";

/// `connector:<record id>:<VARIABLE>`, validated because it becomes the keychain
/// account name, or one connector's reference could address another's.
pub(crate) fn validate_secret_ref(reference: &str) -> Result<&str, String> {
    let mut parts = reference.split(':');
    let ok = matches!(parts.next(), Some("connector"))
        && parts
            .next()
            .is_some_and(|id| !id.is_empty() && id.len() <= 64 && id.chars().all(is_id_char))
        && parts.next().is_some_and(|name| {
            !name.is_empty() && name.len() <= 128 && name.chars().all(is_name_char)
        })
        && parts.next().is_none();
    if ok {
        Ok(reference)
    } else {
        Err(coded("connector-secret-ref-invalid", ""))
    }
}

fn is_id_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'
}

fn is_name_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.'
}

fn entry(reference: &str) -> Result<Entry, String> {
    let account = validate_secret_ref(reference)?;
    Entry::new(SERVICE, account).map_err(|err| coded("keychain-unavailable", err))
}

/// Duplicated from `secrets.rs` so neither module can silently widen the other.
fn tail4(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    let start = chars.len().saturating_sub(4);
    chars[start..].iter().collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorSecretStatus {
    secret_ref: String,
    stored: bool,
    /// No command returns the whole value.
    last4: Option<String>,
}

#[tauri::command]
pub fn connector_secret_set(
    secret_ref: String,
    secret: String,
) -> Result<ConnectorSecretStatus, String> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return Err(coded("secret-empty", ""));
    }
    validate_secret_ref(&secret_ref)?;
    entry(&secret_ref)?
        .set_password(trimmed)
        .map_err(|err| coded("keychain-write-failed", err))?;
    Ok(ConnectorSecretStatus {
        secret_ref,
        stored: true,
        last4: Some(tail4(trimmed)),
    })
}

/// The screen checks this before switching a connector on.
#[tauri::command]
pub fn connector_secret_status(secret_ref: String) -> Result<ConnectorSecretStatus, String> {
    validate_secret_ref(&secret_ref)?;
    match entry(&secret_ref)?.get_password() {
        Ok(secret) => Ok(ConnectorSecretStatus {
            secret_ref,
            stored: true,
            last4: Some(tail4(&secret)),
        }),
        // A locked keychain reads as absent, as in `secrets.rs`.
        Err(_) => Ok(ConnectorSecretStatus {
            secret_ref,
            stored: false,
            last4: None,
        }),
    }
}

/// Absence is success; a failed delete is reported, or someone hands on a machine
/// believing the token is gone.
#[tauri::command]
pub fn connector_secret_delete(secret_ref: String) -> Result<ConnectorSecretStatus, String> {
    validate_secret_ref(&secret_ref)?;
    let handle = entry(&secret_ref)?;
    let deleted = match handle.delete_credential() {
        Ok(()) => Step::Done,
        Err(keyring::Error::NoEntry) => Step::Missing,
        Err(_) => Step::Failed,
    };
    let readback = if deleted == Step::Done {
        match handle.get_password() {
            Ok(_) => Step::Done,
            Err(keyring::Error::NoEntry) => Step::Missing,
            Err(_) => Step::Failed,
        }
    } else {
        Step::Failed
    };
    if is_cleared(deleted, readback) {
        Ok(ConnectorSecretStatus {
            secret_ref,
            stored: false,
            last4: None,
        })
    } else {
        Err(coded("keychain-clear-failed", ""))
    }
}

/// Resolves only at `params.mcpServers[*].env[*]` and `.headers[*]`; anywhere
/// else, a prompt or tool result could name a reference and read the keychain.
/// The substring check runs first because `acp_send` is on the main thread.
pub(crate) fn resolve_secret_refs(line: &str) -> Result<String, String> {
    resolve_secret_refs_with(line, &|reference| {
        entry(reference).ok()?.get_password().ok()
    })
}

pub(crate) fn resolve_secret_refs_with(
    line: &str,
    read: &dyn Fn(&str) -> Option<String>,
) -> Result<String, String> {
    if !line.contains(SECRET_REF_KEY) {
        return Ok(line.to_string());
    }
    let mut root: Value = match serde_json::from_str(line) {
        Ok(root) => root,
        // Not JSON, so not ours to rewrite; only this bridge writes the marker.
        Err(_) => return Ok(line.to_string()),
    };
    let mut missing: Vec<String> = Vec::new();
    substitute_in_servers(&mut root, read, &mut missing);
    if !missing.is_empty() {
        // Names the variable, never the reference value or the token.
        return Err(coded("connector-secret-missing", missing.join(", ")));
    }
    serde_json::to_string(&root).map_err(|err| coded("acp-line-rewrite-failed", err))
}

fn substitute_in_servers(
    root: &mut Value,
    read: &dyn Fn(&str) -> Option<String>,
    missing: &mut Vec<String>,
) {
    let Some(servers) = root
        .get_mut("params")
        .and_then(|params| params.get_mut("mcpServers"))
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    for server in servers.iter_mut() {
        for slot in ["env", "headers"] {
            let Some(entries) = server.get_mut(slot).and_then(Value::as_array_mut) else {
                continue;
            };
            for entry in entries.iter_mut() {
                if let Some(map) = entry.as_object_mut() {
                    substitute_entry(map, read, missing);
                }
            }
        }
    }
}

fn substitute_entry(
    map: &mut serde_json::Map<String, Value>,
    read: &dyn Fn(&str) -> Option<String>,
    missing: &mut Vec<String>,
) {
    let Some(reference) = map
        .get(SECRET_REF_KEY)
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        return;
    };
    map.remove(SECRET_REF_KEY);
    let label = map
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("(unnamed)")
        .to_string();
    match validate_secret_ref(&reference).ok().and_then(read) {
        Some(value) => {
            map.insert("value".to_string(), Value::String(value));
        }
        None => {
            // The caller refuses the whole line, so no half-formed entry is sent.
            missing.push(label);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reader<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |reference: &str| {
            pairs
                .iter()
                .find(|(key, _)| *key == reference)
                .map(|(_, value)| (*value).to_string())
        }
    }

    #[test]
    fn a_reference_must_look_like_one() {
        assert!(validate_secret_ref("connector:c1:NOTION_TOKEN").is_ok());
        assert!(validate_secret_ref("connector:9f2a-4b:X.Y_Z-1").is_ok());
        for bad in [
            "",
            "connector",
            "connector:c1",
            "connector:c1:A:B",
            "provider:anthropic",
            "connector::NAME",
            "connector:c1:",
            "connector:c 1:NAME",
            "connector:c1:NA ME",
            "Connector:c1:NAME",
        ] {
            assert!(validate_secret_ref(bad).is_err(), "should reject {bad:?}");
        }
    }

    #[test]
    fn an_ordinary_line_is_returned_untouched_without_parsing() {
        let line = r#"{"jsonrpc":"2.0","method":"session/prompt","params":{"text":"hello"}}"#;
        assert_eq!(resolve_secret_refs_with(line, &reader(&[])).unwrap(), line);
    }

    #[test]
    fn a_marker_becomes_a_value_only_on_the_way_out() {
        let line = r#"{"params":{"mcpServers":[{"name":"notion","env":[{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}]}]}}"#;
        let out = resolve_secret_refs_with(
            line,
            &reader(&[("connector:c1:NOTION_TOKEN", "ntn_live_value")]),
        )
        .unwrap();
        assert!(out.contains(r#""value":"ntn_live_value""#));
        assert!(out.contains(r#""name":"NOTION_TOKEN""#));
        assert!(!out.contains(SECRET_REF_KEY));
    }

    #[test]
    fn an_http_header_reference_resolves_the_same_way() {
        let line = r#"{"params":{"mcpServers":[{"type":"http","name":"linear","url":"https://mcp.linear.app/mcp","headers":[{"name":"Authorization","__atlasSecretRef":"connector:c2:Authorization"}]}]}}"#;
        let out = resolve_secret_refs_with(
            line,
            &reader(&[("connector:c2:Authorization", "Bearer live")]),
        )
        .unwrap();
        assert!(out.contains(r#""value":"Bearer live""#));
    }

    #[test]
    fn a_missing_secret_stops_the_line_and_names_the_variable_only() {
        let line = r#"{"params":{"mcpServers":[{"name":"notion","env":[{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}]}]}}"#;
        let error = resolve_secret_refs_with(line, &reader(&[])).unwrap_err();
        assert!(error.starts_with("connector-secret-missing"));
        assert!(error.contains("NOTION_TOKEN"));
        assert!(!error.contains("connector:c1"));
    }

    #[test]
    fn a_reference_that_is_not_shaped_like_ours_is_treated_as_missing() {
        let line = r#"{"params":{"mcpServers":[{"name":"x","env":[{"name":"X","__atlasSecretRef":"../../etc/passwd"}]}]}}"#;
        assert!(resolve_secret_refs_with(line, &reader(&[("../../etc/passwd", "v")])).is_err());
    }

    #[test]
    fn a_reference_outside_the_server_list_is_left_exactly_as_it_is() {
        // Markers outside the two written positions stay untouched, or text a person
        // controls could read the keychain.
        for line in [
            r#"{"params":{"prompt":[{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}]}}"#,
            r#"{"params":{"cwd":{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}}}"#,
            r#"{"params":{"mcpServers":[{"name":"n","extra":[{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}]}]}}"#,
            r#"{"env":[{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}]}"#,
        ] {
            let out = resolve_secret_refs_with(
                line,
                &reader(&[("connector:c1:NOTION_TOKEN", "ntn_live_value")]),
            )
            .unwrap();
            // Compared as JSON because re-serializing sorts keys.
            let before: Value = serde_json::from_str(line).unwrap();
            let after: Value = serde_json::from_str(&out).unwrap();
            assert_eq!(
                after, before,
                "a marker outside the server list was resolved"
            );
            assert!(!out.contains("ntn_live_value"));
        }
    }

    #[test]
    fn a_line_that_only_mentions_the_marker_in_prose_is_passed_through() {
        let line = "notice: __atlasSecretRef is an internal marker";
        assert_eq!(resolve_secret_refs_with(line, &reader(&[])).unwrap(), line);
    }

    #[test]
    fn there_is_no_command_that_returns_the_whole_secret() {
        // Only code above the test module is counted; a command that returns
        // the `get_password` result directly would be caught here.
        let source = include_str!("connector_secrets.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap();
        let command_count = source.matches("#[tauri::command]").count();
        let status_returns = source
            .matches("Result<ConnectorSecretStatus, String>")
            .count();
        assert_eq!(
            command_count, status_returns,
            "every connector secret command must return only ConnectorSecretStatus"
        );
        assert_eq!(command_count, 3);
    }

    #[test]
    fn the_resolver_never_prints_a_value() {
        let body = include_str!("connector_secrets.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap()
            .to_string();
        for printer in ["println!", "log::info", "log::debug", "log::warn", "dbg!"] {
            assert!(
                !body.contains(printer),
                "no value may be printed: {printer}"
            );
        }
    }

    #[test]
    fn tail4_never_leaks_more_than_four_characters() {
        assert_eq!(tail4("ntn_secret_abcdefgh"), "efgh");
        assert_eq!(tail4("abc"), "abc");
        assert_eq!(tail4(""), "");
        assert_eq!(tail4("🔑🔒🔓🔐🗝"), "🔒🔓🔐🗝");
    }

    #[test]
    fn deleting_a_token_that_is_not_there_is_not_an_error() {
        // The screen deletes tokens before the row, so absence must count as success
        // here through the shared `secrets.rs` judgment.
        assert!(is_cleared(Step::Missing, Step::Failed));
        assert!(is_cleared(Step::Missing, Step::Missing));
        assert!(!is_cleared(Step::Failed, Step::Failed));

        let body = include_str!("connector_secrets.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap();
        assert!(body.contains("Err(keyring::Error::NoEntry) => Step::Missing"));
        assert!(body.contains("if is_cleared(deleted, readback)"));
    }

    #[test]
    fn the_connector_service_name_is_not_the_byok_one() {
        // A shared service would let a connector reference address a provider key.
        assert_ne!(SERVICE, "Ontology Atlas");
    }
}
