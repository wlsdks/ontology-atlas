//! Decides which file names and folders discovery and a dropped folder may propose.

/// Must equal TS `DISCOVERY_DOCUMENT_EXTENSIONS`. An allow-list, because a
/// deny-list fails on the first unforeseen name; `log` is absent because logs are output.
const DISCOVERY_DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "docx", "doc", "xlsx", "xls", "csv", "tsv", "pptx", "ppt", "txt", "rtf", "odt", "ods",
    "odp", "epub", "md", "markdown", "html", "htm",
];

/// Must equal TS `DISCOVERY_MARKDOWN_EXTENSIONS`. Markdown is offered only from the open
/// folder, and the page drops any file the vault index knows as a node (`kind:`).
const DISCOVERY_MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown"];

/// Must equal TS `DISCOVERY_GUIDE_STEMS`: a repository's guides for people and agents,
/// refused as Markdown, alone or before a further `.` (`README.ko.md`).
const DISCOVERY_GUIDE_STEMS: &[&str] = &[
    "readme",
    "agents",
    "claude",
    "gemini",
    "contributing",
    "code_of_conduct",
    "security",
];

/// Must equal TS `DISCOVERY_VAULT_OWNED_DIRS`: what Atlas itself keeps in the open folder.
pub(super) const DISCOVERY_VAULT_OWNED_DIRS: &[&str] = &["sources", "wiki"];

/// Must equal TS `DISCOVERY_PRUNE_DIR_NAMES`, compared lowercased; dot directories are
/// skipped separately. Generated, published and test-data folders hold files no one wrote
/// as a document.
const DISCOVERY_PRUNE_DIR_NAMES: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    "vendor",
    "pods",
    "deriveddata",
    "__pycache__",
    "venv",
    "public",
    "static",
    "output",
    "outputs",
    "generated",
    "gen",
    "tmp",
    "temp",
    "cache",
    "logs",
    "third_party",
    "third-party",
    "licenses",
    "licences",
    "fixtures",
    "__fixtures__",
    "testdata",
    "test-results",
    "playwright-report",
];

/// Must equal TS `DISCOVERY_PRUNE_DIR_PATHS`; matched as whole trailing segments.
const DISCOVERY_PRUNE_DIR_PATHS: &[&str] = &["src/test/resources", "tests/data"];

/// Must equal TS `DISCOVERY_NOTICE_STEMS`: legal and project notices in any format.
const DISCOVERY_NOTICE_STEMS: &[&str] = &[
    "license",
    "licence",
    "copying",
    "notice",
    "third-party",
    "thirdparty",
    "third_party",
    "authors",
    "contributors",
    "changelog",
    "patents",
];

/// Must equal TS `DISCOVERY_NOTICE_SUFFIXES`: a bundled library's licence, `x-1.0.LICENSE.txt`.
/// A hyphen is absent so `driver-license.pdf` stays a document.
const DISCOVERY_NOTICE_SUFFIXES: &[&str] = &[".license", "_license", ".licence", "_licence"];

/// Must equal TS `DISCOVERY_BUILD_FILE_NAMES`; `requirements-*.txt` is matched by prefix.
const DISCOVERY_BUILD_FILE_NAMES: &[&str] = &["cmakelists.txt", "requirements.txt", "robots.txt"];
const REQUIREMENTS_VARIANT_PREFIX: &str = "requirements-";

/// Must equal TS `DISCOVERY_MIN_FILE_BYTES`; smaller files are empty or placeholders.
pub(super) const DISCOVERY_MIN_FILE_BYTES: u64 = 64;

/// Must equal TS `DISCOVERY_DENIED_NAME_FRAGMENTS`; catches secrets the extension
/// allow-list cannot, such as `credentials.csv`.
const DISCOVERY_DENIED_NAME_FRAGMENTS: &[&str] = &[
    "credential",
    "secret",
    "password",
    "passwd",
    "token",
    "apikey",
    "api-key",
    "api_key",
    "id_rsa",
    "id_ed25519",
    "id_dsa",
    "id_ecdsa",
    ".env",
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".keystore",
    ".jks",
    ".htpasswd",
];

pub(super) const DISCOVERY_MAX_DEPTH: usize = 8;
pub(super) const DISCOVERY_MAX_CANDIDATES: usize = 500;

