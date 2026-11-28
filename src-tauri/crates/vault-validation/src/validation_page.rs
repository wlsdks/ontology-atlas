//! One page of the answer. The rows are cut by count, or by size when the caller named no limit
//! (the reply stays readable at 40,000 characters). What to do about a code is said once, in
//! `summary.byCode[code].remedy`, and each finding keeps only the sentence that names its node. A
//! code lists the files that are not on this page of rows; the rows name the others.

use std::collections::HashMap;

use answer_format::pagination::Pagination;
use answer_format::whitespace::trim;
use build_depth::{Coverage, CoverageCounts, CoveragePage, FinalizeBlock};
use serde::Serialize;
use vault_document::Issue;

use crate::evidence_drift::{
    EvidenceCounts, EvidenceDrift, FolderOnlyConcept, MissingConcept, StaleConcept,
};
use crate::path_drift::PathDrift;
use crate::problem_list::{CodeTally, Problem, ProblemList, ProblemSummary, TalliesByCode};
use crate::summary_freshness::SummaryFreshness;

pub const DEFAULT_PAGE_LIMIT: usize = 100;
const PAGE_TEXT_BYTES: usize = 40_000;
const HINT_AND_ENVELOPE_BYTES: usize = 4096;
const ROW_INDENT_BYTES: usize = 4;
const FILES_SAMPLED_PER_CODE: usize = 20;
const SENTENCE_MIN_CHARS: usize = 40;
/// Dated rows a report lists per group; `counts` and `omitted` carry the rest.
const EVIDENCE_ROWS: usize = 10;
/// Problem files the validation a brief carries lists.
const BRIEF_PAGE_LIMIT: usize = 3;
/// Stands for a node's own slug while guidance is compared between nodes.
const OWN_SLUG: &str = "\u{0}";

/// Everything the answer says besides which problem rows it shows.
pub struct ValidationFrame {
    pub scanned: usize,
    /// The repository root the call named, or the server's own, is not on disk: said once, in
    /// `repoRoot`, where a row for each cited path would ask for each to be patched away.
    pub repo_root_missing: bool,
    pub coverage: Option<Coverage>,
    /// What `finalize_project_meaning` would hold an answered row to; `None` when no repository is
    /// known to hold the map against.
    pub finalize_gate: Option<Vec<FinalizeBlock>>,
    pub summary_freshness: SummaryFreshness,
    pub evidence_drift: EvidenceDrift,
    pub path_drift: PathDrift,
}

/// What is said of the repository root when it is not there.
#[derive(Serialize)]
struct RepoRoot {
    missing: bool,
}

/// How many dated rows each group of `evidenceDrift` left out, for the groups that left any.
#[derive(Serialize)]
struct OmittedRows {
    #[serde(skip_serializing_if = "Option::is_none")]
    stale: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    missing: Option<usize>,
    #[serde(rename = "folderOnly", skip_serializing_if = "Option::is_none")]
    folder_only: Option<usize>,
}

/// `evidenceDrift` with each group of rows cut to the first ten.
#[derive(Serialize)]
struct EvidenceRows<'a> {
    checked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: &'a Option<String>,
    #[serde(rename = "repoRoot", skip_serializing_if = "Option::is_none")]
    repo_root: &'a Option<String>,
    counts: &'a EvidenceCounts,
    stale: &'a [StaleConcept],
    missing: &'a [MissingConcept],
    #[serde(rename = "folderOnly")]
    folder_only: &'a [FolderOnlyConcept],
    hint: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    omitted: Option<OmittedRows>,
}

/// The first ten rows of a group.
fn first_rows<T>(rows: &[T]) -> &[T] {
    rows.get(..EVIDENCE_ROWS).unwrap_or(rows)
}

