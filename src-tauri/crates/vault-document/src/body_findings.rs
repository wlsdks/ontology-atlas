//! What the body of a node leaves unsaid: a definition, each side of its boundary, what the writer
//! did not check, and exclusions that are really evidence limits. Advisory, never a refusal.
//!
//! The reader here is line based on purpose: a vault's bodies are short and written by agents to a
//! template, and the verdict must be the one the app's own twin of this check gives. The template
//! the starter body comes from ([`crate::starter_body`]) is what tells a filled slot from an empty
//! one.

use std::collections::HashSet;

use answer_format::whitespace::{is_line_terminator, is_whitespace, trim};

use crate::meaning_wording::{
    boundary_missing, definition_missing, epistemic_exclusion, uncertainty_missing, BoundarySide,
    DEFINITION_HEADINGS, EXCLUDES_HEADINGS, INCLUDES_HEADINGS, UNCERTAINTY_HEADINGS,
};
use crate::starter_body::{starter_body, META_MODEL_REFERENCE};

/// Words of prose a definition needs: about the shortest English sentence that carries both halves
/// of a definition. Lower passes a restated title; higher accuses a terse real one.
const DEFINITION_MIN_WORDS: usize = 8;

/// Words a definition must add beyond the title; length alone cannot tell circular from terse.
const DEFINITION_MIN_NOVEL_WORDS: usize = 6;

/// Grammar words, so restating the title around them still counts as restating.
const DEFINITION_STOP_WORDS: [&str; 12] = [
    "a", "an", "the", "of", "and", "or", "for", "to", "in", "on", "is", "are",
];

/// Examples a message gives before it says "and N more".
const REFERENCE_SAMPLE_LIMIT: usize = 5;

/// One thing the body leaves unsaid: its code, what it is about, and the sentence that says it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BodyFinding {
    pub code: &'static str,
    pub message: String,
}

fn is_definition_kind(kind: &str) -> bool {
    matches!(kind, "domain" | "capability" | "element")
}

fn is_boundary_kind(kind: &str) -> bool {
    matches!(kind, "domain" | "capability")
}

fn is_epistemic_kind(kind: &str) -> bool {
    matches!(kind, "domain" | "capability" | "element" | "project")
}

/// `\s+` collapsed to one space, trimmed and lowercased.
fn fold(text: &str) -> String {
    let mut folded = String::with_capacity(text.len());
    let mut pending_space = false;
    for character in text.chars() {
        if is_whitespace(character) {
            pending_space = !folded.is_empty();
            continue;
        }
        if pending_space {
            folded.push(' ');
            pending_space = false;
        }
        folded.push(character);
    }
    folded.to_lowercase()
}

/// A list marker (`-`, `*`, `+`, `1.`, `1)`) or a blockquote caret off the start of one line.
fn strip_marker(line: &str) -> &str {
    let rest = line.trim_start_matches(is_whitespace);
    let after_marker = if let Some(rest) = rest.strip_prefix(['-', '*', '+', '>']) {
        rest
    } else {
        let digits = rest.chars().take_while(char::is_ascii_digit).count();
        match rest
            .get(digits..)
            .and_then(|after| after.strip_prefix(['.', ')']))
        {
            Some(after) if digits > 0 => after,
            _ => rest,
        }
    };
    trim(after_marker.trim_start_matches(is_whitespace))
}

fn is_word_character(character: char) -> bool {
    character.is_alphabetic() || character.is_numeric()
}

/// Lowercased word tokens, punctuation and markup dropped.
fn word_tokens(text: &str) -> Vec<String> {
    fold(text)
        .split(|character: char| !is_word_character(character))
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .collect()
}

/// Distinct tokens not in the title, so one new word repeated does not pass.
fn novel_word_count(text: &str, title_words: &HashSet<String>) -> usize {
    word_tokens(text)
        .into_iter()
        .filter(|token| {
            !DEFINITION_STOP_WORDS.contains(&token.as_str()) && !title_words.contains(token)
        })
        .collect::<HashSet<_>>()
        .len()
}

fn word_count(text: &str) -> usize {
    text.split(is_whitespace)
        .filter(|token| token.chars().any(is_word_character))
        .count()
}

/// The starter line every template ends with; counting it would let an empty node pass on
/// boilerplate.
fn is_schema_furniture(line: &str) -> bool {
    line.contains(META_MODEL_REFERENCE)
}

struct Section {
    heading: String,
    lines: Vec<String>,
}

/// The prose before the first `##` and the sections after it. The `#` title is neither (it repeats
/// `title`), and fenced code is skipped so a `##` inside a snippet invents no section.
struct BodySections {
    lead: Vec<String>,
    sections: Vec<Section>,
}

