//! `tests/fixtures/harness-read-scope-cases.json` pins this file to its TypeScript mirror.

use crate::vault::scope::normalize_relative_path;
use std::path::Path;

const MAX_COMPONENTS: usize = 12;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ReadClass {
    Text,
    McpServers,
    ClaudeSettings,
    CodexHooks,
    TomlMcpHeaders,
    PackageScripts,
    NotAllowed,
    Denied,
    Invalid,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ListClass {
    Listable,
    NotAllowed,
    Denied,
    Invalid,
}

#[cfg(test)]
impl ReadClass {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::McpServers => "mcp-servers",
            Self::ClaudeSettings => "claude-settings",
            Self::CodexHooks => "codex-hooks",
            Self::TomlMcpHeaders => "toml-mcp-headers",
            Self::PackageScripts => "package-scripts",
            Self::NotAllowed => "not-allowed",
            Self::Denied => "denied",
            Self::Invalid => "invalid",
        }
    }
}

#[cfg(test)]
impl ListClass {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Listable => "listable",
            Self::NotAllowed => "not-allowed",
            Self::Denied => "denied",
            Self::Invalid => "invalid",
        }
    }
}

// No substring rule, so `block-secret-read.sh` stays readable.
const DENIED_NAMES: &[&str] = &[
    ".git",
    ".ssh",
    ".aws",
    ".gnupg",
    ".env",
    ".npmrc",
    ".netrc",
    ".pypirc",
    ".git-credentials",
    ".htpasswd",
    ".dockercfg",
    "auth.json",
    "settings.local.json",
    ".pgpass",
    ".boto",
    ".s3cfg",
    "kubeconfig",
];
const DENIED_STEMS: &[&str] = &[
    "credential",
    "credentials",
    ".credentials",
    "secret",
    "secrets",
    "private-key",
    "private_key",
    "privatekey",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "apikey",
    "api-key",
    "api_key",
    "service-account",
    "service_account",
    "serviceaccount",
];
const DENIED_EXTENSIONS: &[&str] = &[
    "pem", "key", "p8", "p12", "pfx", "jks", "keystore", "gpg", "kdbx", "ppk", "asc",
];

pub(super) fn is_denied_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    if DENIED_NAMES.contains(&lower.as_str()) || lower.starts_with(".env.") {
        return true;
    }
    let path = Path::new(&lower);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    DENIED_STEMS.contains(&stem) || DENIED_EXTENSIONS.contains(&extension)
}

const TEXT_TREES: &[&[&str]] = &[
    &[".claude", "rules"],
    &[".claude", "hooks"],
    &[".claude", "skills"],
    &[".claude", "agents"],
    &[".agents", "skills"],
    &[".agents", "agents"],
    &[".cursor", "rules"],
    &[".codex", "hooks"],
];
const LISTABLE_DOT_TREES: &[&[&str]] = &[
    &[".claude", "rules"],
    &[".claude", "hooks"],
    &[".claude", "skills"],
    &[".claude", "agents"],
    &[".agents", "skills"],
    &[".agents", "agents"],
    &[".cursor", "rules"],
    &[".codex"],
    &[".githooks"],
    &[".github"],
];
const ROOT_TEXT_FILES: &[&str] = &[
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    ".cursorrules",
    ".cursorignore",
    ".cursorindexingignore",
    ".codeiumignore",
    ".aiexclude",
    ".aiignore",
    ".geminiignore",
    ".gitignore",
];

fn components_of(path: &str) -> Option<Vec<String>> {
    if path.contains('\0') || path.contains('\\') {
        return None;
    }
    let normalized = normalize_relative_path(path).ok()?;
    let mut parts = Vec::new();
    for part in normalized.components() {
        parts.push(part.as_os_str().to_str()?.to_string());
    }
    (parts.len() <= MAX_COMPONENTS).then_some(parts)
}

fn within(parts: &[String], tree: &[&str], strictly: bool) -> bool {
    let long_enough = if strictly {
        parts.len() > tree.len()
    } else {
        parts.len() >= tree.len()
    };
    long_enough && parts.iter().zip(tree).all(|(a, b)| a == b)
}

pub(super) fn read_class(path: &str) -> ReadClass {
    let Some(parts) = components_of(path) else {
        return ReadClass::Invalid;
    };
    if parts.iter().any(|part| is_denied_name(part)) {
        return ReadClass::Denied;
    }
    let names: Vec<&str> = parts.iter().map(String::as_str).collect();
    match names.as_slice() {
        [name] if ROOT_TEXT_FILES.contains(name) => ReadClass::Text,
        [".mcp.json"] => ReadClass::McpServers,
        ["package.json"] => ReadClass::PackageScripts,
        [".github", "copilot-instructions.md"] => ReadClass::Text,
        [".claude", "settings.json"] => ReadClass::ClaudeSettings,
        [".codex", "hooks.json"] => ReadClass::CodexHooks,
        [".codex", "config.toml"] => ReadClass::TomlMcpHeaders,
        [dir, "AGENTS.md"] if !dir.starts_with('.') => ReadClass::Text,
        [".githooks", _] => ReadClass::Text,
        [".github", "workflows", file] if file.ends_with(".yml") || file.ends_with(".yaml") => {
            ReadClass::Text
        }
        _ if TEXT_TREES.iter().any(|tree| within(&parts, tree, true)) => ReadClass::Text,
        _ => ReadClass::NotAllowed,
    }
}

pub(super) fn list_class(path: &str) -> ListClass {
    let Some(parts) = components_of(path) else {
        return ListClass::Invalid;
    };
    if parts.iter().any(|part| is_denied_name(part)) {
        return ListClass::Denied;
    }
    let plain = !parts.iter().any(|part| part.starts_with('.'));
    if plain
        || LISTABLE_DOT_TREES
            .iter()
            .any(|tree| within(&parts, tree, false))
    {
        ListClass::Listable
    } else {
        ListClass::NotAllowed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn the_shared_read_scope_table_holds() {
        let table: Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/harness-read-scope-cases.json"
        ))
        .unwrap();
        let cases = table["cases"].as_array().unwrap();
        assert!(cases.len() >= 90);
        for case in cases {
            let path = case["path"].as_str().unwrap();
            assert_eq!(read_class(path).as_str(), case["read"], "read {path:?}");
            assert_eq!(list_class(path).as_str(), case["list"], "list {path:?}");
        }
    }
}
