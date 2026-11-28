//! One saved constellation as the nodes it names are now: which of its members still resolve to a
//! node, how those nodes relate, and which declared dependencies cross its boundary. Membership is a
//! person's scope; it establishes no relation, no accepted meaning and no complete impact.

use std::collections::{HashMap, HashSet};

use answer_format::collation::compare_text;
use answer_format::pagination::Pagination;
use answer_format::whitespace::trim;
use serde::Serialize;
use vault_document::frontmatter::{Frontmatter, Value};
use vault_document::schema::{
    review_currentness, Currentness, REVIEWED_AT_KEY, REVIEWED_BY_KEY, REVIEW_NOTE_KEY,
    REVIEW_STATE_CONFIRMED, REVIEW_STATE_HUMAN_DECIDES, REVIEW_STATE_KEY,
};
use vault_document::{
    describe_body_delivery, neighbor_refs, relation_note_for, BodyMode, FileReadError,
    LoadedDocument,
};

use crate::collections_validation::{Collections, Folder, Item, Target};
use crate::constellation_list::{constellation_folders, purpose_of, Purpose};

const EXCERPT_CHARS: usize = 400;

/// A constellation and its members, in the order a person arranged them.
pub struct Selection<'a> {
    pub folder: &'a Folder,
    pub items: Vec<&'a Item>,
}

/// The constellation `id`, when the collection has one.
pub fn select_constellation<'a>(collections: &'a Collections, id: &str) -> Option<Selection<'a>> {
    let folder = constellation_folders(collections)
        .into_iter()
        .find(|folder| folder.id == id)?;
    let mut items: Vec<&Item> = collections
        .items
        .iter()
        .filter(|item| item.folder_id.as_deref() == Some(folder.id.as_str()))
        .collect();
    items.sort_by(|left, right| {
        left.order
            .cmp(&right.order)
            .then_with(|| compare_text(&left.label, &right.label))
            .then_with(|| compare_text(&left.id, &right.id))
    });
    Some(Selection { folder, items })
}

/// Which page of members and how many relations of each kind the answer holds.
pub struct ContextRequest {
    pub offset: usize,
    pub limit: usize,
    pub relation_limit: usize,
    pub dependency_limit: usize,
}

/// Why the answer could not be made.
pub enum ContextFault {
    /// The offset lies past the members; the number is how many there are.
    OffsetPastTotal(usize),
    Unreadable(FileReadError),
}

#[derive(Serialize)]
struct SelectedMember<'a> {
    #[serde(rename = "itemId")]
    item_id: &'a str,
    order: u64,
    label: &'a str,
    target: &'a Target,
}

#[derive(Serialize)]
struct SelectionView<'a> {
    id: &'a str,
    name: &'a str,
    purpose: Purpose,
    #[serde(rename = "createdAt")]
    created_at: &'a str,
    #[serde(rename = "updatedAt")]
    updated_at: &'a str,
    #[serde(rename = "memberCount")]
    member_count: usize,
    #[serde(rename = "ontologyMemberCount")]
    ontology_member_count: usize,
    #[serde(rename = "referenceMemberCount")]
    reference_member_count: usize,
    members: Vec<SelectedMember<'a>>,
    pagination: Pagination,
}

#[derive(Serialize)]
struct Evidence<'a> {
    #[serde(rename = "implementationPath")]
    implementation_path: Option<&'a str>,
    excerpt: String,
    #[serde(rename = "excerptTruncated")]
    excerpt_truncated: bool,
    #[serde(rename = "bodyChars")]
    body_chars: usize,
}

/// What a member's review says now. An approval of text that has since changed says so.
#[derive(Serialize)]
struct MemberReview<'a> {
    state: Option<&'a Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<&'a Value>,
    #[serde(rename = "reviewedBy", skip_serializing_if = "Option::is_none")]
    reviewed_by: Option<&'a Value>,
    #[serde(rename = "reviewedAt", skip_serializing_if = "Option::is_none")]
    reviewed_at: Option<&'a Value>,
    currentness: Currentness,
    #[serde(rename = "agentGuidance", skip_serializing_if = "Option::is_none")]
    agent_guidance: Option<&'static str>,
}

