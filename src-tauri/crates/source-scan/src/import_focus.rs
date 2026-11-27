//! A bounded, path-focused neighbourhood of static imports from one scan: the imports into and out
//! of one file, a page at a time. Source evidence only, with no claim about runtime, behaviour or
//! meaning. An edge is named by a hash of what identifies it, so a page cursor stays valid for as
//! long as the evidence is unchanged.

use std::collections::HashMap;

use serde::Serialize;
use sha2::{Digest, Sha256};

use answer_format::collation::compare_text;

use crate::import_edges::{ImportEdge, ImportKind, ImportUsage, SourceRole};
use crate::source_scan_error::SourceScanError;

pub const DEFAULT_FOCUS_LIMIT: usize = 50;
pub const MAX_FOCUS_LIMIT: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FocusDirection {
    Incoming,
    Outgoing,
    Both,
}

impl FocusDirection {
    pub fn parse(word: &str) -> Option<Self> {
        match word {
            "incoming" => Some(Self::Incoming),
            "outgoing" => Some(Self::Outgoing),
            "both" => Some(Self::Both),
            _ => None,
        }
    }
}

/// What a call asked of the focus.
pub struct FocusRequest<'a> {
    pub focus_path: &'a str,
    pub direction: FocusDirection,
    pub limit: usize,
    pub after_edge_id: Option<&'a str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusedEdge {
    pub edge_id: String,
    pub from: String,
    pub to: String,
    pub kind: ImportKind,
    pub source_role: SourceRole,
    pub import_usage: ImportUsage,
}

