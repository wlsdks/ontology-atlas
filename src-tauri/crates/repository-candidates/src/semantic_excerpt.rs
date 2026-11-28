//! Choosing which sections of a document an excerpt quotes, and how much of each, inside the one
//! character budget a row of evidence has.

use std::sync::LazyLock;

use answer_format::utf16;
use answer_format::whitespace::{collapse_whitespace, is_whitespace, trim};
use regex::Regex;
use repository_survey::js_regex;

use crate::candidate_text::clean_heading_label;
use crate::scan_limits::{SEMANTIC_EVIDENCE_MAX_EXCERPT, SEMANTIC_EVIDENCE_MAX_HEADINGS};

#[derive(Debug, Clone)]
pub struct Heading {
    pub level: usize,
    pub value: String,
}

/// One line of prose and where it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProseRow {
    pub line_index: usize,
    pub text: String,
}

/// A part of a document under one heading (or before the first).
#[derive(Debug, Clone)]
pub struct Section {
    pub heading: Option<Heading>,
    /// The line of the heading; the part before the first heading is at -1.
    pub line_index: i64,
    pub prose: Vec<ProseRow>,
    pub excluded: bool,
    pub is_document_title: bool,
}

impl Section {
    pub fn text(&self) -> String {
        self.prose
            .iter()
            .map(|row| row.text.as_str())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// A section chosen for the excerpt: which row of the input it was, and the text it contributes.
pub struct SectionSelection {
    pub row: usize,
    pub text: String,
}

pub struct ExcerptSelection {
    pub excerpt: String,
    pub sections: Vec<SectionSelection>,
    pub first_omitted_line: Option<usize>,
}

static NOT_LETTER_NUMBER_SPACE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"[^\p{L}\p{N}\s]+"));
static HEADING_SEPARATORS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[_-]+"));
static EXCLUDED_HEADING: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?i)\b(?:sponsors?|sponsorship|backers?|funding|fundraisers?|donations?|donate)\b")
});
static CONTENTS_HEADING: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)^(?:table of contents|contents?|toc)$"));
static PURPOSE_HEADING: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)\b(?:purpose|mission|vision|introduction|overview|about|user need|product goal|problem statement)\b",
    )
});
static ARCHITECTURE_HEADING: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)\b(?:architecture|responsibilit(?:y|ies)|design|structure|how it works|system map|workflow|boundar(?:y|ies))\b",
    )
});
static ABILITY_HEADING: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?i)\b(?:features?|capabilit(?:y|ies)|functionality|use cases?|what it does|supported)\b")
});
static QUOTE_PREFIX: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^>\s*"));
static LIST_PREFIX: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[-*+]\s+"));
static SPONSOR_LINE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?i)^(?:featured\s+)?(?:sponsors?|backers?|funding|donations?|donate)\b")
});
static BARE_URL: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)^(?:https?://|www\.)\S+$"));
static LINKED_BADGE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)"));
static INLINE_LINK_OR_IMAGE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"!?\[[^\]]*\]\([^)]*\)"));
static REFERENCE_LINK_OR_IMAGE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"!?\[[^\]]*\]\[[^\]]*\]"));
static ANCHOR_ELEMENT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)<a\b[^>]*>.*?</a>"));
static IMAGE_ELEMENT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)<img\b[^>]*>"));
static ANY_TAG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"<[^>]+>"));

fn normalize_heading(value: &str) -> String {
    let lowered = clean_heading_label(value).to_lowercase();
    let spaced = HEADING_SEPARATORS.replace_all(&lowered, " ");
    let letters = NOT_LETTER_NUMBER_SPACE.replace_all(&spaced, " ");
    collapse_whitespace(&letters)
}

pub fn is_excluded_section(value: &str) -> bool {
    let heading = normalize_heading(value);
    EXCLUDED_HEADING.is_match(&heading) || CONTENTS_HEADING.is_match(&heading)
}

