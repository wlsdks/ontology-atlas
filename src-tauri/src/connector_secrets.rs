//! The OS keychain entries behind an external MCP connector's tokens.
//!
//! ## Why this is not `secrets.rs`
//!
//! That module holds BYOK provider keys under a **frozen three-name allow-list**, and its own
//! comment explains why that list must not grow: the cost is the number of concepts, not the number
//! of vendors. A connector is the opposite shape — the person names it, there are as many as they
//! have tools, and the account name is derived from a record they created. Widening the provider
//! allow-list to fit them would break the thing that keeps it safe, so connectors get their own
//! service name and their own account scheme, and the two never see each other's entries.
//!
//! ## The WebView still never holds a token
//!
//! `secrets.rs` states the contract: there is no command that returns a stored key. That holds here
//! too, and it is harder to keep, because a connector's token has to end up inside the
//! `session/new` line — and that line is composed in the WebView.
//!
//! So the WebView composes it with a **reference**, not a value:
//!
//! ```json
//! { "name": "NOTION_TOKEN", "__atlasSecretRef": "connector:c1:NOTION_TOKEN" }
//! ```
//!
//! and `resolve_secret_refs` swaps each of those for `{ "name": …, "value": … }` on its way out
//! through `acp_send`. The token exists in this process for the length of one line. Nothing returns
//! it upward, nothing logs it, and the WebView never sees it — the same promise as BYOK, kept
//! through a different mechanism because the destination is different.
//!
//! ## An unresolvable reference stops the line
//!
//! If the keychain has no value for a reference, this returns an error naming the **variable**, and
//! the session does not open. The alternative — attaching the server with an empty token — produces
//! an agent whose tools are present but always fail, which is the failure mode that costs somebody
//! an afternoon. The screen keeps this from happening by checking presence before it lets a
//! connector be switched on; this is the backstop underneath that.

use keyring::Entry;
use serde::Serialize;
use serde_json::Value;

use crate::errors::coded;
use crate::secrets::{is_cleared, Step};

/// Distinct from `secrets.rs`'s `Ontology Atlas`, so a person looking in Keychain Access sees which
/// entries belong to their connectors and can delete that group alone.
const SERVICE: &str = "Ontology Atlas Connectors";

/// The marker key the WebView writes in place of a value.
pub(crate) const SECRET_REF_KEY: &str = "__atlasSecretRef";

/// `connector:<record id>:<VARIABLE>`.
///
/// Validated rather than trusted, for the reason `validate_provider` gives: the string the front
/// end passes becomes the keychain account name, so anything unconstrained creates entries nobody
/// can find again — and here it would also let one connector's reference address another's.
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

