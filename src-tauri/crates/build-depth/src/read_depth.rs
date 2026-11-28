//! How deep a first map read, against the lines this session served and never against a body's
//! wording: which capabilities cite served lines that hold a condition, and which state a rule
//! without them. Opening a file, or line 1 of it, is not reading its rule.

use std::collections::HashSet;

use answer_format::json::quote;
use confined_files::SourceFiles;
use source_reads::ReadsUnder;
use vault_document::LoadedDocument;

use crate::line_cites::{cited_symbol, line_cites, served_lines, CitedText};
use crate::node_fields::{kind_of, node_path};
use crate::rule_without_read_lines::{cited_lines_decide, pre_section_paragraphs, states_rule};

const READ_CALL_SELECTORS: usize = 16;

/// A capability and the file and symbol its body names.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CapabilityRow {
    pub slug: String,
    pub path: Option<String>,
    pub symbol: Option<String>,
}

pub(crate) struct ReadDepth {
    /// Capabilities with a `path:`.
    pub capabilities: usize,
    /// Those citing no served line that holds a condition, by slug.
    pub unread: Vec<CapabilityRow>,
    /// Files this session served.
    pub served: usize,
}

pub(crate) struct RuleDepth {
    /// Capabilities that state a rule and cite no read lines that hold its condition.
    pub uncited: Vec<CapabilityRow>,
    /// Whether a cite was judged against served lines, which needs a read to exist.
    pub judged_against_reads: bool,
}

fn row_of(document: &LoadedDocument, body: &str) -> CapabilityRow {
    let path = node_path(document);
    CapabilityRow {
        slug: document.slug().to_string(),
        symbol: path.as_deref().and_then(|path| cited_symbol(body, path)),
        path,
    }
}

fn body_of(document: &LoadedDocument) -> String {
    document
        .body()
        .map(std::borrow::Cow::into_owned)
        .unwrap_or_default()
}

/// A capability counts as read when its body cites lines this session served that hold a
/// condition.
pub(crate) fn measure_reads(
    documents: &[LoadedDocument],
    reads: &ReadsUnder,
    source: Option<&dyn SourceFiles>,
) -> ReadDepth {
    let mut texts = CitedText::default();
    let capabilities: Vec<&LoadedDocument> = documents
        .iter()
        .filter(|document| kind_of(document) == "capability" && node_path(document).is_some())
        .collect();
    let mut unread: Vec<CapabilityRow> = capabilities
        .iter()
        .filter_map(|document| {
            let body = body_of(document);
            let read = line_cites(&body, source).iter().any(|cite| {
                served_lines(reads, cite) && cited_lines_decide(source, &mut texts, cite)
            });
            (!read).then(|| row_of(document, &body))
        })
        .collect();
    unread.sort_by(|left, right| left.slug.cmp(&right.slug));
    ReadDepth {
        capabilities: capabilities.len(),
        unread,
        served: reads.reads.len(),
    }
}

/// Capabilities whose body states a rule (a paragraph after the definition with a condition, an
/// order or a default) but cites no read lines that hold a condition. With this session's reads a
/// cite counts only when every cited line was served; with none, only the cited lines are
/// checked, since no read exists to judge a cite against.
pub(crate) fn measure_rules(
    documents: &[LoadedDocument],
    reads: Option<&ReadsUnder>,
    source: Option<&dyn SourceFiles>,
) -> RuleDepth {
    let judged = reads.filter(|reads| !reads.reads.is_empty());
    let mut texts = CitedText::default();
    let mut uncited = Vec::new();
    for document in documents.iter().filter(|document| kind_of(document) == "capability") {
        let body = body_of(document);
        let states = pre_section_paragraphs(&body)
            .iter()
            .skip(1)
            .any(|paragraph| states_rule(paragraph));
        if !states {
            continue;
        }
        let exact = line_cites(&body, source).iter().any(|cite| {
            judged.is_none_or(|reads| served_lines(reads, cite))
                && cited_lines_decide(source, &mut texts, cite)
        });
        if !exact {
            uncited.push(row_of(document, &body));
        }
    }
    RuleDepth {
        uncited,
        judged_against_reads: judged.is_some(),
    }
}

/// The exact call that reads the listed nodes' entry files, by symbol where the body names one.
pub(crate) fn read_call(rows: &[&CapabilityRow]) -> String {
    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut selectors: Vec<String> = Vec::new();
    for row in rows {
        let Some(path) = row.path.as_deref() else {
            continue;
        };
        let key = (path.to_string(), row.symbol.clone().unwrap_or_default());
        if selectors.len() >= READ_CALL_SELECTORS || !seen.insert(key) {
            continue;
        }
        selectors.push(match row.symbol.as_deref() {
            Some(symbol) => format!(r#"{{"path":{},"symbol":{}}}"#, quote(path), quote(symbol)),
            None => format!(r#"{{"path":{},"startLine":1,"maxLines":200}}"#, quote(path)),
        });
    }
    format!(
        r#"analyze_repo_structure({{"sourceOnly":true,"sourceReads":[{}]}})"#,
        selectors.join(",")
    )
}

/// The read and patch that give each listed rule its exact cite.
pub(crate) fn cite_repair(rows: &[&CapabilityRow]) -> String {
    let readable: Vec<&CapabilityRow> = rows.iter().copied().filter(|row| row.path.is_some()).collect();
    let read = if readable.is_empty() {
        String::new()
    } else {
        format!("{}, then ", read_call(&readable))
    };
    format!("{read}patch_concept each rule with the cite of the returned lines that hold its condition, as `path:L12-L30`")
}
