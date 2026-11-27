//! The set difference between the module edges a scan read from code and the `depends_on`
//! edges the vault holds, so an agent gets exactly what to review instead of every import. It is
//! read-only and never decides: an import is source evidence, not a meaning dependency, and a
//! vault edge no import backs is not called stale, because a dependency can be a spawned process
//! or a configuration pointer.
//!
//! The vault arrives as [`VaultFacts`], plain data: the caller builds it from whatever graph it
//! keeps, so this file reads no graph and no file.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use answer_format::collation::compare_text;

use crate::import_coverage::SUPPORTED_EXTENSIONS;
use crate::import_edges::{ImportEdge, RoleCounts, SourceRole, UsageCounts};
use crate::import_rollup::EVIDENCE_LIMIT;
use crate::import_scan::ModuleEdge;

/// The frontmatter key the graph compiler files a `depends_on:` reference under.
const DEPENDS_ON_VIA: [&str; 2] = ["dependencies", "depends_on"];

/// One `depends_on` reference of the vault: slugs, the reference as written and the key it came
/// under.
#[derive(Debug, Clone)]
pub struct VaultEdge {
    pub from: String,
    pub to: String,
    pub reference: String,
    pub via: String,
}

/// What a reconciliation needs of the vault.
#[derive(Debug, Default)]
pub struct VaultFacts {
    /// Every edge the vault compiled, whatever its relation.
    pub edges: Vec<VaultEdge>,
    /// Alias to the canonical slug it names.
    pub aliases: HashMap<String, String>,
    pub node_slugs: HashSet<String>,
    /// Where each node says its implementation lives; a node without a `path:` is absent.
    pub paths: HashMap<String, String>,
}

/// Why an edge the vault holds could not be checked against imports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum UnjudgeableReason {
    #[serde(rename = "endpoint_path_unknown")]
    PathUnknown,
    #[serde(rename = "endpoint_language_not_scanned")]
    LanguageNotScanned,
}

#[derive(Debug, Serialize)]
pub struct SharedEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceQualification {
    pub basis: &'static str,
    pub source_role_counts: RoleCounts,
    pub import_usage_counts: UsageCounts,
    pub product_value_count: usize,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRequirement {
    pub status: &'static str,
    pub write_allowed: bool,
    pub required: Vec<&'static str>,
    pub next: &'static str,
}

/// An import-backed edge the vault does not have.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeCandidate {
    pub from: String,
    pub to: String,
    pub count: usize,
    /// Set when an endpoint is not yet a node of the vault.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absent_endpoints: Option<Vec<String>>,
    pub source_evidence: Vec<ImportEdge>,
    pub source_evidence_limited: bool,
    pub evidence_qualification: EvidenceQualification,
    pub review: ReviewRequirement,
}

#[derive(Debug, Serialize)]
pub struct VaultOnlyEdge {
    pub from: String,
    pub to: String,
    #[serde(rename = "ref")]
    pub reference: String,
    pub via: String,
}