fn member_review<'a>(frontmatter: &'a Frontmatter, body: &str) -> MemberReview<'a> {
    let state = frontmatter.get(REVIEW_STATE_KEY);
    let currentness = review_currentness(frontmatter, body);
    let state_text = state.and_then(Value::as_text);
    let agent_guidance = if state_text == Some(REVIEW_STATE_HUMAN_DECIDES) {
        Some("A person reserved this node. Atlas write tools refuse agent changes.")
    } else if state_text == Some(REVIEW_STATE_CONFIRMED)
        && currentness == Currentness::ChangedSinceReview
    {
        Some("This node changed after review. Treat its meaning as unreviewed.")
    } else {
        None
    };
    MemberReview {
        state,
        note: frontmatter.truthy(REVIEW_NOTE_KEY),
        reviewed_by: frontmatter.truthy(REVIEWED_BY_KEY),
        reviewed_at: frontmatter.truthy(REVIEWED_AT_KEY),
        currentness,
        agent_guidance,
    }
}

#[derive(Serialize)]
struct ResolvedMember<'a> {
    #[serde(rename = "itemId")]
    item_id: &'a str,
    #[serde(rename = "requestedUid")]
    requested_uid: &'a str,
    #[serde(rename = "identityResolution")]
    identity_resolution: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    uid: Option<&'a Value>,
    slug: &'a str,
    kind: Option<&'a Value>,
    title: String,
    domain: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mtime: Option<f64>,
    review: MemberReview<'a>,
    evidence: Evidence<'a>,
}

#[derive(Serialize)]
struct UnresolvedMember<'a> {
    ok: bool,
    #[serde(rename = "itemId")]
    item_id: &'a str,
    uid: &'a str,
    label: &'a str,
    #[serde(rename = "lastKnownPath")]
    last_known_path: &'a str,
    reason: &'static str,
    #[serde(rename = "claimCount", skip_serializing_if = "Option::is_none")]
    claim_count: Option<usize>,
}

#[derive(Serialize)]
struct Current<'a> {
    #[serde(rename = "resolvedMembers")]
    resolved_members: Vec<ResolvedMember<'a>>,
    #[serde(rename = "unresolvedMembers")]
    unresolved_members: Vec<UnresolvedMember<'a>>,
    #[serde(rename = "resolvedMemberTotal")]
    resolved_member_total: usize,
    #[serde(rename = "unresolvedMemberTotal")]
    unresolved_member_total: usize,
}

#[derive(Serialize)]
struct NodeEnd<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    uid: Option<&'a Value>,
    slug: &'a str,
}

#[derive(Serialize)]
struct OutsideNode<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    uid: Option<&'a Value>,
    slug: &'a str,
    kind: Option<&'a Value>,
    title: String,
}

#[derive(Serialize)]
struct Relation<'a> {
    from: NodeEnd<'a>,
    to: NodeEnd<'a>,
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    rationale: Option<String>,
}

#[derive(Serialize)]
struct CrossingRelation<'a> {
    from: NodeEnd<'a>,
    to: NodeEnd<'a>,
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    rationale: Option<String>,
    #[serde(rename = "scopeDirection")]
    scope_direction: &'static str,
    #[serde(rename = "outsideNode")]
    outside_node: OutsideNode<'a>,
}

#[derive(Serialize)]
struct RelationRows<T> {
    total: usize,
    returned: usize,
    limited: bool,
    rows: Vec<T>,
}

#[derive(Serialize)]
struct Coverage {
    #[serde(rename = "selectedMembership")]
    selected_membership: &'static str,
    #[serde(rename = "memberFacts")]
    member_facts: &'static str,
    #[serde(rename = "internalRelations")]
    internal_relations: &'static str,
    #[serde(rename = "outsideScopeDependencies")]
    outside_scope_dependencies: &'static str,
    #[serde(rename = "transitiveImpactChecked")]
    transitive_impact_checked: bool,
    #[serde(rename = "graphNodesScanned")]
    graph_nodes_scanned: usize,
    #[serde(rename = "unresolvedGraphReferences")]
    unresolved_graph_references: usize,
    #[serde(rename = "unresolvedDependencyReferences")]
    unresolved_dependency_references: usize,
    #[serde(rename = "meaningAcceptanceInferred")]
    meaning_acceptance_inferred: bool,
    #[serde(rename = "completeImpactInferred")]
    complete_impact_inferred: bool,
}

/// Everything the answer says about one constellation, after its `contract`, `availability` and
/// `source`.
#[derive(Serialize)]
pub struct ConstellationContext<'a> {
    selection: SelectionView<'a>,
    current: Current<'a>,
    relations: RelationRows<Relation<'a>>,
    #[serde(rename = "outsideScopeDependencies")]
    outside_scope_dependencies: RelationRows<CrossingRelation<'a>>,
    coverage: Coverage,
    guidance: &'static str,
}

