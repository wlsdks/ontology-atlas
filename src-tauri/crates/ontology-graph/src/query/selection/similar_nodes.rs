//! `similar_nodes`: which nodes resemble a node that exists, or one not written yet, so an agent
//! finds a duplicate before it writes a second. A node scores by what its slug and title share
//! with the other's, whether kind and domain are equal, and how many neighbours they share.

use std::collections::HashSet;

use serde::Serialize;

use super::centrality::round_score;
use super::clusters::undirected_adjacency;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::node_resolution::resolve;
use crate::query::node_summary::NodeSummary;
use crate::query::operation_defaults::SIMILAR_NODES_LIMIT;
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::QueryRequest;
use crate::query::walks::row_page::RowPage;
use vault_document::frontmatter::Value;

const TEXT_WEIGHT: f64 = 0.35;
const FACT_WEIGHT: f64 = 0.1;
const FACT_BONUS: f64 = 0.1;

/// What a node is compared by.
struct Subject {
    slug: String,
    title: String,
    kind: Option<String>,
    domain: Option<String>,
}

impl Subject {
    fn of_node(graph: &CompiledGraph, id: NodeId) -> Self {
        let node = graph.node(id);
        Self {
            slug: node.slug().to_string(),
            title: node.title_text(),
            kind: Some(node.kind().to_string()).filter(|kind| !kind.is_empty()),
            domain: match node.domain() {
                Some(Value::Text(text)) if !text.is_empty() => Some(text.clone()),
                _ => None,
            },
        }
    }
}

/// The words of a text: lowercase runs of letters and digits at least two long, each once.
fn words(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .split(|character: char| !character.is_ascii_lowercase() && !character.is_ascii_digit())
        .filter(|word| word.len() >= 2)
        .map(str::to_string)
        .collect()
}

/// Shared members over all members: zero when either side is empty.
fn jaccard(left: usize, right: usize, shared: usize) -> f64 {
    if left == 0 || right == 0 {
        return 0.0;
    }
    let union = left + right - shared;
    if union == 0 {
        0.0
    } else {
        shared as f64 / union as f64
    }
}

fn word_overlap(left: &HashSet<String>, right: &HashSet<String>) -> f64 {
    let (smaller, larger) = if left.len() <= right.len() {
        (left, right)
    } else {
        (right, left)
    };
    let shared = smaller.iter().filter(|word| larger.contains(*word)).count();
    jaccard(left.len(), right.len(), shared)
}

#[derive(Serialize)]
struct Signals {
    slug: f64,
    title: f64,
    kind: f64,
    domain: f64,
    neighbors: f64,
}

struct Score {
    slug: f64,
    title: f64,
    kind: f64,
    domain: f64,
    neighbors: f64,
}

impl Score {
    /// The sum in the order the signals are written, so the rounding is the same one.
    fn total(&self) -> f64 {
        self.slug + self.title + self.kind + self.domain + self.neighbors
    }
}

#[derive(Serialize)]
struct SimilarRow<'a> {
    node: NodeSummary<'a>,
    score: f64,
    signals: Signals,
    #[serde(rename = "sharedNeighbors")]
    shared_neighbors: RowPage<NodeSummary<'a>>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Source<'a> {
    Existing {
        mode: &'static str,
        slug: &'a str,
        node: NodeSummary<'a>,
    },
    Candidate {
        mode: &'static str,
        slug: Option<String>,
        kind: Option<String>,
        title: Option<String>,
        domain: Option<String>,
    },
}

#[derive(Serialize)]
struct SimilarParameters {
    types: Option<Vec<&'static str>>,
    limit: usize,
}

#[derive(Serialize)]
pub struct SimilarNodesAnswer<'a> {
    operation: &'static str,
    source: Source<'a>,
    parameters: SimilarParameters,
    #[serde(rename = "totalMatches")]
    total_matches: usize,
    limited: bool,
    matches: Vec<SimilarRow<'a>>,
}

/// A candidate row before it is written: the node, its score and the neighbours it shares.
struct Candidate {
    node: NodeId,
    score: f64,
    signals: [f64; 5],
}

fn non_empty(text: Option<&String>) -> Option<String> {
    text.filter(|text| !text.is_empty()).cloned()
}

