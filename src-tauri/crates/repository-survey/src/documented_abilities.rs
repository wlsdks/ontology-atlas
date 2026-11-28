//! Features the README and the docs name in a heading that the code also names: "## Lazy custom
//! readers" beside a `LazyReader` class, "# Telemetry" beside a `telemetry/` folder. A heading
//! alone is prose and a folder alone is layout; the two together say an operator was told this
//! exists. Headings that describe the document (installation, license, out of scope) are skipped,
//! and dated specs, records and plans are history, not operator docs.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::bounded_lines::bounded_lines;
use crate::declaration_index::DeclarationIndex;
use crate::js_pattern::js_regex;
use crate::name_key::{name_key, words_of};
use source_scan::DeclarationKind;

const PAGE_LIMIT: usize = 200;
const PAGE_UNITS: usize = 64 * 1024;

/// Headings about the document rather than the product.
static META_HEADING: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)^(?:installation|installing|install|usage|getting started|get started|quick ?start|introduction|overview|license|licensing|contribut\w*|changelog|change log|faq|requirements|prerequisites|development|developing|testing|tests?|examples?|table of contents|contents|credits|acknowledg\w*|support|sponsors?|backers?|community|roadmap|benchmarks?|further reading|see also|links|references?|api reference|documentation|docs|citation|citing|cite|authors?|security|troubleshooting|motivation|features?|limitations|known issues|todo|notes?|summary|example|demo|status|upgrading|migration|migrating|release notes|versioning|compatibility|alternatives|related projects?|who uses|users|about|why|what|how it works|next steps|learn more|resources|help|feedback|questions|projects using|used by|showcase|in the wild|out of scope|non-goals|goals)\b",
    )
});

/// Words that never place a heading on code by themselves.
const FILLER: &[&str] = &[
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "for",
    "to",
    "in",
    "on",
    "with",
    "using",
    "use",
    "via",
    "how",
    "your",
    "my",
    "our",
    "from",
    "by",
    "as",
    "at",
    "is",
    "are",
    "be",
    "it",
    "this",
    "that",
    "what",
    "why",
    "when",
    "new",
    "custom",
    "basic",
    "advanced",
    "more",
    "other",
    "all",
    "about",
    "setup",
    "set",
    "up",
    "configure",
    "configuring",
    "option",
    "options",
    "setting",
    "settings",
    "mode",
    "modes",
    "support",
    "supported",
    "example",
    "examples",
    "guide",
    "part",
    "step",
    "default",
    "defaults",
    "main",
    "core",
    "common",
    "base",
    "type",
    "types",
    "util",
    "utils",
    "helper",
    "helpers",
    "test",
    "tests",
    "index",
    "lib",
    "run",
    "running",
    "work",
    "working",
    "works",
    "get",
    "getting",
    "started",
    "v1",
    "v2",
    "vs",
    "not",
    "do",
    "does",
    "can",
    "will",
    "you",
    "we",
    "i",
    "its",
    "their",
    "into",
    "over",
    "out",
    "add",
    "adding",
    "make",
    "making",
    "list",
    "note",
    "tip",
    "warning",
    "one",
    "two",
    "multiple",
    "single",
    "simple",
    "usage",
];

/// File and folder names too generic to stand for a feature.
const GENERIC_CODE: &[&str] = &[
    "index",
    "main",
    "mod",
    "lib",
    "init",
    "__init__",
    "util",
    "utils",
    "helper",
    "helpers",
    "type",
    "types",
    "constant",
    "constants",
    "common",
    "base",
    "core",
    "error",
    "errors",
    "option",
    "options",
    "test",
    "tests",
    "src",
    "internal",
    "pkg",
    "app",
    "cmd",
    "model",
    "models",
    "interface",
    "interfaces",
    "shared",
    "misc",
    "version",
    "doc",
];

