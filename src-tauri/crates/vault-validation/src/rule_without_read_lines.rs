//! A capability that states a rule (a paragraph after its definition with a condition, an order or
//! a default) but cites no lines that hold a condition. A reader cannot check such a rule, and a
//! rule taken from a body without its guard or default can be backwards.
//!
//! Without a repository the cited lines cannot be looked at, so a cite stands as given. No read
//! ledger is consulted: a cite is judged by the lines it names, not by whether this session served
//! them.

use std::collections::HashMap;
use std::path::Path;
use std::sync::LazyLock;

use confined_files::SourceFiles;
use regex::Regex;
use source_scan::extension_of;
use vault_document::{Issue, LoadedDocument};

const SMALL_SOURCE_BYTES: usize = 256 * 1024;
/// The text of cited files one call keeps, so a file many capabilities cite is read once. Past it a
/// file is read again for each cite, never refused: the bound is on memory, not on the answer.
const CITED_TEXT_CACHE_BYTES: usize = 16 * 1024 * 1024;
const MAX_CITED_LINES: usize = 400;
const DECIDE_CHARS: usize = 2000;
const UNIT_SOURCE_EXTENSIONS: [&str; 31] = [
    ".c", ".cc", ".cjs", ".cpp", ".cs", ".cts", ".dart", ".ex", ".exs", ".go", ".h", ".hpp",
    ".java", ".js", ".jsx", ".kt", ".kts", ".lua", ".mjs", ".mts", ".php", ".py", ".rb", ".rs",
    ".scala", ".svelte", ".swift", ".ts", ".tsx", ".vue", ".zig",
];

fn pattern(source: &str) -> Regex {
    // Every pattern is a literal of this file, and the tests below run each; a path from a vault
    // never becomes part of a pattern.
    Regex::new(source)
        .unwrap_or_else(|error| unreachable!("a built-in pattern is invalid: {error}"))
}

static RULE_WORDS: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?i-u:\b(?:if|unless|only|when|whenever|before|after|until|otherwise|default|defaults|first|must|requires?|refuses?|rejects?|never|skips?|falls? back|instead)\b)",
    )
});
static CODE_SPAN: LazyLock<Regex> = LazyLock::new(|| pattern(r"`[^`\n]*`"));
static LINE_CITE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"([^\s`'"<>|,;]{1,300}?\.[A-Za-z]{1,5})(?::|#|\s+)L?([0-9]+)(?:\s*[-\u{2013}]\s*L?([0-9]+))?"#,
    )
});
static CONDITION: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?-u:\b)(?:if|elif|else|unless|switch|case|when|match|guard|while|raise|throw|except|catch|default)(?-u:\b)|(?-u:\b)(?:errors\.New|fmt\.Errorf)\(|\?\?|\|\||&&",
    )
});
static DEFAULT_VALUE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"(?:^|[\s(,{])[A-Za-z_$][A-Za-z0-9_$]*\s*(?::=|=|:)\s*(?:true|false|True|False|None|null|nil|-?[0-9][0-9_.]*|"[^"\n]*"|'[^'\n]*')\s*(?:[,)}]|$)"#,
    )
});
static COMMENT: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*(?://|#|\*|/\*)"));
static SYMBOL_STOP: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i-u)^(?:L[0-9]+|and|or|the|was|is|not|in|at|line|lines)$"));

/// Whether a paragraph's prose states a rule. Code spans are left out: an identifier such as
/// `default` or an error code holding `must` names code, not a condition.
fn states_rule(paragraph: &str) -> bool {
    RULE_WORDS.is_match(&CODE_SPAN.replace_all(paragraph, " "))
}