fn evidence_rows(drift: &EvidenceDrift) -> EvidenceRows<'_> {
    let cut = |length: usize| length.checked_sub(EVIDENCE_ROWS).filter(|rest| *rest > 0);
    let omitted = OmittedRows {
        stale: cut(drift.stale.len()),
        missing: cut(drift.missing.len()),
        folder_only: cut(drift.folder_only.len()),
    };
    let any = omitted.stale.is_some() || omitted.missing.is_some() || omitted.folder_only.is_some();
    EvidenceRows {
        checked: drift.checked,
        reason: &drift.reason,
        repo_root: &drift.repo_root,
        counts: &drift.counts,
        stale: first_rows(&drift.stale),
        missing: first_rows(&drift.missing),
        folder_only: first_rows(&drift.folder_only),
        hint: &drift.hint,
        omitted: any.then_some(omitted),
    }
}

#[derive(Serialize)]
struct Frame<'a> {
    scanned: usize,
    #[serde(rename = "repoRoot", skip_serializing_if = "Option::is_none")]
    repo_root: Option<RepoRoot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    coverage: Option<CoveragePage<'a>>,
    #[serde(rename = "finalizeGate", skip_serializing_if = "Option::is_none")]
    finalize_gate: &'a Option<Vec<FinalizeBlock>>,
    problems: &'a [Problem],
    summary: &'a ProblemSummary,
    #[serde(rename = "summaryFreshness")]
    summary_freshness: &'a SummaryFreshness,
    #[serde(rename = "evidenceDrift")]
    evidence_drift: EvidenceRows<'a>,
    #[serde(rename = "pathDrift")]
    path_drift: &'a PathDrift,
}

/// The answer: where the page lies, then the frame with the page's rows.
#[derive(Serialize)]
pub struct ValidationPage<'a> {
    #[serde(rename = "problemsPagination")]
    pagination: Pagination,
    #[serde(rename = "problemsHint", skip_serializing_if = "Option::is_none")]
    hint: Option<String>,
    scanned: usize,
    #[serde(rename = "repoRoot", skip_serializing_if = "Option::is_none")]
    repo_root: Option<RepoRoot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    coverage: Option<CoveragePage<'a>>,
    #[serde(rename = "finalizeGate", skip_serializing_if = "Option::is_none")]
    finalize_gate: &'a Option<Vec<FinalizeBlock>>,
    problems: Vec<Problem>,
    summary: ProblemSummary,
    #[serde(rename = "summaryFreshness")]
    summary_freshness: &'a SummaryFreshness,
    #[serde(rename = "evidenceDrift")]
    evidence_drift: EvidenceRows<'a>,
    #[serde(rename = "pathDrift")]
    path_drift: &'a PathDrift,
}

/// Which rows a caller asked for, and the arguments to repeat in the next call's text.
pub struct PageRequest<'a> {
    offset: usize,
    /// Where the unplaced abilities of the coverage resume; their own cursor, because the problem
    /// list and the unplaced list are cut at different row counts.
    unplaced_offset: usize,
    /// `None` when the caller named no limit: the page is then also held to its size.
    limit: Option<usize>,
    repo_root: Option<&'a str>,
}

impl<'a> PageRequest<'a> {
    /// The page a caller of `validate_vault` named.
    pub const fn asked(
        offset: usize,
        unplaced_offset: usize,
        limit: Option<usize>,
        repo_root: Option<&'a str>,
    ) -> Self {
        Self {
            offset,
            unplaced_offset,
            limit,
            repo_root,
        }
    }
}

/// The call that reads the rest of the rows: `validate_vault` with `offset`, or with nothing when
/// the first page already holds every row.
#[derive(Serialize)]
pub struct NextCall {
    tool: &'static str,
    arguments: NextCallArguments,
}

#[derive(Serialize)]
struct NextCallArguments {
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<usize>,
}

/// `pathDrift` as a brief carries it: how many paths were checked and how many drifted.
#[derive(Serialize)]
struct PathDriftCounts {
    checked: bool,
    #[serde(rename = "pathsChecked")]
    paths_checked: usize,
    drifts: usize,
}

/// `summaryFreshness` as a brief carries it.
#[derive(Serialize)]
struct SummaryFreshnessCount {
    checked: bool,
    #[serde(rename = "summaryNodes")]
    summary_nodes: usize,
    stale: usize,
}

