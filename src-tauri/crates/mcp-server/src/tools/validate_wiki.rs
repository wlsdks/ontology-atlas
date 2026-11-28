//! `validate_wiki`: the pages under `wiki/` judged against their own contract, which `validate_vault`
//! cannot do (a wiki page carries no `kind:` by contract). The whole-folder answer is paged by
//! failing page in path order, with a cursor (`afterPath`) that survives a repair between calls.
//! Every page is judged against the whole folder, since a page asked about alone would read as an
//! orphan. Read-only.

use std::collections::HashSet;

use answer_format::json::to_string;
use answer_format::utf16;
use repository_survey::repo_text;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use serde_json::Value;
use wiki_pages::{
    check_page, is_advisory_code, is_wiki_furniture_slug, judge_folder, ConceptEntry,
    ConceptIndex, Detail, FolderPage, PageCheck, Problem, Values, WIKI_DIR,
};

use super::argument_checks::{
    argument, optional_non_negative_integer, optional_positive_integer,
};
use super::read_vault::read_vault;
use super::reply_bytes::reply_bytes;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const DEFAULT_LIMIT: usize = 100;
const MAXIMUM_LIMIT: f64 = 500.0;
/// Problems shown per page; the rest are counted, so one page cannot fill a reply.
const PROBLEMS_PER_PAGE: usize = 20;
/// Longest message shown: a longer one names repository text (a page or source path) at length.
const MESSAGE_CHARS: usize = 2000;
/// A reply left at the default `limit` stops before it would pass this many bytes.
const REPLY_BUDGET_BYTES: usize = 128 * 1024;
const FILES_SAMPLED_PER_CODE: usize = 20;

/// One page as judged: its findings, own first and the folder's after.
struct Verdict {
    path: String,
    problems: Vec<Problem>,
}

impl Verdict {
    fn codes(&self) -> Vec<&str> {
        let mut codes: Vec<&str> = Vec::new();
        for problem in &self.problems {
            if !codes.contains(&problem.code.as_str()) {
                codes.push(&problem.code);
            }
        }
        codes
    }

    fn ok(&self) -> bool {
        self.problems.is_empty()
    }

    /// Whether any finding is more than advisory.
    fn blocking(&self) -> bool {
        self.problems.iter().any(|problem| !is_advisory_code(&problem.code))
    }
}

#[derive(Serialize)]
struct ShownPage {
    path: String,
    ok: bool,
    blocking: bool,
    problems: Vec<Problem>,
    #[serde(rename = "problemsOmitted", skip_serializing_if = "Option::is_none")]
    problems_omitted: Option<usize>,
}

/// A page as a reply shows it: at most `keep` findings with the rest counted, each message escaped
/// because it quotes page and source names verbatim. Paths and `detail.values` stay exact: they are
/// data a caller passes back, not prose.
fn shown_page(page: &Verdict, keep: usize) -> ShownPage {
    ShownPage {
        path: page.path.clone(),
        ok: page.ok(),
        blocking: page.blocking(),
        problems: page
            .problems
            .iter()
            .take(keep)
            .map(|problem| Problem {
                message: repo_text(&problem.message, MESSAGE_CHARS),
                ..problem.clone()
            })
            .collect(),
        problems_omitted: (page.problems.len() > keep).then(|| page.problems.len() - keep),
    }
}

/// The last resort for a page whose first finding alone is larger than a reply: its repository text
/// is cut, with the cut counted, so a walk always moves forward.
fn page_cut_to_one_finding(page: &Verdict) -> ShownPage {
    let mut shown = shown_page(page, 1);
    if let Some(first) = page.problems.first() {
        let detail = first.detail.as_ref().map(|detail| Detail {
            key: detail.key,
            values: detail.values.as_ref().map(|values| {
                Values(
                    values
                        .0
                        .iter()
                        .map(|(key, value)| (*key, repo_text(value, 200)))
                        .collect(),
                )
            }),
        });
        shown.problems = vec![Problem {
            code: first.code.clone(),
            message: repo_text(&first.message, 1000),
            line: first.line,
            detail,
        }];
    }
    shown
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

#[derive(Serialize)]
struct NextArguments {
    #[serde(rename = "afterPath")]
    after_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<usize>,
}

#[derive(Serialize)]
struct NextCall {
    tool: &'static str,
    arguments: NextArguments,
}

#[derive(Serialize)]
struct CodeRow {
    severity: &'static str,
    count: usize,
    files: Vec<String>,
    #[serde(rename = "filesOmitted", skip_serializing_if = "Option::is_none")]
    files_omitted: Option<usize>,
}

/// Rows written as one object in the order given.
struct ByCode(Vec<(String, CodeRow)>);

impl Serialize for ByCode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (code, row) in &self.0 {
            map.serialize_entry(code, row)?;
        }
        map.end()
    }
}

