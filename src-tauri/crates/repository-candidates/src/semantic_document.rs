//! A document read as sections of prose: where its headings are, which sections are worth quoting,
//! and the excerpt they share. A prose line that makes a claim about the future, a denial or a
//! deprecation is split out as evidence a person must review rather than quoted as fact.

use std::collections::BTreeSet;
use std::sync::LazyLock;

use answer_format::utf16;
use answer_format::whitespace::{collapse_whitespace, trim};
use regex::Regex;
use repository_survey::js_regex;
use serde::Serialize;

use crate::authored_markdown::{authored_markdown_lines, document_lines};
use crate::candidate_text::{heading_level_for_adornment, is_heading_adornment};
use crate::scan_limits::SEMANTIC_EVIDENCE_MAX_HEADINGS;
use crate::semantic_excerpt::{
    build_excerpt_selection, heading_selection, is_decorative_line, is_excluded_section,
    section_category, section_has_named_category, section_priority, visible_prose_rows, Heading,
    ProseRow, Section,
};
use crate::semantic_risk::{has_hostile, has_policy, policy_flags, scan_evidence_risks};

const REVIEW_REQUIRED_MAX_ITEMS: usize = 4;
const REVIEW_REQUIRED_MAX_EXCERPT: usize = 400;
const REVIEW_REQUIRED_MAX_TOTAL_EXCERPT: usize = 800;
const LINE_LIMIT: usize = 2000;

/// One prose line that makes a claim to be reviewed, with the policy flags it carries.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRequiredEvidence {
    pub heading: String,
    pub start_line: usize,
    pub end_line: usize,
    pub excerpt: String,
    pub risk_flags: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ExtractedDocument {
    pub title: Option<String>,
    pub headings: Vec<String>,
    pub excerpt: String,
    pub first_omitted_line: Option<usize>,
    pub review_required_evidence: Vec<ReviewRequiredEvidence>,
}

fn path_pattern(pattern: &str) -> Regex {
    js_regex(pattern)
}

static CAPABILITIES_PATH: LazyLock<Regex> = LazyLock::new(|| {
    path_pattern(r"(?:^|/)(?:readme|features?|capabilit(?:y|ies)|feature-catalog)(?:[._/-]|$)")
});
static CONTRACT_PATH: LazyLock<Regex> = LazyLock::new(|| {
    path_pattern(r"(?:^|/)(?:product|strategy|vision|mission|direction|principles?)(?:[._/-]|$)")
});
static ARCHITECTURE_PATH: LazyLock<Regex> = LazyLock::new(|| {
    path_pattern(r"(?:^|/)(?:architecture|system-map|system_map|system|domain-map)(?:[._/-]|$)")
});
static GLOSSARY_PATH: LazyLock<Regex> =
    LazyLock::new(|| path_pattern(r"(?:^|/)glossary(?:[._/-]|$)"));
static INTRODUCTION_PATH: LazyLock<Regex> =
    LazyLock::new(|| path_pattern(r"(?:^|/)(?:introduction|overview|about)(?:[._/-]|$)"));

/// The role a document's path suggests and its path score, or `None` when the path says nothing.
pub fn classify_evidence_path(source: &str) -> Option<(&'static str, i64)> {
    let normalized = source.to_lowercase();
    if CAPABILITIES_PATH.is_match(&normalized) {
        Some(("product-capabilities", 70))
    } else if CONTRACT_PATH.is_match(&normalized) {
        Some(("product-contract", 65))
    } else if ARCHITECTURE_PATH.is_match(&normalized) {
        Some(("architecture", 60))
    } else if GLOSSARY_PATH.is_match(&normalized) {
        Some(("product-contract", 50))
    } else if INTRODUCTION_PATH.is_match(&normalized) {
        Some(("product-contract", 45))
    } else {
        None
    }
}

static SCORE_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"\bproduct goal\b",
        r"\buser need\b",
        r"\bmission\b",
        r"\bcapabilit(?:y|ies)\b",
        r"\bkey features\b",
        r"\bresponsibilit(?:y|ies)\b",
        r"\bdomain\b",
        r"한 줄 정의",
        r"제품 목표",
        r"기능 정의",
    ]
    .iter()
    .map(|pattern| js_regex(pattern))
    .collect()
});
static PLANNING_TEXT: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"\b(?:backlog|roadmap|implementation plan|research findings|competitor)\b")
});

