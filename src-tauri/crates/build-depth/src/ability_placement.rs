//! Where every ability the survey lists sits on the map:
//! - `Node`: a capability or element whose `path:` is its file and which names it (or is the
//!   file's only ability);
//! - `Named`: a capability or element whose title names it, or whose body names it in code form
//!   (`list`, `--force`, its `path:Lline`); a family or module API when half its members are named
//!   that way. A word in passing ("users list invoices") places nothing;
//! - `Excluded`: one line in the project's `## Uncertainty` or `## Excludes` that points at
//!   exactly this ability, by its `path:Lline` or its exact name, and says why. A line that names
//!   several abilities excludes none of them.
//!
//! Domains and the project do not place an ability: a word in a domain sentence is not a node a
//! reader finds.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;
use repository_survey::{AbilityKind, AbilityRow};
use vault_document::LoadedDocument;

use crate::line_cites::pattern;
use crate::name_matching::{
    cites_evidence, code_tokens, exactly_named, flag_named, gives_reason, named_in_code,
    names_word, title_names,
};
use crate::node_fields::{kind_of, node_path, project_of, section_of};

/// A line of the project's Uncertainty that is a `Not mapped yet` line: the summary or one area.
pub(crate) static NOT_MAPPED_LINE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i-u)^\s*(?:[-*+]\s+)?Not mapped yet:"));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Placement {
    Node,
    Named,
    Excluded,
    Unplaced,
}

struct NamingNode<'a> {
    path: Option<String>,
    title: &'a str,
    body: String,
    tokens: HashSet<String>,
}

fn is_member_kind(kind: AbilityKind) -> bool {
    matches!(kind, AbilityKind::Family | AbilityKind::Api)
}

fn names(node: &NamingNode<'_>, row: &AbilityRow) -> bool {
    if title_names(node.title, row) || named_in_code(&node.body, row, &node.tokens) {
        return true;
    }
    match row.kind {
        AbilityKind::Flags => {
            let members = row.members.as_deref().unwrap_or_default();
            (!row.name.starts_with("--") && node.tokens.contains(&row.name))
                || members
                    .iter()
                    .filter(|member| flag_named(&node.body, member))
                    .count()
                    * 2
                    >= members.len().max(2)
        }
        AbilityKind::Executable => {
            let folder = row.path.rsplit_once('/').map_or(".", |(folder, _)| folder);
            node.body.contains(folder)
        }
        _ => false,
    }
}

/// The rows the project's lines exclude, by index into `abilities`.
fn excluded_rows(documents: &[LoadedDocument], abilities: &[AbilityRow]) -> HashSet<usize> {
    let mut excluded = HashSet::new();
    let Some(project) = project_of(documents) else {
        return excluded;
    };
    let Ok(body) = project.body() else {
        return excluded;
    };
    let text = format!(
        "{}\n{}",
        section_of(&body, "Uncertainty"),
        section_of(&body, "Excludes")
    );
    for line in text
        .split('\n')
        .filter(|line| !line.trim().is_empty() && !NOT_MAPPED_LINE.is_match(line))
    {
        let tokens = code_tokens(line);
        let cited: Vec<usize> = (0..abilities.len())
            .filter(|at| {
                abilities
                    .get(*at)
                    .is_some_and(|row| cites_evidence(line, &row.evidence))
            })
            .collect();
        let pointed: Vec<usize> = if cited.is_empty() {
            (0..abilities.len())
                .filter(|at| {
                    abilities.get(*at).is_some_and(|row| {
                        named_in_code(line, row, &tokens) || exactly_named(line, row)
                    })
                })
                .collect()
        } else {
            cited
        };
        if let [only] = pointed.as_slice() {
            if let Some(row) = abilities.get(*only) {
                if gives_reason(line, &[row]) {
                    excluded.insert(*only);
                }
            }
        }
    }
    excluded
}

/// The placement of each of `abilities`, in the order given.
pub(crate) fn place_abilities(
    documents: &[LoadedDocument],
    abilities: &[AbilityRow],
) -> Vec<Placement> {
    let bodies: Vec<(&LoadedDocument, String)> = documents
        .iter()
        .filter(|document| matches!(kind_of(document), "capability" | "element"))
        .map(|document| (document, document.body().map(|body| body.into_owned()).unwrap_or_default()))
        .collect();
    let nodes: Vec<NamingNode<'_>> = bodies
        .into_iter()
        .map(|(document, body)| NamingNode {
            path: node_path(document),
            title: document.frontmatter().text("title").unwrap_or(""),
            tokens: code_tokens(&body),
            body,
        })
        .collect();
    let excluded = excluded_rows(documents, abilities);
    let mut in_file: HashMap<&str, usize> = HashMap::new();
    for row in abilities {
        *in_file.entry(row.path.as_str()).or_insert(0) += 1;
    }
    let member_named = |member: &str| {
        nodes
            .iter()
            .any(|node| node.tokens.contains(member) || names_word(node.title, member))
    };
    abilities
        .iter()
        .enumerate()
        .map(|(at, row)| {
            let rest = if excluded.contains(&at) {
                Placement::Excluded
            } else {
                Placement::Unplaced
            };
            if is_member_kind(row.kind) {
                let members = row.members.as_deref().unwrap_or_default();
                let named = members.iter().filter(|member| member_named(member)).count();
                let by_code = nodes
                    .iter()
                    .any(|node| named_in_code(&node.body, row, &node.tokens));
                return if named * 2 >= members.len() || by_code {
                    Placement::Named
                } else {
                    rest
                };
            }
            let only_one_here = in_file.get(row.path.as_str()).copied() == Some(1);
            if nodes.iter().any(|node| {
                node.path.as_deref() == Some(row.path.as_str())
                    && (only_one_here || names(node, row))
            }) {
                Placement::Node
            } else if nodes.iter().any(|node| names(node, row)) {
                Placement::Named
            } else {
                rest
            }
        })
        .collect()
}
