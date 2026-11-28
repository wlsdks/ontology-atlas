//! Finds the repository documents worth quoting and builds the semantic evidence packet from them:
//! bounded discovery, then one extracted, risk-scanned row per document.

use std::collections::BTreeMap;

use answer_format::collation::compare_text;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::candidate_text::humanize;
use crate::package_contracts::{
    extract_cargo_contract, extract_node_package_contract, extract_python_pyproject_contract,
    extract_python_setup_contract, Extraction, PackageContract,
};
use crate::repository_files::{file_name, join, Probe, ReadFailure, RepositoryFiles, SkipLog};
use crate::scan_limits::{
    CARGO_MANIFEST_MAX_BYTES, NODE_PACKAGE_MANIFEST_MAX_BYTES, PYTHON_PROJECT_MAX_BYTES,
    PYTHON_SETUP_MAX_BYTES, SEMANTIC_DISCOVERY_MAX_ENTRIES, SEMANTIC_DISCOVERY_MAX_FILES,
    SEMANTIC_EVIDENCE_MAX_BYTES, SEMANTIC_EVIDENCE_MAX_DOCUMENTS,
    WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS,
};
use crate::scan_tables::{
    SEMANTIC_DISCOVERY_ROOTS, SEMANTIC_DISCOVERY_SKIP_DIRS, SEMANTIC_EVIDENCE_SEEDS,
    WORKSPACE_FOLDERS,
};
use crate::semantic_document::{
    classify_evidence_path, content_score, extract_document, ReviewRequiredEvidence,
};
use crate::semantic_risk::{evidence_trust, scan_evidence_risks};

const MAX_NEXT_READ_LINES: usize = 200;

/// Where a read of the rest of a truncated excerpt starts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextSourceRead {
    pub path: String,
    pub start_line: usize,
    pub max_lines: usize,
    pub expected_sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcerptInfo {
    pub scope: &'static str,
    pub truncated: bool,
    pub first_omitted_line: Option<usize>,
    pub next_source_read: Option<NextSourceRead>,
}

/// One quoted document, as the analysis answer carries it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticEvidence {
    pub source: String,
    pub role: String,
    pub title: String,
    pub headings: Vec<String>,
    pub excerpt: String,
    pub trust: &'static str,
    pub risk_flags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub excerpt_info: Option<ExcerptInfo>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub review_required_evidence: Vec<ReviewRequiredEvidence>,
}

struct Candidate {
    source: String,
    role: String,
    path_score: i64,
}