pub fn content_score(title: &str, headings: &[String], excerpt: &str) -> i64 {
    let text = format!("{title}\n{}\n{excerpt}", headings.join("\n")).to_lowercase();
    let mut score = 0;
    for pattern in SCORE_PATTERNS.iter() {
        if pattern.is_match(&text) {
            score += 12;
        }
    }
    if PLANNING_TEXT.is_match(&text) {
        score -= 20;
    }
    score
}

static FENCE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(`{3,}|~{3,})"));
static RST_LITERAL: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)^\.\.\s+(?:code-block|sourcecode|literalinclude)::"));
static RST_DIRECTIVE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\.\.\s+\S+::"));
static MARKDOWN_HEADING: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(#{1,3})\s+(.+?)\s*$"));
static HTML_HEADING: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)<h([1-3])\b[^>]*>(.*?)</h([1-3])>"));
static TAG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"<[^>]+>"));
static LINK_TEXT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\[([^\]]*)\]\([^)]*\)"));
static HEADING_CLOSER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\s+#+\s*$"));
static LEADING_SPACE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s"));
static HTML_COMMENT_START: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^<!--"));
static BLOCK_TAG_START: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)^</?(?:p|div|img|a)\b"));
static RULE_LINE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[-*_]{3,}$"));
static QUOTE_START: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^>\s*"));
static BULLET_START: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[-*]\s+"));
static ENTITY: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)&(?:nbsp|middot|amp|lt|gt);"));

fn is_rst(source: &str) -> bool {
    source.to_lowercase().ends_with(".rst")
}

fn limited(line: &str) -> String {
    if utf16::len(line) > LINE_LIMIT {
        utf16::prefix(line, LINE_LIMIT).to_string()
    } else {
        line.to_string()
    }
}

/// Everything in `sections` (from index 0) that is under the heading at `index` of the stack.
fn build_sections(lines: &[String]) -> (Vec<Section>, Option<String>) {
    let mut title: Option<String> = None;
    let mut fence: Option<char> = None;
    let mut rst_literal_block = false;
    let mut frontmatter = lines.first().is_some_and(|line| trim(line) == "---");
    let mut sections = vec![Section {
        heading: None,
        line_index: -1,
        prose: Vec::new(),
        excluded: false,
        is_document_title: false,
    }];
    let mut stack: Vec<usize> = vec![0];
    let mut current = 0;
    let mut line_index = 0;
    while line_index < lines.len() {
        let raw_line = lines.get(line_index).map_or("", String::as_str);
        let line = trim(raw_line);
        line_index += 1;
        let position = line_index - 1;
        if rst_literal_block {
            if line.is_empty() || LEADING_SPACE.is_match(raw_line) {
                continue;
            }
            rst_literal_block = false;
        }
        if frontmatter {
            if position > 0 && line == "---" {
                frontmatter = false;
            }
            continue;
        }
        if let Some(found) = FENCE.captures(line) {
            let marker = found
                .get(1)
                .and_then(|text| text.as_str().chars().next())
                .unwrap_or('`');
            fence = if fence == Some(marker) {
                None
            } else {
                fence.or(Some(marker))
            };
            continue;
        }
        if fence.is_some() {
            continue;
        }
        if RST_LITERAL.is_match(line) {
            rst_literal_block = true;
            continue;
        }
        let next_line = lines
            .get(position + 1)
            .map_or("", |next| trim(next));
        let underlined = (!line.is_empty() && is_heading_adornment(next_line))
            .then(|| (heading_level_for_adornment(next_line, title.is_some()), line));
        let markdown = MARKDOWN_HEADING.captures(line);
        let html = HTML_HEADING
            .captures(line)
            .filter(|found| found.get(1).map(|m| m.as_str()) == found.get(3).map(|m| m.as_str()));
        if underlined.is_some() || markdown.is_some() || html.is_some() {
            let (level, raw_value): (usize, &str) = if let Some((level, value)) = underlined {
                (level, value)
            } else if let Some(found) = &markdown {
                (
                    found.get(1).map_or(1, |hashes| hashes.as_str().len()),
                    found.get(2).map_or("", |text| text.as_str()),
                )
            } else if let Some(found) = &html {
                (
                    found
                        .get(1)
                        .and_then(|digit| digit.as_str().parse().ok())
                        .unwrap_or(1),
                    found.get(2).map_or("", |text| text.as_str()),
                )
            } else {
                (1, "")
            };
            let untagged = TAG.replace_all(raw_value, "");
            let unlinked = LINK_TEXT.replace_all(&untagged, "$1").into_owned();
            let closed = if underlined.is_none() && markdown.is_some() {
                HEADING_CLOSER.replace(&unlinked, "").into_owned()
            } else {
                unlinked
            };
            let value = trim(&closed).to_string();
            if value.is_empty() {
                continue;
            }
            let is_document_title = level == 1 && title.is_none();
            if is_document_title {
                title = Some(value.clone());
            }
            while stack.len() > 1 {
                let top_level = stack
                    .last()
                    .and_then(|index| sections.get(*index))
                    .and_then(|section| section.heading.as_ref())
                    .map_or(0, |heading| heading.level);
                if top_level >= level {
                    stack.pop();
                } else {
                    break;
                }
            }
            let parent_excluded = stack
                .last()
                .and_then(|index| sections.get(*index))
                .is_some_and(|parent| parent.excluded);
            sections.push(Section {
                excluded: parent_excluded || is_excluded_section(&value),
                heading: Some(Heading { level, value }),
                line_index: position as i64,
                prose: Vec::new(),
                is_document_title,
            });
            current = sections.len() - 1;
            stack.push(current);
            if underlined.is_some() {
                line_index += 1;
            }
            continue;
        }
        if line.is_empty()
            || RST_DIRECTIVE.is_match(line)
            || HTML_COMMENT_START.is_match(line)
            || BLOCK_TAG_START.is_match(line)
            || line.starts_with("![")
            || RULE_LINE.is_match(line)
            || line.contains("shields.io")
        {
            continue;
        }
        if is_decorative_line(line) {
            continue;
        }
        let unquoted = QUOTE_START.replace(line, "");
        let unbulleted = BULLET_START.replace(&unquoted, "");
        let unlinked = LINK_TEXT.replace_all(&unbulleted, "$1");
        let untagged = TAG.replace_all(&unlinked, " ");
        let unentitied = ENTITY.replace_all(&untagged, " ");
        let cleaned = collapse_whitespace(&unentitied);
        if !cleaned.is_empty() {
            if let Some(section) = sections.get_mut(current) {
                section.prose.push(ProseRow {
                    line_index: position,
                    text: cleaned,
                });
            }
        }
    }
    (sections, title)
}

