//! The evidence a project's competency answers may cite: the concepts of its containment, the
//! relations between them, and the source paths and pinned citations a measured receipt supports.
//! Anything incomplete is unavailable, never a smaller inventory: an answer judged against part of
//! the evidence would pass where it should not.

use std::collections::HashSet;

use answer_format::collation::compare_text;
use ontology_graph::CompiledGraph;
use project_source::{
    competency_evidence_citations, competency_evidence_paths, parse_source_range_citation,
    SourceRangeCitation, SourceReceipt, SourceView,
};
use vault_document::LoadedDocument;

use crate::meaning_questions::WITNESS_INVENTORY_CONTRACT;
use crate::stored_name_shapes::{
    non_blank, safe_graph_hash, safe_opaque, safe_relative_path, safe_vault_slug,
    PROJECT_SLUG_MAX_UNITS, SLUG_MAX_UNITS,
};

const MAX_SCOPE_NODES: usize = 500;
/// The relation keys a write may store, which are the only ones an answer may cite.
const ALLOWED_RELATION_TYPES: [&str; 8] = [
    "depends_on",
    "relates",
    "contains",
    "describes",
    "domains",
    "capabilities",
    "elements",
    "domain",
];
const RECEIPT_STATUSES: [&str; 3] = ["needs_evidence", "review_required", "verified_current"];
const VIEW_CURRENTNESS: [&str; 3] = ["current", "stale", "unavailable"];

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct InventoryRelation {
    pub from: String,
    pub to: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Inventory {
    pub contract: &'static str,
    pub graph_hash: String,
    pub source_fingerprint: String,
    /// Sorted.
    pub concepts: Vec<String>,
    /// Concept to kind, in the order of the project's scope.
    pub kinds: Vec<(String, String)>,
    /// Sorted.
    pub relations: Vec<InventoryRelation>,
    /// Sorted: the supported paths, then the citations that still hold.
    pub evidence: Vec<String>,
    /// Sorted.
    pub paths: Vec<String>,
}

/// Why no inventory could be made.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InventoryUnavailable {
    InvalidProject,
    InvalidGraphHash,
    IncompleteProjectScope,
    InvalidProjectScope,
    SourceReceiptUnavailable,
}

impl InventoryUnavailable {
    pub const fn reason(self) -> &'static str {
        match self {
            Self::InvalidProject => "invalid_project",
            Self::InvalidGraphHash => "invalid_graph_hash",
            Self::IncompleteProjectScope => "incomplete_project_scope",
            Self::InvalidProjectScope => "invalid_project_scope",
            Self::SourceReceiptUnavailable => "source_receipt_unavailable",
        }
    }
}

/// What the inventory is made from.
pub struct InventoryInput<'a> {
    pub project_slug: &'a str,
    /// `None` when the project's scope is not whole.
    pub graph_hash: Option<&'a str>,
    /// The slugs of the project's containment, in graph order; `None` when it is past the limit.
    pub scope: Option<&'a [String]>,
    pub graph: &'a CompiledGraph,
    /// The documents of the scope.
    pub documents: &'a [&'a LoadedDocument],
    /// The body the project node will have, when it is not the file's.
    pub project_body: Option<&'a str>,
    pub source: &'a SourceView,
    pub verify_citation: Option<&'a dyn Fn(&SourceRangeCitation) -> bool>,
}

/// A receipt the inventory may draw witnesses from: the view it was read through is current enough
/// to trust, and every field of it is in the form it is stored in.
fn usable_receipt<'a>(source: &'a SourceView, project_slug: &str) -> Option<&'a SourceReceipt> {
    if source.contract_version != 1
        || source.project_slug != project_slug
        || source.binding_cardinality != 1
        || !RECEIPT_STATUSES.contains(&source.status.as_str())
        || !VIEW_CURRENTNESS.contains(&source.currentness)
    {
        return None;
    }
    let receipt = source.receipt.as_ref()?;
    let witnesses_hold = receipt.witnesses.iter().all(|witness| {
        non_blank(&witness.id, 200)
            && safe_vault_slug(&witness.node_slug, SLUG_MAX_UNITS)
            && non_blank(&witness.role, 200)
            && safe_relative_path(&witness.path)
    });
    let sound = receipt.contract_version == 1
        && receipt.project_slug == project_slug
        && safe_graph_hash(&receipt.graph_hash)
        && non_blank(&receipt.source_id, 200)
        && non_blank(&receipt.source_revision, 200)
        && !receipt.source_revision.is_empty()
        && safe_opaque(&receipt.source_fingerprint)
        && !receipt.source_fingerprint.is_empty()
        && non_blank(&receipt.measured_at, 100)
        && RECEIPT_STATUSES.contains(&receipt.status.as_str())
        && receipt.currentness == "current"
        && witnesses_hold;
    sound.then_some(receipt)
}

fn path_of(document: &LoadedDocument) -> Option<&str> {
    document
        .frontmatter()
        .text("path")
        .filter(|path| safe_relative_path(path))
}