/// `evidenceDrift` as a brief carries it: whether it was dated, and the counts.
#[derive(Serialize)]
struct EvidenceCountsOnly<'a> {
    checked: bool,
    counts: &'a EvidenceCounts,
}

/// The validation a brief, `health` or `workspace_brief` embeds: the counts, the first problem
/// files and the next call. The rows behind a count (stale evidence, unplaced abilities, the files
/// of a code, drifted paths) are `validate_vault`'s.
#[derive(Serialize)]
pub struct BriefValidation<'a> {
    #[serde(rename = "nextCall")]
    next_call: NextCall,
    scanned: usize,
    #[serde(rename = "problemsPagination")]
    pagination: Pagination,
    summary: ProblemSummary,
    problems: Vec<Problem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    coverage: Option<CoverageCounts<'a>>,
    #[serde(rename = "finalizeGate", skip_serializing_if = "Option::is_none")]
    finalize_gate: &'a Option<Vec<FinalizeBlock>>,
    #[serde(rename = "evidenceDrift")]
    evidence_drift: EvidenceCountsOnly<'a>,
    #[serde(rename = "summaryFreshness")]
    summary_freshness: SummaryFreshnessCount,
    #[serde(rename = "pathDrift")]
    path_drift: PathDriftCounts,
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

/// One finding with its message cut after the sentence that names the node.
struct Split {
    named: String,
    guidance: String,
}

/// Every problem file with the guidance a code repeats taken out of its findings, and that guidance
/// once per code. A code gets a remedy when two or more of its findings exist and all carry the
/// same guidance after their first sentence, with the node's own slug written as `<slug>`; a code
/// whose messages differ after that sentence (a file to read, a suggested path) keeps every
/// message whole.
fn split_repeated_remedies(problems: &[Problem]) -> (Vec<Problem>, HashMap<&'static str, String>) {
    let split: Vec<Vec<Split>> = problems
        .iter()
        .map(|row| {
            row.issues
                .iter()
                .map(|issue| {
                    let message = issue.message.clone().unwrap_or_default();
                    let named = first_sentence(&message);
                    let guidance = message
                        .get(named.len()..)
                        .unwrap_or_default()
                        .replace(&row.slug, OWN_SLUG);
                    Split {
                        named: named.to_string(),
                        guidance: trim(&guidance).to_string(),
                    }
                })
                .collect()
        })
        .collect();
    let mut total: HashMap<&'static str, usize> = HashMap::new();
    let mut shared: HashMap<&'static str, Vec<(String, usize)>> = HashMap::new();
    for (row, parts) in problems.iter().zip(&split) {
        for (issue, part) in row.issues.iter().zip(parts) {
            *total.entry(issue.code).or_default() += 1;
            if part.guidance.is_empty() {
                continue;
            }
            let seen = shared.entry(issue.code).or_default();
            match seen.iter_mut().find(|(held, _)| *held == part.guidance) {
                Some((_, count)) => *count += 1,
                None => seen.push((part.guidance.clone(), 1)),
            }
        }
    }
    let mut remedies: HashMap<&'static str, String> = HashMap::new();
    for (code, seen) in &shared {
        if let [(guidance, count)] = seen.as_slice() {
            if *count >= 2 && total.get(code) == Some(count) {
                remedies.insert(code, guidance.replace(OWN_SLUG, "<slug>"));
            }
        }
    }
    let kept = problems
        .iter()
        .zip(&split)
        .map(|(row, parts)| Problem {
            slug: row.slug.clone(),
            issues: row
                .issues
                .iter()
                .zip(parts)
                .map(|(issue, part)| {
                    let shares = remedies
                        .get(issue.code)
                        .is_some_and(|remedy| part.guidance.replace(OWN_SLUG, "<slug>") == *remedy);
                    if shares {
                        Issue {
                            message: Some(part.named.clone()),
                            ..issue.clone()
                        }
                    } else {
                        issue.clone()
                    }
                })
                .collect(),
        })
        .collect();
    (kept, remedies)
}

