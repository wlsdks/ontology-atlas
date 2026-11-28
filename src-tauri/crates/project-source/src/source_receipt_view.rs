//! What a vault says about one project's source right now: the stored receipt, judged against the
//! folder as it is and the ontology as it is. A bound private root only reproduces the probe;
//! neither the root nor the raw inspection crosses this boundary.
//!
//! Graph currentness is judged only against a complete project-scoped hash: a bounded or unknown
//! scope is no evidence of drift.

use std::path::Path;

use answer_format::collation::compare_text;
use serde::Serialize;
use serde_json::Value;

use crate::source_bindings::{read_source_bindings, BindingsRead, StoredBinding};
use crate::source_probe::{inspect_project_source, SourceKind, SourceProbe};
use crate::source_receipt::{
    witness_inventory_paths, ActionRef, Diagnostics, GapRef, SourceReceipt, Witness,
    WitnessSummary, SOURCE_RECEIPT_VERSION,
};
use crate::source_vocabulary::{is_action_id, is_gap_id};
use crate::source_witnesses::{normalized_witness_path, WitnessClaim};

const RECEIPT_STATUSES: [&str; 3] = ["needs_evidence", "review_required", "verified_current"];

#[derive(Debug, Clone, Serialize)]
pub struct LiveWitnessCheck {
    pub contract: &'static str,
    pub status: &'static str,
    /// `receipt`: the witnesses a person measured; `current_graph`: those the ontology declares now.
    pub basis: &'static str,
    #[serde(rename = "sourceRevision")]
    pub source_revision: String,
    #[serde(rename = "sourceFingerprint")]
    pub source_fingerprint: String,
    #[serde(rename = "witnessSummary")]
    pub witness_summary: WitnessSummary,
    #[serde(rename = "missingPaths")]
    pub missing_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SourceView {
    #[serde(rename = "contractVersion")]
    pub contract_version: u8,
    #[serde(rename = "projectSlug")]
    pub project_slug: String,
    pub status: String,
    pub currentness: &'static str,
    #[serde(rename = "measuredAt")]
    pub measured_at: Option<String>,
    #[serde(rename = "topGap")]
    pub top_gap: Option<GapRef>,
    #[serde(rename = "nextAction")]
    pub next_action: ActionRef,
    #[serde(rename = "bindingCardinality")]
    pub binding_cardinality: usize,
    pub receipt: Option<SourceReceipt>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub live: Option<LiveWitnessCheck>,
}

fn view(
    project_slug: &str,
    cardinality: usize,
    status: &str,
    currentness: &'static str,
    top_gap: Option<GapRef>,
    next_action: ActionRef,
    receipt: Option<SourceReceipt>,
) -> SourceView {
    SourceView {
        contract_version: SOURCE_RECEIPT_VERSION,
        project_slug: project_slug.to_string(),
        status: status.to_string(),
        currentness,
        measured_at: receipt.as_ref().map(|receipt| receipt.measured_at.clone()),
        top_gap,
        next_action,
        binding_cardinality: cardinality,
        receipt,
        live: None,
    }
}

fn unbound(project_slug: &str) -> SourceView {
    view(
        project_slug,
        0,
        "not_measured",
        "unavailable",
        Some(GapRef::of("source_unbound")),
        ActionRef::of("connect_source"),
        None,
    )
}

fn malformed(project_slug: &str, cardinality: usize) -> SourceView {
    view(
        project_slug,
        cardinality,
        "invalid",
        "stale",
        Some(GapRef::of("receipt_malformed")),
        ActionRef::of("repair_source_binding"),
        None,
    )
}

fn text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)?
        .as_str()
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

/// A JSON number JavaScript's `Number.isInteger` accepts, from zero up.
fn whole_count(value: &Value) -> Option<usize> {
    if let Some(count) = value.as_u64() {
        return usize::try_from(count).ok();
    }
    let number = value.as_f64()?;
    (number >= 0.0 && number.fract() == 0.0 && number < 9.0e15).then_some(number as usize)
}

fn safe_relative_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    let mut characters = normalized.chars();
    let drive = matches!(
        (characters.next(), characters.next(), characters.next()),
        (Some(letter), Some(':'), Some('/')) if letter.is_ascii_alphabetic()
    );
    !path.is_empty() && !normalized.starts_with('/') && !drive && !normalized.split('/').any(|part| part == "..")
}

fn sanitize_gap(value: &Value) -> Option<Option<GapRef>> {
    if value.is_null() {
        return Some(None);
    }
    let id = text(value, "id").filter(|id| is_gap_id(id))?;
    Some(Some(GapRef {
        id,
        node_slug: text(value, "nodeSlug"),
    }))
}

fn sanitize_action(value: &Value) -> Option<ActionRef> {
    let id = text(value, "id").filter(|id| is_action_id(id))?;
    Some(ActionRef {
        id,
        target: text(value, "target"),
    })
}

