//! Env values, headers and permission rules never leave the disk; unparsable text projects to "".

use super::scope::ReadClass;
use serde_json::{json, Map, Value};

pub(super) fn project(class: ReadClass, text: &str) -> String {
    match class {
        ReadClass::Text => text.to_string(),
        ReadClass::TomlMcpHeaders => toml_mcp_headers(text),
        ReadClass::McpServers
        | ReadClass::ClaudeSettings
        | ReadClass::CodexHooks
        | ReadClass::PackageScripts => match serde_json::from_str::<Value>(text) {
            Ok(Value::Object(object)) => Value::Object(json_projection(class, &object)).to_string(),
            Ok(_) => "{}".to_string(),
            Err(_) => String::new(),
        },
        ReadClass::NotAllowed | ReadClass::Denied | ReadClass::Invalid => String::new(),
    }
}

fn json_projection(class: ReadClass, object: &Map<String, Value>) -> Map<String, Value> {
    let mut out = Map::new();
    match class {
        ReadClass::McpServers => {
            if let Some(Value::Object(servers)) = object.get("mcpServers") {
                let names: Map<String, Value> = servers
                    .keys()
                    .map(|name| (name.clone(), json!({})))
                    .collect();
                out.insert("mcpServers".into(), Value::Object(names));
            }
        }
        ReadClass::ClaudeSettings => {
            if let Some(hooks) = object.get("hooks") {
                out.insert("hooks".into(), hook_commands(hooks));
            }
            if let Some(Value::Object(permissions)) = object.get("permissions") {
                let mut counted = Map::new();
                for key in ["allow", "deny", "ask"] {
                    if let Some(Value::Array(rules)) = permissions.get(key) {
                        counted.insert(key.into(), Value::Array(vec![json!(""); rules.len()]));
                    }
                }
                out.insert("permissions".into(), Value::Object(counted));
            }
        }
        ReadClass::CodexHooks => {
            if let Some(hooks) = object.get("hooks") {
                out.insert("hooks".into(), hook_commands(hooks));
            }
        }
        ReadClass::PackageScripts => {
            if let Some(scripts) = object.get("scripts") {
                out.insert("scripts".into(), scripts.clone());
            }
        }
        _ => {}
    }
    out
}

fn hook_commands(hooks: &Value) -> Value {
    let mut events = Map::new();
    if let Value::Object(by_event) = hooks {
        for (event, groups) in by_event {
            let Value::Array(groups) = groups else {
                continue;
            };
            let kept: Vec<Value> = groups
                .iter()
                .filter_map(|group| group.get("hooks")?.as_array())
                .map(|entries| {
                    let commands: Vec<Value> = entries
                        .iter()
                        .filter_map(|entry| entry.get("command")?.as_str())
                        .map(|command| json!({ "command": command }))
                        .collect();
                    json!({ "hooks": commands })
                })
                .collect();
            events.insert(event.clone(), Value::Array(kept));
        }
    }
    Value::Object(events)
}

fn mcp_header(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let after = trimmed.strip_prefix('[')?;
    let table_array = after.starts_with('[');
    let key = after.strip_prefix('[').unwrap_or(after);
    let named = ["mcp_servers", "\"mcp_servers\"", "'mcp_servers'"]
        .iter()
        .find_map(|name| key.trim_start().strip_prefix(name))?;
    if !matches!(named.trim_start().chars().next(), Some('.' | ']')) {
        return None;
    }
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for (index, ch) in key.char_indices() {
        match (quote, ch) {
            _ if escaped => escaped = false,
            (Some('"'), '\\') => escaped = true,
            (Some(open), c) if c == open => quote = None,
            (None, '"' | '\'') => quote = Some(ch),
            (None, ']') => {
                let (open, close) = if table_array {
                    ("[[", "]]")
                } else {
                    ("[", "]")
                };
                return Some(format!("{open}{}{close}", &key[..index]));
            }
            _ => {}
        }
    }
    None
}