#[derive(Serialize)]
struct Summary {
    #[serde(rename = "blockingPages")]
    blocking_pages: usize,
    #[serde(rename = "advisoryOnlyPages")]
    advisory_only_pages: usize,
    #[serde(rename = "byCode")]
    by_code: ByCode,
}

#[derive(Serialize)]
struct Paged {
    #[serde(rename = "pageCount")]
    page_count: usize,
    #[serde(rename = "failingCount")]
    failing_count: usize,
    pagination: Pagination,
    #[serde(rename = "nextCall", skip_serializing_if = "Option::is_none")]
    next_call: Option<NextCall>,
    #[serde(rename = "pagesHint", skip_serializing_if = "Option::is_none")]
    pages_hint: Option<String>,
    summary: Summary,
    pages: Vec<ShownPage>,
}

#[derive(Serialize)]
struct Named {
    #[serde(rename = "pageCount")]
    page_count: usize,
    #[serde(rename = "failingCount")]
    failing_count: usize,
    pages: Vec<ShownPage>,
}

fn invalid_cursor() -> ToolError {
    ToolError::failed(
        "validate_wiki: `afterPath` is a page path, copied from the last reply's `nextCall`.",
    )
}

/// What a JavaScript `String(value)` makes of a path the agent sent.
fn path_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the arguments were checked to be whole numbers from zero up to 500, or a page start"
)]
fn count(number: f64) -> usize {
    number as usize
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let paths = match argument(arguments, "paths")? {
        None => None,
        Some(Value::Array(items)) => Some(items.iter().map(path_text).collect::<Vec<_>>()),
        Some(_) => {
            return Err(ToolError::invalid(
                "validate_wiki: `paths` must be an array of vault-relative page paths.",
            ))
        }
    };
    let offset = optional_non_negative_integer(arguments, "offset", None)?.map(count);
    let limit = optional_positive_integer(arguments, "limit", Some(MAXIMUM_LIMIT))?.map(count);
    let cursor = match argument(arguments, "afterPath")? {
        None => None,
        Some(Value::String(text)) if !text.is_empty() => Some(text),
        Some(_) => return Err(invalid_cursor()),
    };
    if cursor.is_some() && offset.is_some() {
        return Err(ToolError::failed(
            "validate_wiki: `afterPath` resumes where the last reply stopped and `offset` counts from the start; pass one or the other.",
        ));
    }
    if paths.is_some() && (offset.is_some() || limit.is_some() || cursor.is_some()) {
        return Err(ToolError::failed(
            "validate_wiki: `offset`, `limit` and `afterPath` page the whole folder; with `paths` every named page is returned, so pass one or the other.",
        ));
    }
    let judged = judge_pages(context, paths.as_deref())?;
    match paths {
        Some(_) => {
            let failing = judged.iter().filter(|page| !page.ok()).count();
            ToolOutput::json(&Named {
                page_count: judged.len(),
                failing_count: failing,
                pages: judged
                    .iter()
                    .map(|page| shown_page(page, PROBLEMS_PER_PAGE))
                    .collect(),
            })
        }
        None => {
            let page = Request {
                offset: offset.unwrap_or(0),
                cursor,
                limit: limit.unwrap_or(DEFAULT_LIMIT),
                budgeted: limit.is_none(),
                caller_limit: limit,
            };
            ToolOutput::json(&page_failures(&judged, &page)?)
        }
    }
}