/// Folders that hold build, packaging or helper scripts rather than the product.
static NOT_PRODUCT_FOLDER: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)(?:^|/)(?:scripts?|tools?|bin|build|dist|formula|packaging|etc|vendor\w*|ci|docker|deploy|assets?|static|public|shared|common|utils?|helpers?)(?:/|$)",
    )
});
/// A test file, which never stands for the folder it sits in.
static TEST_FILE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?:^|/)(?:tests?|__tests__|specs?)/|(?:^|/)tests?\.\w+$|[._-](?:test|spec)s?\.\w+$|_test\.go$|(?:^|/)test_\w+\.py$|(?:^|/)conftest\.py$",
    )
});
/// Doc folders that keep dated history (specs, records, plans), not what an operator reads.
static HISTORY_DOCS: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)(?:^|/)(?:specs?|records?|decisions?|adrs?|rfcs?|plans?|proposals?|archive|history|changelogs?|retros?)/",
    )
});
static FENCE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:```|~~~)"));
static ATX: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(#{1,6})[ \t]+(.*)$"));
static FRONT_TITLE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^title:[ \t]*(.*)$"));
static QUOTES: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"^["']|["']$"#));
static TAG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"<[^<>]*>"));
static IMAGE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"!\[[^\]\[]*\]\([^()]*\)"));
static LINK: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\[([^\]\[]*)\]\([^()]*\)"));
static EMOJI_CODE: LazyLock<Regex> = LazyLock::new(|| js_regex(r":[a-z0-9_+-]+:"));
static MARKUP: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[`*_~]"));
static ANCHOR: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\{#[^{}]*\}"));
static OTHER_CHARACTERS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[^\p{L}\p{N} .+/&()'-]"));
static SPACES: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\s+"));
static WORD_SPLIT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[^\p{L}\p{N}]+"));
static STARTS_WITH_LETTER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[A-Za-z]"));

/// A heading's text cleaned of markup and cut to 60 units.
fn clean_heading(raw: &str) -> String {
    let text = TAG.replace_all(raw, " ");
    let text = IMAGE.replace_all(&text, " ");
    let text = LINK.replace_all(&text, "$1");
    let text = EMOJI_CODE.replace_all(&text, " ");
    let text = MARKUP.replace_all(&text, "");
    let text = ANCHOR.replace_all(&text, "");
    let text = OTHER_CHARACTERS.replace_all(&text, " ");
    let text = SPACES.replace_all(&text, " ");
    let trimmed = answer_format::whitespace::trim(&text);
    answer_format::whitespace::trim(answer_format::utf16::prefix(trimmed, 60)).to_string()
}

/// A heading's text without its closing `#` run, trimmed by hand so a long line costs one pass.
fn atx_text(rest: &str) -> String {
    let trimmed = rest.trim_end_matches(answer_format::whitespace::is_whitespace);
    let without_hashes = trimmed.trim_end_matches('#');
    let closes_run = without_hashes.len() < trimmed.len()
        && (without_hashes.is_empty()
            || without_hashes
                .chars()
                .last()
                .is_some_and(answer_format::whitespace::is_whitespace));
    let kept = if closes_run { without_hashes } else { trimmed };
    answer_format::whitespace::trim(kept.trim_end_matches(answer_format::whitespace::is_whitespace))
        .to_string()
}

struct Heading {
    text: String,
    line: usize,
    level: usize,
}

/// A heading for each one at the given levels, fenced code skipped.
fn headings_of(text: &str, levels: &[usize]) -> Vec<Heading> {
    let mut rows = Vec::new();
    let mut fenced = false;
    for (index, line) in bounded_lines(text).iter().enumerate() {
        if FENCE.is_match(line) {
            fenced = !fenced;
            continue;
        }
        if fenced {
            continue;
        }
        if let Some(found) = ATX.captures(line) {
            let level = found.get(1).map_or(0, |hashes| hashes.as_str().len());
            if levels.contains(&level) {
                rows.push(Heading {
                    text: clean_heading(&atx_text(found.get(2).map_or("", |rest| rest.as_str()))),
                    line: index + 1,
                    level,
                });
            }
        }
        if index < 10 && levels.contains(&1) {
            if let Some(found) = FRONT_TITLE.captures(line) {
                let title =
                    answer_format::whitespace::trim(found.get(1).map_or("", |rest| rest.as_str()));
                rows.push(Heading {
                    text: clean_heading(&QUOTES.replace_all(title, "")),
                    line: index + 1,
                    level: 1,
                });
            }
        }
    }
    rows.into_iter()
        .filter(|row| answer_format::utf16::len(&row.text) >= 3)
        .collect()
}

#[derive(Debug, Clone)]
struct CodeEntry {
    rank: u8,
    path: String,
    line: usize,
    symbol: String,
}

/// A product file the vocabulary may name.
pub struct VocabularyFile<'a> {
    pub path: &'a str,
    pub lines: usize,
}

fn dirname(path: &str) -> &str {
    path.rsplit_once('/').map_or(".", |(folder, _)| folder)
}

fn stem_of(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

/// Names the code gives a feature, each with where it is: folder names (at the folder's main
/// file), file names, and declared types, classes and functions.
fn code_vocabulary(
    files: &[VocabularyFile<'_>],
    index: &DeclarationIndex,
) -> HashMap<String, CodeEntry> {
    let mut entries: HashMap<String, CodeEntry> = HashMap::new();
    let add = |key: String, entry: CodeEntry, entries: &mut HashMap<String, CodeEntry>| {
        if key.is_empty() || key.chars().count() < 3 || GENERIC_CODE.contains(&key.as_str()) {
            return;
        }
        if entries.get(&key).is_none_or(|held| held.rank > entry.rank) {
            entries.insert(key, entry);
        }
    };
    let kept: Vec<&VocabularyFile<'_>> = files
        .iter()
        .filter(|file| {
            !NOT_PRODUCT_FOLDER.is_match(dirname(file.path)) && !TEST_FILE.is_match(file.path)
        })
        .collect();
    let mut by_folder: indexmap::IndexMap<&str, Vec<&VocabularyFile<'_>>> =
        indexmap::IndexMap::new();
    for file in &kept {
        by_folder.entry(dirname(file.path)).or_default().push(file);
    }
    for (folder, members) in &by_folder {
        if *folder == "." {
            continue;
        }
        let name = folder.rsplit('/').next().unwrap_or(folder);
        let main = members
            .iter()
            .find(|file| stem_of(file.path) == name)
            .or_else(|| {
                members.iter().min_by(|left, right| {
                    right
                        .lines
                        .cmp(&left.lines)
                        .then_with(|| answer_format::collation::compare_text(left.path, right.path))
                })
            });
        if let Some(main) = main {
            add(
                name_key(name),
                CodeEntry {
                    rank: 0,
                    path: main.path.to_string(),
                    line: 1,
                    symbol: name.to_string(),
                },
                &mut entries,
            );
        }
    }
    for file in &kept {
        let stem = stem_of(file.path);
        add(
            name_key(stem),
            CodeEntry {
                rank: 1,
                path: file.path.to_string(),
                line: 1,
                symbol: stem.to_string(),
            },
            &mut entries,
        );
    }
    for (name, rows) in index {
        if name.contains('.') || !STARTS_WITH_LETTER.is_match(name) || words_of(name).len() < 2 {
            continue;
        }
        let found = rows.iter().find(|row| {
            matches!(
                row.kind,
                DeclarationKind::Class
                    | DeclarationKind::Type
                    | DeclarationKind::Interface
                    | DeclarationKind::Struct
                    | DeclarationKind::Enum
                    | DeclarationKind::Function
            )
        });
        if let Some(row) = found {
            add(
                name_key(name),
                CodeEntry {
                    rank: 2,
                    path: row.path.clone(),
                    line: row.line,
                    symbol: name.clone(),
                },
                &mut entries,
            );
        }
    }
    entries
}

/// The code entry a heading names: its whole phrase first ("Signed streams" is `SignedStreams`),
/// then a heading of one word as a whole folder name ("Telemetry" is `telemetry/`). A heading is
/// split at spaces and punctuation only, so "TypeScript" stays one word.
fn match_heading<'a>(
    heading: &str,
    vocabulary: &'a HashMap<String, CodeEntry>,
    one_word: bool,
) -> Option<&'a CodeEntry> {
    let lowered = heading.to_lowercase();
    let spoken: Vec<&str> = WORD_SPLIT
        .split(&lowered)
        .filter(|word| !word.is_empty())
        .collect();
    let words: Vec<&str> = spoken
        .iter()
        .copied()
        .filter(|word| !FILLER.contains(word))
        .collect();
    let key = |word: &str| word.strip_suffix('s').unwrap_or(word).to_string();
    match words.as_slice() {
        [] => None,
        [only] => {
            // "Out of scope" and "How to read" are one word only once the filler is gone.
            let own = spoken
                .iter()
                .filter(|word| !matches!(**word, "the" | "a" | "an"))
                .count();
            if !one_word || own != 1 || only.chars().count() < 3 {
                return None;
            }
            vocabulary.get(&key(only)).filter(|entry| entry.rank == 0)
        }
        many => vocabulary.get(&many.iter().map(|word| key(word)).collect::<String>()),
    }
}

/// The documents the headings are read from, repository-relative paths.
pub struct Documents<'a> {
    pub readme: Option<&'a str>,
    pub pages: &'a [String],
}