fn toml_mcp_headers(text: &str) -> String {
    text.lines()
        .filter_map(mcp_header)
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "sk-test-SECRET";

    #[test]
    fn mcp_projection_keeps_server_names_and_drops_env_and_headers() {
        let text = format!(
            r#"{{"mcpServers":{{"zeta":{{"command":"x","env":{{"TOKEN":"{SECRET}"}}}},"alpha":{{"url":"u","headers":{{"Authorization":"Bearer {SECRET}"}}}}}},"other":"{SECRET}"}}"#
        );
        let out = project(ReadClass::McpServers, &text);
        assert_eq!(out, r#"{"mcpServers":{"alpha":{},"zeta":{}}}"#);
        assert!(!out.contains(SECRET));
    }

    #[test]
    fn claude_settings_projection_keeps_hooks_and_permission_counts_only() {
        let text = format!(
            r#"{{"env":{{"K":"{SECRET}"}},"apiKeyHelper":"{SECRET}","hooks":{{"PreToolUse":[{{"matcher":"Bash","hooks":[{{"type":"command","command":"a.sh"}}]}}]}},"permissions":{{"allow":["Bash({SECRET})","Read"],"deny":["Read(.env)"],"defaultMode":"{SECRET}"}}}}"#
        );
        let out = project(ReadClass::ClaudeSettings, &text);
        let value: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(value["permissions"]["allow"], json!(["", ""]));
        assert_eq!(value["permissions"]["deny"], json!([""]));
        assert!(value["permissions"].get("ask").is_none());
        assert!(value["permissions"].get("defaultMode").is_none());
        assert_eq!(
            value["hooks"]["PreToolUse"][0]["hooks"][0]["command"],
            "a.sh"
        );
        assert!(value.get("env").is_none() && value.get("apiKeyHelper").is_none());
        assert!(!out.contains(SECRET));
    }

    #[test]
    fn codex_hooks_projection_keeps_hooks_only() {
        let text = format!(r#"{{"token":"{SECRET}","hooks":{{"Stop":[]}}}}"#);
        let out = project(ReadClass::CodexHooks, &text);
        assert_eq!(out, r#"{"hooks":{"Stop":[]}}"#);
        assert!(!out.contains(SECRET));
    }

    #[test]
    fn toml_projection_keeps_mcp_headers_and_drops_every_value_line() {
        let text = format!(
            "model = \"{SECRET}\"\n[mcp_servers.git]\ncommand = \"{SECRET}\"\n  [ mcp_servers . \"two]\" ] # {SECRET} ]\n[[mcp_servers.arr]] # {SECRET}\n['mcp_servers'.q.env]\nTOKEN = \"{SECRET}\"\n[mcp_serversX]\n[other]\nkey = \"{SECRET}\"\n[mcp_servers.open # {SECRET}\n"
        );
        let out = project(ReadClass::TomlMcpHeaders, &text);
        assert_eq!(
            out,
            "[mcp_servers.git]\n[ mcp_servers . \"two]\" ]\n[[mcp_servers.arr]]\n['mcp_servers'.q.env]"
        );
        assert!(!out.contains(SECRET));
    }

    #[test]
    fn hook_projection_keeps_only_command_strings() {
        let text = format!(
            r#"{{"hooks":{{"PreToolUse":[{{"matcher":"Bash","extra":"{SECRET}","hooks":[{{"type":"command","command":"a.sh","timeout":5}},{{"type":"http","url":"https://h.example/{SECRET}","headers":{{"Authorization":"{SECRET}"}}}}]}}]}}}}"#
        );
        for class in [ReadClass::ClaudeSettings, ReadClass::CodexHooks] {
            let out = project(class, &text);
            assert_eq!(
                out,
                r#"{"hooks":{"PreToolUse":[{"hooks":[{"command":"a.sh"}]}]}}"#
            );
            assert!(!out.contains(SECRET) && !out.contains("h.example"));
        }
    }

    #[test]
    fn toml_header_escapes_cannot_carry_a_value_into_the_projection() {
        for text in [
            format!("[mcp_servers.\"x\\\"\"] token = \"{SECRET}]\""),
            format!("[mcp_servers.\"x\\\"\"] # \" {SECRET} ]"),
        ] {
            let out = project(ReadClass::TomlMcpHeaders, &text);
            assert_eq!(out, "[mcp_servers.\"x\\\"\"]");
            assert!(!out.contains(SECRET));
        }
    }

    #[test]
    fn package_projection_keeps_scripts_only() {
        let text = format!(
            r#"{{"name":"{SECRET}","dependencies":{{"x":"{SECRET}"}},"scripts":{{"test":"vitest","build":"next build"}}}}"#
        );
        let out = project(ReadClass::PackageScripts, &text);
        assert_eq!(out, r#"{"scripts":{"build":"next build","test":"vitest"}}"#);
        assert!(!out.contains(SECRET));
    }

    #[test]
    fn unparsable_config_projects_to_empty_text() {
        for class in [
            ReadClass::McpServers,
            ReadClass::ClaudeSettings,
            ReadClass::CodexHooks,
            ReadClass::PackageScripts,
        ] {
            let broken = format!("{{\"token\": \"{SECRET}\"");
            assert_eq!(project(class, &broken), "", "{class:?}");
            assert_eq!(
                project(class, &format!("[\"{SECRET}\"]")),
                "{}",
                "{class:?}"
            );
        }
        assert_eq!(project(ReadClass::Text, "x"), "x");
        assert_eq!(project(ReadClass::Denied, SECRET), "");
    }
}
