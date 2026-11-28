//! The cites a node's body makes: `path:L12-L30` and its spellings, the symbol cited after a path,
//! and the text of the small source files those cites name, read once for a call.

use std::collections::HashMap;
use std::path::Path;
use std::sync::LazyLock;

use confined_files::SourceFiles;
use regex::Regex;
use source_reads::ReadsUnder;
use source_scan::extension_of;

pub(crate) const SMALL_SOURCE_BYTES: usize = 256 * 1024;
/// The text of cited files one call keeps, so a file many capabilities cite is read once. Past it a
/// file is read again for each cite, never refused: the bound is on memory, not on the answer.
const CITED_TEXT_CACHE_BYTES: usize = 16 * 1024 * 1024;
const MAX_CITED_LINES: usize = 400;
pub(crate) const UNIT_SOURCE_EXTENSIONS: [&str; 31] = [
    ".c", ".cc", ".cjs", ".cpp", ".cs", ".cts", ".dart", ".ex", ".exs", ".go", ".h", ".hpp",
    ".java", ".js", ".jsx", ".kt", ".kts", ".lua", ".mjs", ".mts", ".php", ".py", ".rb", ".rs",
    ".scala", ".svelte", ".swift", ".ts", ".tsx", ".vue", ".zig",
];

pub(crate) fn pattern(source: &str) -> Regex {
    // Every pattern is a literal of this file, and the tests below run each; a path from a vault
    // never becomes part of a pattern.
    Regex::new(source)
        .unwrap_or_else(|error| unreachable!("a built-in pattern is invalid: {error}"))
}

static LINE_CITE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"([^\s`'"<>|,;]{1,300}?\.[A-Za-z]{1,5})(?::|#|\s+)L?([0-9]+)(?:\s*[-\u{2013}]\s*L?([0-9]+))?"#,
    )
});

static SYMBOL_STOP: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i-u)^(?:L[0-9]+|and|or|the|was|is|not|in|at|line|lines)$"));

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Cite {
    pub(crate) path: String,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
}

pub(crate) fn exists_as_file(source: &dyn SourceFiles, path: &str) -> bool {
    source.regular_file_exists(Path::new(path)).unwrap_or(false)
}

/// The repository path a cited token names. Prose brackets around a cite join the token
/// (`(app/(shop)/page.tsx:L2)`), so each leading bracket is tried off in turn; the first spelling
/// that is a file of the repository wins, and else the last.
fn cite_path(token: &str, source: Option<&dyn SourceFiles>) -> String {
    let strip = |text: &str| text.strip_prefix("./").unwrap_or(text).to_string();
    let mut candidates = vec![strip(token)];
    while let Some(last) = candidates.last() {
        let Some(rest) = last.strip_prefix(['(', '[', '{']) else {
            break;
        };
        let next = strip(rest);
        candidates.push(next);
    }
    if let Some(source) = source {
        if let Some(found) = candidates.iter().find(|path| exists_as_file(source, path)) {
            return found.clone();
        }
    }
    candidates.pop().unwrap_or_default()
}

pub(crate) fn line_cites(body: &str, source: Option<&dyn SourceFiles>) -> Vec<Cite> {
    LINE_CITE
        .captures_iter(body)
        .filter_map(|captures| {
            let first: usize = captures.get(2)?.as_str().parse().ok()?;
            let second: usize = captures
                .get(3)
                .map_or(Some(first), |end| end.as_str().parse().ok())?;
            let (start_line, end_line) = (first.min(second), first.max(second));
            let token = captures.get(1)?.as_str();
            (start_line > 0 && end_line - start_line < MAX_CITED_LINES).then(|| Cite {
                path: cite_path(token, source),
                start_line,
                end_line,
            })
        })
        .collect()
}

/// A small source file the vault names, or `None`: another kind of file, a name the scan may not
/// open, a file over the size a read allows.
pub(crate) fn read_small_source(source: &dyn SourceFiles, path: &str) -> Option<String> {
    let extension = extension_of(path.rsplit('/').next().unwrap_or(path))?.to_ascii_lowercase();
    if !UNIT_SOURCE_EXTENSIONS.contains(&extension.as_str()) || !exists_as_file(source, path) {
        return None;
    }
    let text = source.read_text(Path::new(path)).ok()?;
    (text.len() <= SMALL_SOURCE_BYTES).then(|| text.into_owned())
}

/// The small files a call has read for its cites, by path; a file that could not be read is
/// remembered too.
#[derive(Default)]
pub(crate) struct CitedText {
    files: HashMap<String, Option<String>>,
    kept_bytes: usize,
}

impl CitedText {
    /// Runs `decide` over the text of `path`, reading the file only the first time.
    pub(crate) fn with_text<T>(
        &mut self,
        source: &dyn SourceFiles,
        path: &str,
        decide: impl FnOnce(Option<&str>) -> T,
    ) -> T {
        if let Some(known) = self.files.get(path) {
            return decide(known.as_deref());
        }
        let text = read_small_source(source, path);
        let size = text.as_ref().map_or(0, String::len);
        if self.kept_bytes + size > CITED_TEXT_CACHE_BYTES {
            return decide(text.as_deref());
        }
        self.kept_bytes += size;
        decide(
            self.files
                .entry(path.to_string())
                .or_insert(text)
                .as_deref(),
        )
    }
}

