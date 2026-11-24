use std::path::{Path, PathBuf};

/// Judged by the absolute `toolCall.rawInput.file_path`, not the title, whose
/// wording varies. No path means ask.
pub(crate) fn permission_verdict(vault_root: &Path, file_path: Option<&str>) -> PermissionVerdict {
    let Some(raw) = file_path else {
        return PermissionVerdict::Ask;
    };
    let raw = Path::new(raw);
    // `..` below a missing directory survives resolution and would compare as written.
    if raw
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return PermissionVerdict::Ask;
    }
    // The root must be the absolute directory `acp_start` verified; empty or `/` would
    // open the whole gate.
    if !vault_root.is_absolute() || !raw.is_absolute() {
        return PermissionVerdict::Ask;
    }
    let Ok(root) = std::fs::canonicalize(vault_root) else {
        return PermissionVerdict::Ask;
    };
    // A root replaced by a link after start is refused: the boundary never moves mid-session.
    if root != vault_root || !root.is_dir() || root.parent().is_none() {
        return PermissionVerdict::Ask;
    }
    let resolved = resolve_for_comparison(raw);
    let Ok(below_root) = resolved.strip_prefix(&root) else {
        return PermissionVerdict::Ask;
    };
    // Judged after links resolve: `docs/x -> ../.git/config` lands in a dot folder.
    let hidden = below_root
        .components()
        .any(|part| part.as_os_str().to_string_lossy().starts_with('.'));
    if hidden {
        PermissionVerdict::AllowInsideVaultHidden
    } else {
        PermissionVerdict::AllowInsideVault
    }
}

/// Whether `file_path` is an existing regular file in the vault's connected code folder once links
/// resolve, unpadded, with no dot, `*.git` or secret-looking component below it. A folder never passes: a sweep
/// of it would reach the dot and secret files this refuses one by one. A write still asks.
pub(crate) fn inside_code_folder(source_root: &Path, file_path: Option<&str>) -> bool {
    let Some(text) = file_path else {
        return false;
    };
    // The agent's tool trims a path before opening it, so a padded path names another file.
    if text != text.trim() || text.chars().any(is_hidden_or_control) {
        return false;
    }
    let raw = Path::new(text);
    if !raw.is_absolute()
        || !source_root.is_absolute()
        || raw
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return false;
    }
    let resolved = resolve_for_comparison(raw);
    if !std::fs::metadata(&resolved).is_ok_and(|meta| meta.is_file()) {
        return false;
    }
    let Ok(below) = resolved.strip_prefix(source_root).map(Path::to_path_buf) else {
        return false;
    };
    let names: Option<Vec<&str>> = below
        .components()
        .map(|part| match part {
            std::path::Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect();
    let Some((file_name, folders)) = names.as_deref().and_then(<[&str]>::split_last) else {
        return false;
    };
    folders.iter().all(|name| ordinary_name(name))
        && ordinary_name(file_name)
        && !secret_word_in_file_name(file_name)
}

fn ordinary_name(name: &str) -> bool {
    !name.starts_with('.')
        && !name.to_ascii_lowercase().ends_with(".git")
        && !crate::harness_source::scope::is_denied_name(name)
        && !SECRET_FRAGMENTS
            .iter()
            .any(|fragment| name.to_lowercase().contains(fragment))
}

fn is_hidden_or_control(c: char) -> bool {
    c.is_control()
        || matches!(c, '\u{00AD}' | '\u{061C}' | '\u{180E}' | '\u{200B}'..='\u{200F}'
            | '\u{2028}'..='\u{202E}' | '\u{2060}'..='\u{206F}' | '\u{FEFF}')
}

/// Wider than Harness's exact names, which back an allow-list there and stand alone here.
const SECRET_FRAGMENTS: &[&str] = &[
    "secret",
    "credential",
    "password",
    "passwd",
    "privatekey",
    "private_key",
    "private-key",
    "apikey",
    "api_key",
    "api-key",
    "serviceaccount",
    "service_account",
    "service-account",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "tfstate",
    "tfvars",
    "kubeconfig",
    "htpasswd",
    "netrc",
    "npmrc",
    "pgpass",
    "keystore",
    "keychain",
];

/// A file (not folder) name holding one of these words, split at `.`, `-`, `_` and spaces:
/// `prod.env`, `deploy_key`, `github-token.txt`. A folder such as `tokens/` may hold design tokens.
fn secret_word_in_file_name(name: &str) -> bool {
    const WORDS: &[&str] = &["env", "token", "tokens", "key", "keys", "private"];
    name.to_lowercase()
        .split(['.', '-', '_', ' '])
        .any(|word| WORDS.contains(&word))
}

/// Canonicalizes the deepest existing ancestor and re-appends the rest: a new file
/// cannot be canonicalized (`/var` vs `/private/var`), yet an inside link pointing
/// outside must resolve.
fn resolve_for_comparison(path: &Path) -> PathBuf {
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return canonical;
    }
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor = path;
    loop {
        if let Ok(canonical) = std::fs::canonicalize(cursor) {
            let mut out = canonical;
            for part in rest.iter().rev() {
                out.push(part);
            }
            return out;
        }
        match (cursor.file_name(), cursor.parent()) {
            (Some(name), Some(parent)) => {
                rest.push(name.to_os_string());
                cursor = parent;
            }
            // No canonicalizable ancestor: compare as is.
            _ => return path.to_path_buf(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PermissionVerdict {
    /// Inside the root, and no component below it starts with `.` once links resolve.
    AllowInsideVault,
    /// Inside the root, but a resolved component below it starts with `.`.
    AllowInsideVaultHidden,
    /// Outside the vault, inside its connected code folder as `inside_code_folder` judges it.
    AllowInsideCodeFolder,
    Ask,
}

#[cfg(test)]
mod tests;
