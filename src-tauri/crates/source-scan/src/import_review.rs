//! One import-backed candidate as a review packet an agent can act on, in the canonical from/to
//! order. The order is a review cursor, never a confidence ranking: nothing here says a
//! candidate is semantically stronger than the next.

use serde::Serialize;

use answer_format::utf16;

use crate::import_edges::ImportEdge;
use crate::import_reconciliation::{CodeCandidate, EvidenceQualification, Reconciliation};
use crate::source_scan_error::SourceScanError;

#[derive(Debug, Serialize)]
pub struct QueueOrdering {
    pub basis: &'static str,
    #[serde(rename = "meaningConfidence")]
    pub meaning_confidence: bool,
    pub note: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewedCandidate {
    pub from: String,
    pub to: String,
    pub relation_type: &'static str,
    pub absent_endpoints: Vec<String>,
    pub import_count: usize,
    pub source_evidence: Vec<ImportEdge>,
    pub source_evidence_limited: bool,
    pub evidence_qualification: EvidenceQualification,
}

#[derive(Debug, Serialize)]
pub struct ObservedPaths {
    pub endpoint: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RootArguments {
    #[serde(rename = "rootPath")]
    pub root_path: String,
}

#[derive(Debug, Serialize)]
pub struct AnalysisCall {
    pub tool: &'static str,
    pub arguments: RootArguments,
    pub purpose: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ProposalFieldsByKind {
    pub project: [&'static str; 0],
    pub domain: [&'static str; 0],
    pub capability: [&'static str; 1],
    pub element: [&'static str; 2],
}

#[derive(Debug, Serialize)]
pub struct FieldsAfterKindDecision {
    pub common: [&'static str; 5],
    #[serde(rename = "byKind")]
    pub by_kind: ProposalFieldsByKind,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointDraft {
    pub endpoint: String,
    pub observed_paths: Vec<String>,
    pub slug_candidate: String,
    pub kind_decision: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddConceptsStep {
    pub tool: &'static str,
    pub fields_after_kind_decision: FieldsAfterKindDecision,
    pub endpoint_drafts: Vec<EndpointDraft>,
    pub purpose: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ResumeArguments {
    #[serde(rename = "rootPath")]
    pub root_path: String,
    #[serde(rename = "reviewMode")]
    pub review_mode: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ResumeCall {
    pub tool: &'static str,
    pub arguments: ResumeArguments,
    pub purpose: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointModelling {
    pub status: &'static str,
    pub write_allowed: bool,
    pub absent_endpoints: Vec<String>,
    pub observed_paths_by_endpoint: Vec<ObservedPaths>,
    pub analysis_call: AnalysisCall,
    pub add_concepts_step: AddConceptsStep,
    pub resume_call: ResumeCall,
}

#[derive(Debug, Serialize)]
pub struct ReadConceptsArguments {
    pub slugs: [String; 2],
    pub body: &'static str,
}

#[derive(Debug, Serialize)]
pub struct RelationCheckArguments {
    pub operation: &'static str,
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub relation_type: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum NextCall {
    ReadConcepts {
        tool: &'static str,
        arguments: ReadConceptsArguments,
        purpose: &'static str,
    },
    CheckRelation {
        tool: &'static str,
        arguments: RelationCheckArguments,
        purpose: &'static str,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub question_eligibility: &'static str,
    pub required: Vec<&'static str>,
    pub ask: &'static str,
    pub stop_when: [&'static str; 4],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cursor {
    pub after_review_id: Option<String>,
    pub total: usize,
    pub remaining: usize,
    pub has_more: bool,
    pub next_after_review_id: String,
}

/// The packet for one candidate.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextRelationReview {
    pub contract: &'static str,
    pub review_id: String,
    pub status: &'static str,
    pub write_allowed: bool,
    pub source_qualification: &'static str,
    pub ordering: QueueOrdering,
    pub candidate: ReviewedCandidate,
    pub endpoint_modelling: Option<EndpointModelling>,
    pub next_calls: Vec<NextCall>,
    pub decision: Decision,
    pub cursor: Cursor,
}

fn review_id_of(candidate: &CodeCandidate) -> String {
    format!(
        "import-review:{}:{}",
        encode_uri_component(&candidate.from),
        encode_uri_component(&candidate.to)
    )
}

/// JavaScript's `encodeURIComponent`: everything but letters, digits and `-_.!~*'()` is written
/// as the percent-encoded bytes of its UTF-8.
fn encode_uri_component(text: &str) -> String {
    let mut encoded = String::with_capacity(text.len());
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

/// The queue a review walks: candidates whose endpoints are nodes first, then those that need an
/// endpoint modelled, in one cursor so a mixed queue cannot starve missing-endpoint recovery.
fn queue_of(reconciliation: &Reconciliation) -> Vec<&CodeCandidate> {
    reconciliation
        .in_code_missing_from_vault
        .iter()
        .chain(&reconciliation.in_code_missing_endpoint_absent)
        .collect()
}

/// The observed source paths of each absent endpoint, sorted and unique.
fn observed_paths(candidate: &CodeCandidate, absent: &[String]) -> Vec<ObservedPaths> {
    absent
        .iter()
        .map(|endpoint| {
            let mut paths: Vec<String> = Vec::new();
            for evidence in &candidate.source_evidence {
                if *endpoint == candidate.from {
                    paths.push(evidence.from.clone());
                }
                if *endpoint == candidate.to {
                    paths.push(evidence.to.clone());
                }
            }
            paths.sort_by(|left, right| utf16::compare(left, right));
            paths.dedup();
            ObservedPaths {
                endpoint: endpoint.clone(),
                paths,
            }
        })
        .collect()
}

fn endpoint_modelling(
    candidate: &CodeCandidate,
    absent: &[String],
    root_path: &str,
) -> EndpointModelling {
    let observed = observed_paths(candidate, absent);
    let drafts = observed
        .iter()
        .map(|row| EndpointDraft {
            endpoint: row.endpoint.clone(),
            observed_paths: row.paths.clone(),
            slug_candidate: row.endpoint.clone(),
            kind_decision: "human_meaning_required",
        })
        .collect();
    EndpointModelling {
        status: "required_before_relation_review",
        write_allowed: false,
        absent_endpoints: absent.to_vec(),
        observed_paths_by_endpoint: observed,
        analysis_call: AnalysisCall {
            tool: "analyze_repo_structure",
            arguments: RootArguments {
                root_path: root_path.to_string(),
            },
            purpose: "Refresh repository candidates and evidence only; it does not create either missing ontology endpoint.",
        },
        add_concepts_step: AddConceptsStep {
            tool: "add_concepts",
            fields_after_kind_decision: FieldsAfterKindDecision {
                common: ["slug", "title", "definition", "evidence", "confidence"],
                by_kind: ProposalFieldsByKind {
                    project: [],
                    domain: [],
                    capability: ["domain"],
                    element: ["domain", "path"],
                },
            },
            endpoint_drafts: drafts,
            purpose: "After the kind is decided from reviewed product meaning, write each missing endpoint as one add_concepts row (slug, kind, title, body, and domain or path by kind). Do not infer kind, title, definition, domain, or path from the endpoint slug alone.",
        },
        resume_call: ResumeCall {
            tool: "infer_imports",
            arguments: ResumeArguments {
                root_path: root_path.to_string(),
                review_mode: "next",
            },
            purpose: "After an accepted endpoint plan is written, restart the current semantic queue so this candidate is reclassified against the new vault nodes.",
        },
    }
}

/// The packet for the candidate after `after_review_id` (the first when `None`), or `None` when
/// the queue is exhausted.
pub fn build_next_relation_review(
    reconciliation: &Reconciliation,
    after_review_id: Option<&str>,
    root_path: &str,
) -> Result<Option<NextRelationReview>, SourceScanError> {
    let queue = queue_of(reconciliation);
    let ids: Vec<String> = queue
        .iter()
        .map(|candidate| review_id_of(candidate))
        .collect();
    let at = match after_review_id {
        None => 0,
        Some(after) => match ids.iter().position(|id| id == after) {
            Some(previous) => previous + 1,
            None => {
                return Err(SourceScanError::not_found(format!(
                    "afterReviewId was not found in the current import review queue: {after}. Omit afterReviewId to restart from the first current candidate."
                )))
            }
        },
    };
    let (Some(candidate), Some(review_id)) = (queue.get(at), ids.get(at)) else {
        return Ok(None);
    };
    let needs_endpoints = candidate.review.required.contains(&"vault_endpoints");
    let absent = candidate.absent_endpoints.clone().unwrap_or_default();
    let valued = candidate.evidence_qualification.product_value_count > 0;
    let remaining = queue.len().saturating_sub(at + 1);
    Ok(Some(NextRelationReview {
        contract: "nextRelationReview:v1",
        review_id: review_id.clone(),
        status: "rationale_review_required",
        write_allowed: false,
        source_qualification: "observed_this_call_not_relation_receipt",
        ordering: QueueOrdering {
            basis: "canonical_from_to",
            meaning_confidence: false,
            note: "Queue order is deterministic review order, not evidence that this candidate is semantically stronger.",
        },
        candidate: ReviewedCandidate {
            from: candidate.from.clone(),
            to: candidate.to.clone(),
            relation_type: "depends_on",
            absent_endpoints: absent.clone(),
            import_count: candidate.count,
            source_evidence: candidate.source_evidence.clone(),
            source_evidence_limited: candidate.source_evidence_limited,
            evidence_qualification: candidate.evidence_qualification.clone(),
        },
        endpoint_modelling: needs_endpoints
            .then(|| endpoint_modelling(candidate, &absent, root_path)),
        next_calls: if needs_endpoints {
            Vec::new()
        } else {
            vec![
                NextCall::ReadConcepts {
                    tool: "get_concepts",
                    arguments: ReadConceptsArguments {
                        slugs: [candidate.from.clone(), candidate.to.clone()],
                        body: "full",
                    },
                    purpose: "Read both ontology meanings before deciding whether the code fact is a semantic dependency.",
                },
                NextCall::CheckRelation {
                    tool: "query_ontology",
                    arguments: RelationCheckArguments {
                        operation: "relation_check",
                        from: candidate.from.clone(),
                        to: candidate.to.clone(),
                        relation_type: "depends_on",
                    },
                    purpose: "Check graph shape only; safe_to_add is not semantic approval.",
                },
            ]
        },
        decision: Decision {
            question_eligibility: if needs_endpoints {
                "blocked_missing_vault_endpoints"
            } else if valued {
                "eligible_after_semantic_review"
            } else {
                "additional_product_meaning_evidence_required"
            },
            required: candidate.review.required.clone(),
            ask: if needs_endpoints {
                "Do not ask for relation approval yet. First model and review both ontology endpoints, then explain the observable ability and semantic rationale before asking for approval."
            } else if valued {
                "After the reads, explain which observable ability of the source concept fails without the target. Only if that stable meaning dependency holds, ask the person to approve this exact direction and rationale."
            } else {
                "Do not ask the person to approve a product depends_on relation from this import alone: no product-code value import was observed. Keep the test/type evidence visible and require separate product meaning evidence before any approval question."
            },
            stop_when: [
                "either endpoint meaning does not match the source files",
                "relation_check reports an existing or inverse relation that needs review",
                "the import is an implementation convenience rather than a stable meaning dependency",
                "a nonblank semantic rationale cannot be stated",
            ],
        },
        cursor: Cursor {
            after_review_id: after_review_id.map(str::to_string),
            total: queue.len(),
            remaining,
            has_more: remaining > 0,
            next_after_review_id: review_id.clone(),
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import_edges::{ImportKind, ImportUsage, SourceRole};
    use crate::import_reconciliation::{reconcile_import_edges, VaultFacts};
    use crate::import_rollup::EdgeStats;
    use crate::import_scan::ModuleEdge;
    use crate::source_scan_error::ScanErrorCode;

    fn module(from: &str, to: &str) -> ModuleEdge {
        let mut stats = EdgeStats::default();
        stats.add(ImportEdge {
            from: format!("{from}/a.ts"),
            to: format!("{to}/b.ts"),
            kind: ImportKind::Static,
            source_role: SourceRole::Production,
            import_usage: ImportUsage::Value,
        });
        ModuleEdge {
            from: from.to_string(),
            to: to.to_string(),
            stats,
        }
    }

    #[test]
    fn a_queue_walks_nodes_first_then_endpoints_to_model_and_ids_are_url_encoded() {
        let vault = VaultFacts {
            node_slugs: ["a", "b"].iter().map(|slug| (*slug).to_string()).collect(),
            ..VaultFacts::default()
        };
        let found = reconcile_import_edges(&[module("a", "b"), module("a", "new thing")], &vault);
        let first = build_next_relation_review(&found, None, "/repo")
            .expect("reads")
            .expect("a first packet");
        assert_eq!(first.review_id, "import-review:a:b");
        assert_eq!(first.next_calls.len(), 2);
        assert!(first.endpoint_modelling.is_none());
        let second = build_next_relation_review(&found, Some(&first.review_id), "/repo")
            .expect("reads")
            .expect("a second packet");
        assert_eq!(second.review_id, "import-review:a:new%20thing");
        assert!(second.next_calls.is_empty());
        assert_eq!(
            second.decision.question_eligibility,
            "blocked_missing_vault_endpoints"
        );
        let modelling = second.endpoint_modelling.expect("endpoint recovery");
        assert_eq!(
            modelling.observed_paths_by_endpoint[0].paths,
            ["new thing/b.ts"]
        );
        assert!(!second.cursor.has_more);
        assert!(
            build_next_relation_review(&found, Some(&second.review_id), "/repo")
                .expect("reads")
                .is_none()
        );
        let lost = build_next_relation_review(&found, Some("import-review:x:y"), "/repo")
            .expect_err("unknown cursor");
        assert!(lost.code() == ScanErrorCode::NotFound);
    }
}