/// `^(#{2,6})\s+(.*)$` on a trimmed line: the heading text.
fn section_heading(line: &str) -> Option<&str> {
    let hashes = line
        .chars()
        .take_while(|character| *character == '#')
        .count();
    if !(2..=6).contains(&hashes) {
        return None;
    }
    let rest = line.get(hashes..)?;
    let text = rest.trim_start_matches(is_whitespace);
    (text.len() < rest.len() && !text.chars().any(is_line_terminator)).then(|| trim(text))
}

/// `^#\s+`: the title line.
fn is_title_line(line: &str) -> bool {
    line.strip_prefix('#')
        .and_then(|rest| rest.chars().next())
        .is_some_and(is_whitespace)
}

fn parse_sections(body: &str) -> BodySections {
    let mut lead = Vec::new();
    let mut sections: Vec<Section> = Vec::new();
    let mut in_section = false;
    let mut fenced = false;
    for raw in body.split('\n') {
        let line = trim(raw);
        if line.starts_with("```") || line.starts_with("~~~") {
            fenced = !fenced;
            continue;
        }
        if fenced {
            push_line(&mut lead, &mut sections, in_section, line);
            continue;
        }
        if let Some(heading) = section_heading(line) {
            sections.push(Section {
                heading: heading.to_string(),
                lines: Vec::new(),
            });
            in_section = true;
            continue;
        }
        if is_title_line(line) {
            in_section = false;
            continue;
        }
        if line.is_empty() || is_schema_furniture(line) {
            continue;
        }
        push_line(&mut lead, &mut sections, in_section, line);
    }
    BodySections { lead, sections }
}

fn push_line(lead: &mut Vec<String>, sections: &mut [Section], in_section: bool, line: &str) {
    match sections.last_mut().filter(|_| in_section) {
        Some(section) => section.lines.push(line.to_string()),
        None => lead.push(line.to_string()),
    }
}

/// A heading with markup and one trailing run of punctuation taken off, folded.
fn normalize_heading(heading: &str) -> String {
    let unmarked: String = heading
        .chars()
        .filter(|character| !matches!(character, '`' | '*' | '_' | '#'))
        .collect();
    let without_space = unmarked.trim_end_matches(is_whitespace);
    let without_punctuation = without_space.trim_end_matches([':', '\u{ff1a}', '.', ',']);
    let stripped = if without_punctuation.len() < without_space.len() {
        without_punctuation
    } else {
        unmarked.as_str()
    };
    fold(stripped)
}

fn heading_names(heading: &str, synonyms: &[&str]) -> bool {
    let normalized = normalize_heading(heading);
    synonyms.iter().any(|name| {
        normalized == *name
            || normalized.starts_with(&format!("{name} "))
            || normalized.ends_with(&format!(" {name}"))
            || normalized.contains(&format!(" {name} "))
    })
}

/// The section stating this side of the boundary. The negative side is tested first: "out of
/// scope" contains "scope", or `## Out of scope` reads as Includes.
fn boundary_section(sections: &[Section], side: BoundarySide) -> Option<&Section> {
    for section in sections {
        if heading_names(&section.heading, &EXCLUDES_HEADINGS) {
            if side == BoundarySide::Excludes {
                return Some(section);
            }
            continue;
        }
        if side == BoundarySide::Includes && heading_names(&section.heading, &INCLUDES_HEADINGS) {
            return Some(section);
        }
    }
    None
}

struct View {
    parsed: BodySections,
    starter: Option<BodySections>,
    placeholders: HashSet<String>,
}

fn view_of(kind: &str, title: &str, body: &str) -> View {
    let starter = starter_body(kind, title).map(|text| parse_sections(&text));
    let mut placeholders: HashSet<String> = starter
        .iter()
        .flat_map(|starter| starter.sections.iter())
        .flat_map(|section| section.lines.iter())
        .map(|line| fold(strip_marker(line)))
        .collect();
    placeholders.remove("");
    View {
        parsed: parse_sections(body),
        starter,
        placeholders,
    }
}

/// `<…>` somewhere in the text: `<[^>]*>`.
fn without_angle_slots(text: &str) -> Option<String> {
    let mut replaced = String::with_capacity(text.len());
    let mut found = false;
    let mut rest = text;
    while let Some(open) = rest.find('<') {
        let after = rest.get(open + 1..).unwrap_or_default();
        match after.find('>') {
            Some(close) => {
                replaced.push_str(rest.get(..open).unwrap_or_default());
                replaced.push(' ');
                rest = after.get(close + 1..).unwrap_or_default();
                found = true;
            }
            None => break,
        }
    }
    replaced.push_str(rest);
    found.then_some(replaced)
}

