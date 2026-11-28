//! One page of the answer. The rows are cut by count, or by size when the caller named no limit
//! (the reply stays readable at 40,000 characters), and a page repeats no code's repair guidance:
//! after the first finding of a code on the page, a later one that carries only the same guidance
//! keeps the sentence naming its own node and points back at the first.

use std::collections::HashMap;

use serde::Serialize;
use vault_document::Issue;

use crate::evidence_drift::EvidenceDrift;
use crate::path_drift::PathDrift;
use crate::problem_list::{CodeTally, Problem, ProblemList, ProblemSummary, TalliesByCode};
use crate::summary_freshness::SummaryFreshness;

pub const DEFAULT_PAGE_LIMIT: usize = 100;
const PAGE_TEXT_BYTES: usize = 40_000;
const HINT_AND_ENVELOPE_BYTES: usize = 4096;
const ROW_INDENT_BYTES: usize = 4;
const FILES_SAMPLED_PER_CODE: usize = 20;
const SENTENCE_MIN_CHARS: usize = 40;

/// Everything the answer says besides which problem rows it shows.
pub struct ValidationFrame {
    pub scanned: usize,
    pub coverage: Option<String>,
    pub summary_freshness: SummaryFreshness,
    pub evidence_drift: EvidenceDrift,
    pub path_drift: PathDrift,
}

#[derive(Serialize)]
struct Frame<'a> {
    scanned: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    coverage: &'a Option<String>,
    problems: &'a [Problem],
    summary: &'a ProblemSummary,
    #[serde(rename = "summaryFreshness")]
    summary_freshness: &'a SummaryFreshness,
    #[serde(rename = "evidenceDrift")]
    evidence_drift: &'a EvidenceDrift,
    #[serde(rename = "pathDrift")]
    path_drift: &'a PathDrift,
}

#[derive(Serialize)]
struct Pagination {
    offset: usize,
    limit: usize,
    total: usize,
    returned: usize,
    #[serde(rename = "hasMore")]
    has_more: bool,
    #[serde(rename = "nextOffset")]
    next_offset: Option<usize>,
}

/// The answer: where the page lies, then the frame with the page's rows.
#[derive(Serialize)]
pub struct ValidationPage<'a> {
    #[serde(rename = "nextCall", skip_serializing_if = "Option::is_none")]
    next_call: Option<NextCall>,
    #[serde(rename = "problemsPagination")]
    pagination: Pagination,
    #[serde(rename = "problemsHint", skip_serializing_if = "Option::is_none")]
    hint: Option<String>,
    scanned: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    coverage: &'a Option<String>,
    problems: Vec<Problem>,
    summary: ProblemSummary,
    #[serde(rename = "summaryFreshness")]
    summary_freshness: &'a SummaryFreshness,
    #[serde(rename = "evidenceDrift")]
    evidence_drift: &'a EvidenceDrift,
    #[serde(rename = "pathDrift")]
    path_drift: &'a PathDrift,
}

/// Which rows a caller asked for, and the arguments to repeat in the next call's text.
pub struct PageRequest<'a> {
    offset: usize,
    /// `None` when the caller named no limit: the page is then also held to its size.
    limit: Option<usize>,
    repo_root: Option<&'a str>,
    brief: bool,
}

impl<'a> PageRequest<'a> {
    /// The page a caller of `validate_vault` named.
    pub const fn asked(offset: usize, limit: Option<usize>, repo_root: Option<&'a str>) -> Self {
        Self {
            offset,
            limit,
            repo_root,
            brief: false,
        }
    }

    /// The first page another tool's answer carries: a few rows, no size cut, and the next call
    /// named as a call to make.
    pub const fn brief() -> Self {
        Self {
            offset: 0,
            limit: Some(BRIEF_PAGE_LIMIT),
            repo_root: None,
            brief: true,
        }
    }
}

const BRIEF_PAGE_LIMIT: usize = 20;

/// The call that reads the rest of the rows.
#[derive(Serialize)]
pub struct NextCall {
    tool: &'static str,
    arguments: NextCallArguments,
}

