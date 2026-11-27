//! Which node a name an agent typed means, and the sentence that helps when it means none.

use answer_format::whitespace::trim;

use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::query_error::QueryError;

/// The most slugs a not-found sentence offers.
const SUGGESTION_LIMIT: usize = 3;

fn last_segment(slug: &str) -> &str {
    let tail = slug.rsplit('/').next().unwrap_or(slug);
    if tail.is_empty() {
        slug
    } else {
        tail
    }
}

/// Slugs near `candidate`, for a name that matched none: the same last segment first, then a last
/// segment a few edits away (nearest first), then any slug that contains the name or is contained
/// in it.
fn suggest_slugs(graph: &CompiledGraph, candidate: &str) -> Vec<String> {
    let lower_tail = last_segment(candidate).to_lowercase();
    let lower_name = candidate.to_lowercase();
    let mut same_tail: Vec<&str> = Vec::new();
    let mut typos: Vec<(usize, &str)> = Vec::new();
    let mut containing: Vec<&str> = Vec::new();
    let tail_units: Vec<u16> = lower_tail.encode_utf16().collect();
    for node in graph.nodes() {
        let slug = node.slug.as_str();
        if slug == candidate {
            continue;
        }
        let candidate_tail = last_segment(slug).to_lowercase();
        if candidate_tail == lower_tail {
            same_tail.push(slug);
            continue;
        }
        let units: Vec<u16> = candidate_tail.encode_utf16().collect();
        let allowed = (units.len() / 3).max(2);
        if units.len().abs_diff(tail_units.len()) <= allowed {
            let distance = strsim::generic_levenshtein(&tail_units, &units);
            if distance <= allowed {
                typos.push((distance, slug));
                continue;
            }
        }
        if candidate_tail.contains(&lower_tail)
            || lower_tail.contains(&candidate_tail)
            || slug.to_lowercase().contains(&lower_name)
        {
            containing.push(slug);
        }
    }
    typos.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| answer_format::collation::compare_text(left.1, right.1))
    });
    same_tail
        .into_iter()
        .chain(typos.into_iter().map(|(_, slug)| slug))
        .chain(containing)
        .take(SUGGESTION_LIMIT)
        .map(String::from)
        .collect()
}

/// The node `input` names, as a slug or as an alias that names one node. `field` is the argument
/// the name came from.
pub fn resolve(
    graph: &CompiledGraph,
    input: Option<&str>,
    field: &'static str,
) -> Result<NodeId, QueryError> {
    let Some(input) = input.filter(|text| !trim(text).is_empty()) else {
        return Err(QueryError::Invalid(format!(
            "{field} (string) is required."
        )));
    };
    let candidate = trim(input);
    if let Some(node) = graph.resolve_name(candidate) {
        return Ok(node);
    }
    if let Some(entry) = graph
        .ambiguous_aliases()
        .iter()
        .find(|entry| entry.alias == candidate)
    {
        return Err(QueryError::Failed(format!(
            "{field} \"{candidate}\" is ambiguous. Use a canonical slug: {}",
            entry.slugs.join(", ")
        )));
    }
    let mut referenced_by: Vec<(&str, &str)> = Vec::new();
    for edge in graph.edges() {
        if edge.reference != candidate || edge.is_resolved() {
            continue;
        }
        let from = graph.node(edge.from).slug.as_str();
        if !referenced_by.contains(&(from, edge.via)) {
            referenced_by.push((from, edge.via));
        }
    }
    if !referenced_by.is_empty() {
        referenced_by.sort_by(|left, right| {
            answer_format::collation::compare_text(left.0, right.0)
                .then_with(|| answer_format::collation::compare_text(left.1, right.1))
        });
        let cited: Vec<String> = referenced_by
            .iter()
            .map(|(slug, via)| format!("{slug} (via {via})"))
            .collect();
        return Err(QueryError::Failed(format!(
            "{field} \"{candidate}\" is referenced by the vault but has no document of its own, so it is not a compiled node. Referenced by: {}. Create it with add_concepts({{concepts:[{{slug:\"{candidate}\", kind, title}}]}}) to make it queryable.",
            cited.join(", ")
        )));
    }
    Err(QueryError::UnknownNode {
        field,
        name: candidate.to_string(),
        similar: suggest_slugs(graph, candidate),
    })
}
