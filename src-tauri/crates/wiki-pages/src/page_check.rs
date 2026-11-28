//! One wiki page against its contract: no `kind:`, the required fields, a list for `describes:`,
//! the five sections in order, a citation on every fact, and every citation well formed, declared
//! and (when the folder's sources are known) present. Pure and linear: one parse, one pass per
//! section, one lookup per citation.

use std::collections::HashSet;

use answer_format::whitespace::trim;
use icu_normalizer::ComposingNormalizerBorrowed;
use vault_document::frontmatter::{Frontmatter, Value};
use vault_document::Document;

use crate::concept_index::{ConceptIndex, Named};
use crate::page_links::page_links;
use crate::problem::Problem;
use crate::wiki_template::{
    citation_shaped, cited_sources, has_citation, is_whole_citation, REQUIRED_FIELDS,
    SECTION_ORDER, WIKI_SOURCES_DIR,
};

/// What judging one page found, and the facts the folder is judged from.
pub struct PageCheck {
    pub problems: Vec<Problem>,
    /// The distinct declared sources, the first being the primary.
    pub sources: Vec<String>,
    /// Each distinct link target with the file line it first appears on.
    pub links: Vec<(String, usize)>,
}

fn is_fence(line: &str) -> bool {
    let rest = line.trim_start_matches(answer_format::whitespace::is_whitespace);
    rest.starts_with("```") || rest.starts_with("~~~")
}

/// Sources a page names, trimmed: a list, or one non-blank text.
fn declared_sources(frontmatter: &Frontmatter) -> Vec<String> {
    match frontmatter.get("sources") {
        Some(Value::List(items)) => items.iter().map(|item| trim(item).to_string()).collect(),
        Some(Value::Text(text)) if !trim(text).is_empty() => vec![trim(text).to_string()],
        _ => Vec::new(),
    }
}

fn distinct(items: &[String]) -> Vec<String> {
    let mut kept: Vec<String> = Vec::new();
    for item in items {
        if !kept.contains(item) {
            kept.push(item.clone());
        }
    }
    kept
}

struct Section {
    title: String,
    /// The file line of the heading.
    line: usize,
}

/// Level-2 headings in order. The line that opens a fence is skipped; the one that closes it is
/// read as an ordinary line.
fn read_sections(lines: &[&str], offset: usize) -> Vec<Section> {
    let mut found = Vec::new();
    let mut in_fence = false;
    for (index, line) in lines.iter().enumerate() {
        if is_fence(line) {
            in_fence = !in_fence;
        }
        if in_fence {
            continue;
        }
        let Some(rest) = line.strip_prefix("##") else {
            continue;
        };
        let spaced = rest.trim_start_matches(answer_format::whitespace::is_whitespace);
        if spaced.len() == rest.len() || trim(spaced).is_empty() {
            continue;
        }
        found.push(Section {
            title: trim(spaced).to_string(),
            line: offset + index + 1,
        });
    }
    found
}

struct Bullet {
    text: String,
    line: usize,
}

/// The bullets under `title`; a wrapped bullet continues on indented lines and the citation sits
/// on the last of them, so the whole item is judged.
fn section_bullets(lines: &[&str], offset: usize, sections: &[Section], title: &str) -> Vec<Bullet> {
    let Some(at) = sections.iter().position(|section| section.title == title) else {
        return Vec::new();
    };
    let start = sections.get(at).map_or(0, |section| section.line - offset);
    let end = sections
        .get(at + 1)
        .map_or(usize::MAX, |next| next.line - offset - 1);
    let mut bullets: Vec<Bullet> = Vec::new();
    let mut in_fence = false;
    let mut index = start;
    while index < lines.len() && index <= end {
        let line = lines.get(index).copied().unwrap_or_default();
        index += 1;
        if is_fence(line) {
            in_fence = !in_fence;
        }
        if in_fence {
            continue;
        }
        let indented = line
            .chars()
            .next()
            .is_some_and(answer_format::whitespace::is_whitespace);
        let unindented = line.trim_start_matches(answer_format::whitespace::is_whitespace);
        let is_bullet = unindented
            .strip_prefix(['-', '*'])
            .is_some_and(|rest| {
                let spaced = rest.trim_start_matches(answer_format::whitespace::is_whitespace);
                spaced.len() < rest.len() && !spaced.is_empty()
            });
        if is_bullet {
            bullets.push(Bullet {
                text: line.to_string(),
                line: offset + index,
            });
        } else if indented && !unindented.is_empty() {
            if let Some(last) = bullets.last_mut() {
                last.text.push('\n');
                last.text.push_str(line);
            }
        }
    }
    bullets
}

