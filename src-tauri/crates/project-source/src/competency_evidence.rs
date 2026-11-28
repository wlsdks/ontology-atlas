//! The source claims a project's body makes in its `## Competency answers` section: the paths and
//! pinned citations on its `- Evidence:` and `- Paths:` rows. Arbitrary prose and other headings are
//! not claims. A malformed row makes the whole set empty; the strict parser reports it at finalize.

use answer_format::collation::compare_text;

use crate::source_range_citation::{is_persistable_relative_path, parse_source_range_citation};

pub const COMPETENCY_HEADING: &str = "## Competency answers";

struct EvidenceValue {
    path: String,
    citation: Option<String>,
}

/// The text of the one section: after its heading, up to the next `## ` heading (a `###` is not one).
fn section_of_one_heading(body: &str) -> Option<&str> {
    let mut headings = body
        .match_indices(COMPETENCY_HEADING)
        .filter(|(at, heading)| {
            let line_start = *at == 0 || body.as_bytes().get(at - 1) == Some(&b'\n');
            let line_end = at + heading.len() == body.len()
                || body.as_bytes().get(at + heading.len()) == Some(&b'\n');
            line_start && line_end
        });
    let (at, _) = headings.next()?;
    if headings.next().is_some() {
        return None;
    }
    let remainder = body.get(at + COMPETENCY_HEADING.len()..)?;
    let end = remainder
        .match_indices("\n## ")
        .find(|(position, marker)| {
            remainder.as_bytes().get(position + marker.len()) != Some(&b'#')
        })
        .map_or(remainder.len(), |(position, _)| position);
    remainder.get(..end)
}

fn evidence_values(body: &str) -> Vec<EvidenceValue> {
    let Some(section) = section_of_one_heading(body) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for line in section.split('\n') {
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
}