#[derive(Debug, Serialize)]
pub struct FocusSummary {
    pub incoming: usize,
    pub outgoing: usize,
    pub selected: usize,
    pub returned: usize,
    pub limited: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusCursor {
    pub after_edge_id: Option<String>,
    pub total: usize,
    pub remaining: usize,
    pub has_more: bool,
    pub next_after_edge_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportImpactFocus {
    pub contract: &'static str,
    pub focus_path: String,
    pub direction: FocusDirection,
    pub source_qualification: &'static str,
    pub write_allowed: bool,
    pub summary: FocusSummary,
    pub edges: Vec<FocusedEdge>,
    pub cursor: FocusCursor,
    pub interpretation: String,
}

/// A path that names a place outside the repository by being rooted: `/x`, and on Windows `\x`
/// and `C:\x` as well.
fn is_absolute(path: &str) -> bool {
    if path.starts_with('/') {
        return true;
    }
    if !cfg!(windows) {
        return false;
    }
    let bytes = path.as_bytes();
    path.starts_with('\\')
        || (bytes.first().is_some_and(u8::is_ascii_alphabetic)
            && bytes.get(1) == Some(&b':')
            && matches!(bytes.get(2), Some(b'/' | b'\\')))
}

fn identity_of(edge: &ImportEdge) -> String {
    answer_format::json::to_string(&(
        &edge.from,
        &edge.to,
        edge.kind,
        edge.source_role,
        edge.import_usage,
    ))
    .unwrap_or_default()
}

fn edge_id(identity: &str, duplicate_index: usize) -> String {
    let digest = Sha256::digest(format!("{identity}:{duplicate_index}").as_bytes());
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    format!("import-impact:{}", hex.get(..20).unwrap_or(&hex))
}

pub fn build_import_impact_focus(
    edges: &[ImportEdge],
    request: &FocusRequest<'_>,
) -> Result<ImportImpactFocus, SourceScanError> {
    let path = request.focus_path;
    if path.is_empty() || answer_format::whitespace::trim(path) != path {
        return Err(SourceScanError::invalid(
            "focusPath must be a nonblank repository-relative path without surrounding whitespace.",
        ));
    }
    let slashed = path.replace('\\', "/");
    let normalized = slashed.strip_prefix("./").unwrap_or(&slashed).to_string();
    if is_absolute(path)
        || normalized == ".."
        || normalized.starts_with("../")
        || normalized.contains("/../")
    {
        return Err(SourceScanError::invalid(
            "focusPath must be a repository-relative path that stays inside the repository.",
        ));
    }
    if request.limit < 1 || request.limit > MAX_FOCUS_LIMIT {
        return Err(SourceScanError::invalid(
            "limit must be an integer between 1 and 100.",
        ));
    }
    if let Some(after) = request.after_edge_id {
        if after.is_empty() || answer_format::whitespace::trim(after) != after {
            return Err(SourceScanError::invalid(
                "afterEdgeId must be null or a nonblank string without surrounding whitespace.",
            ));
        }
    }

    let incoming = edges.iter().filter(|edge| edge.to == normalized).count();
    let outgoing = edges.iter().filter(|edge| edge.from == normalized).count();
    let mut selected: Vec<(String, &ImportEdge)> = edges
        .iter()
        .filter(|edge| match request.direction {
            FocusDirection::Incoming => edge.to == normalized,
            FocusDirection::Outgoing => edge.from == normalized,
            FocusDirection::Both => edge.from == normalized || edge.to == normalized,
        })
        .map(|edge| (identity_of(edge), edge))
        .collect();
    selected.sort_by(|left, right| compare_text(&left.0, &right.0));
    let mut seen: HashMap<&str, usize> = HashMap::new();
    let identified: Vec<FocusedEdge> = selected
        .iter()
        .map(|(identity, edge)| {
            let duplicate = seen.entry(identity.as_str()).or_insert(0);
            let edge_id = edge_id(identity, *duplicate);
            *duplicate += 1;
            FocusedEdge {
                edge_id,
                from: edge.from.clone(),
                to: edge.to.clone(),
                kind: edge.kind,
                source_role: edge.source_role,
                import_usage: edge.import_usage,
            }
        })
        .collect();

    let start = match request.after_edge_id {
        None => 0,
        Some(after) => match identified.iter().position(|edge| edge.edge_id == after) {
            Some(previous) => previous + 1,
            None => {
                return Err(SourceScanError::not_found(format!(
                    "afterEdgeId was not found in the current focused import evidence: {after}. Omit afterEdgeId to restart from the first current edge."
                )))
            }
        },
    };
    let total = identified.len();
    let page: Vec<FocusedEdge> = identified
        .into_iter()
        .skip(start)
        .take(request.limit)
        .collect();
    let remaining = total.saturating_sub(start + page.len());
    Ok(ImportImpactFocus {
        contract: "importImpactFocus:v1",
        focus_path: normalized,
        direction: request.direction,
        source_qualification: "observed_static_imports_not_runtime_or_semantic_impact",
        write_allowed: false,
        summary: FocusSummary {
            incoming,
            outgoing,
            selected: total,
            returned: page.len(),
            limited: remaining > 0,
        },
        cursor: FocusCursor {
            after_edge_id: request.after_edge_id.map(str::to_string),
            total,
            remaining,
            has_more: remaining > 0,
            next_after_edge_id: page.last().map(|edge| edge.edge_id.clone()),
        },
        edges: page,
        interpretation: "These are bounded supported static import receipts around the exact file path. An empty or partial result does not prove no impact; inspect symbols, tests, dynamic behavior, and ontology meaning separately before changing code or approving a semantic relation.".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source_scan_error::ScanErrorCode;

    fn edge(from: &str, to: &str, kind: ImportKind) -> ImportEdge {
        ImportEdge {
            from: from.to_string(),
            to: to.to_string(),
            kind,
            source_role: SourceRole::Production,
            import_usage: ImportUsage::Value,
        }
    }

    fn request<'a>(path: &'a str, after: Option<&'a str>, limit: usize) -> FocusRequest<'a> {
        FocusRequest {
            focus_path: path,
            direction: FocusDirection::Both,
            limit,
            after_edge_id: after,
        }
    }

    #[test]
    fn pages_follow_a_stable_cursor_and_a_repeated_edge_gets_its_own_id() {
        let edges = vec![
            edge("b.ts", "a.ts", ImportKind::Static),
            edge("a.ts", "c.ts", ImportKind::Static),
            edge("a.ts", "c.ts", ImportKind::Static),
            edge("x.ts", "y.ts", ImportKind::Static),
        ];
        let first = build_import_impact_focus(&edges, &request("./a.ts", None, 2)).expect("page");
        assert_eq!(first.focus_path, "a.ts");
        assert_eq!(
            (
                first.summary.incoming,
                first.summary.outgoing,
                first.summary.selected
            ),
            (1, 2, 3)
        );
        assert!(first.cursor.has_more);
        let cursor = first.cursor.next_after_edge_id.clone().expect("a cursor");
        let rest =
            build_import_impact_focus(&edges, &request("a.ts", Some(&cursor), 2)).expect("page");
        assert_eq!(rest.edges.len(), 1);
        let ids: Vec<&str> = first
            .edges
            .iter()
            .chain(&rest.edges)
            .map(|e| e.edge_id.as_str())
            .collect();
        assert_eq!(
            ids.iter().collect::<std::collections::HashSet<_>>().len(),
            3
        );
        assert!(
            ids[0].starts_with("import-impact:") && ids[0].len() == "import-impact:".len() + 20
        );
    }

    #[test]
    fn a_path_outside_the_repository_and_a_lost_cursor_are_refused_by_kind() {
        let edges = vec![edge("a.ts", "b.ts", ImportKind::Static)];
        assert!(
            build_import_impact_focus(&edges, &request("../x.ts", None, 5))
                .expect_err("outside")
                .code()
                == ScanErrorCode::Invalid
        );
        assert!(
            build_import_impact_focus(&edges, &request("/etc/x", None, 5))
                .expect_err("rooted")
                .code()
                == ScanErrorCode::Invalid
        );
        assert!(
            build_import_impact_focus(&edges, &request("a.ts", Some("import-impact:0"), 5))
                .expect_err("lost")
                .code()
                == ScanErrorCode::NotFound
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_drive_path_and_a_backslash_root_are_rooted_on_windows() {
        let edges = vec![edge("a.ts", "b.ts", ImportKind::Static)];
        for rooted in ["C:\\x\\a.ts", "c:/x/a.ts", "\\x\\a.ts"] {
            assert!(
                build_import_impact_focus(&edges, &request(rooted, None, 5))
                    .expect_err("rooted")
                    .code()
                    == ScanErrorCode::Invalid,
                "{rooted}"
            );
        }
    }
}
