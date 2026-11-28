//! The source claims a project's body makes in its `## Competency answers` section: the paths and
//! pinned citations on its `- Evidence:` and `- Paths:` rows. Arbitrary prose and other headings are
//! not claims. A malformed row makes the whole set empty; the strict parser reports it at finalize.

use answer_format::collation::compare_text;
use answer_format::whitespace::is_line_terminator;

use crate::source_range_citation::{is_persistable_relative_path, parse_source_range_citation};

pub const COMPETENCY_HEADING: &str = "## Competency answers";

struct EvidenceValue {
    path: String,
    citation: Option<String>,
}

/// Where each `## Competency answers` heading starts. A heading is the whole of its line, and a
/// line ends at any JavaScript line terminator (`\n`, `\r`, U+2028, U+2029), so a file written with
/// Windows line ends has its headings too.
pub fn competency_heading_starts(body: &str) -> Vec<usize> {
    let line_start = |at: usize| {
        body.get(..at)
            .and_then(|before| before.chars().next_back())
            .is_none_or(is_line_terminator)
    };
    body.match_indices(COMPETENCY_HEADING)
        .filter(|(at, heading)| {
            line_start(*at)
                && body
                    .get(at + heading.len()..)
                    .and_then(|after| after.chars().next())
                    .is_none_or(is_line_terminator)
        })
        .map(|(at, _)| at)
        .collect()
}

/// Where the section that begins after its heading at `after_heading` ends: at the `\n` before the
/// next `## ` heading (a `###` is not one), else the end of the body.
pub fn competency_section_end(body: &str, after_heading: usize) -> usize {
    let remainder = body.get(after_heading..).unwrap_or("");
    after_heading
        + remainder
            .match_indices("\n## ")
            .find(|(position, marker)| remainder.as_bytes().get(position + marker.len()) != Some(&b'#'))
            .map_or(remainder.len(), |(position, _)| position)
}

/// The text of the one section: after its heading, up to the next `## ` heading.
fn section_of_one_heading(body: &str) -> Option<&str> {
    let starts = competency_heading_starts(body);
    let [at] = starts.as_slice() else {
        return None;
    };
    let after_heading = at + COMPETENCY_HEADING.len();
    body.get(after_heading..competency_section_end(body, after_heading))
}

fn evidence_values(body: &str) -> Vec<EvidenceValue> {
    let Some(section) = section_of_one_heading(body) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for line in section.split(is_line_terminator) {
        let (is_evidence, cells) = if let Some(cells) = line.strip_prefix("- Evidence: ") {
            (true, cells)
        } else if let Some(cells) = line.strip_prefix("- Paths: ") {
            (false, cells)
        } else {
            continue;
        };
        if cells.is_empty() {
            continue;
        }
        for value in cells.split(", ") {
            let Some(literal) = value
                .strip_prefix('`')
                .and_then(|rest| rest.strip_suffix('`'))
                .filter(|literal| !literal.is_empty() && !literal.contains('`'))
            else {
                return Vec::new();
            };
            let range = if is_evidence {
                parse_source_range_citation(literal)
            } else {
                None
            };
            if literal.starts_with("source:") && (range.is_none() || !is_evidence) {
                return Vec::new();
            }
            let path = range.as_ref().map_or(literal, |range| range.path.as_str());
            if !is_persistable_relative_path(path, true) {
                return Vec::new();
            }
            values.push(EvidenceValue {
                path: path.to_string(),
                citation: range.is_some().then(|| literal.to_string()),
            });
        }
    }
    values
}

fn sorted_unique(mut values: Vec<String>) -> Vec<String> {
    values.sort_by(|left, right| compare_text(left, right));
    values.dedup();
    values
}

/// The paths the section cites, once each, in collation order.
pub fn competency_evidence_paths(body: &str) -> Vec<String> {
    sorted_unique(evidence_values(body).into_iter().map(|value| value.path).collect())
}

/// The pinned `source:` citations among the section's evidence values, once each.
pub fn competency_evidence_citations(body: &str) -> Vec<String> {
    sorted_unique(
        evidence_values(body)
            .into_iter()
            .filter_map(|value| value.citation)
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIGEST: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn only_the_evidence_and_paths_rows_of_the_one_section_name_source_claims() {
        let body = format!(
            "# P\n\n- Evidence: `not/this.ts`\n\n## Competency answers\n\n### scope: answered\n\n- Evidence: `src/a.ts`, `source:src/b.ts#L1-L2@sha256:{DIGEST}`\n- Paths: `src/c`\n\n## Uncertainty\n\n- Paths: `elsewhere.ts`\n"
        );
        assert_eq!(competency_evidence_paths(&body), ["src/a.ts", "src/b.ts", "src/c"]);
        assert_eq!(
            competency_evidence_citations(&body),
            [format!("source:src/b.ts#L1-L2@sha256:{DIGEST}")]
        );
    }

    #[test]
    fn a_malformed_row_or_a_repeated_heading_makes_the_set_empty() {
        let twice = "## Competency answers\n- Evidence: `a.ts`\n\n## Competency answers\n";
        assert!(competency_evidence_paths(twice).is_empty());
        let bare = "## Competency answers\n- Evidence: a.ts\n";
        assert!(competency_evidence_paths(bare).is_empty());
        let pinned_path = "## Competency answers\n- Paths: `source:a.ts#L1-L2@sha256:x`\n";
        assert!(competency_evidence_paths(pinned_path).is_empty());
    }

    #[test]
    fn a_windows_line_ending_does_not_hide_the_section_or_its_rows() {
        let body = "# P\r\n\r\n## Competency answers\r\n\r\n- Evidence: `src/a.ts`\r\n- Paths: `src/c`\r\n\r\n## Uncertainty\r\n";
        assert_eq!(competency_evidence_paths(body), ["src/a.ts", "src/c"]);
    }
}
