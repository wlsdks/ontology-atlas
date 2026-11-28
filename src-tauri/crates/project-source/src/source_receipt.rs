//! What one measurement of a project's source recorded, and how it is minted from a probe and the
//! claims the project's documents make. A claim is supported when its path is a file of the probe
//! or a folder above one.

use std::collections::HashSet;

use serde::Serialize;

use crate::source_probe::SourceProbe;
use crate::source_witnesses::{normalized_witness_path, WitnessClaim};

pub const SOURCE_RECEIPT_VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GapRef {
    pub id: String,
    #[serde(rename = "nodeSlug", skip_serializing_if = "Option::is_none")]
    pub node_slug: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ActionRef {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

impl ActionRef {
    pub fn of(id: &str) -> Self {
        Self {
            id: id.to_string(),
            target: None,
        }
    }
}

impl GapRef {
    pub fn of(id: &str) -> Self {
        Self {
            id: id.to_string(),
            node_slug: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Witness {
    pub id: String,
    #[serde(rename = "nodeSlug")]
    pub node_slug: String,
    pub role: String,
    pub path: String,
    pub supported: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct WitnessSummary {
    pub total: usize,
    pub supported: usize,
    pub missing: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Diagnostics {
    pub dirty: Option<bool>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceReceipt {
    #[serde(rename = "contractVersion")]
    pub contract_version: u8,
    #[serde(rename = "projectSlug")]
    pub project_slug: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "sourceKind")]
    pub source_kind: String,
    #[serde(rename = "sourceRevision")]
    pub source_revision: String,
    #[serde(rename = "sourceFingerprint")]
    pub source_fingerprint: String,
    #[serde(rename = "graphHash")]
    pub graph_hash: String,
    #[serde(rename = "measuredAt")]
    pub measured_at: String,
    pub status: String,
    pub currentness: &'static str,
    #[serde(rename = "topGap")]
    pub top_gap: Option<GapRef>,
    #[serde(rename = "nextAction")]
    pub next_action: ActionRef,
    #[serde(rename = "witnessSummary")]
    pub witness_summary: WitnessSummary,
    pub witnesses: Vec<Witness>,
    pub diagnostics: Diagnostics,
}

/// Every path a probe supports: `.`, each file and every folder above one, so `path: src/features/x`
/// counts when any file beneath it exists. Minting and the live check share it.
pub fn witness_inventory_paths(files: &[String]) -> HashSet<String> {
    let mut paths: HashSet<String> = HashSet::with_capacity(files.len() * 2);
    paths.insert(".".to_string());
    for file in files {
        let normalized = normalized_witness_path(file);
        let mut end = 0;
        for (index, part) in normalized.split('/').enumerate() {
            if index > 0 {
                paths.insert(normalized.get(..end).unwrap_or("").to_string());
                end += 1;
            }
            end += part.len();
        }
        paths.insert(normalized);
    }
    paths
}

pub struct MintInput<'a> {
    pub project_slug: &'a str,
    pub graph_hash: &'a str,
    pub probe: &'a SourceProbe,
    pub claims: &'a [WitnessClaim],
    pub measured_at: &'a str,
}

pub fn mint_source_receipt(input: &MintInput<'_>) -> SourceReceipt {
    let inventory = witness_inventory_paths(&input.probe.files);
    let witnesses: Vec<Witness> = input
        .claims
        .iter()
        .map(|claim| {
            let path = normalized_witness_path(&claim.path);
            Witness {
                id: claim.id.clone(),
                node_slug: claim.node_slug.clone(),
                role: claim.role.to_string(),
                supported: inventory.contains(&path),
                path,
            }
        })
        .collect();
    let first_missing = witnesses.iter().find(|witness| !witness.supported);
    let missing = witnesses.iter().filter(|witness| !witness.supported).count();

    let (status, top_gap, next_action) = if witnesses.is_empty() {
        (
            "needs_evidence",
            Some(GapRef::of("source_role_evidence_missing")),
            ActionRef::of("record_source_role"),
        )
    } else if input.probe.truncated {
        (
            "review_required",
            Some(GapRef::of("source_inventory_truncated")),
            ActionRef::of("review_inventory_limit"),
        )
    } else if let Some(first) = first_missing {
        (
            "review_required",
            Some(GapRef {
                id: "declared_source_path_missing".to_string(),
                node_slug: Some(first.node_slug.clone()),
            }),
            ActionRef {
                id: "repair_source_path".to_string(),
                target: Some(first.node_slug.clone()),
            },
        )
    } else {
        ("verified_current", None, ActionRef::of("use_current_evidence"))
    };

    SourceReceipt {
        contract_version: SOURCE_RECEIPT_VERSION,
        project_slug: input.project_slug.to_string(),
        source_id: input.probe.source_id.clone(),
        source_kind: input.probe.kind.word().to_string(),
        source_revision: input.probe.revision.clone(),
        source_fingerprint: input.probe.fingerprint.clone(),
        graph_hash: input.graph_hash.to_string(),
        measured_at: input.measured_at.to_string(),
        status: status.to_string(),
        currentness: "current",
        top_gap,
        next_action,
        witness_summary: WitnessSummary {
            total: witnesses.len(),
            supported: witnesses.len() - missing,
            missing,
        },
        witnesses,
        diagnostics: Diagnostics {
            dirty: input.probe.dirty,
            truncated: input.probe.truncated,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source_probe::SourceKind;

    fn probe(files: &[&str], truncated: bool) -> SourceProbe {
        SourceProbe {
            root_path: "/r".to_string(),
            source_id: "sha256:id".to_string(),
            kind: SourceKind::Folder,
            revision: "sha256:rev".to_string(),
            fingerprint: "sha256:fp".to_string(),
            dirty: None,
            truncated,
            files: files.iter().map(|file| (*file).to_string()).collect(),
            vault_excluded: None,
        }
    }

    fn claim(node: &str, path: &str) -> WitnessClaim {
        WitnessClaim {
            id: format!("{node}:path"),
            node_slug: node.to_string(),
            role: "entrypoint",
            path: path.to_string(),
        }
    }

    fn mint(files: &[&str], truncated: bool, claims: &[WitnessClaim]) -> SourceReceipt {
        mint_source_receipt(&MintInput {
            project_slug: "p",
            graph_hash: "project-graph-v1:00000000",
            probe: &probe(files, truncated),
            claims,
            measured_at: "2026-01-01T00:00:00.000Z",
        })
    }

    #[test]
    fn a_path_is_supported_by_a_file_or_by_a_folder_above_one() {
        let paths = witness_inventory_paths(&["src/features/x/a.ts".to_string()]);
        for supported in [".", "src", "src/features", "src/features/x", "src/features/x/a.ts"] {
            assert!(paths.contains(supported), "{supported}");
        }
        assert!(!paths.contains("src/feat"));
    }

    #[test]
    fn the_receipt_names_the_one_gap_that_comes_first_and_the_action_that_closes_it() {
        let none = mint(&["a.go"], false, &[]);
        assert_eq!(none.status, "needs_evidence");
        assert_eq!(none.next_action.id, "record_source_role");

        let cut = mint(&["a.go"], true, &[claim("n", "a.go")]);
        assert_eq!(cut.top_gap.as_ref().map(|gap| gap.id.as_str()), Some("source_inventory_truncated"));

        let missing = mint(&["a.go"], false, &[claim("n", "a.go"), claim("m", "gone.go")]);
        assert_eq!(missing.witness_summary, WitnessSummary { total: 2, supported: 1, missing: 1 });
        assert_eq!(missing.next_action.target.as_deref(), Some("m"));

        let good = mint(&["a.go"], false, &[claim("n", "a.go")]);
        assert_eq!((good.status.as_str(), good.top_gap), ("verified_current", None));
    }
}
