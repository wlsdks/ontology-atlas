//! Which paths a read may name, judged by the text of the path alone, before the disk is asked.
//! A path is repository-relative with `/` separators; every refusal is one word an agent can act
//! on, and the order of the checks is the order the script server told them in.

use std::collections::HashSet;

use confined_files::is_credential_name;
use source_scan::DEFAULT_IGNORE;

use crate::posix_path::extname;
use crate::refusal_reason::RefusalReason;

const SOURCE_EXTENSIONS: [&str; 31] = [
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".css",
    ".go",
    ".h",
    ".hpp",
    ".html",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".mjs",
    ".mts",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".sh",
    ".swift",
    ".ts",
    ".tsx",
    ".vue",
    ".zig",
    // Prose shipped beside the code, under the same caps; not a manifest.
    ".markdown",
    ".md",
    ".rst",
    ".txt",
];

const MANIFESTS: [&str; 8] = [
    "Cargo.toml",
    "Gemfile",
    "go.mod",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "setup.cfg",
    "setup.py",
];

/// The folder names a read refuses: the scan's own list and the names the caller added.
pub fn ignored_names(extra: &[String]) -> HashSet<String> {
    DEFAULT_IGNORE
        .iter()
        .map(|name| (*name).to_string())
        .chain(extra.iter().cloned())
        .collect()
}

fn is_absolute(path: &str) -> bool {
    let mut characters = path.chars();
    let drive = matches!(
        (characters.next(), characters.next(), characters.next()),
        (Some(letter), Some(':'), Some('\\' | '/')) if letter.is_ascii_alphabetic()
    );
    drive || path.starts_with("\\\\") || path.starts_with('/')
}

/// Why `path` may not be read, or `None` when its text is acceptable.
pub fn path_refusal(path: &str, ignore: &HashSet<String>) -> Option<RefusalReason> {
    if is_absolute(path) {
        return Some(RefusalReason::AbsolutePath);
    }
    if path
        .chars()
        .any(|character| character <= '\u{1f}' || character == '\u{7f}')
    {
        return Some(RefusalReason::ControlCharacter);
    }
    if path.contains('\\') || path.contains(':') {
        return Some(RefusalReason::AmbiguousSeparator);
    }
    if path.contains('#') || path.contains("@sha256:") {
        return Some(RefusalReason::AmbiguousCitationDelimiter);
    }
    let parts: Vec<&str> = path.split('/').collect();
    if parts
        .iter()
        .any(|part| part.is_empty() || *part == "." || *part == "..")
    {
        return Some(RefusalReason::PathTraversal);
    }
    if parts.iter().any(|part| part.starts_with('.')) {
        return Some(RefusalReason::SensitivePath);
    }
    if parts.iter().any(|part| ignore.contains(*part)) {
        return Some(RefusalReason::IgnoredPath);
    }
    if parts.iter().any(|part| is_credential_name(part)) {
        return Some(RefusalReason::SensitivePath);
    }
    let name = parts.last().copied().unwrap_or("");
    if !SOURCE_EXTENSIONS.contains(&extname(path).to_ascii_lowercase().as_str())
        && !MANIFESTS.contains(&name)
    {
        return Some(RefusalReason::UnsupportedSourceType);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_path_a_stranger_could_write_is_refused_by_the_first_rule_it_breaks() {
        let ignore = ignored_names(&["generated".to_string()]);
        for (path, reason) in [
            ("/etc/passwd", RefusalReason::AbsolutePath),
            ("C:\\x.ts", RefusalReason::AbsolutePath),
            ("a\u{1}.ts", RefusalReason::ControlCharacter),
            ("a\\b.ts", RefusalReason::AmbiguousSeparator),
            ("a:b.ts", RefusalReason::AmbiguousSeparator),
            ("a#1.ts", RefusalReason::AmbiguousCitationDelimiter),
            ("a/../b.ts", RefusalReason::PathTraversal),
            ("a//b.ts", RefusalReason::PathTraversal),
            (".env", RefusalReason::SensitivePath),
            ("src/.git/config", RefusalReason::SensitivePath),
            ("node_modules/x/index.js", RefusalReason::IgnoredPath),
            ("generated/a.ts", RefusalReason::IgnoredPath),
            ("src/secrets.ts", RefusalReason::SensitivePath),
            ("src/server.pem", RefusalReason::SensitivePath),
            ("bin/tool.exe", RefusalReason::UnsupportedSourceType),
            ("LICENSE", RefusalReason::UnsupportedSourceType),
        ] {
            assert_eq!(path_refusal(path, &ignore), Some(reason), "{path}");
        }
        for allowed in ["src/a.ts", "Cargo.toml", "docs/Guide.MD", "a/b/c.py"] {
            assert_eq!(path_refusal(allowed, &ignore), None, "{allowed}");
        }
    }
}
