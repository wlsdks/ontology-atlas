//! The documentation pages a repository keeps beside its code: the Markdown and reStructuredText
//! under `docs`, with the title each page gives itself.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;

use crate::entry_signals::stem_of;
use crate::js_pattern::js_regex;
use crate::survey_files::SurveyFiles;

const DOC_FOLDERS: [&str; 3] = ["docs", "doc", "documentation"];
/// A page is listed at most this deep below its documentation folder.
const MAX_DEPTH: usize = 4;
/// A survey lists at most this many pages.
pub const DOC_PAGE_LIMIT: usize = 40;
const TITLE_UNITS: usize = 70;
const TITLE_READ_UNITS: usize = 16 * 1024;

static SKIPPED: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)(?:^|/)(?:blog|changelog|changelogs|release-notes|news|_[^/]*|node_modules)(?:/|$)",
    )
});
static PAGE_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)\.(?:md|mdx|markdown|rst)$"));
static HAS_EXTENSION: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)\.[a-z0-9]+$"));
static FRONT_MATTER_START: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^---\r?\n"));
static FRONT_TITLE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?m)^title:[ \t]*(\S.*)$"));
static HEADING: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?m)^#\s+(.+)$"));
static RST_TITLE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?m)^([^\n=\-~]+)\r?\n[=\-~]{3,}\s*$"));
static MARKUP: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[`*_]"));
static QUOTES: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"^["']|["']$"#));

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocPage {
    pub path: String,
    pub title: String,
}

#[derive(Debug, Default)]
pub struct DocPages {
    /// The first [`DOC_PAGE_LIMIT`] pages, shallowest first.
    pub rows: Vec<DocPage>,
    pub omitted: usize,
    /// Every page's path, for the readers of the documentation that want them all.
    pub all: Vec<String>,
}

fn pages_under(files: &SurveyFiles<'_>, ignore: &HashSet<&str>) -> Vec<String> {
    let mut pages = Vec::new();
    for folder in DOC_FOLDERS {
        let mut stack: Vec<(String, usize)> = vec![(folder.to_string(), 0)];
        while let Some((directory, depth)) = stack.pop() {
            if depth > MAX_DEPTH {
                continue;
            }
            let mut folders_here = Vec::new();
            for name in files.names_in(&directory) {
                if name.starts_with('.') || ignore.contains(name.as_str()) {
                    continue;
                }
                let path = format!("{directory}/{name}");
                if SKIPPED.is_match(&path) {
                    continue;
                }
                if PAGE_NAME.is_match(&name) {
                    if files.file(&path).is_some() {
                        pages.push(path);
                    }
                } else if !HAS_EXTENSION.is_match(&name) {
                    folders_here.push((path, depth + 1));
                }
            }
            stack.extend(folders_here.into_iter().rev());
        }
    }
    pages
}

fn title_of(files: &SurveyFiles<'_>, path: &str) -> String {
    let text = files.text(path, TITLE_READ_UNITS);
    let front = if FRONT_MATTER_START.is_match(&text) {
        let front_end = text
            .get(3..)
            .and_then(|rest| rest.find("\n---"))
            .map(|at| at + 3);
        let scope = front_end
            .filter(|end| *end > 0)
            .and_then(|end| text.get(..end))
            .unwrap_or(&text);
        FRONT_TITLE
            .captures(scope)
            .and_then(|found| found.get(1))
            .map(|title| QUOTES.replace_all(title.as_str().trim(), "").into_owned())
    } else {
        None
    };
    let title = front
        .or_else(|| {
            HEADING
                .captures(&text)
                .and_then(|found| found.get(1))
                .map(|title| title.as_str().to_string())
        })
        .or_else(|| {
            RST_TITLE
                .captures(&text)
                .and_then(|found| found.get(1))
                .map(|title| title.as_str().to_string())
        })
        .unwrap_or_else(|| stem_of(path).to_string());
    let cleaned = MARKUP.replace_all(&title, "");
    let trimmed = answer_format::whitespace::trim(&cleaned);
    answer_format::utf16::prefix(trimmed, TITLE_UNITS).to_string()
}

/// The documentation pages, shallowest first and by name within a depth.
pub fn doc_pages(files: &SurveyFiles<'_>, ignore: &HashSet<&str>) -> DocPages {
    let mut titled: Vec<DocPage> = pages_under(files, ignore)
        .into_iter()
        .map(|path| DocPage {
            title: title_of(files, &path),
            path,
        })
        .collect();
    titled.sort_by(|left, right| {
        left.path
            .split('/')
            .count()
            .cmp(&right.path.split('/').count())
            .then_with(|| answer_format::collation::compare_text(&left.path, &right.path))
    });
    let all = titled.iter().map(|page| page.path.clone()).collect();
    let omitted = titled.len().saturating_sub(DOC_PAGE_LIMIT);
    titled.truncate(DOC_PAGE_LIMIT);
    DocPages {
        rows: titled,
        omitted,
        all,
    }
}