const GUIDANCE: &str = "Saved membership and purpose are user-authored task context. They do not create relations, prove accepted or current meaning, authorize writes, or establish a complete blast radius. Follow pagination and use graph/source reads when the task needs wider impact evidence.";

/// How the vault's documents claim a uid: as the current one, or as one merged into them.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Claim {
    Current,
    Merged,
}

impl Claim {
    const fn word(self) -> &'static str {
        match self {
            Self::Current => "current",
            Self::Merged => "merged",
        }
    }
}

fn uid_claims(documents: &[LoadedDocument]) -> HashMap<&str, Vec<(&LoadedDocument, Claim)>> {
    let mut claims: HashMap<&str, Vec<(&LoadedDocument, Claim)>> = HashMap::new();
    for document in documents {
        let frontmatter = document.frontmatter();
        let mut held: Vec<(&str, Claim)> = Vec::new();
        if let Some(uid) = frontmatter.text("uid").filter(|uid| !uid.is_empty()) {
            held.push((uid, Claim::Current));
        }
        for uid in frontmatter.list("merged_uids").unwrap_or_default() {
            if !uid.is_empty() && !held.iter().any(|(known, _)| known == uid) {
                held.push((uid, Claim::Merged));
            }
        }
        for (uid, claim) in held {
            claims.entry(uid).or_default().push((document, claim));
        }
    }
    claims
}

fn is_graph_node(document: &LoadedDocument) -> bool {
    document
        .frontmatter()
        .text("kind")
        .is_some_and(|kind| !trim(kind).is_empty())
}

fn titled(document: &LoadedDocument) -> String {
    let frontmatter = document.frontmatter();
    ["title", "name"]
        .iter()
        .find_map(|key| frontmatter.text(key).filter(|text| !text.is_empty()))
        .unwrap_or_else(|| document.slug())
        .to_string()
}

enum Resolution<'a> {
    Resolved {
        item: &'a Item,
        document: &'a LoadedDocument,
        claim: Claim,
    },
    Unresolved {
        item: &'a Item,
        reason: &'static str,
        claim_count: Option<usize>,
    },
}

fn uid_of(item: &Item) -> &str {
    match &item.target {
        Target::Ontology { uid, .. } => uid,
        Target::Reference { .. } => "",
    }
}

fn resolve_member<'a>(
    item: &'a Item,
    claims: &HashMap<&str, Vec<(&'a LoadedDocument, Claim)>>,
) -> Resolution<'a> {
    let held = claims.get(uid_of(item)).map_or(&[][..], Vec::as_slice);
    match held {
        [] => Resolution::Unresolved {
            item,
            reason: "missing",
            claim_count: None,
        },
        [(document, claim)] if is_graph_node(document) => Resolution::Resolved {
            item,
            document,
            claim: *claim,
        },
        [_] => Resolution::Unresolved {
            item,
            reason: "not_graph_node",
            claim_count: Some(1),
        },
        many => Resolution::Unresolved {
            item,
            reason: "ambiguous",
            claim_count: Some(many.len()),
        },
    }
}

fn graph_resolver<'a>(
    graph_documents: &[&'a LoadedDocument],
) -> impl Fn(&str) -> Option<&'a LoadedDocument> {
    let exact: HashMap<&str, &LoadedDocument> = graph_documents
        .iter()
        .map(|document| (document.slug(), *document))
        .collect();
    let mut aliases: HashMap<String, Vec<&'a LoadedDocument>> = HashMap::new();
    let mut add = |alias: &str, document: &'a LoadedDocument| {
        if !trim(alias).is_empty() {
            aliases.entry(alias.to_string()).or_default().push(document);
        }
    };
    for document in graph_documents {
        if let Some(declared) = document.frontmatter().text("slug") {
            add(declared, document);
        }
        let tail = document.slug().rsplit('/').next().unwrap_or(document.slug());
        if tail != document.slug() {
            add(tail, document);
        }
    }
    move |reference: &str| {
        if let Some(direct) = exact.get(reference) {
            return Some(*direct);
        }
        let mut distinct: Vec<&LoadedDocument> = Vec::new();
        for candidate in aliases.get(reference).map_or(&[][..], Vec::as_slice) {
            if !distinct.iter().any(|held| held.slug() == candidate.slug()) {
                distinct.push(candidate);
            }
        }
        match distinct.as_slice() {
            [only] => Some(*only),
            _ => None,
        }
    }
}

