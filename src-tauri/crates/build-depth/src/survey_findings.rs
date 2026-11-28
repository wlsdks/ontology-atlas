//! The findings that need the repository survey or this session's reads: a relation note about
//! nodes nobody read, a `path:` on a file without code, a path many nodes share, and a project
//! whose `Not mapped yet` summary is not the measured one. Each message names the node and the
//! files; what to do is the code's remedy, stated once per answer.

use std::collections::HashMap;

use confined_files::SourceFiles;
use repository_survey::Collection;
use source_reads::ReadsUnder;
use vault_document::frontmatter::Value;
use vault_document::{Issue, LoadedDocument};

use crate::area_coverage::AreaCoverage;
use crate::code_in_text::has_code;
use crate::line_cites::{cited_symbol, read_small_source};
use crate::node_fields::{
    kind_of, node_path, project_of, refs_of, says_outlined_only, SlugResolver,
};
use crate::not_mapped_lines::line_gap;

/// Nodes sharing one `path:` beyond this many are told apart by their file.
const SHARED_PATH_LIMIT: usize = 5;
const SHARED_PATH_LISTED: usize = 6;
const NEARBY_FILES: usize = 3;
const NOTE_KEYS: [(&str, &str); 5] = [
    ("dependencies", "depends_on"),
    ("depends_on", "depends_on"),
    ("relates", "relates"),
    ("elements", "elements"),
    ("capabilities", "capabilities"),
];

/// Up to three product files near `path`, longest first: its unit's, then its folder's.
fn nearby_files(collection: &Collection, path: &str) -> Vec<String> {
    let unit = collection.unit_of_file.get(path).copied();
    let folder = path.rsplit_once('/').map_or("", |(folder, _)| folder);
    let in_folder = format!("{folder}/");
    let mut candidates: Vec<(&str, usize)> = collection
        .product_files_listed()
        .filter(|file| file.path != path && file.lines > 0)
        .filter(|file| {
            (unit.is_some() && collection.unit_of_file.get(&file.path).copied() == unit)
                || file.path.starts_with(&in_folder)
        })
        .map(|file| (file.path.as_str(), file.lines))
        .collect();
    candidates.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| answer_format::collation::compare_text(left.0, right.0))
    });
    candidates
        .into_iter()
        .take(NEARBY_FILES)
        .map(|(path, _)| path.to_string())
        .collect()
}

fn nearby_text(collection: &Collection, path: &str) -> String {
    let nearby = nearby_files(collection, path);
    if nearby.is_empty() {
        String::new()
    } else {
        format!("; nearby: {}", nearby.join(", "))
    }
}

/// Whether a node's subject was left unread: with this session's reads, a node whose `path:` file
/// was never served; without them (a restarted server), a node whose `## Uncertainty` says so.
fn is_unread(document: &LoadedDocument, reads: &ReadsUnder) -> bool {
    if reads.reads.is_empty() {
        return document
            .body()
            .is_ok_and(|body| says_outlined_only(&body));
    }
    node_path(document).is_some_and(|path| !reads.reads.contains_key(&path))
}

fn relation_note_findings(
    documents: &[LoadedDocument],
    reads: &ReadsUnder,
) -> Vec<(String, Issue)> {
    let resolver = SlugResolver::of(documents);
    let by_slug: HashMap<&str, &LoadedDocument> = documents
        .iter()
        .map(|document| (document.slug(), document))
        .collect();
    let mut findings = Vec::new();
    for document in documents {
        let Some(notes) = document
            .frontmatter()
            .get("relation_notes")
            .and_then(Value::as_map)
        else {
            continue;
        };
        let mut listed: Vec<&str> = Vec::new();
        for (key, _) in NOTE_KEYS {
            listed.extend(refs_of(document, &[key]));
        }
        for (reference, note) in notes.iter() {
            let says_something = matches!(
                note,
                vault_document::frontmatter::Scalar::Text(text)
                    if !answer_format::whitespace::trim(text).is_empty()
            );
            if !says_something || !listed.contains(&reference.as_str()) {
                continue;
            }
            let Some(target) = resolver
                .resolve(reference)
                .and_then(|slug| by_slug.get(slug).copied())
            else {
                continue;
            };
            let unread: Vec<&LoadedDocument> = [document, target]
                .into_iter()
                .filter(|node| is_unread(node, reads))
                .collect();
            if unread.is_empty() {
                continue;
            }
            let names: Vec<&str> = unread.iter().map(|node| node.slug()).collect();
            let reason = if reads.reads.is_empty() {
                "says it was not read"
            } else if unread.len() > 1 {
                "were never read this session"
            } else {
                "was never read this session"
            };
            let selectors: Vec<String> = unread
                .iter()
                .filter_map(|node| {
                    let path = node_path(node)?;
                    let body = node.body().ok()?;
                    Some(match cited_symbol(&body, &path) {
                        Some(symbol) => format!("`{path}` symbol `{symbol}`"),
                        None => format!("`{path}`"),
                    })
                })
                .collect();
            let read = if selectors.is_empty() {
                String::new()
            } else {
                format!("; read {}", selectors.join(", "))
            };
            findings.push((
                document.slug().to_string(),
                Issue::warning(
                    "relation-note-on-unread",
                    format!(
                        "The why on {} -> {} says how they work together, but {} {reason}{read}",
                        document.slug(),
                        target.slug(),
                        names.join(" and ")
                    ),
                ),
            ));
        }
    }
    findings
}