struct Row {
    source: String,
    role: String,
    title: String,
    headings: Vec<String>,
    excerpt: String,
    review_required: Vec<ReviewRequiredEvidence>,
    excerpt_info: Option<ExcerptInfo>,
    risk_text: String,
    score: i64,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn is_node_package(source: &str) -> bool {
    source == "package.json" || source.ends_with("/package.json")
}

fn package_limit(source: &str) -> Option<usize> {
    if source == "Cargo.toml" {
        Some(CARGO_MANIFEST_MAX_BYTES)
    } else if source == "setup.py" {
        Some(PYTHON_SETUP_MAX_BYTES)
    } else if source == "pyproject.toml" {
        Some(PYTHON_PROJECT_MAX_BYTES)
    } else if is_node_package(source) {
        Some(NODE_PACKAGE_MANIFEST_MAX_BYTES)
    } else {
        None
    }
}

/// The sort order of a package contract's problem rows and the rest: this is how a path that is
/// not safe to read becomes a skipped row.
pub fn package_contract_issue(
    files: &RepositoryFiles<'_>,
    source: &str,
    max_bytes: usize,
) -> Result<String, String> {
    match files.text(source) {
        Ok(text) if text.len() > max_bytes => Err(format!(
            "package-contract-skip: {source} exceeds {max_bytes} bytes"
        )),
        Ok(text) => Ok(text),
        Err(ReadFailure::OutsideRoot) => Err(format!(
            "package-contract-skip: {source} resolves outside repository root"
        )),
        Err(ReadFailure::TooLarge) => Err(format!(
            "package-contract-skip: {source} exceeds {max_bytes} bytes"
        )),
        Err(_) => Err(format!("package-contract-skip: {source} cannot be read")),
    }
}

fn contract_row(
    source: &str,
    role: &str,
    path_score: i64,
    contract: PackageContract,
) -> Option<Row> {
    if contract.excerpt.is_empty() && contract.headings.is_empty() {
        return None;
    }
    let score = path_score + content_score(&contract.title, &contract.headings, &contract.excerpt);
    Some(Row {
        source: source.to_string(),
        role: role.to_string(),
        title: contract.title,
        headings: contract.headings,
        excerpt: contract.excerpt,
        review_required: Vec::new(),
        excerpt_info: None,
        risk_text: contract.risk_text,
        score,
    })
}

fn row_of(
    files: &RepositoryFiles<'_>,
    skipped: &mut SkipLog,
    candidate: &Candidate,
) -> Option<Row> {
    let source = candidate.source.as_str();
    if !files.is_file(source) && files.probe(source) != Probe::OutsideRoot {
        return None;
    }
    let display = files.display(source);
    let node = is_node_package(source);
    let (text, extraction): (String, Option<Extraction>) = if let Some(limit) = package_limit(source)
    {
        match package_contract_issue(files, source, limit) {
            Err(reason) => {
                let reason = if node && reason.ends_with("resolves outside repository root") {
                    format!("semantic-evidence-skip: {source} resolves outside repository root")
                } else {
                    reason
                };
                skipped.push_once(display, reason);
                return None;
            }
            Ok(text) => {
                let extraction = if source == "Cargo.toml" {
                    extract_cargo_contract(&text)
                } else if source == "setup.py" {
                    extract_python_setup_contract(&text)
                } else if source == "pyproject.toml" {
                    extract_python_pyproject_contract(&text)
                } else {
                    extract_node_package_contract(&text)
                };
                (text, Some(extraction))
            }
        }
    } else {
        match files.text(source) {
            Ok(text) if text.len() > SEMANTIC_EVIDENCE_MAX_BYTES => {
                skipped.push_once(
                    display,
                    format!(
                        "semantic-evidence-skip: {source} exceeds {SEMANTIC_EVIDENCE_MAX_BYTES} bytes"
                    ),
                );
                return None;
            }
            Ok(text) => (text, None),
            Err(ReadFailure::OutsideRoot) => {
                skipped.push_once(
                    display,
                    format!("semantic-evidence-skip: {source} resolves outside repository root"),
                );
                return None;
            }
            Err(ReadFailure::TooLarge) => {
                skipped.push_once(
                    display,
                    format!(
                        "semantic-evidence-skip: {source} exceeds {SEMANTIC_EVIDENCE_MAX_BYTES} bytes"
                    ),
                );
                return None;
            }
            Err(_) => {
                skipped.push(display, "semantic-evidence-read-error: unreadable".to_string());
                return None;
            }
        }
    };
    match extraction {
        Some(Err(reason)) => {
            let already_reported = source == "package.json"
                && skipped.contains(|row| {
                    row.path == display && row.reason.starts_with("package-json-parse-error:")
                });
            if !already_reported {
                skipped.push_once(display, reason);
            }
            None
        }
        Some(Ok(contract)) => contract_row(source, &candidate.role, candidate.path_score, contract),
        None => {
            let document = extract_document(&text, source);
            if document.excerpt.is_empty() && document.headings.is_empty() {
                return None;
            }
            let title = document
                .title
                .clone()
                .unwrap_or_else(|| humanize(&strip_markdown_extension(file_name(source))));
            let score = candidate.path_score
                + content_score(
                    document.title.as_deref().unwrap_or(""),
                    &document.headings,
                    &document.excerpt,
                );
            let truncated = document.first_omitted_line.is_some();
            let next_source_read = document.first_omitted_line.map(|line| NextSourceRead {
                path: source.to_string(),
                start_line: line,
                max_lines: MAX_NEXT_READ_LINES,
                expected_sha256: sha256_hex(text.as_bytes()),
            });
            Some(Row {
                source: source.to_string(),
                role: candidate.role.clone(),
                title,
                headings: document.headings,
                excerpt: document.excerpt,
                review_required: document.review_required_evidence,
                excerpt_info: Some(ExcerptInfo {
                    scope: "selected_prose",
                    truncated,
                    first_omitted_line: document.first_omitted_line,
                    next_source_read,
                }),
                risk_text: String::new(),
                score,
            })
        }
    }
}

fn strip_markdown_extension(name: &str) -> String {
    let lowered = name.to_lowercase();
    if lowered.ends_with(".md") {
        name.get(..name.len() - 3).unwrap_or(name).to_string()
    } else {
        name.to_string()
    }
}

pub fn collect_semantic_evidence(
    files: &RepositoryFiles<'_>,
    skipped: &mut SkipLog,
) -> Vec<SemanticEvidence> {
    let candidates = discover_candidates(files, skipped);
    let mut rows: Vec<Row> = candidates
        .iter()
        .filter_map(|candidate| row_of(files, skipped, candidate))
        .collect();
    rows.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| compare_text(&left.source, &right.source))
    });
    let mut chosen: Vec<usize> = Vec::new();
    for role in [
        "mission",
        "package-contract",
        "product-contract",
        "product-capabilities",
        "architecture",
        "agent-guidance",
    ] {
        if let Some(index) = rows
            .iter()
            .enumerate()
            .find(|(index, row)| row.role == role && !chosen.contains(index))
            .map(|(index, _)| index)
        {
            chosen.push(index);
        }
    }
    for index in 0..rows.len() {
        if chosen.len() >= SEMANTIC_EVIDENCE_MAX_DOCUMENTS {
            break;
        }
        if !chosen.contains(&index) {
            chosen.push(index);
        }
    }
    let mut slots: Vec<Option<Row>> = rows.into_iter().map(Some).collect();
    chosen
        .into_iter()
        .filter_map(|index| slots.get_mut(index).and_then(Option::take))
        .map(|row| {
            let mut risk_flags = scan_evidence_risks(&row.headings, &row.excerpt, &row.risk_text);
            if row
                .excerpt_info
                .as_ref()
                .is_some_and(|info| info.truncated)
            {
                risk_flags.push("excerpt-truncated".to_string());
            }
            SemanticEvidence {
                source: row.source,
                role: row.role,
                title: row.title,
                headings: row.headings,
                excerpt: row.excerpt,
                trust: evidence_trust(&risk_flags),
                risk_flags,
                excerpt_info: row.excerpt_info,
                review_required_evidence: row.review_required,
            }
        })
        .collect()
}