#[derive(Serialize)]
struct NextCallArguments {
    offset: usize,
}

fn pretty_bytes<T: Serialize>(value: &T) -> usize {
    answer_format::json::to_string_indented(value, 2).map_or(0, |text| text.len())
}

fn row_bytes(row: &Problem) -> usize {
    let text = answer_format::json::to_string_indented(row, 2).unwrap_or_default();
    text.len() + ROW_INDENT_BYTES * (text.matches('\n').count() + 1) + ",\n".len()
}

/// The message up to its first sentence end outside code and quotes, or all of it. Positions count
/// UTF-16 units, as the sentence minimum always has.
fn first_sentence(message: &str) -> &str {
    let units: Vec<u16> = message.encode_utf16().collect();
    let (mut in_code, mut in_quote) = (false, false);
    let mut position = 0usize;
    let characters: Vec<(usize, char)> = message.char_indices().collect();
    for (at, character) in &characters {
        let width = character.len_utf16();
        if position + 2 >= units.len() {
            break;
        }
        match character {
            '`' => in_code = !in_code,
            '"' if !in_code => in_quote = !in_quote,
            '.' if !in_code
                && !in_quote
                && position >= SENTENCE_MIN_CHARS
                && units.get(position + 1) == Some(&u16::from(b' '))
                && units
                    .get(position + 2)
                    .is_some_and(|next| (u16::from(b'A')..=u16::from(b'Z')).contains(next)) =>
            {
                return message.get(..at + 1).unwrap_or(message);
            }
            _ => {}
        }
        position += width;
    }
    message
}

/// Rows with the repeated guidance after a code's first finding folded away.
fn fold_repeated_guidance(rows: Vec<Problem>) -> Vec<Problem> {
    let mut first_guidance: HashMap<&'static str, String> = HashMap::new();
    rows.into_iter()
        .map(|row| {
            let slug = row.slug.clone();
            let issues = row
                .issues
                .into_iter()
                .map(|issue| {
                    let message = issue.message.clone().unwrap_or_default();
                    let named = first_sentence(&message).to_string();
                    let guidance = message
                        .get(named.len()..)
                        .unwrap_or_default()
                        .replace(&slug, "\u{0}");
                    match first_guidance.get(issue.code) {
                        None => {
                            first_guidance.insert(issue.code, guidance);
                            issue
                        }
                        Some(first) if guidance.is_empty() || guidance != *first => issue,
                        Some(_) => Issue {
                            message: Some(format!(
                                "{named} Repair as the first {} on this page says.",
                                issue.code
                            )),
                            ..issue
                        },
                    }
                })
                .collect();
            Problem { slug, issues }
        })
        .collect()
}

fn sampled(by_code: &TalliesByCode) -> TalliesByCode {
    TalliesByCode(
        by_code
            .0
            .iter()
            .map(|(code, tally)| {
                let omitted = tally.files.len().saturating_sub(FILES_SAMPLED_PER_CODE);
                (
                    *code,
                    CodeTally {
                        severity: tally.severity,
                        count: tally.count,
                        files: tally
                            .files
                            .iter()
                            .take(FILES_SAMPLED_PER_CODE)
                            .cloned()
                            .collect(),
                        files_omitted: (omitted > 0).then_some(omitted),
                    },
                )
            })
            .collect(),
    )
}

