//! A narrow scanner for the `[mcp_servers.*]` tables of Codex's `config.toml`.
//! It is not a TOML parser, and only key names leave it, never values.

use std::collections::BTreeSet;

use super::{DiscoveredConnector, Found, CODEX_USER};

/// A narrow scanner, not a TOML parser: header then `key = value` lines, plus
/// nested env keys; any unclassified table counts into `unreadable`.
pub(super) fn collect_codex_servers(text: &str) -> Found {
    struct Draft {
        name: String,
        command: Option<String>,
        args: Vec<String>,
        url: Option<String>,
        env_keys: BTreeSet<String>,
        header_keys: BTreeSet<String>,
    }

    let mut drafts: Vec<Draft> = Vec::new();
    enum Cursor {
        Server(usize),
        Env(usize),
        Headers(usize),
        Elsewhere,
    }
    let mut cursor = Cursor::Elsewhere;

    for raw in text.lines() {
        let line = strip_comment(raw);
        if line.is_empty() {
            continue;
        }
        if let Some(header) = line
            .strip_prefix('[')
            .and_then(|rest| rest.strip_suffix(']'))
        {
            let header = header.trim();
            let Some(rest) = header.strip_prefix("mcp_servers.") else {
                cursor = Cursor::Elsewhere;
                continue;
            };
            let (name, child) = split_table_name(rest);
            if name.is_empty() {
                cursor = Cursor::Elsewhere;
                continue;
            }
            let index = match drafts.iter().position(|draft| draft.name == name) {
                Some(index) => index,
                None => {
                    drafts.push(Draft {
                        name: name.clone(),
                        command: None,
                        args: Vec::new(),
                        url: None,
                        env_keys: BTreeSet::new(),
                        header_keys: BTreeSet::new(),
                    });
                    drafts.len() - 1
                }
            };
            cursor = match child.as_deref() {
                None => Cursor::Server(index),
                Some("env") => Cursor::Env(index),
                Some("headers") => Cursor::Headers(index),
                // An unmodelled child table's keys must not be read as env names.
                Some(_) => Cursor::Elsewhere,
            };
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = unquote(key.trim());
        let value = value.trim();
        let (Cursor::Server(index) | Cursor::Env(index) | Cursor::Headers(index)) = cursor else {
            continue;
        };
        let Some(draft) = drafts.get_mut(index) else {
            continue;
        };
        match cursor {
            Cursor::Server(_) => match key.as_str() {
                "command" => draft.command = toml_string(value),
                "url" => draft.url = toml_string(value),
                "args" => draft.args = toml_string_array(value),
                // Names only.
                "env" => draft.env_keys.extend(inline_table_keys(value)),
                "headers" => draft.header_keys.extend(inline_table_keys(value)),
                _ => {}
            },
            Cursor::Env(_) => {
                draft.env_keys.insert(key);
            }
            Cursor::Headers(_) => {
                draft.header_keys.insert(key);
            }
            Cursor::Elsewhere => {}
        }
    }

    let mut unreadable = 0usize;
    let mut connectors: Vec<DiscoveredConnector> = Vec::new();
    for draft in drafts {
        let transport = match (&draft.command, &draft.url) {
            (Some(_), _) => "stdio",
            (None, Some(_)) => "http",
            (None, None) => {
                unreadable += 1;
                continue;
            }
        };
        connectors.push(DiscoveredConnector {
            source: CODEX_USER.to_string(),
            name: draft.name,
            transport: transport.to_string(),
            command: draft.command,
            args: draft.args,
            url: draft.url,
            env_keys: draft.env_keys.into_iter().collect(),
            header_keys: draft.header_keys.into_iter().collect(),
        });
    }
    connectors.sort_by(|a, b| a.name.cmp(&b.name));
    Found {
        connectors,
        unreadable,
    }
}

/// A `#` inside quotes is kept, or a Windows path or URL fragment is truncated.
fn strip_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut quoted = false;
    for (index, byte) in bytes.iter().enumerate() {
        match byte {
            b'"' => quoted = !quoted,
            b'#' if !quoted => return line[..index].trim(),
            _ => {}
        }
    }
    line.trim()
}