/// The paragraphs before the first `## ` heading.
fn pre_section_paragraphs(body: &str) -> Vec<String> {
    let mut paragraphs = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    let mut close = |current: &mut Vec<&str>| {
        if !current.is_empty() {
            paragraphs.push(current.join("\n").trim().to_string());
            current.clear();
        }
    };
    for line in body.split('\n') {
        let opens_section = line
            .strip_prefix("##")
            .is_some_and(|rest| rest.chars().next().is_none_or(char::is_whitespace));
        if opens_section {
            break;
        }
        if line.trim().is_empty() {
            close(&mut current);
        } else {
            current.push(line);
        }
    }
    close(&mut current);
    paragraphs.retain(|paragraph| !paragraph.is_empty());
    paragraphs
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Cite {
    path: String,
    start_line: usize,
    end_line: usize,
}

fn exists_as_file(source: &dyn SourceFiles, path: &str) -> bool {
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

fn line_cites(body: &str, source: Option<&dyn SourceFiles>) -> Vec<Cite> {
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

/// `a ? b : c` with spaces around both marks and no colon between them, in one right-to-left pass.
fn has_ternary(line: &[char]) -> bool {
    let space = |at: usize| {
        line.get(at)
            .is_some_and(|character| character.is_whitespace())
    };
    let mut colon: Option<usize> = None;
    for index in (1..line.len()).rev() {
        match line.get(index) {
            Some(':') => colon = Some(index),
            Some('?') if space(index - 1) && (index + 1 >= line.len() || space(index + 1)) => {
                if let Some(colon) = colon {
                    if colon > index + 3
                        && space(colon - 1)
                        && (colon + 1 >= line.len() || space(colon + 1))
                    {
                        return true;
                    }
                }
            }
            _ => {}
        }
    }
    false
}

/// Whether one source line decides: a condition, a branch, a throw or a literal default.
fn decides_line(line: &str) -> bool {
    let line = line.trim_end_matches(['\n', '\r']);
    let head: String = line.chars().take(DECIDE_CHARS).collect();
    if COMMENT.is_match(&head) {
        return false;
    }
    let characters: Vec<char> = head.chars().collect();
    CONDITION.is_match(&head) || has_ternary(&characters) || DEFAULT_VALUE.is_match(&head)
}

/// A small source file the vault names, or `None`: another kind of file, a name the scan may not
/// open, a file over the size a read allows.
fn read_small_source(source: &dyn SourceFiles, path: &str) -> Option<String> {
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
struct CitedText {
    files: HashMap<String, Option<String>>,
    kept_bytes: usize,
}

impl CitedText {
    /// Runs `decide` over the text of `path`, reading the file only the first time.
    fn with_text<T>(
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
        decide(self.files.entry(path.to_string()).or_insert(text).as_deref())
    }
}

fn cited_lines_decide(
    source: Option<&dyn SourceFiles>,
    texts: &mut CitedText,
    cite: &Cite,
) -> bool {
    let Some(source) = source else {
        return true;
    };
    texts.with_text(source, &cite.path, |text| {
        text.is_some_and(|text| {
            text.split('\n')
                .skip(cite.start_line - 1)
                .take(cite.end_line - cite.start_line + 1)
                .any(|line| decides_line(line.trim_end_matches('\r')))
        })
    })
}

static SYMBOL_AFTER_PATH: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"^`?(?:#|:|\s+|,\s*)`?([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?)")
});

/// The symbol a body cites right after its path, in any form builders write: "`src/x.ts`
/// `issueInvoice`", "src/x.ts issueInvoice", "src/x.py#Owner.method".
fn cited_symbol(body: &str, path: &str) -> Option<String> {
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

fn node_path(document: &LoadedDocument) -> Option<String> {
    let path = answer_format::whitespace::trim(document.frontmatter().text("path")?);
    (!path.is_empty()).then(|| path.strip_prefix("./").unwrap_or(path).to_string())
}

/// The exact call that reads the entry file, by symbol where the body names one.
fn read_call(path: &str, symbol: Option<&str>) -> String {
    let quoted = answer_format::json::quote(path);
    let selector = match symbol {
        Some(symbol) => format!(
            "{{\"path\":{quoted},\"symbol\":{}}}",
            answer_format::json::quote(symbol)
        ),
        None => format!("{{\"path\":{quoted},\"startLine\":1,\"maxLines\":200}}"),
    };
    format!("analyze_repo_structure({{\"sourceOnly\":true,\"sourceReads\":[{selector}]}})")
}

/// One finding for each capability that states a rule and cites no lines that hold its condition.
pub fn rule_cite_findings(
    documents: &[LoadedDocument],
    source: Option<&dyn SourceFiles>,
) -> Vec<(String, Issue)> {
    let mut findings = Vec::new();
    let mut texts = CitedText::default();
    for document in documents {
        let is_capability = document
            .frontmatter()
            .text("kind")
            .is_some_and(|kind| answer_format::whitespace::trim(kind) == "capability");
        if !is_capability {
            continue;
        }
        let Ok(body) = document.body() else {
            continue;
        };
        let states = pre_section_paragraphs(&body)
            .into_iter()
            .skip(1)
            .any(|paragraph| states_rule(&paragraph));
        if !states {
            continue;
        }
        let cites = line_cites(&body, source);
        if cites.iter().any(|cite| cited_lines_decide(source, &mut texts, cite)) {
            continue;
        }
        let slug = document.slug();
        let path = node_path(document);
        let symbol = path.as_deref().and_then(|path| cited_symbol(&body, path));
        let read = path
            .as_deref()
            .map(|path| format!("{}, then ", read_call(path, symbol.as_deref())))
            .unwrap_or_default();
        let held = if cites.is_empty() {
            ""
        } else {
            " (its cites name lines that hold no condition)"
        };
        findings.push((
            slug.to_string(),
            Issue::warning(
                "rule-without-read-lines",
                format!("{slug} states a rule but cites no lines that hold its condition{held}. A reader cannot check it, and a rule taken from a body without its guard or default can be backwards. Repair: {read}patch_concept each rule with the cite of the returned lines that hold its condition, as `path:L12-L30`."),
            ),
        ));
    }
    findings
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
    fn a_paragraph_states_a_rule_by_its_prose_and_not_by_a_code_span() {
        assert!(states_rule("It refuses an order when the cart is empty."));
        assert!(!states_rule(
            "It lists the `default` values and `must_pay` codes."
        ));
    }

    #[test]
    fn a_line_decides_by_a_branch_a_ternary_or_a_literal_default_and_a_comment_never_does() {
        assert!(decides_line("  if (cart.empty) throw new Error('x');"));
        assert!(decides_line("const label = ok ? a : b;"));
        assert!(decides_line("  retries: 3,"));
        assert!(!decides_line("// if this were a branch"));
        assert!(!decides_line("const total = a + b;"));
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
            assert!(cited_lines_decide(Some(&source), &mut texts, &cite));
        }
        assert_eq!(source.opened.get(), 1);
    }
}