fn heading_values(section: Option<&Section>) -> Vec<String> {
    section
        .and_then(|section| section.heading.as_ref())
        .map(|heading| vec![heading.value.clone()])
        .unwrap_or_default()
}

/// Reads a Markdown or reStructuredText document into the excerpt a row of evidence quotes.
pub fn extract_document(text: &str, source: &str) -> ExtractedDocument {
    let lines: Vec<String> = if is_rst(source) {
        let mut rows = Vec::new();
        for line in document_lines(text) {
            rows.push(limited(line));
        }
        rows
    } else {
        authored_markdown_lines(text)
            .iter()
            .map(|line| limited(line))
            .collect()
    };
    let (sections, title) = build_sections(&lines);
    let eligible: Vec<&Section> = sections
        .iter()
        .filter(|section| !section.excluded && !section.prose.is_empty())
        .collect();
    let named: Vec<&Section> = eligible
        .iter()
        .copied()
        .filter(|section| section_has_named_category(section))
        .collect();
    let candidates: Vec<&Section> = if named.is_empty() {
        eligible.clone()
    } else {
        eligible
            .iter()
            .copied()
            .filter(|section| {
                section_category(section) == Some("purpose")
                    && !section_has_named_category(section)
            })
            .chain(named.iter().copied())
            .collect()
    };
    let mut selected: Vec<&Section> = Vec::new();
    let mut taken: BTreeSet<i64> = BTreeSet::new();
    for category in ["purpose", "architecture", "ability"] {
        if let Some(section) = candidates
            .iter()
            .copied()
            .find(|candidate| section_category(candidate) == Some(category))
        {
            selected.push(section);
            taken.insert(section.line_index);
        }
    }
    let mut by_priority = candidates.clone();
    by_priority.sort_by(|left, right| {
        section_priority(right)
            .cmp(&section_priority(left))
            .then(left.line_index.cmp(&right.line_index))
    });
    for section in by_priority {
        if selected.len() > SEMANTIC_EVIDENCE_MAX_HEADINGS {
            break;
        }
        if taken.contains(&section.line_index) {
            continue;
        }
        selected.push(section);
        taken.insert(section.line_index);
    }
    let mut ordered = selected;
    ordered.sort_by_key(|section| section.line_index);
    let complete_headings = heading_selection(&sections, &ordered, false);
    let complete = build_excerpt_selection(&ordered);
    let complete_flags = scan_evidence_risks(&complete_headings, &complete.excerpt, "");
    let whole = |reviews: Vec<ReviewRequiredEvidence>| ExtractedDocument {
        title: title.clone(),
        headings: complete_headings.clone(),
        excerpt: complete.excerpt.clone(),
        first_omitted_line: complete.first_omitted_line,
        review_required_evidence: reviews,
    };
    if has_hostile(&complete_flags) || !has_policy(&complete_flags) {
        return whole(Vec::new());
    }

    let mut reviews: Vec<ReviewRequiredEvidence> = Vec::new();
    let mut reviewed: BTreeSet<usize> = BTreeSet::new();
    let mut safe: Vec<Section> = ordered.iter().map(|section| (*section).clone()).collect();
    let mut review_length = 0;
    loop {
        let non_empty: Vec<&Section> = safe.iter().filter(|section| !section.prose.is_empty()).collect();
        if non_empty.is_empty() {
            break;
        }
        let selection = build_excerpt_selection(&non_empty);
        let headings = heading_selection(&sections, &non_empty, true);
        let visible_flags = scan_evidence_risks(&headings, &selection.excerpt, "");
        if has_hostile(&visible_flags) {
            break;
        }
        if !has_policy(&visible_flags) {
            if reviews.is_empty() || selection.excerpt.is_empty() {
                break;
            }
            reviews.sort_by_key(|review| review.start_line);
            return ExtractedDocument {
                title,
                headings,
                excerpt: selection.excerpt,
                first_omitted_line: selection.first_omitted_line,
                review_required_evidence: reviews,
            };
        }
        let mut newly_risky: BTreeSet<usize> = BTreeSet::new();
        let mut fits = true;
        for chosen in &selection.sections {
            let Some(section) = non_empty.get(chosen.row) else {
                continue;
            };
            for (row, visible_text) in visible_prose_rows(section, &chosen.text) {
                let headings = heading_values(Some(section));
                let visible_policy =
                    policy_flags(scan_evidence_risks(&headings, &visible_text, ""));
                if visible_policy.is_empty() || reviewed.contains(&row.line_index) {
                    continue;
                }
                let exact = policy_flags(scan_evidence_risks(&headings, &row.text, ""));
                let row_length = utf16::len(&row.text);
                review_length += row_length;
                if reviews.len() >= REVIEW_REQUIRED_MAX_ITEMS
                    || row_length > REVIEW_REQUIRED_MAX_EXCERPT
                    || review_length > REVIEW_REQUIRED_MAX_TOTAL_EXCERPT
                {
                    fits = false;
                    break;
                }
                reviewed.insert(row.line_index);
                newly_risky.insert(row.line_index);
                reviews.push(ReviewRequiredEvidence {
                    heading: section
                        .heading
                        .as_ref()
                        .map(|heading| heading.value.clone())
                        .or_else(|| title.clone())
                        .unwrap_or_else(|| "Document prelude".to_string()),
                    start_line: row.line_index + 1,
                    end_line: row.line_index + 1,
                    excerpt: row.text.clone(),
                    risk_flags: exact,
                });
            }
            if !fits {
                break;
            }
        }
        if !fits || newly_risky.is_empty() {
            break;
        }
        for section in &mut safe {
            section
                .prose
                .retain(|row| !newly_risky.contains(&row.line_index));
        }
    }
    whole(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_readme_gives_its_title_headings_and_prose() {
        let found = extract_document(
            "# Orders\n\nPlaces and tracks customer orders.\n\n## Features\n\nRefund an order.\n",
            "README.md",
        );
        assert_eq!(found.title.as_deref(), Some("Orders"));
        assert_eq!(found.headings, ["Orders", "Features"]);
        assert_eq!(found.excerpt, "Places and tracks customer orders. Refund an order.");
    }

    #[test]
    fn a_future_claim_is_split_out_for_review() {
        let found = extract_document(
            "# Orders\n\nPlaces orders.\n\nRoadmap: coming soon refunds.\n",
            "docs/product.md",
        );
        assert_eq!(found.excerpt, "Places orders.");
        assert_eq!(found.review_required_evidence.len(), 1);
        assert_eq!(found.review_required_evidence[0].start_line, 5);
    }

    #[test]
    fn a_path_names_the_role_a_document_plays() {
        assert_eq!(classify_evidence_path("docs/Architecture.md"), Some(("architecture", 60)));
        assert_eq!(classify_evidence_path("docs/notes.md"), None);
    }
}
