//! The three example nodes `init` writes into a new vault, once the vault has real nodes of the same
//! kind beside them. Alone, a starter is the product's own instructions; beside real nodes it is a
//! fake concept on the map.

use std::collections::HashMap;

use answer_format::whitespace::trim;

use crate::compiled_graph::{CompiledGraph, NodeId};

/// Where `init` writes the example of each kind. The templates of the command line and the
/// browser's first-run starter use the same addresses.
const STARTER_SLUGS: [(&str, &str); 3] = [
    ("domain", "domains/example-domain"),
    ("capability", "capabilities/example-capability"),
    ("element", "elements/example-element"),
];

/// Sentences only the untouched starter body carries.
const BODY_MARKERS: [&str; 2] = [
    "this file is a starter, not an observation",
    "## how to fill it in",
];

fn starter_slug_of(kind: &str) -> Option<&'static str> {
    STARTER_SLUGS
        .iter()
        .find(|(name, _)| *name == kind)
        .map(|(_, slug)| *slug)
}

/// Whether a node is one of the examples `init` wrote to be copied. The three addresses match
/// outright; any other needs both an `example-` slug tail and a title that starts with "Example",
/// since either alone would accuse a real node. The body is not read, so rewriting the prose but
/// keeping the name still counts.
fn is_starter(slug: &str, kind: &str, title: &str) -> bool {
    let address = trim(slug);
    if address.is_empty() {
        return false;
    }
    if starter_slug_of(trim(kind)) == Some(address) {
        return true;
    }
    if STARTER_SLUGS.iter().any(|(_, starter)| *starter == address) {
        return true;
    }
    let tail = address.rsplit('/').next().unwrap_or_default();
    tail.starts_with("example-") && trim(title).starts_with("Example")
}

fn has_untouched_body(graph: &CompiledGraph, id: NodeId) -> bool {
    graph.node(id).body().is_ok_and(|body| {
        let text = body.to_lowercase();
        BODY_MARKERS.iter().all(|marker| text.contains(marker))
    })
}

fn message(
    starter_slug: &str,
    kind: &str,
    real_slug: Option<&str>,
    rename_to: &str,
    untouched_body: bool,
) -> String {
    let body_note = if untouched_body {
        format!(" Its body is still the starter's own explanation of what a {kind} is, so a reader who opens it asking what this {kind} does gets a definition of the word instead.")
    } else {
        String::new()
    };
    let sibling = match real_slug {
        Some(real) => format!("\"{real}\" is now a real {kind} beside it"),
        None => format!("this vault now holds a real {kind} beside it"),
    };
    format!("\"{starter_slug}\" is the {kind} the `init` starter wrote as a shape to copy, and {sibling}. The write succeeded and nothing here blocks it. While the starter was the only {kind} in the vault it was instructions; now it is a fake concept sitting on the map next to the real ones, and the only relations it has run to the other two starter examples.{body_note} Delete it: delete_concept({{slug:\"{starter_slug}\"}}) without `confirm` returns a dry-run listing its backlinks first — they are the other two starter examples, so delete all three together and the graph loses nothing. If you meant to keep this one, it is not a starter any more: patch_concept it into a real concept, then give it a real address with rename_concept({{oldSlug:\"{starter_slug}\", newSlug:\"{rename_to}\", confirm:true}}). The UID does not change, so nothing loses its identity.")
}

/// One starter example the vault has outgrown.
pub struct StarterExample {
    pub node: NodeId,
    pub message: String,
}

/// Every starter example that has a real node of its kind beside it, in slug order.
pub fn starter_examples(graph: &CompiledGraph) -> Vec<StarterExample> {
    let mut first_real: HashMap<&str, &str> = HashMap::new();
    let mut starters: Vec<NodeId> = Vec::new();
    for id in graph.node_ids() {
        let node = graph.node(id);
        let kind = trim(node.kind());
        if kind.is_empty() {
            continue;
        }
        if is_starter(node.slug(), kind, &node.title_text()) {
            starters.push(id);
        } else {
            first_real.entry(kind).or_insert_with(|| node.slug());
        }
    }
    let mut found = Vec::new();
    for id in starters {
        let node = graph.node(id);
        let kind = trim(node.kind());
        let Some(real) = first_real.get(kind).copied() else {
            continue;
        };
        if starter_slug_of(kind).is_none() {
            continue;
        }
        let folder = vault_document::schema::folder_for_kind(kind);
        found.push(StarterExample {
            node: id,
            message: message(
                trim(node.slug()),
                kind,
                Some(real),
                &format!("{folder}<real-name>"),
                has_untouched_body(graph, id),
            ),
        });
    }
    found
}