/// Is this line still a slot? Either untouched (matches the template) or reworded around a
/// surviving `<…>` slot, which a counter reads as filled.
fn is_placeholder_line(line: &str, placeholders: &HashSet<String>) -> bool {
    let text = strip_marker(line);
    let folded = fold(text);
    if folded.is_empty() || placeholders.contains(&folded) {
        return true;
    }
    match without_angle_slots(text) {
        Some(without_slots) => word_count(&without_slots) < 3,
        None => false,
    }
}

fn content_lines<'a>(section: Option<&'a Section>, placeholders: &HashSet<String>) -> Vec<&'a str> {
    section
        .map(|section| {
            section
                .lines
                .iter()
                .map(String::as_str)
                .filter(|line| !line.is_empty() && !is_placeholder_line(line, placeholders))
                .collect()
        })
        .unwrap_or_default()
}

fn definition_section(sections: &[Section]) -> Option<&Section> {
    sections
        .iter()
        .find(|section| heading_names(&section.heading, &DEFINITION_HEADINGS))
}

fn definition_is_missing(title: &str, view: &View) -> bool {
    let lead_text = view.parsed.lead.join(" ");
    let starter_lead = view
        .starter
        .as_ref()
        .map(|starter| starter.lead.join(" "))
        .unwrap_or_default();
    let lead_is_starter =
        !starter_lead.is_empty() && fold(&lead_text).contains(&fold(&starter_lead));
    let stated = content_lines(
        definition_section(&view.parsed.sections),
        &view.placeholders,
    )
    .into_iter()
    .map(strip_marker)
    .collect::<Vec<_>>()
    .join(" ");
    let title_words: HashSet<String> = word_tokens(title).into_iter().collect();
    let candidates = [
        if lead_is_starter {
            ""
        } else {
            lead_text.as_str()
        },
        stated.as_str(),
    ];
    !candidates.iter().any(|candidate| {
        word_count(candidate) >= DEFINITION_MIN_WORDS
            && novel_word_count(candidate, &title_words) >= DEFINITION_MIN_NOVEL_WORDS
    })
}

/// The evidence-limit phrasings an exclusion may carry: each clause stays tied to a reading verb so
/// an ordinary product boundary does not match.
fn states_an_evidence_limit(text: &str) -> bool {
    crate::evidence_limit::matches(&fold(text))
}

/// Every finding for the body of a node of `kind` addressed as `slug` and titled `title`, in the
/// order the checks run: definition, boundary, uncertainty, exclusions that are evidence limits.
pub fn body_findings(kind: &str, slug: &str, title: &str, body: &str) -> Vec<BodyFinding> {
    if !(is_definition_kind(kind) || is_boundary_kind(kind) || is_epistemic_kind(kind)) {
        return Vec::new();
    }
    let view = view_of(kind, title, body);
    let mut findings = Vec::new();
    if is_definition_kind(kind) && definition_is_missing(title, &view) {
        findings.push(BodyFinding {
            code: "definition-missing",
            message: definition_missing(slug, kind),
        });
    }
    if is_boundary_kind(kind) {
        for side in [BoundarySide::Includes, BoundarySide::Excludes] {
            let section = boundary_section(&view.parsed.sections, side);
            if content_lines(section, &view.placeholders).is_empty() {
                findings.push(BodyFinding {
                    code: "boundary-missing",
                    message: boundary_missing(slug, kind, side),
                });
            }
        }
    }
    if is_definition_kind(kind) {
        let section = view
            .parsed
            .sections
            .iter()
            .find(|section| heading_names(&section.heading, &UNCERTAINTY_HEADINGS));
        if content_lines(section, &view.placeholders).is_empty() {
            findings.push(BodyFinding {
                code: "uncertainty-missing",
                message: uncertainty_missing(slug, kind),
            });
        }
    }
    if is_epistemic_kind(kind) {
        if let Some(section) = boundary_section(&view.parsed.sections, BoundarySide::Excludes) {
            let offending: Vec<String> = content_lines(Some(section), &view.placeholders)
                .into_iter()
                .map(strip_marker)
                .filter(|text| !text.is_empty() && states_an_evidence_limit(text))
                .map(str::to_string)
                .collect();
            if !offending.is_empty() {
                findings.push(BodyFinding {
                    code: "epistemic-exclusion",
                    message: epistemic_exclusion(slug, &offending, REFERENCE_SAMPLE_LIMIT),
                });
            }
        }
    }
    findings
}