pub fn is_decorative_line(value: &str) -> bool {
    let unquoted = QUOTE_PREFIX.replace(value, "");
    let unlisted = LIST_PREFIX.replace(&unquoted, "");
    let line = trim(&unlisted);
    if line.is_empty() {
        return true;
    }
    if SPONSOR_LINE.is_match(line) || BARE_URL.is_match(line) {
        return true;
    }
    let mut remaining = LINKED_BADGE.replace_all(line, "").into_owned();
    remaining = INLINE_LINK_OR_IMAGE.replace_all(&remaining, "").into_owned();
    remaining = REFERENCE_LINK_OR_IMAGE
        .replace_all(&remaining, "")
        .into_owned();
    remaining = ANCHOR_ELEMENT.replace_all(&remaining, "").into_owned();
    remaining = IMAGE_ELEMENT.replace_all(&remaining, "").into_owned();
    remaining = ANY_TAG.replace_all(&remaining, "").into_owned();
    let stripped: String = remaining
        .chars()
        .filter(|character| !matches!(character, '|' | '`' | '*' | '_' | '~'))
        .collect();
    trim(&stripped).is_empty()
}

fn heading_category(value: &str) -> Option<&'static str> {
    let heading = normalize_heading(value);
    if PURPOSE_HEADING.is_match(&heading) {
        Some("purpose")
    } else if ARCHITECTURE_HEADING.is_match(&heading) {
        Some("architecture")
    } else if ABILITY_HEADING.is_match(&heading) {
        Some("ability")
    } else {
        None
    }
}

pub fn section_has_named_category(section: &Section) -> bool {
    section
        .heading
        .as_ref()
        .is_some_and(|heading| heading_category(&heading.value).is_some())
}

pub fn section_category(section: &Section) -> Option<&'static str> {
    let value = section
        .heading
        .as_ref()
        .map_or("", |heading| heading.value.as_str());
    if let Some(named) = heading_category(value) {
        return Some(named);
    }
    if normalize_heading(value).is_empty() || section.is_document_title {
        return Some("purpose");
    }
    None
}

pub fn section_priority(section: &Section) -> u8 {
    match section_category(section) {
        Some("purpose") => 3,
        Some("architecture") => 2,
        Some("ability") => 1,
        _ => 0,
    }
}

/// `text` cut to at most `max_length` units at the last whole sentence, else the last word.
fn truncate_at_boundary(text: &str, max_length: usize) -> String {
    if utf16::len(text) <= max_length {
        return text.to_string();
    }
    if max_length == 0 {
        return String::new();
    }
    let bytes = text.as_bytes();
    let mut sentence_end: Option<usize> = None;
    let mut units_before = 0;
    let mut cursor = 0;
    while let Some(offset) = text
        .get(cursor..)
        .and_then(|rest| rest.find(['.', '!', '?']))
    {
        let start = cursor + offset;
        let mut end = start;
        while matches!(bytes.get(end), Some(b'.' | b'!' | b'?')) {
            end += 1;
        }
        units_before += utf16::len(text.get(cursor..start).unwrap_or_default());
        let run_units = end - start;
        let followed = text
            .get(end..)
            .and_then(|rest| rest.chars().next())
            .is_none_or(is_whitespace);
        if followed && units_before + run_units <= max_length {
            sentence_end = Some(end);
        }
        units_before += run_units;
        cursor = end;
    }
    if let Some(end) = sentence_end {
        return text
            .get(..end)
            .unwrap_or_default()
            .trim_end_matches(is_whitespace)
            .to_string();
    }
    let bounded = utf16::prefix(text, max_length);
    let last_space = bounded.rfind(' ');
    let cut = match last_space {
        Some(index) if index > 0 => bounded.get(..index).unwrap_or(bounded),
        _ => bounded,
    };
    cut.trim_end_matches(is_whitespace).to_string()
}