fn relation_key(kind: &str, from: &str, to: &str) -> String {
    format!("{kind}\0{from}\0{to}")
}

struct ScopeRelations<'a> {
    internal: Vec<Relation<'a>>,
    outside: Vec<CrossingRelation<'a>>,
    graph_node_count: usize,
    unresolved_graph_references: usize,
    unresolved_dependency_references: usize,
}

fn scope_relations<'a>(
    documents: &'a [LoadedDocument],
    resolved: &HashSet<&str>,
) -> ScopeRelations<'a> {
    let graph_documents: Vec<&LoadedDocument> =
        documents.iter().filter(|document| is_graph_node(document)).collect();
    let resolve = graph_resolver(&graph_documents);
    let mut internal: HashMap<String, Relation<'a>> = HashMap::new();
    let mut crossing: HashMap<String, CrossingRelation<'a>> = HashMap::new();
    let (mut unresolved_references, mut unresolved_dependencies) = (0, 0);
    for document in &graph_documents {
        let from_inside = resolved.contains(document.slug());
        for neighbor in neighbor_refs(document.frontmatter()) {
            let Some(target) = resolve(&neighbor.reference) else {
                if from_inside {
                    unresolved_references += 1;
                    if neighbor.key == "dependencies" {
                        unresolved_dependencies += 1;
                    }
                }
                continue;
            };
            if target.slug() == document.slug() {
                continue;
            }
            let to_inside = resolved.contains(target.slug());
            let rationale =
                relation_note_for(document.frontmatter(), &neighbor.reference, Some(target.slug()));
            let end = |held: &'a LoadedDocument| NodeEnd {
                uid: held.frontmatter().get("uid"),
                slug: held.slug(),
            };
            if from_inside && to_inside {
                internal.insert(
                    relation_key(neighbor.key, document.slug(), target.slug()),
                    Relation {
                        from: end(document),
                        to: end(target),
                        kind: neighbor.key,
                        rationale,
                    },
                );
            } else if neighbor.key == "dependencies" && from_inside != to_inside {
                let outside = if from_inside { target } else { document };
                let direction = if from_inside { "outgoing" } else { "incoming" };
                crossing.insert(
                    format!(
                        "{}\0{direction}",
                        relation_key(neighbor.key, document.slug(), target.slug())
                    ),
                    CrossingRelation {
                        from: end(document),
                        to: end(target),
                        kind: neighbor.key,
                        rationale,
                        scope_direction: direction,
                        outside_node: OutsideNode {
                            uid: outside.frontmatter().get("uid"),
                            slug: outside.slug(),
                            kind: outside.frontmatter().get("kind"),
                            title: titled(outside),
                        },
                    },
                );
            }
        }
    }
    let mut internal: Vec<(String, Relation<'a>)> = internal.into_iter().collect();
    internal.sort_by(|left, right| compare_text(&left.0, &right.0));
    let mut crossing: Vec<(String, CrossingRelation<'a>)> = crossing.into_iter().collect();
    crossing.sort_by(|left, right| {
        let order = |row: &CrossingRelation<'_>, key: &str| {
            format!("{}\0{key}", row.scope_direction)
        };
        compare_text(&order(&left.1, &left.0), &order(&right.1, &right.0))
    });
    ScopeRelations {
        internal: internal.into_iter().map(|(_, row)| row).collect(),
        outside: crossing.into_iter().map(|(_, row)| row).collect(),
        graph_node_count: graph_documents.len(),
        unresolved_graph_references: unresolved_references,
        unresolved_dependency_references: unresolved_dependencies,
    }
}

fn resolved_view<'a>(
    item: &'a Item,
    document: &'a LoadedDocument,
    claim: Claim,
) -> Result<ResolvedMember<'a>, FileReadError> {
    let body = document.body()?;
    let delivery = describe_body_delivery(&body, BodyMode::Excerpt, EXCERPT_CHARS, None);
    let frontmatter = document.frontmatter();
    Ok(ResolvedMember {
        item_id: &item.id,
        requested_uid: uid_of(item),
        identity_resolution: claim.word(),
        uid: frontmatter.get("uid"),
        slug: document.slug(),
        kind: frontmatter.get("kind"),
        title: titled(document),
        domain: frontmatter.text("domain"),
        mtime: document.modified_ms(),
        review: member_review(frontmatter, &body),
        evidence: Evidence {
            implementation_path: frontmatter
                .text("path")
                .filter(|path| !trim(path).is_empty()),
            excerpt: delivery.text,
            excerpt_truncated: delivery.info.truncated(),
            body_chars: delivery.info.total_chars(),
        },
    })
}

