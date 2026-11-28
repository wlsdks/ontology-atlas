//! A DOCX as its paragraphs in order. A paragraph styled as a heading opens a section, and every
//! paragraph under it carries that heading's `h:<slug>` anchor; paragraphs before the first heading
//! carry `p1`, the one page a short letter or note has.

use std::collections::{HashMap, HashSet};

use answer_format::whitespace::{is_whitespace, trim};

use crate::citable_unit::{Unit, UnitKind, UnitPlace};
use crate::heading_slug::heading_slug;
use crate::markup_scan::{element_spans, open_tags, rewrite_tags, text_of};
use crate::unit_window::WindowCollector;

struct Paragraph {
    text: String,
    /// The anchor a heading would have without a repeat to tell apart; `None` for a paragraph.
    heading_base: Option<String>,
}

/// `\s+` of the text collapsed to one space, and the ends trimmed.
pub(crate) fn collapse_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_gap = false;
    for character in text.chars() {
        if is_whitespace(character) {
            in_gap = true;
        } else {
            if in_gap && !out.is_empty() {
                out.push(' ');
            }
            in_gap = false;
            out.push(character);
        }
    }
    out
}

/// The tabs and line breaks of a paragraph read as spaces, so words do not fuse.
fn space_for_tab_and_break(tag: &str) -> Option<&'static str> {
    let is_break = tag.strip_prefix("w:br").is_some_and(|rest| {
        !rest
            .as_bytes()
            .first()
            .is_some_and(|&byte| byte.is_ascii_alphanumeric() || byte == b'_')
            && rest.ends_with('/')
    });
    (tag == "w:tab/" || is_break).then_some(" ")
}

fn is_heading_style(style: &str) -> bool {
    let without_digits = style.trim_end_matches(|character: char| character.is_ascii_digit());
    ["heading", "title"]
        .iter()
        .any(|name| without_digits.eq_ignore_ascii_case(name))
        || matches!(
            without_digits,
            "\u{c81c}\u{baa9}" | "\u{898b}\u{51fa}\u{3057}"
        )
}

fn paragraph_style(paragraph: &str) -> &str {
    open_tags(paragraph, "w:pStyle")
        .into_iter()
        .find_map(|tag| {
            let at = tag.find("w:val=\"")? + "w:val=\"".len();
            let length = tag.get(at..)?.find('"')?;
            tag.get(at..at + length).filter(|style| !style.is_empty())
        })
        .unwrap_or("")
}

fn paragraphs_of(document_xml: &str) -> Vec<Paragraph> {
    let mut paragraphs = Vec::new();
    let mut heading_count = 0usize;
    for span in element_spans(document_xml, "w:p") {
        let spaced = rewrite_tags(span, space_for_tab_and_break);
        let text = collapse_whitespace(trim(&text_of(&spaced)));
        if text.is_empty() {
            continue;
        }
        if is_heading_style(paragraph_style(span)) {
            heading_count += 1;
            let slug = heading_slug(&text);
            let base = if slug.is_empty() {
                format!("h:heading-{heading_count}")
            } else {
                format!("h:{slug}")
            };
            paragraphs.push(Paragraph {
                text,
                heading_base: Some(base),
            });
        } else {
            paragraphs.push(Paragraph {
                text,
                heading_base: None,
            });
        }
    }
    paragraphs
}

/// The headings whose natural anchor several headings share, as `base (N occurrences)`.
fn ambiguous_bases(paragraphs: &[Paragraph], counts: &HashMap<&str, usize>) -> Vec<String> {
    let mut seen = HashSet::new();
    paragraphs
        .iter()
        .filter_map(|paragraph| paragraph.heading_base.as_deref())
        .filter(|base| seen.insert(*base))
        .filter(|base| counts.get(base).copied().unwrap_or(0) > 1)
        .map(|base| {
            format!(
                "{base} ({} occurrences)",
                counts.get(base).copied().unwrap_or(0)
            )
        })
        .collect()
}

/// Offers the units of `document_xml` and returns the note about headings that repeat, if any.
pub(crate) fn offer_docx_units(
    document_xml: &str,
    collector: &mut WindowCollector,
) -> Option<String> {
    let paragraphs = paragraphs_of(document_xml);
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for base in paragraphs
        .iter()
        .filter_map(|paragraph| paragraph.heading_base.as_deref())
    {
        *counts.entry(base).or_default() += 1;
    }
    let ambiguous = ambiguous_bases(&paragraphs, &counts);
    // A unique `Scope 2` keeps `h:scope-2` even when `h:scope` repeats, so every natural base is
    // reserved before a repeat is numbered.
    let reserved: HashSet<&str> = counts.keys().copied().collect();
    let mut used: HashSet<String> = HashSet::new();
    let mut next_suffix: HashMap<&str, usize> = HashMap::new();
    let mut anchor = "p1".to_string();
    let mut heading: Option<String> = None;
    for paragraph in &paragraphs {
        let kind = if let Some(base) = paragraph.heading_base.as_deref() {
            heading = Some(paragraph.text.clone());
            if counts.get(base) == Some(&1) {
                anchor = base.to_string();
            } else {
                let suffix = next_suffix.entry(base).or_insert(1);
                anchor = loop {
                    let generated = format!("{base}-{suffix}");
                    *suffix += 1;
                    if !reserved.contains(generated.as_str()) && !used.contains(&generated) {
                        break generated;
                    }
                };
            }
            used.insert(anchor.clone());
            UnitKind::Heading
        } else {
            UnitKind::Paragraph
        };
        collector.offer(|| Unit {
            anchor: anchor.clone(),
            place: UnitPlace::Section(heading.clone()),
            text: paragraph.text.clone(),
            kind,
        });
    }
    (!ambiguous.is_empty()).then(|| {
        format!(
            "Ambiguous legacy DOCX heading addresses: {}. Duplicate headings use distinct generated anchors in the returned units; cite those anchors instead.",
            ambiguous.join(", ")
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::unit_window::UnitWindow;

    fn paragraph(style: Option<&str>, text: &str) -> String {
        let style = style.map_or(String::new(), |style| {
            format!("<w:pPr><w:pStyle w:val=\"{style}\"/></w:pPr>")
        });
        format!("<w:p>{style}<w:r><w:t>{text}</w:t></w:r></w:p>")
    }

    #[test]
    fn a_repeated_heading_is_numbered_around_the_names_unique_headings_keep() {
        let xml = [
            paragraph(None, "before"),
            paragraph(Some("Heading1"), "Scope"),
            paragraph(None, "one"),
            paragraph(Some("Heading1"), "Scope"),
            paragraph(Some("Heading2"), "Scope 1"),
            paragraph(None, "two"),
        ]
        .concat();
        let mut collector = WindowCollector::new(&UnitWindow::default());
        let note = offer_docx_units(&xml, &mut collector).expect("a note");
        let units = collector.finish().units;
        let anchors: Vec<&str> = units.iter().map(|unit| unit.anchor.as_str()).collect();
        assert_eq!(
            anchors,
            [
                "p1",
                "h:scope-2",
                "h:scope-2",
                "h:scope-3",
                "h:scope-1",
                "h:scope-1"
            ]
        );
        assert!(note.contains("h:scope (2 occurrences)"));
    }
}