/// The excerpt the given sections share: each gets an equal part of the budget, the sections that
/// matter most take what the short ones leave, and each is cut at a sentence or a word.
pub fn build_excerpt_selection(sections: &[&Section]) -> ExcerptSelection {
    let texts: Vec<String> = sections.iter().map(|section| section.text()).collect();
    let count = sections.len();
    let prose_budget = SEMANTIC_EVIDENCE_MAX_EXCERPT.saturating_sub(count.saturating_sub(1));
    let base_length = prose_budget.checked_div(count).unwrap_or(0);
    let mut selected: Vec<usize> = texts
        .iter()
        .map(|text| base_length.min(utf16::len(text)))
        .collect();
    let mut remaining = prose_budget as i64 - selected.iter().sum::<usize>() as i64;
    let mut order: Vec<usize> = (0..count).collect();
    order.sort_by(|left, right| {
        let (left_section, right_section) = (sections.get(*left), sections.get(*right));
        match (left_section, right_section) {
            (Some(l), Some(r)) => section_priority(r)
                .cmp(&section_priority(l))
                .then(l.line_index.cmp(&r.line_index)),
            _ => std::cmp::Ordering::Equal,
        }
    });
    for index in order {
        if remaining <= 0 {
            break;
        }
        let text_length = texts.get(index).map_or(0, |text| utf16::len(text));
        if let Some(chosen) = selected.get_mut(index) {
            let extra = text_length.saturating_sub(*chosen).min(remaining as usize);
            *chosen += extra;
            remaining -= extra as i64;
        }
    }
    let mut chosen_sections = Vec::new();
    for (index, text) in texts.iter().enumerate() {
        let cut = truncate_at_boundary(text, selected.get(index).copied().unwrap_or(0));
        if !cut.is_empty() {
            chosen_sections.push(SectionSelection {
                row: index,
                text: cut,
            });
        }
    }
    let joined = chosen_sections
        .iter()
        .map(|selection| selection.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let excerpt = trim(utf16::prefix(&joined, SEMANTIC_EVIDENCE_MAX_EXCERPT)).to_string();
    let mut first_omitted_line: Option<usize> = None;
    for (index, section) in sections.iter().enumerate() {
        let text_length = texts.get(index).map_or(0, |text| utf16::len(text));
        let returned = chosen_sections
            .iter()
            .find(|selection| selection.row == index)
            .map_or(0, |selection| utf16::len(&selection.text));
        if returned >= text_length {
            continue;
        }
        let mut offset = 0;
        for row in &section.prose {
            let row_length = utf16::len(&row.text);
            if offset + row_length > returned {
                let line = row.line_index + 1;
                first_omitted_line = Some(first_omitted_line.map_or(line, |held| held.min(line)));
                break;
            }
            offset += row_length + 1;
        }
    }
    ExcerptSelection {
        excerpt,
        sections: chosen_sections,
        first_omitted_line,
    }
}

/// The prose rows of a section whose text the excerpt shows, each cut to what is visible.
pub fn visible_prose_rows<'a>(
    section: &'a Section,
    selected_text: &str,
) -> Vec<(&'a ProseRow, String)> {
    let selected_length = utf16::len(selected_text);
    let mut visible = Vec::new();
    let mut offset = 0;
    for row in &section.prose {
        if offset >= selected_length {
            break;
        }
        let row_length = utf16::len(&row.text);
        let visible_length = row_length.min(selected_length - offset);
        if visible_length > 0 {
            visible.push((row, utf16::prefix(&row.text, visible_length).to_string()));
        }
        offset += row_length + 1;
    }
    visible
}

/// The headings of the sections an excerpt quotes, the document title first, in document order.
pub fn heading_selection(
    all_sections: &[Section],
    selected: &[&Section],
    selected_title_only: bool,
) -> Vec<String> {
    let is_title = |section: &&Section| {
        section
            .heading
            .as_ref()
            .is_some_and(|heading| heading.level == 1)
            && !section.excluded
    };
    let title_section: Option<&Section> = if selected_title_only {
        selected.iter().copied().find(is_title)
    } else {
        all_sections.iter().find(|section| is_title(section))
    };
    let mut prioritized: Vec<&Section> = Vec::new();
    prioritized.extend(title_section);
    prioritized.extend(selected.iter().copied().filter(|section| section.heading.is_some()));
    let mut chosen: Vec<&Section> = Vec::new();
    for section in prioritized {
        if chosen
            .iter()
            .any(|held| held.line_index == section.line_index)
        {
            continue;
        }
        chosen.push(section);
    }
    chosen.truncate(SEMANTIC_EVIDENCE_MAX_HEADINGS);
    chosen.sort_by_key(|section| section.line_index);
    chosen
        .into_iter()
        .filter_map(|section| section.heading.as_ref().map(|heading| heading.value.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cut_falls_at_the_last_sentence_that_fits_else_at_a_word() {
        assert_eq!(truncate_at_boundary("One. Two three four.", 12), "One.");
        assert_eq!(truncate_at_boundary("alpha beta gamma", 12), "alpha beta");
        assert_eq!(truncate_at_boundary("short", 12), "short");
    }

    #[test]
    fn a_decorative_line_is_a_badge_a_bare_link_or_a_sponsor_heading() {
        assert!(is_decorative_line("[![build](x.svg)](y)"));
        assert!(is_decorative_line("https://example.com/a"));
        assert!(is_decorative_line("Sponsors"));
        assert!(!is_decorative_line("Places an order."));
    }
}