fn discover_candidates(files: &RepositoryFiles<'_>, skipped: &mut SkipLog) -> Vec<Candidate> {
    let mut by_source: BTreeMap<String, Candidate> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut insert = |by_source: &mut BTreeMap<String, Candidate>, candidate: Candidate| {
        if !by_source.contains_key(&candidate.source) {
            order.push(candidate.source.clone());
        }
        by_source.insert(candidate.source.clone(), candidate);
    };
    for (source, role) in SEMANTIC_EVIDENCE_SEEDS {
        let Some(resolved) = files.existing_source_case(source) else {
            continue;
        };
        if role == "package-contract" && resolved != source {
            continue;
        }
        insert(
            &mut by_source,
            Candidate {
                source: resolved,
                role: role.to_string(),
                path_score: 100,
            },
        );
    }
    for folder in WORKSPACE_FOLDERS {
        if files.probe(folder) == Probe::Missing {
            continue;
        }
        let eligible: Vec<String> = files
            .entries(folder)
            .into_iter()
            .filter(|(name, probe)| !name.starts_with('.') && *probe == Probe::Folder)
            .map(|(name, _)| name)
            .collect();
        let considered = eligible
            .iter()
            .take(WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS);
        if eligible.len() > WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS {
            skipped.push_once(
                files.display(folder),
                format!(
                    "semantic-evidence-skip: {folder} workspace members limited to {WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS}"
                ),
            );
        }
        for entry in considered {
            let package_source = format!("{folder}/{entry}/package.json");
            if files.existing_source_case(&package_source).as_deref() == Some(&package_source) {
                insert(
                    &mut by_source,
                    Candidate {
                        source: package_source,
                        role: "package-contract".to_string(),
                        path_score: 74,
                    },
                );
            }
            let readme_source = format!("{folder}/{entry}/README.md");
            if let Some(resolved) = files.existing_source_case(&readme_source) {
                insert(
                    &mut by_source,
                    Candidate {
                        source: resolved,
                        role: "product-capabilities".to_string(),
                        path_score: 75,
                    },
                );
            }
        }
    }
    let mut walk = Walk {
        files_seen: 0,
        entries_seen: 0,
    };
    for root_name in SEMANTIC_DISCOVERY_ROOTS {
        if walk.files_seen >= SEMANTIC_DISCOVERY_MAX_FILES {
            break;
        }
        match files.probe(root_name) {
            Probe::Missing => continue,
            Probe::OutsideRoot => {
                skipped.push_once(
                    files.display(root_name),
                    format!("semantic-evidence-skip: {root_name} resolves outside repository root"),
                );
                continue;
            }
            Probe::Folder => {}
            _ => continue,
        }
        let mut found: Vec<(String, &'static str, i64)> = Vec::new();
        walk.visit(files, skipped, root_name, &mut found);
        for (source, role, score) in found {
            if by_source.contains_key(&source) {
                continue;
            }
            insert(
                &mut by_source,
                Candidate {
                    source,
                    role: role.to_string(),
                    path_score: score,
                },
            );
        }
    }
    order
        .into_iter()
        .filter_map(|source| by_source.remove(&source))
        .collect()
}

struct Walk {
    files_seen: usize,
    entries_seen: usize,
}

impl Walk {
    fn budget_reached(
        &self,
        files: &RepositoryFiles<'_>,
        skipped: &mut SkipLog,
        directory: &str,
    ) -> bool {
        if self.entries_seen < SEMANTIC_DISCOVERY_MAX_ENTRIES {
            return false;
        }
        skipped.push_once(
            files.display(directory),
            format!(
                "semantic-evidence-skip: {directory} reached {SEMANTIC_DISCOVERY_MAX_ENTRIES} entry walk budget"
            ),
        );
        true
    }

    /// Sorted depth-first: capped by the file and entry budgets.
    fn visit(
        &mut self,
        files: &RepositoryFiles<'_>,
        skipped: &mut SkipLog,
        directory: &str,
        found: &mut Vec<(String, &'static str, i64)>,
    ) {
        if self.files_seen >= SEMANTIC_DISCOVERY_MAX_FILES
            || self.budget_reached(files, skipped, directory)
        {
            return;
        }
        for (entry, probe) in files.entries(directory) {
            if self.files_seen >= SEMANTIC_DISCOVERY_MAX_FILES
                || self.budget_reached(files, skipped, directory)
            {
                return;
            }
            self.entries_seen += 1;
            let path = join(directory, &entry);
            match probe {
                Probe::OutsideRoot => {
                    skipped.push_once(
                        files.display(&path),
                        format!("semantic-evidence-skip: {path} resolves outside repository root"),
                    );
                }
                Probe::Folder => {
                    if !SEMANTIC_DISCOVERY_SKIP_DIRS.contains(&entry.to_lowercase().as_str()) {
                        self.visit(files, skipped, &path, found);
                    }
                }
                Probe::File => {
                    if !entry.to_lowercase().ends_with(".md") {
                        continue;
                    }
                    self.files_seen += 1;
                    if let Some((role, score)) = classify_evidence_path(&path) {
                        found.push((path, role, score));
                    }
                }
                _ => {}
            }
        }
    }
}