/// The page `request` names of `list`.
pub fn page_validation<'a>(
    frame: &'a ValidationFrame,
    list: &ProblemList,
    request: &PageRequest<'_>,
) -> ValidationPage<'a> {
    let total = list.problems.len();
    let start = request.offset.min(total);
    let limit = request.limit.unwrap_or(DEFAULT_PAGE_LIMIT);
    let summary = ProblemSummary {
        problem_files: list.summary.problem_files,
        error_files: list.summary.error_files,
        warning_files: list.summary.warning_files,
        by_code: sampled(&list.summary.by_code),
    };
    let wanted: Vec<Problem> = list
        .problems
        .iter()
        .skip(start)
        .take(limit)
        .cloned()
        .collect();
    let mut rows = fold_repeated_guidance(wanted);
    let mut stopped_for_size = false;
    if request.limit.is_none() && !request.brief {
        let empty = Frame {
            scanned: frame.scanned,
            coverage: &frame.coverage,
            problems: &[],
            summary: &summary,
            summary_freshness: &frame.summary_freshness,
            evidence_drift: &frame.evidence_drift,
            path_drift: &frame.path_drift,
        };
        let spent = pretty_bytes(&empty) + HINT_AND_ENVELOPE_BYTES;
        let mut room = PAGE_TEXT_BYTES as i64 - i64::try_from(spent).unwrap_or(i64::MAX);
        let mut fitting = 0;
        for row in &rows {
            let bytes = i64::try_from(row_bytes(row)).unwrap_or(i64::MAX);
            if fitting > 0 && bytes > room {
                break;
            }
            room -= bytes;
            fitting += 1;
        }
        stopped_for_size = fitting < rows.len();
        rows.truncate(fitting);
    }
    let end = start + rows.len();
    let next_offset = (end < total).then_some(end);
    let hint = (start > 0 || next_offset.is_some()).then(|| {
        let shown = if rows.is_empty() {
            format!("No problem files from offset {start}; the vault has {total}")
        } else {
            format!(
                "Problem files {}-{end} of {total}, files with errors first and then by slug",
                start + 1
            )
        };
        let size = if stopped_for_size {
            format!("; the page stopped before {limit} files to stay within 40,000 characters")
        } else {
            String::new()
        };
        let next = match next_offset {
            Some(offset) => {
                let mut arguments = format!("{{\"offset\":{offset}");
                if let Some(root) = request.repo_root {
                    arguments.push_str(&format!(
                        ",\"repoRoot\":{}",
                        answer_format::json::quote(root)
                    ));
                }
                if let Some(named) = request.limit.filter(|_| !request.brief) {
                    arguments.push_str(&format!(",\"limit\":{named}"));
                }
                format!(". The next page: validate_vault({arguments}}}).")
            }
            None => ".".to_string(),
        };
        format!("{shown}{size}{next}")
    });
    let next_call = (request.brief && next_offset.is_some()).then(|| NextCall {
        tool: "validate_vault",
        arguments: NextCallArguments {
            offset: next_offset.unwrap_or_default(),
        },
    });
    ValidationPage {
        next_call,
        pagination: Pagination {
            offset: start,
            limit,
            total,
            returned: rows.len(),
            has_more: next_offset.is_some(),
            next_offset,
        },
        hint,
        scanned: frame.scanned,
        coverage: &frame.coverage,
        problems: rows,
        summary,
        summary_freshness: &frame.summary_freshness,
        evidence_drift: &frame.evidence_drift,
        path_drift: &frame.path_drift,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(slug: &str, message: &str) -> Problem {
        Problem {
            slug: slug.to_string(),
            issues: vec![Issue::warning("path-drift", message)],
        }
    }

    #[test]
    fn a_later_finding_of_a_code_keeps_its_own_sentence_and_points_back_at_the_first() {
        let guidance = " Fix the path in the frontmatter or remove the entry from the node.";
        let first = format!(
            "\"node-one\" cites a file that is no longer in the repository at all.{guidance}"
        );
        let second = format!(
            "\"node-two\" cites a file that is no longer in the repository at all.{guidance}"
        );
        let other = "\"node-three\" cites a moved file; read it at src/x.ts before you decide anything here.";
        let folded = fold_repeated_guidance(vec![
            row("node-one", &first),
            row("node-two", &second),
            row("node-three", other),
        ]);
        assert_eq!(folded[0].issues[0].message.as_deref(), Some(first.as_str()));
        assert_eq!(
            folded[1].issues[0].message.as_deref(),
            Some("\"node-two\" cites a file that is no longer in the repository at all. Repair as the first path-drift on this page says.")
        );
        assert_eq!(folded[2].issues[0].message.as_deref(), Some(other));
    }
}