pub fn similar_nodes<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<SimilarNodesAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(SIMILAR_NODES_LIMIT);
    let types = RelationSet::parse(request.types.as_deref(), "types")?;
    let arguments = &request.selection.arguments;
    let source = request
        .slug
        .as_deref()
        .map(|name| resolve(graph, Some(name), "slug"))
        .transpose()?;
    let subject = match source {
        Some(id) => Subject::of_node(graph, id),
        None => {
            let slug = non_empty(arguments.candidate_slug.as_ref())
                .or_else(|| non_empty(arguments.title.as_ref()))
                .unwrap_or_default();
            let title = non_empty(arguments.title.as_ref())
                .or_else(|| non_empty(arguments.candidate_slug.as_ref()))
                .unwrap_or_default();
            Subject {
                slug,
                title,
                kind: non_empty(arguments.kind.as_ref()),
                domain: non_empty(arguments.domain.as_ref()),
            }
        }
    };
    let adjacency = undirected_adjacency(graph, types.as_ref());
    let neighbours_of = |id: NodeId| adjacency.get(id.index()).map_or(&[][..], Vec::as_slice);
    let source_neighbours: HashSet<NodeId> = source
        .map(|id| neighbours_of(id).iter().copied().collect())
        .unwrap_or_default();
    let subject_slug_words = words(&subject.slug);
    let subject_title_words = words(&subject.title);

    let mut candidates: Vec<Candidate> = Vec::new();
    for id in graph.node_ids() {
        if Some(id) == source {
            continue;
        }
        let other = Subject::of_node(graph, id);
        let other_neighbours = neighbours_of(id);
        let neighbours = if source_neighbours.is_empty() {
            0.0
        } else {
            let shared = other_neighbours
                .iter()
                .filter(|node| source_neighbours.contains(node))
                .count();
            jaccard(source_neighbours.len(), other_neighbours.len(), shared)
        };
        let score = Score {
            slug: word_overlap(&subject_slug_words, &words(&other.slug)) * TEXT_WEIGHT,
            title: word_overlap(&subject_title_words, &words(&other.title)) * TEXT_WEIGHT,
            kind: match (&subject.kind, &other.kind) {
                (Some(left), Some(right)) if left == right => FACT_BONUS,
                _ => 0.0,
            },
            domain: match (&subject.domain, &other.domain) {
                (Some(left), Some(right)) if left == right => FACT_BONUS,
                _ => 0.0,
            },
            neighbors: neighbours * FACT_WEIGHT,
        };
        let total = score.total();
        if total <= 0.0 {
            continue;
        }
        candidates.push(Candidate {
            node: id,
            score: round_score(total),
            signals: [
                round_score(score.slug),
                round_score(score.title),
                round_score(score.kind),
                round_score(score.domain),
                round_score(score.neighbors),
            ],
        });
    }
    candidates.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.node.cmp(&right.node))
    });
    let total = candidates.len();
    let matches: Vec<SimilarRow<'a>> = candidates
        .iter()
        .take(limit)
        .map(|candidate| {
            let [slug, title, kind, domain, neighbors] = candidate.signals;
            let mut shared: Vec<NodeId> = neighbours_of(candidate.node)
                .iter()
                .copied()
                .filter(|node| source_neighbours.contains(node))
                .collect();
            shared.sort_unstable();
            SimilarRow {
                node: NodeSummary::of(graph, candidate.node),
                score: candidate.score,
                signals: Signals {
                    slug,
                    title,
                    kind,
                    domain,
                    neighbors,
                },
                shared_neighbors: RowPage::new(
                    shared.len(),
                    limit,
                    shared
                        .iter()
                        .take(limit)
                        .map(|&node| NodeSummary::of(graph, node))
                        .collect(),
                ),
            }
        })
        .collect();
    Ok(SimilarNodesAnswer {
        operation: "similar_nodes",
        source: match source {
            Some(id) => Source::Existing {
                mode: "existing",
                slug: graph.node(id).slug(),
                node: NodeSummary::of(graph, id),
            },
            None => Source::Candidate {
                mode: "candidate",
                slug: Some(subject.slug).filter(|slug| !slug.is_empty()),
                kind: subject.kind,
                title: Some(subject.title).filter(|title| !title.is_empty()),
                domain: subject.domain,
            },
        },
        parameters: SimilarParameters {
            types: types.as_ref().map(RelationSet::sorted_names),
            limit,
        },
        total_matches: total,
        limited: total > limit,
        matches,
    })
}