/// The pages of the folder, or the named `paths`, judged against the whole folder.
fn judge_pages(
    context: &CallContext<'_>,
    paths: Option<&[String]>,
) -> Result<Vec<Verdict>, ToolError> {
    let read = read_vault(context)?;
    let known_sources: HashSet<String> = read.root.raw_source_paths().into_iter().collect();
    let documents = read.vault.documents();
    let concepts = ConceptIndex::new(documents.iter().map(|document| ConceptEntry {
        slug: document.slug(),
        kind: document.frontmatter().text("kind"),
        alias: document.frontmatter().text("slug"),
    }));
    let wiki_prefix = format!("{WIKI_DIR}/");
    let read_page = |slug: &str, file: &confined_files::ConfinedPath| -> Result<PageCheck, ToolError> {
        let raw = file.read_text().map_err(|error| {
            ToolError::failed(format!("Could not read the file of \"{slug}\": {error}"))
        })?;
        Ok(check_page(&raw, Some(&known_sources), Some(&concepts)))
    };

    let mut folder: Vec<(String, PageCheck)> = Vec::new();
    for document in documents {
        let slug = document.slug();
        if slug.starts_with(&wiki_prefix) && !is_wiki_furniture_slug(slug) {
            folder.push((format!("{slug}.md"), read_page(slug, document.file())?));
        }
    }
    folder.sort_by(|left, right| utf16::compare(&left.0, &right.0));
    let folder_pages: Vec<FolderPage<'_>> = folder
        .iter()
        .map(|(path, check)| FolderPage {
            path,
            sources: &check.sources,
            links: &check.links,
        })
        .collect();
    let mut folder_problems = judge_folder(&folder_pages);

    let mut verdict_of_folder = |index: usize| -> Verdict {
        let (path, check) = &folder[index];
        let mut problems = check.problems.clone();
        problems.append(&mut std::mem::take(&mut folder_problems[index]));
        Verdict {
            path: path.clone(),
            problems,
        }
    };

    let Some(paths) = paths else {
        return Ok((0..folder.len()).map(verdict_of_folder).collect());
    };
    let mut verdicts = Vec::with_capacity(paths.len());
    for path in paths {
        if !path.starts_with(&wiki_prefix) {
            verdicts.push(Verdict {
                path: path.clone(),
                problems: vec![Problem::plain(
                    "not-a-wiki-page",
                    format!("`{path}` is not under `{wiki_prefix}`, so the wiki page contract does not apply to it."),
                )],
            });
            continue;
        }
        let slug = path.strip_suffix(".md").unwrap_or(path);
        let Some(document) = documents.iter().find(|document| document.slug() == slug) else {
            verdicts.push(Verdict {
                path: path.clone(),
                problems: vec![Problem::plain(
                    "page-missing",
                    format!("`{path}` is not in this folder."),
                )],
            });
            continue;
        };
        match folder.iter().position(|(held, _)| held == path) {
            Some(index) => verdicts.push(verdict_of_folder(index)),
            None => verdicts.push(Verdict {
                path: path.clone(),
                problems: read_page(slug, document.file())?.problems,
            }),
        }
    }
    Ok(verdicts)
}

struct Request {
    offset: usize,
    cursor: Option<String>,
    limit: usize,
    /// Left at the default `limit`: the reply stops before it passes the budget.
    budgeted: bool,
    caller_limit: Option<usize>,
}

