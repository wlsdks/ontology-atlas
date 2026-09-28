//! Read-only discovery of MCP servers registered in Claude, project and Codex
//! configs. Only env and header key names leave, never values, which are tokens.
//! Unclassifiable Codex TOML entries are counted, not guessed, so no list is silently short.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

/// Injected so tests judge without a real disk, as `acp::FsProbe` does.
pub(crate) struct ConfigFs<'a> {
    pub read_text: &'a dyn Fn(&Path) -> Option<String>,
}

/// A reading of the disk; nothing attaches until the person turns it on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredConnector {
    /// Matches a `DiscoverySource::id`.
    pub source: String,
    /// Codex silently drops an ACP server whose name a config layer holds, so the
    /// screen warns on collisions.
    pub name: String,
    /// Reported verbatim; the TypeScript side decides what can attach.
    pub transport: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    /// Names only, never values.
    pub env_keys: Vec<String>,
    /// Names only, never values.
    pub header_keys: Vec<String>,
}

/// Present even when empty, so "registered nothing" differs from "did not look".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySource {
    pub id: String,
    pub path: String,
    /// `read` · `missing` · `malformed`.
    pub status: String,
    pub unreadable: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorDiscovery {
    pub connectors: Vec<DiscoveredConnector>,
    pub sources: Vec<DiscoverySource>,
}

/// Reported in this order.
const CLAUDE_USER: &str = "claude-user";
const CLAUDE_PROJECT: &str = "claude-project";
const VAULT_MCP_JSON: &str = "vault-mcp-json";
const CODEX_USER: &str = "codex-user";
const CURSOR_USER: &str = "cursor-user";

pub(crate) fn discover_with(
    home: Option<&Path>,
    vault: Option<&Path>,
    fs: &ConfigFs<'_>,
) -> ConnectorDiscovery {
    let mut connectors: Vec<DiscoveredConnector> = Vec::new();
    let mut sources: Vec<DiscoverySource> = Vec::new();

    if let Some(home) = home {
        let claude_json = home.join(".claude.json");
        match (fs.read_text)(&claude_json) {
            None => sources.push(missing(CLAUDE_USER, &claude_json)),
            Some(text) => match serde_json::from_str::<Value>(&text) {
                Err(_) => sources.push(malformed(CLAUDE_USER, &claude_json)),
                Ok(root) => {
                    let user = collect_json_servers(root.get("mcpServers"), CLAUDE_USER);
                    sources.push(read(CLAUDE_USER, &claude_json, user.unreadable));
                    connectors.extend(user.connectors);

                    // Only the open folder's project block is read, or unrelated workplaces appear.
                    let project = vault
                        .and_then(|vault| project_servers(&root, vault))
                        .map(|node| collect_json_servers(Some(node), CLAUDE_PROJECT));
                    if let Some(project) = project {
                        sources.push(read(CLAUDE_PROJECT, &claude_json, project.unreadable));
                        connectors.extend(project.connectors);
                    }
                }
            },
        }
    }

    if let Some(vault) = vault {
        let mcp_json = vault.join(".mcp.json");
        read_json_file(&mcp_json, VAULT_MCP_JSON, fs, &mut connectors, &mut sources);
    }

    if let Some(home) = home {
        let codex = home.join(".codex").join("config.toml");
        match (fs.read_text)(&codex) {
            None => sources.push(missing(CODEX_USER, &codex)),
            Some(text) => {
                let found = collect_codex_servers(&text);
                sources.push(read(CODEX_USER, &codex, found.unreadable));
                connectors.extend(found.connectors);
            }
        }

        let cursor = home.join(".cursor").join("mcp.json");
        read_json_file(&cursor, CURSOR_USER, fs, &mut connectors, &mut sources);
    }

    ConnectorDiscovery {
        connectors,
        sources,
    }
}