/// The tally of each code for a page: its remedy, and the files that are not on the page's rows,
/// at most twenty.
fn tallies_for_page(
    by_code: &TalliesByCode,
    remedies: &HashMap<&'static str, String>,
    on_page: &[&str],
) -> TalliesByCode {
    TalliesByCode(
        by_code
            .0
            .iter()
            .map(|(code, tally)| {
                let elsewhere: Vec<&String> = tally
                    .files
                    .iter()
                    .filter(|slug| !on_page.contains(&slug.as_str()))
                    .collect();
                let omitted = elsewhere.len().saturating_sub(FILES_SAMPLED_PER_CODE);
                (
                    *code,
                    CodeTally {
                        severity: tally.severity,
                        count: tally.count,
                        remedy: tally.remedy.clone().or_else(|| remedies.get(code).cloned()),
                        files: elsewhere
                            .into_iter()
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
    let coverage = frame
        .coverage
        .as_ref()
        .map(|measured| measured.page(request.unplaced_offset));
    let total = list.problems.len();
    let start = request.offset.min(total);
    let limit = request.limit.unwrap_or(DEFAULT_PAGE_LIMIT);
    let (shortened, remedies) = split_repeated_remedies(&list.problems);
    let wanted: Vec<Problem> = shortened.into_iter().skip(start).take(limit).collect();
    let on_page: Vec<&str> = wanted.iter().map(|row| row.slug.as_str()).collect();
    let summary = ProblemSummary {
        problem_files: list.summary.problem_files,
        error_files: list.summary.error_files,
        warning_files: list.summary.warning_files,
        by_code: tallies_for_page(&list.summary.by_code, &remedies, &on_page),
    };
    let mut rows = wanted.clone();
    let mut stopped_for_size = false;
    if request.limit.is_none() {
        let empty = Frame {
            scanned: frame.scanned,
            repo_root: frame.repo_root_missing.then_some(RepoRoot { missing: true }),
            coverage,
            finalize_gate: &frame.finalize_gate,
            problems: &[],
            summary: &summary,
            summary_freshness: &frame.summary_freshness,
            evidence_drift: evidence_rows(&frame.evidence_drift),
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
                if let Some(named) = request.limit {
                    arguments.push_str(&format!(",\"limit\":{named}"));
                }
                format!(". The next page: validate_vault({arguments}}}).")
            }
            None => ".".to_string(),
        };
        format!("{shown}{size}{next}")
    });
    ValidationPage {
        pagination: Pagination::of(start, limit, total, rows.len()),
        hint,
        scanned: frame.scanned,
        repo_root: frame.repo_root_missing.then_some(RepoRoot { missing: true }),
        coverage,
        finalize_gate: &frame.finalize_gate,
        problems: rows,
        summary,
        summary_freshness: &frame.summary_freshness,
        evidence_drift: evidence_rows(&frame.evidence_drift),
        path_drift: &frame.path_drift,
    }
}

/// The first three problem files and the counts behind everything else, for the tools that embed
/// the validation.
pub fn brief_validation<'a>(
    frame: &'a ValidationFrame,
    list: &ProblemList,
) -> BriefValidation<'a> {
    let total = list.problems.len();
    let (shortened, remedies) = split_repeated_remedies(&list.problems);
    let rows: Vec<Problem> = shortened.into_iter().take(BRIEF_PAGE_LIMIT).collect();
    let by_code = TalliesByCode(
        list.summary
            .by_code
            .0
            .iter()
            .map(|(code, tally)| {
                (
                    *code,
                    CodeTally {
                        severity: tally.severity,
                        count: tally.count,
                        remedy: tally.remedy.clone().or_else(|| remedies.get(code).cloned()),
                        files: Vec::new(),
                        files_omitted: None,
                    },
                )
            })
            .collect(),
    );
    let has_more = rows.len() < total;
    BriefValidation {
        next_call: NextCall {
            tool: "validate_vault",
            arguments: NextCallArguments {
                offset: has_more.then_some(rows.len()),
            },
        },
        scanned: frame.scanned,
        pagination: Pagination::of(0, BRIEF_PAGE_LIMIT, total, rows.len()),
        summary: ProblemSummary {
            problem_files: list.summary.problem_files,
            error_files: list.summary.error_files,
            warning_files: list.summary.warning_files,
            by_code,
        },
        problems: rows,
        coverage: frame.coverage.as_ref().map(Coverage::counts),
        finalize_gate: &frame.finalize_gate,
        evidence_drift: EvidenceCountsOnly {
            checked: frame.evidence_drift.checked,
            counts: &frame.evidence_drift.counts,
        },
        summary_freshness: SummaryFreshnessCount {
            checked: frame.summary_freshness.checked,
            summary_nodes: frame.summary_freshness.summary_nodes,
            stale: frame.summary_freshness.stale.len(),
        },
        path_drift: PathDriftCounts {
            checked: frame.path_drift.checked,
            paths_checked: frame.path_drift.paths_checked,
            drifts: frame.path_drift.drifts.len(),
        },
    }
}

#[cfg(test)]
mod tests {
    use build_depth::{Breadth, UnplacedRow};
    use serde_json::Value;

    use super::*;
    use crate::evidence_drift::EvidenceCounts;
    use crate::path_drift::path_drift_unchecked;
    use crate::problem_list::{ProblemSummary, TalliesByCode};

    fn row(slug: &str, message: &str) -> Problem {
        Problem {
            slug: slug.to_string(),
            issues: vec![Issue::warning("path-drift", message)],
        }
    }

    #[test]
    fn guidance_every_finding_of_a_code_repeats_is_said_once_as_its_remedy() {
        let guidance = " Fix the path in the frontmatter or remove the entry from the node.";
        let named = |slug: &str| {
            format!("\"{slug}\" cites a file that is no longer in the repository at all.")
        };
        let rows = vec![
            row("node-one", &format!("{}{guidance}", named("node-one"))),
            row("node-two", &format!("{}{guidance}", named("node-two"))),
        ];
        let (kept, remedies) = split_repeated_remedies(&rows);
        assert_eq!(kept[0].issues[0].message.as_deref(), Some(named("node-one").as_str()));
        assert_eq!(kept[1].issues[0].message.as_deref(), Some(named("node-two").as_str()));
        assert_eq!(
            remedies.get("path-drift").map(String::as_str),
            Some("Fix the path in the frontmatter or remove the entry from the node.")
        );
    }

    #[test]
    fn a_code_whose_findings_carry_different_guidance_keeps_every_message_whole() {
        let first = "\"node-one\" cites a file that is no longer in the repository at all. Read src/a.ts first.";
        let second = "\"node-two\" cites a file that is no longer in the repository at all. Read src/b.ts first.";
        let (kept, remedies) =
            split_repeated_remedies(&[row("node-one", first), row("node-two", second)]);
        assert!(remedies.is_empty());
        assert_eq!(kept[1].issues[0].message.as_deref(), Some(second));
    }

    fn frame_with_unplaced(unplaced: usize) -> ValidationFrame {
        ValidationFrame {
            scanned: 0,
            repo_root_missing: false,
            coverage: Some(Coverage {
                breadth: Breadth {
                    abilities: unplaced,
                    not_listed: 0,
                    node: 0,
                    named: 0,
                    excluded: 0,
                    unplaced: (0..unplaced)
                        .map(|at| UnplacedRow {
                            kind: "command",
                            name: format!("ability-{at}"),
                            evidence: format!("a.ts:L{at}"),
                            symbol: None,
                        })
                        .collect(),
                },
                areas: None,
                reads: None,
            }),
            finalize_gate: None,
            summary_freshness: SummaryFreshness {
                checked: true,
                summary_nodes: 0,
                stale: Vec::new(),
                hint: String::new(),
            },
            evidence_drift: EvidenceDrift {
                checked: false,
                reason: None,
                repo_root: None,
                counts: EvidenceCounts {
                    current: 0,
                    stale: 0,
                    missing: 0,
                    unknown: 0,
                    folder_only: 0,
                },
                stale: Vec::new(),
                missing: Vec::new(),
                folder_only: Vec::new(),
                hint: String::new(),
            },
            path_drift: path_drift_unchecked(String::new()),
        }
    }

    fn problem_list(files: usize) -> ProblemList {
        ProblemList {
            problems: (0..files)
                .map(|at| row(&format!("node-{at:03}"), "a short finding"))
                .collect(),
            summary: ProblemSummary {
                problem_files: files,
                error_files: 0,
                warning_files: files,
                by_code: TalliesByCode::default(),
            },
        }
    }

    fn names_in(answer: &Value, pointer: &str, key: &str) -> Vec<String> {
        answer
            .pointer(pointer)
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .filter_map(|row| row[key].as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default()
    }

    #[test]
    fn following_each_cursor_shows_every_problem_file_and_every_unplaced_ability_once() {
        let frame = frame_with_unplaced(47);
        let list = problem_list(150);
        let (mut problem_cursor, mut unplaced_cursor) = (Some(0usize), Some(0usize));
        let mut problems: Vec<String> = Vec::new();
        let mut unplaced: Vec<String> = Vec::new();
        let mut calls = 0;
        while problem_cursor.is_some() || unplaced_cursor.is_some() {
            calls += 1;
            assert!(calls <= 10, "the cursors never reached an end");
            let request = PageRequest::asked(
                problem_cursor.unwrap_or(list.problems.len()),
                unplaced_cursor.unwrap_or(usize::MAX),
                Some(100),
                None,
            );
            let page = serde_json::to_value(page_validation(&frame, &list, &request))
                .expect("serializes");
            problems.extend(names_in(&page, "/problems", "slug"));
            unplaced.extend(names_in(&page, "/coverage/breadth/unplaced/rows", "name"));
            problem_cursor = page["problemsPagination"]["nextOffset"]
                .as_u64()
                .map(|next| usize::try_from(next).expect("fits"));
            unplaced_cursor = page["coverage"]["breadth"]["unplaced"]["pagination"]["nextOffset"]
                .as_u64()
                .map(|next| usize::try_from(next).expect("fits"));
        }
        let expected_problems: Vec<String> = (0..150).map(|at| format!("node-{at:03}")).collect();
        let expected_unplaced: Vec<String> = (0..47).map(|at| format!("ability-{at}")).collect();
        assert_eq!(problems, expected_problems);
        assert_eq!(unplaced, expected_unplaced);
    }

    #[test]
    fn a_page_names_only_files_its_rows_do_not_and_a_brief_keeps_three_rows_and_the_counts() {
        let list = ProblemList {
            problems: (0..5)
                .map(|at| Problem {
                    slug: format!("node-{at}"),
                    issues: vec![Issue::warning("path-drift", "short")],
                })
                .collect(),
            summary: ProblemSummary {
                problem_files: 5,
                error_files: 0,
                warning_files: 5,
                by_code: TalliesByCode(vec![(
                    "path-drift",
                    CodeTally {
                        severity: vault_document::Severity::Warning,
                        count: 5,
                        remedy: None,
                        files: (0..5).map(|at| format!("node-{at}")).collect(),
                        files_omitted: None,
                    },
                )]),
            },
        };
        let frame = frame_with_unplaced(12);
        let page = serde_json::to_value(page_validation(
            &frame,
            &list,
            &PageRequest::asked(0, 0, Some(2), None),
        ))
        .expect("serializes");
        assert_eq!(
            page["summary"]["byCode"]["path-drift"]["files"],
            serde_json::json!(["node-2", "node-3", "node-4"])
        );
        let brief = serde_json::to_value(brief_validation(&frame, &list)).expect("serializes");
        assert_eq!(brief["problems"].as_array().map(Vec::len), Some(3));
        assert_eq!(brief["nextCall"]["arguments"]["offset"], 3);
        assert!(brief["summary"]["byCode"]["path-drift"].get("files").is_none());
        assert_eq!(brief["coverage"]["breadth"]["unplaced"], 12);
    }
}