fn nfc(text: &str) -> String {
    ComposingNormalizerBorrowed::new_nfc().normalize(trim(text)).into_owned()
}

fn describes_problems(frontmatter: &Frontmatter, concepts: &ConceptIndex) -> Vec<Problem> {
    let Some(Value::List(entries)) = frontmatter.get("describes") else {
        return Vec::new();
    };
    let mut seen: HashSet<String> = HashSet::new();
    let mut problems = Vec::new();
    for entry in entries {
        let named = concepts.resolve(entry);
        if named == Named::Concept {
            continue;
        }
        let target = nfc(entry);
        if !seen.insert(target.clone()) {
            continue;
        }
        let message = match named {
            Named::Ambiguous => format!("`{target}` under `describes:` matches more than one document by its last part, so it names no one concept. Write the concept's full slug."),
            Named::Missing => format!("`{target}` under `describes:` names no concept in this folder. Remove it, or name a concept that exists by its slug."),
            _ => format!("`{target}` under `describes:` is a wiki page or the vault README, not a concept. `describes:` names `kind:` nodes only."),
        };
        problems.push(Problem::new(
            "describes-target-missing",
            message,
            None,
            "describes-target-missing",
            vec![("target", target)],
        ));
    }
    problems
}

fn truncation_problems(frontmatter: &Frontmatter, declared: &HashSet<&str>) -> Vec<Problem> {
    if !frontmatter.contains_key("sources_truncated") {
        return Vec::new();
    }
    let listed: Option<Vec<String>> = match frontmatter.get("sources_truncated") {
        Some(Value::List(items)) => Some(items.iter().map(|item| trim(item).to_string()).collect()),
        Some(Value::Text(text)) if !trim(text).is_empty() => Some(vec![trim(text).to_string()]),
        _ => None,
    };
    let Some(listed) = listed else {
        return vec![Problem::new(
            "bad-truncation-record",
            "`sources_truncated:` is a list of the paths in `sources:` that were read only in part. This value is not a list of paths, so it records no boundary at all.",
            None,
            "bad-truncation-record-shape",
            Vec::new(),
        )];
    };
    listed
        .into_iter()
        .filter(|path| !declared.contains(path.as_str()))
        .map(|path| {
            Problem::new(
                "bad-truncation-record",
                format!("`{path}` is under `sources_truncated:` but not under `sources:`. The key says which of this page's own sources stop short, so a path the page does not cite names a boundary no reader can place."),
                None,
                "bad-truncation-record-path",
                vec![("path", path)],
            )
        })
        .collect()
}

fn section_order_problem(sections: &[Section]) -> Option<Problem> {
    let found: Vec<&str> = sections.iter().map(|section| section.title.as_str()).collect();
    let in_expected: Vec<&str> = found
        .iter()
        .copied()
        .filter(|title| SECTION_ORDER.contains(title))
        .collect();
    if in_expected == SECTION_ORDER {
        return None;
    }
    let missing: Vec<&str> = SECTION_ORDER
        .iter()
        .copied()
        .filter(|title| !found.contains(title))
        .collect();
    if missing.is_empty() {
        let expected = SECTION_ORDER.join(" \u{2192} ");
        let seen = in_expected.join(" \u{2192} ");
        return Some(Problem::new(
            "section-order",
            format!("The five sections must appear in this order: {expected}. Found: {seen}."),
            None,
            "section-order-sequence",
            vec![("expected", expected), ("found", seen)],
        ));
    }
    let headings: Vec<String> = SECTION_ORDER.iter().map(|title| format!("## {title}")).collect();
    let missing = missing.join(", ");
    Some(Problem::new(
        "section-order",
        format!(
            "The page needs all five sections in order ({}). Missing: {missing}. An empty section is kept, not dropped \u{2014} it says \"nothing here\", which a missing one does not.",
            headings.join(", ")
        ),
        None,
        "section-order-missing",
        vec![("missing", missing)],
    ))
}