/// One page of the failing pages, in path order. Passing pages are counted, never listed; each
/// listed page says whether it is `blocking`, and the summary samples blocking pages first.
fn page_failures(judged: &[Verdict], request: &Request) -> Result<Paged, ToolError> {
    let failing: Vec<&Verdict> = judged.iter().filter(|page| !page.ok()).collect();
    let blocking_first: Vec<&Verdict> = failing
        .iter()
        .copied()
        .filter(|page| page.blocking())
        .chain(failing.iter().copied().filter(|page| !page.blocking()))
        .collect();
    let blocking_pages = failing.iter().filter(|page| page.blocking()).count();

    let mut rows: Vec<(String, CodeRow)> = Vec::new();
    for page in &blocking_first {
        for code in page.codes() {
            let at = match rows.iter().position(|(held, _)| held == code) {
                Some(at) => at,
                None => {
                    let severity = if is_advisory_code(code) { "warning" } else { "error" };
                    rows.push((
                        code.to_string(),
                        CodeRow {
                            severity,
                            count: 0,
                            files: Vec::new(),
                            files_omitted: None,
                        },
                    ));
                    rows.len() - 1
                }
            };
            if let Some((_, row)) = rows.get_mut(at) {
                row.count += 1;
                if row.files.len() < FILES_SAMPLED_PER_CODE {
                    row.files.push(page.path.clone());
                }
            }
        }
    }
    rows.sort_by(|left, right| utf16::compare(&left.0, &right.0));
    for (_, row) in &mut rows {
        row.files_omitted = (row.count > row.files.len()).then(|| row.count - row.files.len());
    }
    let summary = Summary {
        blocking_pages,
        advisory_only_pages: failing.len() - blocking_pages,
        by_code: ByCode(rows),
    };

    let total = failing.len();
    let start = match &request.cursor {
        Some(cursor) => failing
            .iter()
            .position(|page| utf16::compare(&page.path, cursor).is_gt())
            .unwrap_or(total),
        None => request.offset.min(total),
    };
    let window: Vec<&Verdict> = failing.iter().copied().skip(start).take(request.limit).collect();
    let slice: Vec<ShownPage> = window.iter().map(|page| shown_page(page, PROBLEMS_PER_PAGE)).collect();

    let build = |count: usize, replaced: Option<ShownPage>, summary: Summary| -> Paged {
        let end = start + count;
        let next_offset = (end < total).then_some(end);
        let after = next_offset
            .and_then(|_| window.get(count.wrapping_sub(1)))
            .map(|page| page.path.clone());
        let stopped_for_size = count < slice.len() || replaced.is_some();
        let mut hint = if count > 0 {
            format!("Failing pages {}-{end} of {total}, by path", start + 1)
        } else {
            format!("No failing pages from position {start}; the folder has {total}")
        };
        if stopped_for_size {
            hint.push_str("; the reply stopped short to stay within 128 KiB");
        }
        hint.push_str(if after.is_some() {
            ". Call nextCall.arguments next: it resumes after the last page shown, so every page failing for the whole walk is listed once. A page renamed during the walk appears under its new path only if that path sorts after the last page shown; run the walk again to be complete. The folder is clean only when failingCount is 0."
        } else {
            "."
        });
        let pages = match replaced {
            Some(page) => vec![page],
            None => slice_of(&window, count),
        };
        Paged {
            page_count: judged.len(),
            failing_count: total,
            pagination: Pagination {
                offset: start,
                limit: request.limit,
                total,
                returned: count,
                has_more: next_offset.is_some(),
                next_offset,
            },
            next_call: after.map(|after_path| NextCall {
                tool: "validate_wiki",
                arguments: NextArguments {
                    after_path,
                    limit: request.caller_limit,
                },
            }),
            pages_hint: (start > 0 || next_offset.is_some()).then(|| repo_text(&hint, 1000)),
            summary,
            pages,
        }
    };
    let fits = |reply: &Paged| -> Result<bool, ToolError> {
        let text = to_string(reply).map_err(|error| ToolError::failed(error.to_string()))?;
        Ok(reply_bytes(&text) <= REPLY_BUDGET_BYTES)
    };
    let summary_of = || Summary {
        blocking_pages: summary.blocking_pages,
        advisory_only_pages: summary.advisory_only_pages,
        by_code: ByCode(
            summary
                .by_code
                .0
                .iter()
                .map(|(code, row)| {
                    (
                        code.clone(),
                        CodeRow {
                            severity: row.severity,
                            count: row.count,
                            files: row.files.clone(),
                            files_omitted: row.files_omitted,
                        },
                    )
                })
                .collect(),
        ),
    };

    if !request.budgeted || slice.is_empty() {
        return Ok(build(slice.len(), None, summary_of()));
    }
    if fits(&build(slice.len(), None, summary_of()))? {
        return Ok(build(slice.len(), None, summary_of()));
    }
    // The reply grows with every page it keeps, so the largest count that fits is found by
    // bisection: a logarithmic number of serializations of at most one page of text.
    let (mut fitting, mut over) = (0usize, slice.len());
    while over - fitting > 1 {
        let middle = (fitting + over) / 2;
        if fits(&build(middle, None, summary_of()))? {
            fitting = middle;
        } else {
            over = middle;
        }
    }
    if fitting > 0 {
        return Ok(build(fitting, None, summary_of()));
    }
    // Even one page is too large: keep as many of its findings as fit, else cut its first.
    let Some(first) = window.first() else {
        return Ok(build(0, None, summary_of()));
    };
    let (mut kept, mut too_many) = (0usize, first.problems.len().min(PROBLEMS_PER_PAGE) + 1);
    while too_many - kept > 1 {
        let middle = (kept + too_many) / 2;
        if fits(&build(1, Some(shown_page(first, middle)), summary_of()))? {
            kept = middle;
        } else {
            too_many = middle;
        }
    }
    let page = if kept > 0 {
        shown_page(first, kept)
    } else {
        page_cut_to_one_finding(first)
    };
    Ok(build(1, Some(page), summary_of()))
}

fn slice_of(window: &[&Verdict], count: usize) -> Vec<ShownPage> {
    window
        .iter()
        .take(count)
        .map(|page| shown_page(page, PROBLEMS_PER_PAGE))
        .collect()
}