/// The tail four characters, so the screen can show the token's **shape** and nothing else. Same
/// rule and same reason as `secrets.rs`; duplicated rather than shared because the two modules must
/// be able to change independently without one silently widening the other.
fn tail4(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    let start = chars.len().saturating_sub(4);
    chars[start..].iter().collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorSecretStatus {
    /// The reference, echoed back so a screen holding several does not have to track the pairing.
    secret_ref: String,
    stored: bool,
    /// Last four characters, only when present. **No command returns the whole value.**
    last4: Option<String>,
}

/// Store one connector variable's value — only when the person typed it and pressed save.
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

/// Present or not, plus the last four characters.
///
/// This is what the screen consults **before** letting a connector be switched on, so that an
/// unresolvable reference is caught while somebody is looking at it rather than when a session
/// refuses to open.
#[tauri::command]
pub fn connector_secret_status(secret_ref: String) -> Result<ConnectorSecretStatus, String> {
    validate_secret_ref(&secret_ref)?;
    match entry(&secret_ref)?.get_password() {
        Ok(secret) => Ok(ConnectorSecretStatus {
            secret_ref,
            stored: true,
            last4: Some(tail4(&secret)),
        }),
        // Absent is a normal state, and a locked keychain is demoted to it for the same reason as
        // in `secrets.rs`: the only question the screen asks is "can this be used right now".
        Err(_) => Ok(ConnectorSecretStatus {
            secret_ref,
            stored: false,
            last4: None,
        }),
    }
}

/// Delete one. Absence still counts as success; a delete that **failed** is reported as a failure.
///
/// The reasoning is `secrets.rs`'s, and it applies with full force here: a false "deleted" is what
/// makes somebody walk away reassured, and hand on a machine believing a token is gone.
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

/// Swap every `__atlasSecretRef` marker in one outgoing ACP line for the value behind it.
///
/// Called from `acp_send`, which runs on the main thread, so the cheap substring check comes first:
/// an ordinary line never touches JSON parsing or the keychain at all. Only `session/new` and
/// `session/load` carry markers, and those are sent once per conversation.
///
/// ## It resolves in one place, not wherever the key appears
///
/// The marker is honoured **only at `params.mcpServers[*].env[*]` and
/// `params.mcpServers[*].headers[*]`** — the two positions this app writes it in. A key with that
/// spelling anywhere else in an outbound message is left exactly as it is.
///
/// A tree-wide walk would have made every path a person's own text can reach into a way to read
/// this machine's keychain: a prompt, a tool result, a file the agent echoed back. None of those
/// are written by us, and none of them should be able to name `connector:c1:NOTION_TOKEN` and get
/// a token in return. Narrowing costs nothing, because the writer on the other side of this bridge
/// only ever puts the marker in those two places.
pub(crate) fn resolve_secret_refs(line: &str) -> Result<String, String> {
    resolve_secret_refs_with(line, &|reference| {
        entry(reference).ok()?.get_password().ok()
    })
}

/// The same, with the keychain injected — the judgment is testable, the keychain is not.
pub(crate) fn resolve_secret_refs_with(
    line: &str,
    read: &dyn Fn(&str) -> Option<String>,
) -> Result<String, String> {
    if !line.contains(SECRET_REF_KEY) {
        return Ok(line.to_string());
    }
    let mut root: Value = match serde_json::from_str(line) {
        Ok(root) => root,
        // A line carrying the marker text but not parsing as JSON is not ours to rewrite. Passing
        // it through unchanged is right: the marker cannot be a value we would have to hide,
        // because the only writer of that key is the code on the other side of this bridge.
        Err(_) => return Ok(line.to_string()),
    };
    let mut missing: Vec<String> = Vec::new();
    substitute_in_servers(&mut root, read, &mut missing);
    if !missing.is_empty() {
        // The **variable name**, never the reference's value and never the token. Attaching the
        // server with an empty token instead would give an agent tools that are present and always
        // fail, which costs far more than a refusal here.
        return Err(coded("connector-secret-missing", missing.join(", ")));
    }
    serde_json::to_string(&root).map_err(|err| coded("acp-line-rewrite-failed", err))
}

/// Walk to `params.mcpServers[*]` and resolve inside each server's `env` and `headers` only.
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

/// One `{ name, __atlasSecretRef }` becomes `{ name, value }`.
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
            // Leave no half-formed entry behind: the caller turns this into an error and the
            // line is never sent.
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
        // Everything outside the shape is refused, for the same reason the provider allow-list
        // refuses: this string becomes a keychain account name.
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
        // The marker itself does not survive into the protocol line.
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
        // Sending the server with an empty token would give the agent tools that always fail.
        assert!(!error.contains("connector:c1"));
    }

    #[test]
    fn a_reference_that_is_not_shaped_like_ours_is_treated_as_missing() {
        // A malformed reference must not reach `Entry::new` as an account name, and it must not
        // silently become an empty value either.
        let line = r#"{"params":{"mcpServers":[{"name":"x","env":[{"name":"X","__atlasSecretRef":"../../etc/passwd"}]}]}}"#;
        assert!(resolve_secret_refs_with(line, &reader(&[("../../etc/passwd", "v")])).is_err());
    }

    #[test]
    fn a_reference_outside_the_server_list_is_left_exactly_as_it_is() {
        // The marker is honoured at two positions this app writes it in, and nowhere else. A
        // tree-wide walk would have turned every path a person's own text reaches — a prompt, a
        // tool result, a file the agent echoed back — into a way to read this machine's keychain
        // by naming a reference.
        for line in [
            // In the prompt a person typed.
            r#"{"params":{"prompt":[{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}]}}"#,
            // Beside the server list rather than inside it.
            r#"{"params":{"cwd":{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}}}"#,
            // On a server, but not in `env` or `headers`.
            r#"{"params":{"mcpServers":[{"name":"n","extra":[{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}]}]}}"#,
            // At the top level, outside `params` entirely.
            r#"{"env":[{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}]}"#,
        ] {
            let out = resolve_secret_refs_with(
                line,
                &reader(&[("connector:c1:NOTION_TOKEN", "ntn_live_value")]),
            )
            .unwrap();
            // Compared as JSON rather than as text: re-serializing sorts object keys, so a
            // string comparison would fail on an ordering change that means nothing. What is
            // being asserted is that the marker is still there and no token took its place.
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
        // Not JSON, so there is nothing to rewrite. Rewriting on a substring match would corrupt
        // a perfectly ordinary line.
        let line = "notice: __atlasSecretRef is an internal marker";
        assert_eq!(resolve_secret_refs_with(line, &reader(&[])).unwrap(), line);
    }

    #[test]
    fn there_is_no_command_that_returns_the_whole_secret() {
        // The same source-reflection guard as `secrets.rs`, for the same reason: a new command
        // that returned `get_password` directly would be caught here and nowhere else. Only the
        // code above the test module is counted — the literals inside this test are not commands.
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
        // A value reaching a log survives the process. The only formatting in this module is the
        // error path, and that formats variable names.
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
        // Char-based, so a multibyte token does not panic on a byte boundary — byte slicing
        // would panic here rather than truncate.
        assert_eq!(tail4("🔑🔒🔓🔐🗝"), "🔒🔓🔐🗝");
    }

    #[test]
    fn the_connector_service_name_is_not_the_byok_one() {
        // Sharing the service would let a connector reference address a provider key, and would
        // put both groups in one undeletable pile in Keychain Access.
        assert_ne!(SERVICE, "Ontology Atlas");
    }
}
