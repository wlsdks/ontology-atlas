//! Splitting a document at its `##` headings. `###` and deeper stay in their section, and a heading
//! inside a fenced code block never splits, so a `## comment` in a shell block is not a section.

use std::sync::LazyLock;

use answer_format::whitespace::trim;
use regex::Regex;

use crate::JS_SPACE;

/// A character that is not a line break, as JavaScript's `.` reads it.
const NOT_BREAK: &str = r"[^\n\r\x{2028}\x{2029}]";

static TITLE_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(r"^#[{JS_SPACE}]+({NOT_BREAK}+?)[{JS_SPACE}]*$")).expect("title pattern")
});
static SECTION_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(r"^##[{JS_SPACE}]+({NOT_BREAK}+?)[{JS_SPACE}]*$")).expect("section pattern")
});
static FENCE_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(&format!(r"^[{JS_SPACE}]*(?:```+|~~~+)")).expect("fence pattern"));

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawSection {
    pub heading: String,
    pub body: String,
    pub raw: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentSections {
    /// The first `# ` line before the first `##`.
    pub title: Option<String>,
    /// What stands before the first `##`, the title line excluded.
    pub intro: String,
    pub sections: Vec<RawSection>,
}

/// `text` split into its title, its introduction and its sections.
pub fn split_document(text: &str) -> DocumentSections {
    let lines = lines_of(text);
    let mut in_fence = vec![false; lines.len()];
    let mut open = false;
    for (index, line) in lines.iter().enumerate() {
        if FENCE_LINE.is_match(line) {
            open = !open;
            set(&mut in_fence, index, true);
        } else {
            set(&mut in_fence, index, open);
        }
    }
    let heading_at = |index: usize, pattern: &Regex| -> Option<String> {
        if in_fence.get(index).copied().unwrap_or(true) {
            return None;
        }
        pattern
            .captures(lines.get(index)?)
            .and_then(|found| found.get(1))
            .map(|name| trim(name.as_str()).to_string())
    };
    let first_section = (0..lines.len()).find(|&index| heading_at(index, &SECTION_LINE).is_some());
    let preamble_end = first_section.unwrap_or(lines.len());
    let title_at = (0..preamble_end).find(|&index| heading_at(index, &TITLE_LINE).is_some());
    let title = title_at.and_then(|index| heading_at(index, &TITLE_LINE));
    let intro = lines
        .iter()
        .take(preamble_end)
        .enumerate()
        .filter(|(index, _)| Some(*index) != title_at)
        .map(|(_, line)| *line)
        .collect::<Vec<_>>()
        .join("\n");
    let mut sections = Vec::new();
    let mut index = preamble_end;
    while index < lines.len() {
        let Some(heading) = heading_at(index, &SECTION_LINE) else {
            index += 1;
            continue;
        };
        let mut next = index + 1;
        while next < lines.len() && heading_at(next, &SECTION_LINE).is_none() {
            next += 1;
        }
        let body_lines = lines.get(index + 1..next).unwrap_or_default();
        let raw_lines = lines.get(index..next).unwrap_or_default();
        sections.push(RawSection {
            heading,
            body: trim(&body_lines.join("\n")).to_string(),
            raw: trim(&raw_lines.join("\n")).to_string(),
        });
        index = next;
    }
    DocumentSections {
        title,
        intro: trim(&intro).to_string(),
        sections,
    }
}

fn set(flags: &mut [bool], index: usize, value: bool) {
    if let Some(flag) = flags.get_mut(index) {
        *flag = value;
    }
}

/// Lines split at `\n`, each losing one `\r` before it; a lone `\r` stays in its line.
fn lines_of(text: &str) -> Vec<&str> {
    text.split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_heading_inside_a_fence_is_code_and_deeper_headings_stay_in_their_section() {
        let text = "# Title\nintro\n## Rules\n```sh\n## not a heading\n```\n### Deeper\nbody\n## Other\nx";
        let split = split_document(text);
        assert_eq!(split.title.as_deref(), Some("Title"));
        assert_eq!(split.intro, "intro");
        let headings: Vec<&str> = split.sections.iter().map(|s| s.heading.as_str()).collect();
        assert_eq!(headings, ["Rules", "Other"]);
        assert_eq!(
            split.sections[0].body,
            "```sh\n## not a heading\n```\n### Deeper\nbody"
        );
    }

    #[test]
    fn carriage_returns_before_line_breaks_do_not_end_up_in_headings() {
        let split = split_document("## Rules\r\nbody\r\n");
        assert_eq!(split.sections[0].heading, "Rules");
        assert_eq!(split.sections[0].body, "body");
    }
}