fn read_json_file(
    path: &Path,
    id: &str,
    fs: &ConfigFs<'_>,
    connectors: &mut Vec<DiscoveredConnector>,
    sources: &mut Vec<DiscoverySource>,
) {
    match (fs.read_text)(path) {
        None => sources.push(missing(id, path)),
        Some(text) => match serde_json::from_str::<Value>(&text) {
            Err(_) => sources.push(malformed(id, path)),
            Ok(root) => {
                let found = collect_json_servers(root.get("mcpServers"), id);
                sources.push(read(id, path, found.unreadable));
                connectors.extend(found.connectors);
            }
        },
    }
}

fn missing(id: &str, path: &Path) -> DiscoverySource {
    source(id, path, "missing", 0)
}

fn malformed(id: &str, path: &Path) -> DiscoverySource {
    source(id, path, "malformed", 0)
}

fn read(id: &str, path: &Path, unreadable: usize) -> DiscoverySource {
    source(id, path, "read", unreadable)
}

fn source(id: &str, path: &Path, status: &str, unreadable: usize) -> DiscoverySource {
    DiscoverySource {
        id: id.to_string(),
        path: path.to_string_lossy().to_string(),
        status: status.to_string(),
        unreadable,
    }
}

struct Found {
    connectors: Vec<DiscoveredConnector>,
    unreadable: usize,
}

/// Trailing separators are tolerated: picker paths and shell-written config differ.
fn project_servers<'a>(root: &'a Value, vault: &Path) -> Option<&'a Value> {
    let wanted = normalize_path(&vault.to_string_lossy());
    let projects = root.get("projects")?.as_object()?;
    projects
        .iter()
        .find(|(key, _)| normalize_path(key) == wanted)
        .and_then(|(_, node)| node.get("mcpServers"))
}

fn normalize_path(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        raw.trim().to_string()
    } else {
        trimmed.to_string()
    }
}

/// The shape Claude Code, Cursor and `.mcp.json` share.
fn collect_json_servers(node: Option<&Value>, source_id: &str) -> Found {
    let mut connectors = Vec::new();
    let mut unreadable = 0usize;
    let Some(map) = node.and_then(Value::as_object) else {
        return Found {
            connectors,
            unreadable,
        };
    };
    for (name, entry) in map {
        let Some(entry) = entry.as_object() else {
            unreadable += 1;
            continue;
        };
        let command = entry.get("command").and_then(Value::as_str);
        let url = entry.get("url").and_then(Value::as_str);
        let declared = entry.get("type").and_then(Value::as_str);
        let transport = match (declared, command, url) {
            // A declared `sse` stays `sse` so the screen can say why it cannot attach.
            (Some("sse"), _, _) => "sse",
            (Some("http"), _, _) | (Some("streamable-http"), _, _) => "http",
            (Some("stdio"), _, _) => "stdio",
            (_, Some(_), _) => "stdio",
            (_, None, Some(_)) => "http",
            _ => {
                unreadable += 1;
                continue;
            }
        };
        connectors.push(DiscoveredConnector {
            source: source_id.to_string(),
            name: name.clone(),
            transport: transport.to_string(),
            command: command.map(str::to_string),
            args: entry
                .get("args")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default(),
            url: url.map(str::to_string),
            env_keys: object_keys(entry.get("env")),
            header_keys: object_keys(entry.get("headers")),
        });
    }
    // Sorted so the screen is stable across hand edits.
    connectors.sort_by(|a, b| a.name.cmp(&b.name));
    Found {
        connectors,
        unreadable,
    }
}

/// Names only: the values are API tokens.
fn object_keys(node: Option<&Value>) -> Vec<String> {
    node.and_then(Value::as_object)
        .map(|map| map.keys().cloned().collect::<BTreeSet<_>>())
        .map(|set| set.into_iter().collect())
        .unwrap_or_default()
}