/// The inventory of `project_slug`, or why there is none.
pub fn build_meaning_inventory(
    input: &InventoryInput<'_>,
) -> Result<Inventory, InventoryUnavailable> {
    if !safe_vault_slug(input.project_slug, PROJECT_SLUG_MAX_UNITS) {
        return Err(InventoryUnavailable::InvalidProject);
    }
    let graph_hash = input
        .graph_hash
        .filter(|hash| safe_graph_hash(hash))
        .ok_or(InventoryUnavailable::InvalidGraphHash)?;
    let concepts = input
        .scope
        .filter(|slugs| slugs.len() <= MAX_SCOPE_NODES)
        .ok_or(InventoryUnavailable::IncompleteProjectScope)?;
    let distinct: HashSet<&str> = concepts.iter().map(String::as_str).collect();
    if concepts.is_empty()
        || !concepts.iter().all(|slug| safe_vault_slug(slug, SLUG_MAX_UNITS))
        || distinct.len() != concepts.len()
        || !distinct.contains(input.project_slug)
    {
        return Err(InventoryUnavailable::InvalidProjectScope);
    }
    let receipt = usable_receipt(input.source, input.project_slug)
        .ok_or(InventoryUnavailable::SourceReceiptUnavailable)?;

    let kinds: Vec<(String, String)> = concepts
        .iter()
        .filter_map(|slug| {
            let node = input.graph.node(input.graph.node_by_slug(slug)?);
            non_blank(node.kind(), 100).then(|| (slug.clone(), node.kind().to_string()))
        })
        .collect();

    let mut relations: HashSet<InventoryRelation> = HashSet::new();
    for edge in input.graph.edges() {
        let Some(to) = edge.to() else { continue };
        let kind = if edge.via == "dependencies" { "depends_on" } else { edge.via };
        let from = input.graph.node(edge.from).slug();
        let to = input.graph.node(to).slug();
        if edge.is_resolved()
            && !edge.is_external()
            && distinct.contains(from)
            && distinct.contains(to)
            && ALLOWED_RELATION_TYPES.contains(&kind)
        {
            relations.insert(InventoryRelation {
                from: from.to_string(),
                to: to.to_string(),
                kind: kind.to_string(),
            });
        }
    }

    let mut claims: HashSet<(String, String)> = HashSet::new();
    let mut citations: Vec<String> = Vec::new();
    for document in input.documents {
        let slug = document.slug();
        if !distinct.contains(slug) {
            continue;
        }
        if let Some(path) = path_of(document) {
            claims.insert((slug.to_string(), path.to_string()));
        }
        let frontmatter = document.frontmatter();
        let is_the_project = frontmatter.text("kind") == Some("project")
            && (slug == input.project_slug || frontmatter.text("slug") == Some(input.project_slug));
        if !is_the_project {
            continue;
        }
        let body = match input.project_body.filter(|_| slug == input.project_slug) {
            Some(body) => Some(std::borrow::Cow::Borrowed(body)),
            None => document.body().ok(),
        };
        if let Some(body) = body {
            for path in competency_evidence_paths(&body) {
                claims.insert((slug.to_string(), path));
            }
            citations.extend(competency_evidence_citations(&body));
        }
    }

    let mut evidence: HashSet<String> = HashSet::new();
    if receipt.graph_hash == graph_hash {
        for witness in &receipt.witnesses {
            if witness.supported
                && distinct.contains(witness.node_slug.as_str())
                && claims.contains(&(witness.node_slug.clone(), witness.path.clone()))
            {
                evidence.insert(witness.path.clone());
            }
        }
    }
    let paths: Vec<String> = evidence.iter().cloned().collect();
    // A pinned citation holds when its file is a measured witness and still hashes to the pin.
    for reference in citations {
        let holds = parse_source_range_citation(&reference).is_some_and(|citation| {
            evidence.contains(&citation.path)
                && input
                    .verify_citation
                    .is_some_and(|verify| verify(&citation))
        });
        if holds {
            evidence.insert(reference);
        }
    }

    let mut sorted_concepts = concepts.to_vec();
    sorted_concepts.sort_by(|left, right| compare_text(left, right));
    let mut sorted_relations: Vec<InventoryRelation> = relations.into_iter().collect();
    sorted_relations.sort_by(|left, right| {
        compare_text(&relation_key(left), &relation_key(right))
    });
    let sorted = |values: Vec<String>| {
        let mut values = values;
        values.sort_by(|left, right| compare_text(left, right));
        values
    };
    Ok(Inventory {
        contract: WITNESS_INVENTORY_CONTRACT,
        graph_hash: graph_hash.to_string(),
        source_fingerprint: receipt.source_fingerprint.clone(),
        concepts: sorted_concepts,
        kinds,
        relations: sorted_relations,
        evidence: sorted(evidence.into_iter().collect()),
        paths: sorted(paths),
    })
}

pub(crate) fn relation_key(relation: &InventoryRelation) -> String {
    format!("{}\0{}\0{}", relation.from, relation.to, relation.kind)
}