fn unresolved_view<'a>(item: &'a Item, reason: &'static str, claim_count: Option<usize>) -> UnresolvedMember<'a> {
    let last_known_path = match &item.target {
        Target::Ontology { last_known_path, .. } => last_known_path.as_str(),
        Target::Reference { path, .. } => path.as_str(),
    };
    UnresolvedMember {
        ok: false,
        item_id: &item.id,
        uid: uid_of(item),
        label: &item.label,
        last_known_path,
        reason,
        claim_count,
    }
}

fn rows_of<T>(mut rows: Vec<T>, limit: usize) -> RelationRows<T> {
    let total = rows.len();
    rows.truncate(limit);
    RelationRows {
        total,
        returned: rows.len(),
        limited: rows.len() < total,
        rows,
    }
}

/// The constellation as `documents` hold its members now.
pub fn constellation_context<'a>(
    selection: &'a Selection<'a>,
    documents: &'a [LoadedDocument],
    request: &ContextRequest,
) -> Result<ConstellationContext<'a>, ContextFault> {
    let items = &selection.items;
    if request.offset > items.len() {
        return Err(ContextFault::OffsetPastTotal(items.len()));
    }
    let page: Vec<&Item> = items
        .iter()
        .skip(request.offset)
        .take(request.limit)
        .copied()
        .collect();
    let next = request.offset + page.len();
    let has_more = next < items.len();
    let pagination = Pagination::of(request.offset, request.limit, items.len(), page.len());
    let claims = uid_claims(documents);
    let ontology_items: Vec<&Item> = items.iter().copied().filter(|item| item.ontology).collect();
    let resolutions: Vec<Resolution<'_>> = ontology_items
        .iter()
        .map(|item| resolve_member(item, &claims))
        .collect();
    let on_page: HashSet<&str> = page.iter().map(|item| item.id.as_str()).collect();
    let resolved_slugs: HashSet<&str> = resolutions
        .iter()
        .filter_map(|row| match row {
            Resolution::Resolved { document, .. } => Some(document.slug()),
            Resolution::Unresolved { .. } => None,
        })
        .collect();
    let mut resolved_members = Vec::new();
    let mut unresolved_members = Vec::new();
    for resolution in &resolutions {
        match resolution {
            Resolution::Resolved { item, document, claim } if on_page.contains(item.id.as_str()) => {
                resolved_members.push(
                    resolved_view(item, document, *claim).map_err(ContextFault::Unreadable)?,
                );
            }
            Resolution::Unresolved { item, reason, claim_count }
                if on_page.contains(item.id.as_str()) =>
            {
                unresolved_members.push(unresolved_view(item, reason, *claim_count));
            }
            _ => {}
        }
    }
    let resolved_total = resolutions
        .iter()
        .filter(|row| matches!(row, Resolution::Resolved { .. }))
        .count();
    let relations = scope_relations(documents, &resolved_slugs);
    let internal = rows_of(relations.internal, request.relation_limit);
    let outside = rows_of(relations.outside, request.dependency_limit);
    let selection_view = SelectionView {
        id: &selection.folder.id,
        name: trim(&selection.folder.name),
        purpose: purpose_of(
            selection
                .folder
                .constellation
                .as_ref()
                .and_then(|facts| facts.purpose.as_deref()),
        ),
        created_at: selection
            .folder
            .constellation
            .as_ref()
            .map_or("", |facts| facts.created_at.as_str()),
        updated_at: selection
            .folder
            .constellation
            .as_ref()
            .map_or("", |facts| facts.updated_at.as_str()),
        member_count: items.len(),
        ontology_member_count: ontology_items.len(),
        reference_member_count: items.len() - ontology_items.len(),
        members: page
            .iter()
            .map(|item| SelectedMember {
                item_id: &item.id,
                order: item.order,
                label: trim(&item.label),
                target: &item.target,
            })
            .collect(),
        pagination,
    };
    let coverage = Coverage {
        selected_membership: "saved_user_scope",
        member_facts: if request.offset > 0 || has_more {
            "paged_current_facts"
        } else {
            "complete_current_facts_for_saved_members"
        },
        internal_relations: if internal.limited {
            "bounded_declared_edges"
        } else {
            "all_declared_edges_between_resolved_saved_members"
        },
        outside_scope_dependencies: if outside.limited {
            "bounded_direct_declared_dependencies"
        } else {
            "all_direct_declared_dependencies_crossing_saved_scope"
        },
        transitive_impact_checked: false,
        graph_nodes_scanned: relations.graph_node_count,
        unresolved_graph_references: relations.unresolved_graph_references,
        unresolved_dependency_references: relations.unresolved_dependency_references,
        meaning_acceptance_inferred: false,
        complete_impact_inferred: false,
    };
    Ok(ConstellationContext {
        selection: selection_view,
        current: Current {
            resolved_members,
            unresolved_members,
            resolved_member_total: resolved_total,
            unresolved_member_total: resolutions.len() - resolved_total,
        },
        relations: internal,
        outside_scope_dependencies: outside,
        coverage,
        guidance: GUIDANCE,
    })
}