static SYMBOL_AFTER_PATH: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"^`?(?:#|:|\s+|,\s*)`?([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?)")
});

/// Whether this session served every line of the cite, under the path a sub-root read cited it by.
pub(crate) fn served_lines(reads: &ReadsUnder, cite: &Cite) -> bool {
    let Some(ranges) = reads.reads.get(reads.read_path(&cite.path)) else {
        return false;
    };
    (cite.start_line..=cite.end_line).all(|line| {
        ranges
            .iter()
            .any(|range| range.start_line <= line && line <= range.end_line)
    })
}

/// Whether the cited range lies inside a file of the repository: one small enough to read, with
/// at least as many lines as the cite ends at.
pub(crate) fn cited_lines_exist(
    source: &dyn SourceFiles,
    texts: &mut CitedText,
    cite: &Cite,
) -> bool {
    texts.with_text(source, &cite.path, |text| {
        text.is_some_and(|text| text.split('\n').count() >= cite.end_line)
    })
}

/// The symbol a body cites right after its path, in any form builders write: "`src/x.ts`
/// `issueInvoice`", "src/x.ts issueInvoice", "src/x.py#Owner.method".
pub(crate) fn cited_symbol(body: &str, path: &str) -> Option<String> {
    body.match_indices(path).find_map(|(at, _)| {
        let rest = body.get(at + path.len()..)?;
        let symbol = SYMBOL_AFTER_PATH
            .captures(rest)?
            .get(1)?
            .as_str()
            .trim_end_matches('.')
            .to_string();
        (!SYMBOL_STOP.is_match(&symbol)).then_some(symbol)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_node_path_of_six_hundred_kilobytes_is_searched_for_and_never_compiled_into_a_pattern() {
        let path = format!("src/{}.ts", "a.".repeat(300_000));
        let body = format!("`{path}` issueInvoice");
        assert_eq!(cited_symbol(&body, &path).as_deref(), Some("issueInvoice"));
    }

    #[test]
    fn cites_read_each_spelling_and_the_symbol_after_a_path() {
        let cites = line_cites(
            "see `src/a.ts:L12-L30`, (src/b.py#5) and src/c.rs L7\u{2013}9",
            None,
        );
        let shown: Vec<(&str, usize, usize)> = cites
            .iter()
            .map(|cite| (cite.path.as_str(), cite.start_line, cite.end_line))
            .collect();
        assert_eq!(
            shown,
            [("src/a.ts", 12, 30), ("src/b.py", 5, 5), ("src/c.rs", 7, 9)]
        );
        assert_eq!(
            cited_symbol("`src/x.ts` `issueInvoice` does it", "src/x.ts").as_deref(),
            Some("issueInvoice")
        );
    }

    /// One file held in memory, counting how often it is opened.
    struct CountingSource {
        root: std::path::PathBuf,
        opened: std::cell::Cell<usize>,
    }

    impl SourceFiles for CountingSource {
        fn root(&self) -> &Path {
            &self.root
        }
        fn kind(
            &self,
            _path: &Path,
        ) -> Result<Option<confined_files::EntryKind>, confined_files::SourceReadError> {
            Ok(Some(confined_files::EntryKind::File))
        }
        fn link_kind(
            &self,
            _path: &Path,
        ) -> Result<Option<confined_files::EntryKind>, confined_files::SourceReadError> {
            Ok(Some(confined_files::EntryKind::File))
        }
        fn regular_file_exists(
            &self,
            _path: &Path,
        ) -> Result<bool, confined_files::SourceReadError> {
            Ok(true)
        }
        fn read_text(
            &self,
            _path: &Path,
        ) -> Result<std::borrow::Cow<'_, str>, confined_files::SourceReadError> {
            self.opened.set(self.opened.get() + 1);
            Ok(std::borrow::Cow::Borrowed("if (x) throw new Error();\n"))
        }
        fn list_directory(
            &self,
            _path: &Path,
        ) -> Result<confined_files::DirectoryListing, confined_files::SourceReadError> {
            Err(confined_files::SourceReadError::Absent)
        }
    }

    #[test]
    fn a_file_many_capabilities_cite_is_opened_once_for_the_whole_call() {
        let source = CountingSource {
            root: std::path::PathBuf::from("/repository"),
            opened: std::cell::Cell::new(0),
        };
        let cite = Cite {
            path: "a.ts".to_string(),
            start_line: 1,
            end_line: 1,
        };
        let mut texts = CitedText::default();
        for _ in 0..5 {
            assert!(texts.with_text(&source, &cite.path, |text| text
                .is_some_and(|text| text.contains("throw"))));
        }
        assert_eq!(source.opened.get(), 1);
    }
}