fn entry_path_findings(
    documents: &[LoadedDocument],
    source: &dyn SourceFiles,
    collection: &Collection,
) -> Vec<(String, Issue)> {
    let mut findings = Vec::new();
    let mut by_path: Vec<(String, Vec<&str>)> = Vec::new();
    let mut at: HashMap<String, usize> = HashMap::new();
    for document in documents {
        if !matches!(kind_of(document), "capability" | "element") {
            continue;
        }
        let Some(path) = node_path(document) else {
            continue;
        };
        match at.get(&path) {
            Some(index) => {
                if let Some((_, slugs)) = by_path.get_mut(*index) {
                    slugs.push(document.slug());
                }
            }
            None => {
                at.insert(path.clone(), by_path.len());
                by_path.push((path.clone(), vec![document.slug()]));
            }
        }
        let Some(text) = read_small_source(source, &path) else {
            continue;
        };
        if has_code(&text, &path) {
            continue;
        }
        findings.push((
            document.slug().to_string(),
            Issue::warning(
                "path-without-code",
                format!(
                    "path: {path} holds no code{}",
                    nearby_text(collection, &path)
                ),
            ),
        ));
    }
    for (path, slugs) in by_path {
        if slugs.len() <= SHARED_PATH_LIMIT {
            continue;
        }
        let more = slugs.len().saturating_sub(SHARED_PATH_LISTED);
        let mut listed = slugs
            .iter()
            .take(SHARED_PATH_LISTED)
            .copied()
            .collect::<Vec<_>>()
            .join(", ");
        if more > 0 {
            listed.push_str(&format!(" and {more} more"));
        }
        let message = format!(
            "{} nodes share path: {path} ({listed}){}",
            slugs.len(),
            nearby_text(collection, &path)
        );
        for slug in slugs {
            findings.push((
                slug.to_string(),
                Issue::warning("path-shared", message.clone()),
            ));
        }
    }
    findings
}

fn not_mapped_line_findings(
    documents: &[LoadedDocument],
    coverage: Option<&AreaCoverage<'_>>,
) -> Vec<(String, Issue)> {
    let (Some(project), Some(coverage)) = (project_of(documents), coverage) else {
        return Vec::new();
    };
    let Ok(body) = project.body() else {
        return Vec::new();
    };
    line_gap(&body, coverage).map_or_else(Vec::new, |gap| {
        vec![(
            project.slug().to_string(),
            Issue::warning(
                "not-mapped-line-mismatch",
                format!("{} {gap}", project.slug()),
            ),
        )]
    })
}

/// What the survey and the session's reads give the findings besides the vault itself.
pub(crate) struct SurveyEvidence<'a> {
    pub source: &'a dyn SourceFiles,
    pub collection: &'a Collection,
    pub reads: &'a ReadsUnder,
}

pub(crate) fn survey_findings(
    documents: &[LoadedDocument],
    evidence: &SurveyEvidence<'_>,
    coverage: Option<&AreaCoverage<'_>>,
) -> Vec<(String, Issue)> {
    let mut findings = relation_note_findings(documents, evidence.reads);
    findings.extend(entry_path_findings(
        documents,
        evidence.source,
        evidence.collection,
    ));
    findings.extend(not_mapped_line_findings(documents, coverage));
    findings
}