#[cfg(test)]
mod tests {
    #![allow(
        clippy::disallowed_methods,
        clippy::indexing_slicing,
        clippy::panic,
        reason = "a test plants the vault whose nodes the constellation names"
    )]

    use confined_files::VaultRoot;
    use serde_json::json;
    use vault_document::{DocumentCache, LoadedVault};

    use super::*;
    use crate::collections_validation::validate;

    const FOLDER: &str = "1f6c0b1a-8f2e-4c3a-9d5e-000000000001";
    const INSIDE_A: &str = "1f6c0b1a-8f2e-4c3a-9d5e-00000000000a";
    const INSIDE_B: &str = "1f6c0b1a-8f2e-4c3a-9d5e-00000000000b";
    const OUTSIDE: &str = "1f6c0b1a-8f2e-4c3a-9d5e-00000000000c";
    const GONE: &str = "1f6c0b1a-8f2e-4c3a-9d5e-00000000000d";

    fn node(uid: &str, title: &str, more: &str) -> String {
        format!("---\nkind: capability\nuid: {uid}\ntitle: {title}\n{more}---\nBody of {title}.\n")
    }

    fn item(id: u32, uid: &str) -> serde_json::Value {
        json!({
            "id": format!("1f6c0b1a-8f2e-4c3a-9d5e-1000000000{id:02}"),
            "folderId": FOLDER,
            "order": id,
            "label": format!("Member {id}"),
            "target": { "kind": "ontology", "uid": uid, "lastKnownPath": "capabilities/x.md" },
        })
    }

    #[test]
    fn members_resolve_by_uid_and_only_direct_dependencies_cross_the_boundary() {
        let folder = tempfile::tempdir().expect("vault");
        for (name, text) in [
            ("a", node(INSIDE_A, "A", "dependencies: [capabilities/b, capabilities/outside]\n")),
            ("b", node(INSIDE_B, "B", "")),
            ("outside", node(OUTSIDE, "Outside", "dependencies: [capabilities/a]\n")),
        ] {
            let file = folder.path().join(format!("capabilities/{name}.md"));
            std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
            std::fs::write(file, text).expect("write");
        }
        let loaded = LoadedVault::load(
            &VaultRoot::open(folder.path()).expect("vault root"),
            &DocumentCache::new(),
        )
        .expect("vault");
        let document = json!({
            "folders": [{
                "id": FOLDER, "name": "Checkout", "parentId": null, "order": 0,
                "presentation": "constellation",
                "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z",
            }],
            "items": [item(1, INSIDE_A), item(2, INSIDE_B), item(3, GONE)],
        });
        let collections = validate(document.as_object().expect("an object")).expect("valid");
        let selection = select_constellation(&collections, FOLDER).expect("the constellation");
        let request = ContextRequest {
            offset: 0,
            limit: 50,
            relation_limit: 100,
            dependency_limit: 100,
        };
        let answer = constellation_context(&selection, loaded.documents(), &request)
            .unwrap_or_else(|_| panic!("an answer"));
        let value = serde_json::to_value(&answer).expect("json");

        assert_eq!(value["current"]["resolvedMemberTotal"], 2);
        assert_eq!(value["current"]["unresolvedMembers"][0]["reason"], "missing");
        assert_eq!(value["relations"]["rows"][0]["from"]["slug"], "capabilities/a");
        assert_eq!(value["relations"]["rows"][0]["to"]["slug"], "capabilities/b");
        let crossing = &value["outsideScopeDependencies"]["rows"];
        assert_eq!(crossing.as_array().map(Vec::len), Some(2));
        assert_eq!(crossing[0]["scopeDirection"], "incoming");
        assert_eq!(crossing[1]["scopeDirection"], "outgoing");
        assert_eq!(value["coverage"]["transitiveImpactChecked"], false);
    }
}