#[derive(Debug, Serialize)]
pub struct UnjudgeableEdge {
    pub from: String,
    pub to: String,
    #[serde(rename = "ref")]
    pub reference: String,
    pub via: String,
    pub unreadable: Vec<String>,
    pub reason: UnjudgeableReason,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reconciliation {
    pub in_both: Vec<SharedEdge>,
    pub in_code_missing_from_vault: Vec<CodeCandidate>,
    pub in_code_missing_endpoint_absent: Vec<CodeCandidate>,
    pub in_vault_not_in_code: Vec<VaultOnlyEdge>,
    pub not_judgeable_by_imports: Vec<UnjudgeableEdge>,
}

/// A module edge after its endpoints went through the alias map; two edges that name one pair
/// are summed.
struct CodeEdge {
    from: String,
    to: String,
    count: usize,
    source_role_counts: RoleCounts,
    import_usage_counts: UsageCounts,
    product_value_count: usize,
    evidence: Vec<ImportEdge>,
    evidence_limited: bool,
}

fn pair_key(from: &str, to: &str) -> String {
    answer_format::json::to_string(&[from, to]).unwrap_or_default()
}

fn add_roles(left: RoleCounts, right: RoleCounts) -> RoleCounts {
    RoleCounts {
        production: left.production + right.production,
        test: left.test + right.test,
        unknown: left.unknown + right.unknown,
    }
}

fn add_usages(left: UsageCounts, right: UsageCounts) -> UsageCounts {
    UsageCounts {
        value: left.value + right.value,
        type_only: left.type_only + right.type_only,
        unknown: left.unknown + right.unknown,
    }
}

enum Readability {
    Readable,
    Unreadable(UnjudgeableReason),
}

/// Whether the scanner can read this endpoint's implementation: a native C endpoint has no
/// scannable imports, and reporting "did not see" as "does not exist" would have an agent delete
/// a correct relation.
fn readability_of(slug: &str, paths: &HashMap<String, String>) -> Readability {
    let raw = match paths.get(slug) {
        Some(raw) if !answer_format::whitespace::trim(raw).is_empty() => raw,
        _ => return Readability::Unreadable(UnjudgeableReason::PathUnknown),
    };
    let dot = raw.rfind('.');
    let slash = raw.rfind('/');
    let Some(dot) = dot.filter(|dot| slash.is_none_or(|slash| *dot > slash)) else {
        // No extension points at a directory, which may hold readable files.
        return Readability::Readable;
    };
    let extension = raw.get(dot..).unwrap_or_default().to_lowercase();
    if SUPPORTED_EXTENSIONS.contains(&extension.as_str()) {
        Readability::Readable
    } else {
        Readability::Unreadable(UnjudgeableReason::LanguageNotScanned)
    }
}

fn evidence_qualification(edge: &CodeEdge) -> EvidenceQualification {
    EvidenceQualification {
        basis: "whole_module_edge",
        source_role_counts: edge.source_role_counts,
        import_usage_counts: edge.import_usage_counts,
        product_value_count: edge.product_value_count,
        status: if edge.product_value_count > 0 {
            "product_value_observed"
        } else {
            "product_value_not_observed"
        },
    }
}

fn review_requirement(edge: &CodeEdge, endpoint_absent: bool) -> ReviewRequirement {
    let mut required: Vec<&'static str> = Vec::new();
    if endpoint_absent {
        required.push("vault_endpoints");
    }
    if edge.evidence.is_empty() {
        required.push("source_evidence");
    }
    required.extend(["semantic_rationale", "human_approval"]);
    let valued = edge.product_value_count > 0;
    if !valued {
        required.insert(0, "product_meaning_evidence");
    }
    ReviewRequirement {
        status: "rationale_review_required",
        write_allowed: false,
        required,
        next: if valued {
            "Review the exact import evidence and both ontology concepts, explain why the semantic dependency holds, ask the user, then write one explicit depends_on relation with why."
        } else {
            "No product-code value import was observed. Preserve the test/type evidence, but do not frame it as a product depends_on approval question without separate product meaning evidence."
        },
    }
}

fn candidate_of(edge: CodeEdge, absent_endpoints: Option<Vec<String>>) -> CodeCandidate {
    let evidence_qualification = evidence_qualification(&edge);
    let review = review_requirement(&edge, absent_endpoints.is_some());
    CodeCandidate {
        from: edge.from,
        to: edge.to,
        count: edge.count,
        absent_endpoints,
        source_evidence: edge.evidence,
        source_evidence_limited: edge.evidence_limited,
        evidence_qualification,
        review,
    }
}

/// Sums the module edges that name one pair once their endpoints are alias-resolved, in the
/// order the pairs first appear.
fn code_edges(module_edges: &[ModuleEdge], vault: &VaultFacts) -> Vec<(String, CodeEdge)> {
    let canonical = |slug: &str| -> String {
        vault
            .aliases
            .get(slug)
            .map_or_else(|| slug.to_string(), Clone::clone)
    };
    let mut merged: Vec<(String, CodeEdge)> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for module in module_edges {
        let (from, to) = (canonical(&module.from), canonical(&module.to));
        if from.is_empty() || to.is_empty() || from == to {
            continue;
        }
        let key = pair_key(&from, &to);
        let stats = &module.stats;
        let previous = index.get(&key).and_then(|at| merged.get(*at)).map(|(_, edge)| edge);
        let mut evidence: Vec<ImportEdge> = previous
            .map(|edge| edge.evidence.clone())
            .unwrap_or_default();
        for row in &stats.evidence {
            if evidence.len() >= EVIDENCE_LIMIT {
                break;
            }
            evidence.push(row.clone());
        }
        let count = stats.count + previous.map_or(0, |edge| edge.count);
        let next = CodeEdge {
            from,
            to,
            count,
            source_role_counts: add_roles(
                previous.map(|edge| edge.source_role_counts).unwrap_or_default(),
                stats.source_role_counts,
            ),
            import_usage_counts: add_usages(
                previous.map(|edge| edge.import_usage_counts).unwrap_or_default(),
                stats.import_usage_counts,
            ),
            product_value_count: previous.map_or(0, |edge| edge.product_value_count)
                + stats.product_value_count,
            evidence_limited: previous.is_some_and(|edge| edge.evidence_limited)
                || stats.evidence_limited
                || count > evidence.len(),
            evidence,
        };
        match index.get(&key).copied() {
            Some(at) => {
                if let Some(slot) = merged.get_mut(at) {
                    slot.1 = next;
                }
            }
            None => {
                index.insert(key.clone(), merged.len());
                merged.push((key, next));
            }
        }
    }
    merged
}

/// Diffs `module_edges` against the vault's `depends_on` edges.
pub fn reconcile_import_edges(module_edges: &[ModuleEdge], vault: &VaultFacts) -> Reconciliation {
    let canonical = |slug: &str| -> String {
        vault
            .aliases
            .get(slug)
            .map_or_else(|| slug.to_string(), Clone::clone)
    };
    let mut vault_edges: HashMap<String, VaultOnlyEdge> = HashMap::new();
    for edge in &vault.edges {
        if !DEPENDS_ON_VIA.contains(&edge.via.as_str()) {
            continue;
        }
        let (from, to) = (canonical(&edge.from), canonical(&edge.to));
        if from.is_empty() || to.is_empty() || from == to {
            continue;
        }
        vault_edges.insert(
            pair_key(&from, &to),
            VaultOnlyEdge {
                from,
                to,
                reference: edge.reference.clone(),
                via: edge.via.clone(),
            },
        );
    }

    let mut in_both: Vec<(String, SharedEdge)> = Vec::new();
    let mut missing: Vec<(String, CodeCandidate)> = Vec::new();
    let mut endpoint_absent: Vec<(String, CodeCandidate)> = Vec::new();
    let code = code_edges(module_edges, vault);
    let code_keys: HashSet<String> = code.iter().map(|(key, _)| key.clone()).collect();
    for (key, edge) in code {
        if vault_edges.contains_key(&key) {
            in_both.push((
                key,
                SharedEdge {
                    from: edge.from,
                    to: edge.to,
                },
            ));
            continue;
        }
        let absent: Vec<String> = [&edge.from, &edge.to]
            .into_iter()
            .filter(|slug| !vault.node_slugs.contains(*slug))
            .cloned()
            .collect();
        if absent.is_empty() {
            missing.push((key, candidate_of(edge, None)));
        } else {
            endpoint_absent.push((key, candidate_of(edge, Some(absent))));
        }
    }

    let mut vault_only: Vec<(String, VaultOnlyEdge)> = Vec::new();
    let mut unjudgeable: Vec<(String, UnjudgeableEdge)> = Vec::new();
    for (key, edge) in vault_edges {
        if code_keys.contains(&key) {
            continue;
        }
        let from = readability_of(&edge.from, &vault.paths);
        let to = readability_of(&edge.to, &vault.paths);
        let reason = match (&from, &to) {
            (Readability::Readable, Readability::Readable) => {
                vault_only.push((key, edge));
                continue;
            }
            (Readability::Unreadable(reason), _) | (_, Readability::Unreadable(reason)) => *reason,
        };
        let unreadable = [
            matches!(from, Readability::Unreadable(_)).then(|| edge.from.clone()),
            matches!(to, Readability::Unreadable(_)).then(|| edge.to.clone()),
        ]
        .into_iter()
        .flatten()
        .collect();
        unjudgeable.push((
            key,
            UnjudgeableEdge {
                from: edge.from,
                to: edge.to,
                reference: edge.reference,
                via: edge.via,
                unreadable,
                reason,
            },
        ));
    }

    fn sorted<T>(mut rows: Vec<(String, T)>) -> Vec<T> {
        rows.sort_by(|left, right| compare_text(&left.0, &right.0));
        rows.into_iter().map(|(_, row)| row).collect()
    }
    Reconciliation {
        in_both: sorted(in_both),
        in_code_missing_from_vault: sorted(missing),
        in_code_missing_endpoint_absent: sorted(endpoint_absent),
        in_vault_not_in_code: sorted(vault_only),
        not_judgeable_by_imports: sorted(unjudgeable),
    }
}

/// The counts of a reconciliation.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconciliationSummary {
    pub in_both: usize,
    pub in_code_missing_from_vault: usize,
    pub in_code_missing_endpoint_absent: usize,
    pub in_vault_not_in_code: usize,
    pub not_judgeable_by_imports: usize,
    pub unresolved_imports: usize,
    pub hint: String,
}