fn sanitize_witness(value: &Value) -> Option<Witness> {
    let path = text(value, "path").filter(|path| safe_relative_path(path))?;
    Some(Witness {
        id: text(value, "id")?,
        node_slug: text(value, "nodeSlug")?,
        role: text(value, "role")?,
        path,
        supported: value.get("supported")?.as_bool()?,
    })
}

/// Only the public receipt contract; unknown fields of the stored file never reach an answer.
pub fn sanitize_receipt(value: &Value, project_slug: &str) -> Option<SourceReceipt> {
    if !value.is_object() {
        return None;
    }
    let top_gap = sanitize_gap(value.get("topGap")?)?;
    let next_action = sanitize_action(value.get("nextAction")?)?;
    if whole_count(value.get("contractVersion")?) != Some(usize::from(SOURCE_RECEIPT_VERSION))
        || value.get("projectSlug")?.as_str() != Some(project_slug)
    {
        return None;
    }
    let status = text(value, "status").filter(|status| RECEIPT_STATUSES.contains(&status.as_str()))?;
    let source_kind = text(value, "sourceKind").filter(|kind| SourceKind::from_word(kind).is_some())?;
    let summary = value.get("witnessSummary")?;
    let (total, supported, missing) = (
        whole_count(summary.get("total")?)?,
        whole_count(summary.get("supported")?)?,
        whole_count(summary.get("missing")?)?,
    );
    let listed = value.get("witnesses")?.as_array()?;
    let diagnostics = value.get("diagnostics")?;
    let dirty = match diagnostics.get("dirty")? {
        Value::Null => None,
        Value::Bool(flag) => Some(*flag),
        _ => return None,
    };
    if total != supported + missing || listed.len() != total {
        return None;
    }
    let witnesses: Vec<Witness> = listed
        .iter()
        .map(sanitize_witness)
        .collect::<Option<Vec<_>>>()?;
    if witnesses.iter().filter(|witness| witness.supported).count() != supported {
        return None;
    }
    Some(SourceReceipt {
        contract_version: SOURCE_RECEIPT_VERSION,
        project_slug: project_slug.to_string(),
        source_id: text(value, "sourceId")?,
        source_kind,
        source_revision: text(value, "sourceRevision")?,
        source_fingerprint: text(value, "sourceFingerprint")?,
        graph_hash: text(value, "graphHash")?,
        measured_at: text(value, "measuredAt")?,
        status,
        currentness: "current",
        top_gap,
        next_action,
        witness_summary: WitnessSummary { total, supported, missing },
        witnesses,
        diagnostics: Diagnostics {
            dirty,
            truncated: diagnostics.get("truncated")?.as_bool()?,
        },
    })
}

fn matches_probe(probe: &SourceProbe, receipt: &SourceReceipt) -> bool {
    probe.kind.word() == receipt.source_kind
        && probe.source_id == receipt.source_id
        && probe.fingerprint == receipt.source_fingerprint
        && probe.revision == receipt.source_revision
}

/// Re-checks witnesses against the live inventory the probe already holds, in memory, so a brief
/// can verify coordinates instead of saying unknown. The receipt stays stale until a connect
/// restamps it.
fn live_witness_check(
    probe: &SourceProbe,
    witnesses: &[(String, bool)],
    basis: &'static str,
) -> LiveWitnessCheck {
    let inventory = witness_inventory_paths(&probe.files);
    let mut missing: Vec<String> = witnesses
        .iter()
        .map(|(path, _)| normalized_witness_path(path))
        .filter(|path| !inventory.contains(path))
        .collect();
    missing.sort_by(|left, right| compare_text(left, right));
    let status = if witnesses.is_empty() {
        "no_witnesses"
    } else if probe.truncated {
        "inventory_truncated"
    } else if missing.is_empty() {
        "witnesses_supported"
    } else {
        "witnesses_missing"
    };
    LiveWitnessCheck {
        contract: "projectSourceLiveWitnesses:v1",
        status,
        basis,
        source_revision: probe.revision.clone(),
        source_fingerprint: probe.fingerprint.clone(),
        witness_summary: WitnessSummary {
            total: witnesses.len(),
            supported: witnesses.len() - missing.len(),
            missing: missing.len(),
        },
        missing_paths: missing.into_iter().take(5).collect(),
    }
}