/// A quoted segment keeps its spaces.
fn split_table_name(rest: &str) -> (String, Option<String>) {
    if let Some(tail) = rest.strip_prefix('"') {
        if let Some((name, remainder)) = tail.split_once('"') {
            let child = remainder
                .trim()
                .strip_prefix('.')
                .map(|c| c.trim().to_string());
            return (name.to_string(), child.filter(|c| !c.is_empty()));
        }
    }
    match rest.split_once('.') {
        Some((name, child)) => (
            name.trim().to_string(),
            Some(child.trim().to_string()).filter(|c| !c.is_empty()),
        ),
        None => (rest.trim().to_string(), None),
    }
}

fn unquote(raw: &str) -> String {
    let trimmed = raw.trim();
    trimmed
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
        .unwrap_or(trimmed)
        .to_string()
}

fn toml_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let inner = trimmed
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))?;
    Some(inner.replace("\\\\", "\\").replace("\\\"", "\""))
}

fn toml_string_array(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    let Some(inner) = trimmed
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
    else {
        return Vec::new();
    };
    split_top_level(inner)
        .into_iter()
        .filter_map(|item| toml_string(&item))
        .collect()
}

/// Names only: the values must not leave this process.
fn inline_table_keys(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    let Some(inner) = trimmed
        .strip_prefix('{')
        .and_then(|rest| rest.strip_suffix('}'))
    else {
        return Vec::new();
    };
    split_top_level(inner)
        .into_iter()
        .filter_map(|item| item.split_once('=').map(|(key, _)| unquote(key)))
        .filter(|key| !key.is_empty())
        .collect()
}

fn split_top_level(inner: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for ch in inner.chars() {
        match ch {
            '"' => {
                quoted = !quoted;
                current.push(ch);
            }
            ',' if !quoted => {
                out.push(current.trim().to_string());
                current = String::new();
            }
            _ => current.push(ch),
        }
    }
    let last = current.trim().to_string();
    if !last.is_empty() {
        out.push(last);
    }
    out.into_iter().filter(|item| !item.is_empty()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_quoted_hash_inside_a_value_is_not_treated_as_a_comment() {
        assert_eq!(
            strip_comment(r#"url = "https://x.test/a#b""#),
            r#"url = "https://x.test/a#b""#
        );
        assert_eq!(
            strip_comment(r#"command = "npx" # note"#),
            r#"command = "npx""#
        );
    }

    #[test]
    fn an_inline_env_table_still_yields_names_only() {
        assert_eq!(
            inline_table_keys(r#"{ TOKEN = "abc, def", OTHER = "x" }"#),
            ["TOKEN", "OTHER"]
        );
    }

    #[test]
    fn a_table_name_keeps_its_quoted_dots_and_splits_the_child() {
        assert_eq!(split_table_name("notion"), ("notion".to_string(), None));
        assert_eq!(
            split_table_name("notion.env"),
            ("notion".to_string(), Some("env".to_string()))
        );
        assert_eq!(
            split_table_name(r#""my.server".headers"#),
            ("my.server".to_string(), Some("headers".to_string()))
        );
        assert_eq!(
            split_table_name(r#""my server""#),
            ("my server".to_string(), None)
        );
    }

    #[test]
    fn a_string_value_unescapes_backslashes_and_quotes_and_nothing_else_is_a_string() {
        assert_eq!(
            toml_string(r#""C:\\bin\\npx""#).as_deref(),
            Some(r"C:\bin\npx")
        );
        assert_eq!(
            toml_string(r#""say \"hi\"""#).as_deref(),
            Some(r#"say "hi""#)
        );
        assert_eq!(toml_string("npx"), None);
    }

    #[test]
    fn an_args_array_splits_on_commas_outside_quotes() {
        assert_eq!(
            toml_string_array(r#"["-y", "a,b", "c"]"#),
            ["-y", "a,b", "c"]
        );
        assert!(toml_string_array(r#""not an array""#).is_empty());
    }

    #[test]
    fn a_child_table_the_scanner_does_not_model_never_leaks_its_keys_as_env_names() {
        let found = collect_codex_servers(
            "[mcp_servers.zeta]\ncommand = \"z\"\n\n[mcp_servers.zeta.tools.search]\napproval = \"x\"\n\n[mcp_servers.alpha]\nurl = \"https://a.test\"\n",
        );
        assert_eq!(found.unreadable, 0);
        let names: Vec<&str> = found.connectors.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["alpha", "zeta"], "sorted for a stable screen");
        assert!(found.connectors.iter().all(|c| c.env_keys.is_empty()));
    }
}
