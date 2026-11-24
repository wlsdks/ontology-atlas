use super::{HIDDEN, OUTSIDE, SECRET};
use crate::harness_source::scope::{is_denied_name, read_class, ReadClass};
use crate::vault::scope::normalize_relative_path;

const PATH_MAX_BYTES: usize = 1024;

/// Extensions of files written to hold keys: dotenv files and Terraform variables and state.
const SECRET_EXTENSIONS: &[&str] = &["env", "tfvars", "tfstate"];
/// Whole names of files that hold keys or passwords. `database.yml` is Rails' database login.
const SECRET_FILE_NAMES: &[&str] = &[
    "env",
    "htpasswd",
    "local.settings.json",
    "database.yml",
    "database.yaml",
];
/// Data files whose stem says what they hold.
const DATA_EXTENSIONS: &[&str] = &[
    "json",
    "yaml",
    "yml",
    "toml",
    "ini",
    "txt",
    "xml",
    "properties",
    "conf",
];
const SECRET_STEM_WORDS: &[&str] = &["secret", "credential", "password", "token"];

/// Names the shared Harness table does not list but the reader, which shows any file's text,
/// also refuses. The Harness table stays as its fixture pins it.
fn holds_keys_by_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if SECRET_FILE_NAMES.contains(&lower.as_str()) {
        return true;
    }
    let (stem, extension) = lower.rsplit_once('.').unwrap_or((lower.as_str(), ""));
    if SECRET_EXTENSIONS.contains(&extension) || lower.contains(".tfstate.") {
        return true;
    }
    if stem.starts_with("client_secret") || stem.contains("adminsdk") {
        return true;
    }
    DATA_EXTENSIONS.contains(&extension) && SECRET_STEM_WORDS.iter().any(|word| stem.contains(word))
}

/// A Git folder by any name: `.git` and a bare clone such as `vendor.git`.
fn is_git_folder(part: &str) -> bool {
    part.to_ascii_lowercase().ends_with(".git")
}

/// Why the reader will not open `path`, or none. A name that holds keys is `SECRET`; a Git
/// folder and a dot path the Harness read does not show as plain text are `HIDDEN`; a path that
/// leaves the folder is `OUTSIDE`. Dot files the Harness read projects (`.mcp.json`) are refused
/// rather than shown raw.
pub(super) fn path_refusal(path: &str) -> Option<&'static str> {
    if path.is_empty() || path.len() > PATH_MAX_BYTES || path.contains('\0') || path.contains('\\')
    {
        return Some(OUTSIDE);
    }
    let Ok(normalized) = normalize_relative_path(path) else {
        return Some(OUTSIDE);
    };
    let mut parts = Vec::new();
    for component in normalized.components() {
        let Some(part) = component.as_os_str().to_str() else {
            return Some(OUTSIDE);
        };
        parts.push(part);
    }
    let Some((name, folders)) = parts.split_last() else {
        return Some(OUTSIDE);
    };
    if folders.iter().any(|part| is_git_folder(part)) || name.eq_ignore_ascii_case(".git") {
        return Some(HIDDEN);
    }
    if parts.iter().any(|part| is_denied_name(part)) || holds_keys_by_name(name) {
        return Some(SECRET);
    }
    if parts.iter().any(|part| part.starts_with('.'))
        && read_class(&parts.join("/")) != ReadClass::Text
    {
        return Some(HIDDEN);
    }
    None
}