pub(super) fn lower_extension(name: &str) -> String {
    match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => extension.to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn names_a_notice(stem: &str) -> bool {
    DISCOVERY_NOTICE_STEMS.iter().any(|notice| {
        stem.strip_prefix(notice)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with(['-', '_', '.']))
    }) || DISCOVERY_NOTICE_SUFFIXES
        .iter()
        .any(|suffix| stem.ends_with(suffix))
}

fn names_a_build_file(lowered: &str) -> bool {
    DISCOVERY_BUILD_FILE_NAMES.contains(&lowered)
        || (lowered.starts_with(REQUIREMENTS_VARIANT_PREFIX) && lowered.ends_with(".txt"))
}

/// A digits-only stem shorter than 32 is a date or scanner counter, so it stays a document.
fn looks_like_a_hash(stem: &str) -> bool {
    let is_hex = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_hexdigit());
    if is_hex(stem) {
        let has_letter = stem.bytes().any(|b| matches!(b, b'a'..=b'f'));
        return (stem.len() >= 16 && has_letter) || matches!(stem.len(), 32 | 40 | 64);
    }
    let groups: Vec<&str> = stem.split('-').collect();
    groups.len() == 5
        && groups
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(group, len)| group.len() == len && is_hex(group))
}

/// Why a walk passes a file over, in the words the skipped line uses; mirrors TS
/// `DiscoverySkipReason`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SkipReason {
    SecretName,
    Licence,
    NotDocument,
}

fn file_stem<'a>(lowered: &'a str, extension: &str) -> &'a str {
    lowered
        .strip_suffix(extension)
        .and_then(|rest| rest.strip_suffix('.'))
        .unwrap_or(lowered)
}

/// The name rules every folder walk applies; repository guides are discovery's alone.
pub(crate) fn discovery_skip_reason(name: &str) -> Option<SkipReason> {
    let lowered = name.to_ascii_lowercase();
    if DISCOVERY_DENIED_NAME_FRAGMENTS
        .iter()
        .any(|fragment| lowered.contains(fragment))
    {
        return Some(SkipReason::SecretName);
    }
    let extension = lower_extension(&lowered);
    let stem = file_stem(&lowered, &extension);
    if names_a_notice(stem) {
        return Some(SkipReason::Licence);
    }
    if !DISCOVERY_DOCUMENT_EXTENSIONS.contains(&extension.as_str())
        || names_a_build_file(&lowered)
        || looks_like_a_hash(stem)
    {
        return Some(SkipReason::NotDocument);
    }
    None
}

pub(crate) fn is_markdown_name(name: &str) -> bool {
    DISCOVERY_MARKDOWN_EXTENSIONS.contains(&lower_extension(&name.to_ascii_lowercase()).as_str())
}

/// A bound code root's Markdown is developer documentation and its HTML a page or template
/// the code serves; only the open folder offers either.
const DISCOVERY_CODE_ROOT_PAGE_EXTENSIONS: &[&str] = &["html", "htm"];

pub(crate) fn offered_only_from_open_folder(name: &str) -> bool {
    is_markdown_name(name)
        || DISCOVERY_CODE_ROOT_PAGE_EXTENSIONS
            .contains(&lower_extension(&name.to_ascii_lowercase()).as_str())
}

fn names_a_repository_guide(lowered: &str) -> bool {
    let extension = lower_extension(lowered);
    if !DISCOVERY_MARKDOWN_EXTENSIONS.contains(&extension.as_str()) {
        return false;
    }
    let stem = file_stem(lowered, &extension);
    DISCOVERY_GUIDE_STEMS.iter().any(|guide| {
        stem.strip_prefix(guide)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('.'))
    })
}

/// A free function so this test and the TS mirror test measure the same rule.
pub(crate) fn discovery_accepts_file(name: &str) -> bool {
    if name.starts_with('.') {
        return false;
    }
    discovery_skip_reason(name).is_none() && !names_a_repository_guide(&name.to_ascii_lowercase())
}

/// Takes the path relative to the walked root, with either separator, so Windows matches too.
pub(crate) fn discovery_accepts_directory(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/").to_ascii_lowercase();
    let normalized = normalized.trim_end_matches('/');
    let name = normalized.rsplit('/').next().unwrap_or(normalized);
    if name.starts_with('.') || DISCOVERY_PRUNE_DIR_NAMES.contains(&name) {
        return false;
    }
    !DISCOVERY_PRUNE_DIR_PATHS.iter().any(|path| {
        normalized
            .strip_suffix(path)
            .is_some_and(|before| before.is_empty() || before.ends_with('/'))
    })
}

#[cfg(test)]
mod tests;