/// A narrow scanner, not a TOML parser: header then `key = value` lines, plus
/// nested env keys; any unclassified table counts into `unreadable`.
fn collect_codex_servers(text: &str) -> Found {
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
        match cursor {
            Cursor::Server(index) => match key.as_str() {
                "command" => drafts[index].command = toml_string(value),
                "url" => drafts[index].url = toml_string(value),
                "args" => drafts[index].args = toml_string_array(value),
                // Names only.
                "env" => drafts[index].env_keys.extend(inline_table_keys(value)),
                "headers" => drafts[index].header_keys.extend(inline_table_keys(value)),
                _ => {}
            },
            Cursor::Env(index) => {
                drafts[index].env_keys.insert(key);
            }
            Cursor::Headers(index) => {
                drafts[index].header_keys.insert(key);
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

/// Reads only; `None` reads only user-level files.
#[tauri::command(async)]
pub fn discover_mcp_connectors(vault_path: Option<String>) -> Result<ConnectorDiscovery, String> {
    let home = home_dir();
    let vault = match vault_path.as_deref().map(str::trim).filter(|path| !path.is_empty()) {
        Some(path) => Some(crate::canonical_root(path)?),
        None => None,
    };
    let fs = ConfigFs {
        read_text: &|path: &Path| std::fs::read_to_string(path).ok(),
    };
    Ok(discover_with(home.as_deref(), vault.as_deref(), &fs))
}

/// Resolves a fixed allow-list of runtimes to paths because the agent's spawned
/// connector gets no `PATH`. It enumerates nothing and executes nothing: starting a
/// program unasked differs from the person pressing a button.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRuntime {
    pub name: String,
    /// `None` when not installed.
    pub path: Option<String>,
}

/// A sixth name is a deliberate edit; taking names from the caller would make this
/// "resolve anything", a different capability.
pub(crate) const CONNECTOR_RUNTIMES: &[&str] = &["npx", "node", "uvx", "python3", "docker"];

/// Reads only, executes nothing.
#[tauri::command]
pub fn resolve_connector_runtimes() -> Result<Vec<ResolvedRuntime>, String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let (is_executable, list_dir, read_text, login_ok) = crate::acp::real_probe();
    let probe = crate::acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    // No managed directories: those hold the agent's runtime, and a connector path
    // only this app can reach would break the person's config.
    let dirs = crate::acp::candidate_bin_dirs(
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        None,
        None,
    );
    Ok(CONNECTOR_RUNTIMES
        .iter()
        .map(|name| ResolvedRuntime {
            name: (*name).to_string(),
            path: crate::acp::resolve_command(name, &dirs, &probe)
                .map(|path| path.to_string_lossy().into_owned()),
        })
        .collect())
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn probe(files: &HashMap<PathBuf, String>) -> impl Fn(&Path) -> Option<String> + '_ {
        move |path: &Path| files.get(path).cloned()
    }

    fn files(entries: &[(&str, &str)]) -> HashMap<PathBuf, String> {
        entries
            .iter()
            .map(|(path, body)| (PathBuf::from(path), (*body).to_string()))
            .collect()
    }

    fn discover(entries: &[(&str, &str)], vault: Option<&str>) -> ConnectorDiscovery {
        let map = files(entries);
        let read_text = probe(&map);
        let fs = ConfigFs {
            read_text: &read_text,
        };
        discover_with(Some(Path::new("/home/me")), vault.map(Path::new), &fs)
    }

    const CLAUDE_JSON: &str = r#"{
      "mcpServers": {
        "notion": {
          "command": "/opt/homebrew/bin/npx",
          "args": ["-y", "@notionhq/notion-mcp-server"],
          "env": { "NOTION_TOKEN": "ntn_secret_value" }
        },
        "linear": {
          "type": "http",
          "url": "https://mcp.linear.app/mcp",
          "headers": { "Authorization": "Bearer super_secret" }
        }
      },
      "projects": {
        "/work/atlas": {
          "mcpServers": {
            "repo-tools": { "command": "/usr/bin/python3", "args": ["tools.py"] }
          }
        },
        "/work/other": {
          "mcpServers": { "unrelated": { "command": "/bin/false" } }
        }
      }
    }"#;

    #[test]
    fn a_stdio_server_registered_with_claude_is_found_whole() {
        let found = discover(&[("/home/me/.claude.json", CLAUDE_JSON)], None);
        let notion = found
            .connectors
            .iter()
            .find(|c| c.name == "notion")
            .expect("notion");
        assert_eq!(notion.transport, "stdio");
        assert_eq!(notion.command.as_deref(), Some("/opt/homebrew/bin/npx"));
        assert_eq!(notion.args, ["-y", "@notionhq/notion-mcp-server"]);
        assert_eq!(notion.env_keys, ["NOTION_TOKEN"]);
        assert_eq!(notion.source, "claude-user");
    }

    #[test]
    fn an_http_server_reports_its_url_and_header_names() {
        let found = discover(&[("/home/me/.claude.json", CLAUDE_JSON)], None);
        let linear = found
            .connectors
            .iter()
            .find(|c| c.name == "linear")
            .expect("linear");
        assert_eq!(linear.transport, "http");
        assert_eq!(linear.url.as_deref(), Some("https://mcp.linear.app/mcp"));
        assert_eq!(linear.header_keys, ["Authorization"]);
        assert!(linear.command.is_none());
    }

    #[test]
    fn no_env_value_survives_serialization() {
        // Pinned against the serialized payload, not the struct, so a new field is covered.
        let found = discover(
            &[
                ("/home/me/.claude.json", CLAUDE_JSON),
                (
                    "/home/me/.codex/config.toml",
                    "[mcp_servers.gh]\ncommand = \"gh\"\n\n[mcp_servers.gh.env]\nGITHUB_TOKEN = \"ghp_secret_value\"\n",
                ),
            ],
            Some("/work/atlas"),
        );
        let payload = serde_json::to_string(&found).unwrap();
        for secret in [
            "ntn_secret_value",
            "super_secret",
            "ghp_secret_value",
            "Bearer",
        ] {
            assert!(
                !payload.contains(secret),
                "a secret value reached the WebView: {secret}"
            );
        }
        assert!(payload.contains("NOTION_TOKEN"));
        assert!(payload.contains("GITHUB_TOKEN"));
        assert!(payload.contains("Authorization"));
    }

    #[test]
    fn only_the_open_folders_project_block_is_read() {
        let found = discover(
            &[("/home/me/.claude.json", CLAUDE_JSON)],
            Some("/work/atlas/"),
        );
        let names: Vec<&str> = found.connectors.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"repo-tools"));
        assert!(!names.contains(&"unrelated"));
        assert_eq!(
            found
                .connectors
                .iter()
                .find(|c| c.name == "repo-tools")
                .map(|c| c.source.as_str()),
            Some("claude-project")
        );
    }

    #[test]
    fn a_vault_mcp_json_is_read_from_the_open_folder() {
        let found = discover(
            &[(
                "/work/atlas/.mcp.json",
                r#"{"mcpServers":{"local":{"command":"/bin/echo","args":["hi"]}}}"#,
            )],
            Some("/work/atlas"),
        );
        assert_eq!(found.connectors.len(), 1);
        assert_eq!(found.connectors[0].source, "vault-mcp-json");
        assert_eq!(found.connectors[0].command.as_deref(), Some("/bin/echo"));
    }

    #[test]
    fn the_codex_config_yields_command_args_and_env_names() {
        let found = discover(
            &[(
                "/home/me/.codex/config.toml",
                r#"
# a comment line
model = "gpt-5"

[mcp_servers.notion]
command = "npx"          # trailing comment
args = ["-y", "@notionhq/notion-mcp-server"]

[mcp_servers.notion.env]
NOTION_TOKEN = "ntn_secret_value"
OTHER = "x"

[mcp_servers.remote]
url = "https://example.test/mcp"
"#,
            )],
            None,
        );
        let notion = found
            .connectors
            .iter()
            .find(|c| c.name == "notion")
            .expect("notion");
        assert_eq!(notion.transport, "stdio");
        assert_eq!(notion.command.as_deref(), Some("npx"));
        assert_eq!(notion.args, ["-y", "@notionhq/notion-mcp-server"]);
        assert_eq!(notion.env_keys, ["NOTION_TOKEN", "OTHER"]);
        let remote = found
            .connectors
            .iter()
            .find(|c| c.name == "remote")
            .expect("remote");
        assert_eq!(remote.transport, "http");
        assert_eq!(remote.url.as_deref(), Some("https://example.test/mcp"));
    }

    #[test]
    fn a_codex_table_we_cannot_classify_is_counted_rather_than_dropped() {
        let found = discover(
            &[(
                "/home/me/.codex/config.toml",
                "[mcp_servers.mystery]\nstartup_timeout_sec = 10\n",
            )],
            None,
        );
        assert!(found.connectors.is_empty());
        let source = found
            .sources
            .iter()
            .find(|s| s.id == "codex-user")
            .expect("codex source");
        assert_eq!(source.status, "read");
        assert_eq!(source.unreadable, 1);
    }

    #[test]
    fn a_deprecated_sse_entry_is_reported_as_sse_not_as_http() {
        let found = discover(
            &[(
                "/home/me/.cursor/mcp.json",
                r#"{"mcpServers":{"old":{"type":"sse","url":"https://example.test/sse"}}}"#,
            )],
            None,
        );
        assert_eq!(found.connectors[0].transport, "sse");
        assert_eq!(found.connectors[0].source, "cursor-user");
    }

    #[test]
    fn a_missing_file_is_a_state_not_an_error() {
        let found = discover(&[], None);
        assert!(found.connectors.is_empty());
        assert!(found
            .sources
            .iter()
            .all(|source| source.status == "missing"));
        let ids: Vec<&str> = found.sources.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&"claude-user"));
        assert!(ids.contains(&"codex-user"));
        assert!(ids.contains(&"cursor-user"));
    }

    #[test]
    fn a_malformed_file_says_so_instead_of_looking_empty() {
        let found = discover(&[("/home/me/.claude.json", "{ not json")], None);
        let source = found
            .sources
            .iter()
            .find(|s| s.id == "claude-user")
            .expect("claude source");
        assert_eq!(source.status, "malformed");
    }

    #[test]
    fn discovery_never_writes_anything() {
        // The injected filesystem has no writer, so a write here would not compile.
        let source = include_str!("connectors.rs");
        let body = source.split("#[cfg(test)]").next().unwrap();
        for writer in ["fs::write", "create_dir", "OpenOptions", "File::create"] {
            assert!(
                !body.contains(writer),
                "discovery must not write: found {writer}"
            );
        }
        // It says where a program is and never starts one.
        for runner in ["Command::new", "process::Command", "spawn("] {
            assert!(
                !body.contains(runner),
                "discovery must not execute anything: found {runner}"
            );
        }
    }

    #[test]
    fn the_runtime_allow_list_is_fixed_and_small() {
        assert_eq!(
            CONNECTOR_RUNTIMES,
            &["npx", "node", "uvx", "python3", "docker"]
        );
        let source = include_str!("connectors.rs");
        let body = source.split("#[cfg(test)]").next().unwrap();
        assert!(
            body.contains(
                "pub fn resolve_connector_runtimes() -> Result<Vec<ResolvedRuntime>, String>"
            ),
            "resolve_connector_runtimes must take no caller-supplied name"
        );
    }

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
    fn discovery_refuses_a_vault_root_the_user_never_granted() {
        let base = std::env::temp_dir().join(format!("atlas-connector-grant-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let granted = base.join("vault");
        let forged = base.join("elsewhere");
        std::fs::create_dir_all(&granted).unwrap();
        std::fs::create_dir_all(&forged).unwrap();
        let granted = std::fs::canonicalize(&granted).unwrap();
        let forged = std::fs::canonicalize(&forged).unwrap();

        let _scope = crate::vault_grants::EnforcedScope::granting(&[granted.clone()]);

        assert!(discover_mcp_connectors(Some(forged.to_string_lossy().to_string())).is_err());
        assert!(discover_mcp_connectors(Some(granted.to_string_lossy().to_string())).is_ok());
        assert!(discover_mcp_connectors(None).is_ok());

        let _ = std::fs::remove_dir_all(&base);
    }
}