/// The counts of `reconciliation` and the one sentence that says whether the vault and the code
/// agree: "in sync" only when no bucket has drift.
pub fn summarize_reconciliation(
    reconciliation: &Reconciliation,
    unresolved_count: usize,
) -> ReconciliationSummary {
    let mut parts: Vec<String> = Vec::new();
    let missing = reconciliation.in_code_missing_from_vault.len();
    let absent = reconciliation.in_code_missing_endpoint_absent.len();
    let vault_only = reconciliation.in_vault_not_in_code.len();
    let unjudgeable = reconciliation.not_judgeable_by_imports.len();
    if missing > 0 {
        parts.push(format!("{missing} import-backed candidate(s) are missing from the vault with both endpoints already nodes — inspect exact evidence, supply semantic rationale, and obtain human approval before one explicit write"));
    }
    if absent > 0 {
        parts.push(format!("{absent} import-backed candidate(s) reference a slug that is not yet a vault node (model endpoints before semantic review)"));
    }
    if vault_only > 0 {
        parts.push(format!("{vault_only} vault depends_on edge(s) have no matching code import. An import is only one kind of evidence: a dependency can be a process spawn, a config reference, or a runtime contract. Read the code before treating any of these as stale"));
    }
    if unjudgeable > 0 {
        parts.push(format!("{unjudgeable} vault depends_on edge(s) could NOT be judged from imports because an endpoint's implementation is not in a scanned language (do not treat these as stale — read the code yourself or leave them alone)"));
    }
    if unresolved_count > 0 {
        parts.push(format!("{unresolved_count} unresolved import(s) could not be compared with the vault (inspect unresolved before claiming sync)"));
    }
    let shared = reconciliation.in_both.len();
    ReconciliationSummary {
        in_both: shared,
        in_code_missing_from_vault: missing,
        in_code_missing_endpoint_absent: absent,
        in_vault_not_in_code: vault_only,
        not_judgeable_by_imports: unjudgeable,
        unresolved_imports: unresolved_count,
        hint: if parts.is_empty() {
            format!("code import graph and vault depends_on edges are in sync ({shared} shared, no drift).")
        } else {
            format!("{}.", parts.join("; "))
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import_edges::{ImportKind, ImportUsage};
    use crate::import_rollup::EdgeStats;

    fn module(from: &str, to: &str, role: SourceRole, usage: ImportUsage) -> ModuleEdge {
        let mut stats = EdgeStats::default();
        stats.add(ImportEdge {
            from: format!("{from}/a.ts"),
            to: format!("{to}/b.ts"),
            kind: ImportKind::Static,
            source_role: role,
            import_usage: usage,
        });
        ModuleEdge {
            from: from.to_string(),
            to: to.to_string(),
            stats,
        }
    }

    fn vault_edge(from: &str, to: &str, via: &str) -> VaultEdge {
        VaultEdge {
            from: from.to_string(),
            to: to.to_string(),
            reference: to.to_string(),
            via: via.to_string(),
        }
    }

    fn facts(edges: Vec<VaultEdge>, nodes: &[&str], paths: &[(&str, &str)]) -> VaultFacts {
        VaultFacts {
            edges,
            aliases: HashMap::from([("old-a".to_string(), "a".to_string())]),
            node_slugs: nodes.iter().map(|slug| (*slug).to_string()).collect(),
            paths: paths
                .iter()
                .map(|(slug, path)| ((*slug).to_string(), (*path).to_string()))
                .collect(),
        }
    }

    #[test]
    fn each_edge_lands_in_exactly_one_bucket_and_aliases_are_resolved_first() {
        let modules = vec![
            module("old-a", "b", SourceRole::Production, ImportUsage::Value),
            module("a", "c", SourceRole::Test, ImportUsage::Value),
            module("a", "ghost", SourceRole::Production, ImportUsage::Value),
        ];
        let vault = facts(
            vec![
                vault_edge("a", "b", "dependencies"),
                vault_edge("a", "native", "dependencies"),
                vault_edge("a", "d", "dependencies"),
                vault_edge("a", "d", "implements"),
            ],
            &["a", "b", "c", "d", "native"],
            &[("a", "src/a.ts"), ("b", "src/b.ts"), ("c", "src/c.ts"), ("d", "src/d"), ("native", "src/n.c")],
        );
        let found = reconcile_import_edges(&modules, &vault);
        assert_eq!(found.in_both.len(), 1);
        assert_eq!(found.in_code_missing_from_vault[0].to, "c");
        assert_eq!(
            found.in_code_missing_from_vault[0].review.required[0],
            "product_meaning_evidence",
            "a test-only edge is not framed as a product dependency"
        );
        assert_eq!(found.in_code_missing_endpoint_absent[0].absent_endpoints, Some(vec!["ghost".to_string()]));
        assert_eq!(found.in_vault_not_in_code[0].to, "d", "a directory may hold readable files");
        assert_eq!(found.not_judgeable_by_imports[0].reason, UnjudgeableReason::LanguageNotScanned);
        assert_eq!(found.not_judgeable_by_imports[0].unreadable, ["native"]);
        let summary = summarize_reconciliation(&found, 0);
        assert!(summary.hint.starts_with("1 import-backed candidate(s) are missing"));
    }

    #[test]
    fn a_reconciliation_with_no_drift_says_in_sync() {
        let vault = facts(vec![vault_edge("a", "b", "dependencies")], &["a", "b"], &[]);
        let modules = vec![module("a", "b", SourceRole::Production, ImportUsage::Value)];
        let summary = summarize_reconciliation(&reconcile_import_edges(&modules, &vault), 0);
        assert_eq!(summary.hint, "code import graph and vault depends_on edges are in sync (1 shared, no drift).");
    }
}
