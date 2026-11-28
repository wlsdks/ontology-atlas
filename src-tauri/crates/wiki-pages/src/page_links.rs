//! The page links of a body: `[[target]]`, `[[target|text]]`, `[[target#anchor]]`. A citation
//! (`src:`) is not a link, and fenced code holds none.

use std::sync::LazyLock;

use answer_format::whitespace::trim;
use regex::Regex;

use crate::wiki_template::WIKI_DIR;

#[allow(clippy::expect_used, reason = "constant pattern, built by every test run")]
static LINK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\]\[|#]+)(?:#[^\]\[|]*)?(?:\|[^\]\[]*)?\]\]").expect("link pattern")
});

/// A link target as the folder names a page: `wiki/<slug>` without `.md`. A bare name folds into
/// `wiki/`; a target that already holds a `/` addresses the vault root and is left alone.
fn page_slug(target: &str) -> Option<String> {
    let trimmed = trim(target);
    let slug = trimmed.strip_suffix(".md").unwrap_or(trimmed);
    if slug.is_empty() || slug.starts_with("src:") {
        return None;
    }
    Some(if slug.contains('/') {
        slug.to_string()
    } else {
        format!("{WIKI_DIR}/{slug}")
    })
}

fn opens_fence(line: &str) -> bool {
    let rest = line.trim_start_matches(answer_format::whitespace::is_whitespace);
    rest.starts_with("```") || rest.starts_with("~~~")
}

/// Each target with the file line of its first appearance, in order. `first_line` is the file
/// line of the body's first line.
pub fn page_links(body: &str, line_offset: usize) -> Vec<(String, usize)> {
    let mut found: Vec<(String, usize)> = Vec::new();
    let mut in_fence = false;
    for (index, line) in body.split('\n').enumerate() {
        if opens_fence(line) {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || !line.contains("[[") {
            continue;
        }
        for link in LINK.captures_iter(line) {
            let Some(target) = link.get(1).and_then(|target| page_slug(target.as_str())) else {
                continue;
            };
            if found.iter().all(|(held, _)| *held != target) {
                found.push((target, line_offset + index + 1));
            }
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_link_names_its_page_once_by_its_first_line_and_a_citation_or_fenced_link_is_none() {
        let body = "see [[plan]] and [[wiki/other#top]]\n```\n[[hidden]]\n```\n[[plan|again]] [[src:sources/a.md#p1]] [[capabilities/x.md]]";
        assert_eq!(
            page_links(body, 10),
            [
                ("wiki/plan".to_string(), 11),
                ("wiki/other".to_string(), 11),
                ("capabilities/x".to_string(), 15),
            ]
        );
    }
}