/// The view of `project_slug`. `graph_hash` is the project's current hash when its scope is whole;
/// `current_claims` the witnesses the ontology declares now, for the live check after a change.
pub fn read_source_view(
    vault: &Path,
    project_slug: &str,
    graph_hash: Option<&str>,
    current_claims: Option<&[WitnessClaim]>,
) -> SourceView {
    let bindings = match read_source_bindings(vault) {
        BindingsRead::Missing => return unbound(project_slug),
        BindingsRead::UnsafePath | BindingsRead::Malformed => return malformed(project_slug, 0),
        read @ BindingsRead::Ok(_) => read,
    };
    let held: Vec<&StoredBinding> = bindings.bound_to(project_slug);
    let binding = match held.as_slice() {
        [] => return unbound(project_slug),
        [only] => *only,
        many => {
            return view(
                project_slug,
                many.len(),
                "invalid",
                "stale",
                Some(GapRef::of("multiple_active_sources")),
                ActionRef::of("repair_source_binding"),
                None,
            )
        }
    };
    let receipt = binding
        .receipt
        .as_ref()
        .and_then(|stored| sanitize_receipt(stored, project_slug))
        .filter(|receipt| {
            receipt.source_id == binding.source_id && receipt.source_kind == binding.kind.word()
        });
    let Some(receipt) = receipt else {
        return malformed(project_slug, 1);
    };
    // A transient permission, file system or Git failure keeps a valid receipt, currentness unavailable.
    let probe = inspect_project_source(Path::new(&binding.root_path), Some(vault)).ok();
    if graph_hash.is_some_and(|hash| receipt.graph_hash != hash) {
        let mut moved = view(
            project_slug,
            1,
            "review_required",
            "stale",
            Some(GapRef::of("ontology_changed")),
            ActionRef::of("remeasure_source"),
            Some(receipt.clone()),
        );
        moved.live = probe.as_ref().map(|probe| match current_claims {
            Some(claims) => {
                let paths: Vec<(String, bool)> =
                    claims.iter().map(|claim| (claim.path.clone(), true)).collect();
                live_witness_check(probe, &paths, "current_graph")
            }
            None => live_witness_check(probe, &receipt_paths(&receipt), "receipt"),
        });
        return moved;
    }
    let Some(probe) = probe else {
        return view(
            project_slug,
            1,
            &receipt.status.clone(),
            "unavailable",
            receipt.top_gap.clone(),
            receipt.next_action.clone(),
            Some(receipt),
        );
    };
    if !matches_probe(&probe, &receipt) {
        let mut changed = view(
            project_slug,
            1,
            "review_required",
            "stale",
            Some(GapRef::of("source_changed")),
            ActionRef::of("remeasure_source"),
            Some(receipt.clone()),
        );
        changed.live = Some(live_witness_check(&probe, &receipt_paths(&receipt), "receipt"));
        return changed;
    }
    view(
        project_slug,
        1,
        &receipt.status.clone(),
        "current",
        receipt.top_gap.clone(),
        receipt.next_action.clone(),
        Some(receipt),
    )
}

fn receipt_paths(receipt: &SourceReceipt) -> Vec<(String, bool)> {
    receipt
        .witnesses
        .iter()
        .map(|witness| (witness.path.clone(), witness.supported))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn stored() -> Value {
        json!({
            "contractVersion": 1, "projectSlug": "p", "sourceId": "sha256:a", "sourceKind": "folder",
            "sourceRevision": "sha256:r", "sourceFingerprint": "sha256:f",
            "graphHash": "project-graph-v1:00000000", "measuredAt": "2026-01-01T00:00:00.000Z",
            "status": "verified_current", "currentness": "current", "topGap": null,
            "nextAction": {"id": "use_current_evidence"},
            "witnessSummary": {"total": 1, "supported": 1, "missing": 0},
            "witnesses": [{"id": "n:path", "nodeSlug": "n", "role": "entrypoint", "path": "src/a.go", "supported": true, "extra": 1}],
            "diagnostics": {"dirty": null, "truncated": false},
            "private": "/home/me/code"
        })
    }

    #[test]
    fn a_stored_receipt_is_read_back_without_a_field_the_contract_does_not_name() {
        let receipt = sanitize_receipt(&stored(), "p").expect("valid");
        let text = serde_json::to_string(&receipt).expect("writes");
        assert!(!text.contains("private") && !text.contains("extra"));
        assert_eq!(receipt.witnesses.len(), 1);
    }

    #[test]
    fn a_receipt_whose_counts_or_witness_paths_cannot_be_trusted_is_rejected() {
        let mut counts = stored();
        counts["witnessSummary"]["supported"] = json!(0);
        counts["witnessSummary"]["missing"] = json!(1);
        assert!(sanitize_receipt(&counts, "p").is_none());
        let mut escaping = stored();
        escaping["witnesses"][0]["path"] = json!("../outside");
        assert!(sanitize_receipt(&escaping, "p").is_none());
        let mut other = stored();
        other["projectSlug"] = json!("q");
        assert!(sanitize_receipt(&other, "p").is_none());
        let mut unknown_gap = stored();
        unknown_gap["topGap"] = json!({"id": "made_up"});
        assert!(sanitize_receipt(&unknown_gap, "p").is_none());
    }
}