/// Judges one page. `known_sources`, given, makes a citation of a path nobody has a problem;
/// omitted, citations are checked against the page's own `sources:` only. `concepts`, given, makes
/// each `describes:` entry name a `kind:` node; omitted, `describes:` is not checked.
pub fn check_page(
    raw: &str,
    known_sources: Option<&HashSet<String>>,
    concepts: Option<&ConceptIndex>,
) -> PageCheck {
    let document = Document::from_text(raw);
    let frontmatter = document.frontmatter();
    let body_range = document.body_range();
    let body = raw.get(body_range.clone()).unwrap_or_default();
    let frontmatter_lines = if raw.starts_with("---") {
        raw.get(..body_range.start)
            .map_or(0, |head| head.matches('\n').count())
    } else {
        0
    };
    let body_lines: Vec<&str> = body.split('\n').collect();
    let mut problems: Vec<Problem> = Vec::new();

    if frontmatter.contains_key("kind") {
        problems.push(Problem::new(
            "kind-present",
            "A wiki page must not carry `kind:`. That key is what puts a document in the graph, and a wiki page is a write-up about sources, not a reviewed concept. Remove it, or move the file out of `wiki/` if it really is a node.",
            None,
            "kind-present",
            Vec::new(),
        ));
    }
    for field in &REQUIRED_FIELDS {
        if !frontmatter.contains_key(field.key) {
            problems.push(Problem::new(
                format!("missing-field:{}", field.key),
                format!("`{}:` is missing. {}", field.key, field.description),
                None,
                "missing-field",
                vec![("field", field.key.to_string())],
            ));
        }
    }
    if frontmatter.contains_key("describes") && frontmatter.list("describes").is_none() {
        problems.push(Problem::new(
            "bad-describes",
            "`describes:` is not a list. Write each concept's slug as a list item (`describes:` then `  - capabilities/<name>`), or `describes: []` when no concept fits. A single value is not read as a link, and a rename cannot rewrite it.",
            None,
            "bad-describes",
            Vec::new(),
        ));
    }
    if let Some(concepts) = concepts {
        problems.extend(describes_problems(frontmatter, concepts));
    }

    let sections = read_sections(&body_lines, frontmatter_lines);
    problems.extend(section_order_problem(&sections));

    let declared_list = declared_sources(frontmatter);
    let declared: HashSet<&str> = declared_list.iter().map(String::as_str).collect();
    problems.extend(truncation_problems(frontmatter, &declared));

    for bullet in section_bullets(&body_lines, frontmatter_lines, &sections, "Facts") {
        if !has_citation(&bullet.text) {
            problems.push(Problem::new(
                "uncited-fact",
                "Every bullet under `## Facts` ends in at least one citation (`[[src:sources/<file>#p12]]`). A claim a reader cannot check against one place in one document belongs under `## Not in sources`.",
                Some(bullet.line),
                "uncited-fact",
                Vec::new(),
            ));
        }
    }

    // A malformed citation is reported, or `[[src:plan.pdf]]` reads as prose and an ungrounded claim
    // passes the fact check. Fenced text is quoted: a page may show a wrong citation to explain it.
    let mut in_fence = false;
    for (index, line) in body_lines.iter().enumerate() {
        if is_fence(line) {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || !line.contains("[[src:") {
            continue;
        }
        for whole in citation_shaped(line) {
            if is_whole_citation(&whole) {
                continue;
            }
            problems.push(Problem::new(
                "bad-citation",
                format!("`{whole}` is not a citation this format can resolve. The shape is `[[src:{WIKI_SOURCES_DIR}/<path>#<anchor>]]`, where the anchor is p<n>, s<n>, s<n>r<n>, r<n>, l<n>, or h:<heading-slug>."),
                Some(frontmatter_lines + index + 1),
                "bad-citation",
                vec![("text", whole)],
            ));
        }
    }

    let mut seen_missing: HashSet<String> = HashSet::new();
    for path in cited_sources(body) {
        if seen_missing.contains(&path) {
            continue;
        }
        let undeclared = !declared.contains(path.as_str());
        let absent = known_sources.is_some_and(|known| !known.contains(&path));
        if !undeclared && !absent {
            continue;
        }
        seen_missing.insert(path.clone());
        let (message, key) = if absent {
            (
                format!("`{path}` is cited but is not in this folder. A citation a reader cannot open is not a citation."),
                "citation-target-missing-folder",
            )
        } else {
            (
                format!("`{path}` is cited but is not listed in this page's `sources:`. Add it there with its sha256, or fix the citation."),
                "citation-target-missing-sources",
            )
        };
        problems.push(Problem::new(
            "citation-target-missing",
            message,
            None,
            key,
            vec![("path", path)],
        ));
    }

    PageCheck {
        problems,
        sources: distinct(&declared_list),
        links: page_links(body, frontmatter_lines),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIT: &str = "---\ntitle: Plan\ncreated_by: human\ncompiled_at: 2026-01-01T00:00:00Z\nsources:\n  - sources/notes.md\nsource_hash:\n  sources/notes.md: abc\nstatus: draft\nsummary: A plan.\n---\n\n## Summary\n\nx\n\n## Facts\n\n- A claim. [[src:sources/notes.md#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n";

    fn codes(raw: &str) -> Vec<String> {
        check_page(raw, None, None)
            .problems
            .into_iter()
            .map(|problem| problem.code)
            .collect()
    }

    #[test]
    fn a_page_that_follows_the_template_has_no_problem() {
        assert_eq!(codes(FIT), Vec::<String>::new());
    }

    #[test]
    fn an_uncited_fact_a_bad_citation_and_a_kind_are_each_named_with_their_line() {
        let broken = FIT
            .replace("title: Plan\n", "title: Plan\nkind: element\n")
            .replace("- A claim. [[src:sources/notes.md#p1]]", "- A claim.\n- Another. [[src:plan.pdf]]");
        let check = check_page(&broken, None, None);
        let found: Vec<(&str, Option<usize>)> = check
            .problems
            .iter()
            .map(|problem| (problem.code.as_str(), problem.line))
            .collect();
        assert_eq!(
            found,
            [
                ("kind-present", None),
                ("uncited-fact", Some(20)),
                ("uncited-fact", Some(21)),
                ("bad-citation", Some(21)),
            ]
        );
    }

    #[test]
    fn a_cited_source_the_folder_lacks_is_named_once_however_often_it_is_cited() {
        let twice = FIT.replace("## Decisions\n", "## Decisions\n\n- Again. [[src:sources/notes.md#p2]]\n");
        let known: HashSet<String> = HashSet::new();
        let check = check_page(&twice, Some(&known), None);
        let missing: Vec<&str> = check.problems.iter().map(|p| p.code.as_str()).collect();
        assert_eq!(missing, ["citation-target-missing"]);
    }

    #[test]
    fn sections_out_of_order_or_missing_are_two_different_sentences() {
        let swapped = FIT.replace("## Facts", "## Tmp").replace("## Decisions", "## Facts").replace("## Tmp", "## Decisions");
        assert_eq!(check_page(&swapped, None, None).problems[0].detail.as_ref().map(|d| d.key), Some("section-order-sequence"));
        let dropped = FIT.replace("## Not in sources\n", "");
        assert_eq!(check_page(&dropped, None, None).problems[0].detail.as_ref().map(|d| d.key), Some("section-order-missing"));
    }
}
