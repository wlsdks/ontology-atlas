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
    "password",
    "passwords",
    "local.settings.json",
    "database.yml",
    "database.yaml",
];
/// Folders named for what every file in them holds.
const SECRET_FOLDER_NAMES: &[&str] = &[
    "password",
    "passwords",
    "credential",
    "credentials",
    "token",
    "tokens",
];
/// `env.<name>` files of one deployment, as `env.production`; `env.ts` and `env.d.ts` are code.
const ENVIRONMENT_NAMES: &[&str] = &[
    "production",
    "prod",
    "staging",
    "development",
    "dev",
    "local",
    "test",
];
/// Data files whose name can say what they hold.
const DATA_EXTENSIONS: &[&str] = &[
    "json",
    "yaml",
    "yml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "txt",
    "csv",
    "xml",
    "properties",
];
/// Data formats a key file is written in, for names such as `sa-key.json`.
const KEY_FILE_EXTENSIONS: &[&str] = &["json", "yaml", "yml"];
/// Parts of a word that say it names a secret: `appsecrets`, `secretkey`, `db_password`.
const SECRET_WORD_PARTS: &[&str] = &["secret", "credential", "password", "passwd"];
/// A word before `tokens` that makes them design tokens: `design-tokens.json`.
const DESIGN_WORDS: &[&str] = &["design", "theme"];
/// A word after a secret word that says the file is about it: `password-reset.json` is a page's
/// copy, `secret_scanning.yml` a scanner's settings. Before it the word does not count:
/// `reset-credentials.json` holds credentials.
const ABOUT_WORDS: &[&str] = &[
    "policy",
    "policies",
    "reset",
    "rules",
    "scanning",
    "schema",
    "strength",
    "validation",
];

/// The words of a file stem, split at separators and lower-to-upper case changes, lowercased:
/// `apiSecret` and `api_secret` both give `api`, `secret`. O(stem length).
fn stem_words(stem: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut word = String::new();
    let mut previous_lower = false;
    for character in stem.chars() {
        if !character.is_alphanumeric() {
            if !word.is_empty() {
                words.push(std::mem::take(&mut word));
            }
            previous_lower = false;
            continue;
        }
        if character.is_uppercase() && previous_lower {
            words.push(std::mem::take(&mut word));
        }
        previous_lower = character.is_lowercase() || character.is_ascii_digit();
        word.extend(character.to_lowercase());
    }
    if !word.is_empty() {
        words.push(word);
    }
    words
}

/// Whether `word` names a key: a word ending in `token` or `tokens` unless a design word comes
/// before it or it is the whole name (`tokens.json` is design tokens), or a word holding a secret
/// word unless an about-word follows it.
fn names_a_key(before: Option<&str>, word: &str, after: Option<&str>) -> bool {
    if word.ends_with("token") || word.ends_with("tokens") {
        let design = before.is_some_and(|previous| DESIGN_WORDS.contains(&previous));
        let alone = before.is_none() && after.is_none();
        return !(design || (alone && word == "tokens"));
    }
    SECRET_WORD_PARTS.iter().any(|part| word.contains(part))
        && !after.is_some_and(|next| ABOUT_WORDS.contains(&next))
}

/// Names the shared Harness table does not list but the reader, which shows any file's text,
/// also refuses: key and deployment files by name, and data files whose words name a key. The
/// Harness table stays as its fixture pins it.
fn holds_keys_by_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if SECRET_FILE_NAMES.contains(&lower.as_str()) {
        return true;
    }
    let (stem, extension) = lower.rsplit_once('.').unwrap_or((lower.as_str(), ""));
    if SECRET_EXTENSIONS.contains(&extension)
        || lower.contains(".tfstate.")
        || lower.contains(".tfvars.")
        || (stem == "env"
            && (DATA_EXTENSIONS.contains(&extension) || ENVIRONMENT_NAMES.contains(&extension)))
    {
        return true;
    }
    if stem.starts_with("client_secret") || stem.contains("adminsdk") {
        return true;
    }
    if !DATA_EXTENSIONS.contains(&extension) {
        return false;
    }
    let words = stem_words(name.rsplit_once('.').map_or(name, |(stem, _)| stem));
    let key_file = KEY_FILE_EXTENSIONS.contains(&extension)
        && words
            .last()
            .is_some_and(|word| word == "key" || word == "keys");
    key_file
        || words.iter().enumerate().any(|(index, word)| {
            let before = index
                .checked_sub(1)
                .and_then(|previous| words.get(previous));
            names_a_key(
                before.map(String::as_str),
                word,
                words.get(index + 1).map(String::as_str),
            )
        })
}

/// A folder whose name says every file in it holds a key.
fn is_secret_folder(part: &str) -> bool {
    SECRET_FOLDER_NAMES.contains(&part.to_ascii_lowercase().as_str())
}

/// A Git folder by any name: `.git` and a bare clone such as `vendor.git`.
fn is_git_folder(part: &str) -> bool {
    part.to_ascii_lowercase().ends_with(".git")
}

/// Why the reader will not open `path`, or none. A name that holds keys is `SECRET`; a Git
/// folder and a dot path the Harness read does not show as plain text are `HIDDEN`; a path that
/// leaves the folder is `OUTSIDE`. Dot files the Harness read projects (`.mcp.json`) are refused
/// rather than shown raw.
pub(crate) fn path_refusal(path: &str) -> Option<&'static str> {
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
    if parts.iter().any(|part| is_denied_name(part))
        || folders.iter().any(|part| is_secret_folder(part))
        || holds_keys_by_name(name)
    {
        return Some(SECRET);
    }
    if parts.iter().any(|part| part.starts_with('.'))
        && read_class(&parts.join("/")) != ReadClass::Text
    {
        return Some(HIDDEN);
    }
    None
}