/// Documented features with their code location.
pub fn documented_abilities(
    read_text: &dyn Fn(&str, usize) -> String,
    documents: &Documents<'_>,
    files: &[VocabularyFile<'_>],
    index: &DeclarationIndex,
) -> Vec<AbilityRow> {
    let vocabulary = code_vocabulary(files, index);
    struct Source<'a> {
        path: &'a str,
        levels: &'static [usize],
        one_word_levels: &'static [usize],
    }
    let mut sources: Vec<Source<'_>> = Vec::new();
    // A one-word heading names a feature as a README section or a page's own title, never as a
    // section deep in a page.
    if let Some(readme) = documents.readme {
        sources.push(Source {
            path: readme,
            levels: &[2, 3],
            one_word_levels: &[2, 3],
        });
    }
    for page in documents
        .pages
        .iter()
        .filter(|path| !HISTORY_DOCS.is_match(path))
        .take(PAGE_LIMIT)
    {
        sources.push(Source {
            path: page,
            levels: &[1, 2],
            one_word_levels: &[1],
        });
    }
    let mut rows = Vec::new();
    let mut placed: HashSet<(String, String)> = HashSet::new();
    for source in sources {
        let text = read_text(source.path, PAGE_UNITS);
        if text.is_empty() {
            continue;
        }
        for heading in headings_of(&text, source.levels) {
            if META_HEADING.is_match(&heading.text) {
                continue;
            }
            let Some(entry) = match_heading(
                &heading.text,
                &vocabulary,
                source.one_word_levels.contains(&heading.level),
            ) else {
                continue;
            };
            if !placed.insert((entry.path.clone(), entry.symbol.clone())) {
                continue;
            }
            rows.push(
                AbilityRow::at(
                    AbilityKind::Documented,
                    &heading.text,
                    &entry.path,
                    entry.line,
                )
                .with_symbol(&entry.symbol)
                .with_doc(format!("{}:L{}", source.path, heading.line)),
            );
        }
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vocabulary_of(paths: &[(&str, usize)]) -> HashMap<String, CodeEntry> {
        let files: Vec<VocabularyFile<'_>> = paths
            .iter()
            .map(|(path, lines)| VocabularyFile {
                path,
                lines: *lines,
            })
            .collect();
        code_vocabulary(&files, &DeclarationIndex::new())
    }

    #[test]
    fn a_heading_of_two_words_names_a_file_and_a_lone_word_only_a_folder() {
        let vocabulary = vocabulary_of(&[("src/telemetry/sink.ts", 10), ("src/lazy_reader.ts", 5)]);
        assert_eq!(
            match_heading("Lazy reader", &vocabulary, true).map(|entry| entry.path.as_str()),
            Some("src/lazy_reader.ts")
        );
        assert_eq!(
            match_heading("Telemetry", &vocabulary, true).map(|entry| entry.symbol.as_str()),
            Some("telemetry")
        );
        assert!(match_heading("Telemetry", &vocabulary, false).is_none());
        assert!(match_heading("Sink", &vocabulary, true).is_none());
    }

    #[test]
    fn headings_in_fences_are_skipped_and_a_front_matter_title_counts_as_level_one() {
        let text = "---\ntitle: \"Billing\"\n---\n```\n# Not a heading\n```\n## Real one ##\n";
        let rows = headings_of(text, &[1, 2]);
        assert_eq!(
            rows.iter()
                .map(|row| (row.text.as_str(), row.line))
                .collect::<Vec<_>>(),
            [("Billing", 2), ("Real one", 7)]
        );
    }
}
