use crate::gray_area_rpc::EvidenceReader;
use crate::gray_area_scope::{
    digest, excerpt_source_path, observe_scoped_source, read_text, resolve_binding,
    safe_source_path, source_witness, vault_digest, verify_identity,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::Path;

const MAX_FILES: usize = 2000;
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceBasis {
    project_slug: String,
    selected_uids: Vec<String>,
    source_id: String,
    source_fingerprint: String,
    source_roots: Vec<String>,
    graph_digest: String,
    body_digest: String,
    binding_digest: String,
}

fn string<'a>(row: &'a Value, key: &str) -> &'a str {
    row.get(key).and_then(Value::as_str).unwrap_or("")
}
fn rows(value: &Value, key: &str) -> Vec<Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}
fn dependency(edge: &Value) -> bool {
    matches!(string(edge, "via"), "dependencies" | "depends_on")
}

fn selected_scope(
    nodes: &[Value],
    edges: &[Value],
    project: &str,
    uids: &[String],
) -> Result<(Vec<String>, HashSet<String>), String> {
    if uids.is_empty()
        || uids.len() > 12
        || !nodes
            .iter()
            .any(|n| string(n, "slug") == project && string(n, "kind") == "project")
    {
        return Err("scope_invalid".into());
    }
    let mut contained = HashSet::from([project.to_string()]);
    loop {
        let previous = contained.len();
        for edge in edges {
            let (from, to) = if string(edge, "via") == "domain" {
                (string(edge, "to"), string(edge, "from"))
            } else {
                (string(edge, "from"), string(edge, "to"))
            };
            if matches!(
                string(edge, "via"),
                "domain" | "domains" | "capabilities" | "elements" | "contains"
            ) && contained.contains(from)
            {
                contained.insert(to.to_string());
            }
        }
        if previous == contained.len() {
            break;
        }
    }
    let mut scope = HashSet::new();
    for uid in uids {
        let matches: Vec<_> = nodes.iter().filter(|n| string(n, "uid") == uid).collect();
        if matches.len() != 1 || !contained.contains(string(matches[0], "slug")) {
            return Err("scope_invalid".into());
        }
        scope.insert(string(matches[0], "slug").to_string());
    }
    let mut groups: HashSet<String> = nodes
        .iter()
        .filter(|n| {
            uids.iter().any(|uid| uid == string(n, "uid"))
                && matches!(string(n, "kind"), "project" | "domain")
        })
        .map(|n| string(n, "slug").into())
        .collect();
    loop {
        let previous = groups.len();
        for edge in edges {
            if !matches!(
                string(edge, "via"),
                "domains" | "domain" | "capabilities" | "elements" | "contains"
            ) {
                continue;
            }
            let (parent, child) = if string(edge, "via") == "domain" {
                (string(edge, "to"), string(edge, "from"))
            } else {
                (string(edge, "from"), string(edge, "to"))
            };
            if groups.contains(parent) && contained.contains(child) {
                groups.insert(child.into());
            }
        }
        if previous == groups.len() {
            break;
        }
    }
    scope.extend(groups);
    for _ in 0..2 {
        let previous = scope.clone();
        for edge in edges.iter().filter(|e| dependency(e)) {
            let from = string(edge, "from");
            let to = string(edge, "to");
            if previous.contains(from) && contained.contains(to) {
                scope.insert(to.into());
            }
            if previous.contains(to) && contained.contains(from) {
                scope.insert(from.into());
            }
        }
    }
    let mut result: Vec<_> = scope.into_iter().collect();
    result.sort();
    if result.len() > 40 {
        return Err("scope_limit".into());
    }
    Ok((result, contained))
}

#[tauri::command(async)]
pub fn read_gray_area_evidence(
    vault_path: String,
    project_slug: String,
    selected_uids: Vec<String>,
    expected_binding_digest: String,
) -> Result<Value, String> {
    let vault = crate::canonical_root(&vault_path)?;
    let binding = resolve_binding(&vault, &project_slug)?;
    verify_identity(&binding)?;
    if binding.binding_digest != expected_binding_digest {
        return Err("binding_changed".into());
    }
    let body_digest = vault_digest(&vault)?;
    let mut reader =
        EvidenceReader::start(&vault, &crate::gray_area_scope::SourceObservation::empty())?;
    let graph = reader.call(
        "compile_ontology",
        json!({"nodesLimit":500,"edgesLimit":500}),
    )?;
    if graph
        .pointer("/nodesPagination/hasMore")
        .and_then(Value::as_bool)
        == Some(true)
        || graph
            .pointer("/edgesPagination/hasMore")
            .and_then(Value::as_bool)
            == Some(true)
    {
        return Err("graph_limit".into());
    }
    let nodes = rows(&graph, "nodes");
    let edges = rows(&graph, "edges");
    let (mut scope, contained) = selected_scope(&nodes, &edges, &project_slug, &selected_uids)?;
    let mut source_folders: Vec<_> = nodes
        .iter()
        .filter(|n| scope.iter().any(|s| s == string(n, "slug")))
        .filter_map(|n| {
            let path = Path::new(string(n, "path"));
            if string(n, "path").is_empty() || !safe_source_path(path) {
                return None;
            }
            let parent = path.parent()?.to_string_lossy();
            Some(if parent.is_empty() {
                ".".into()
            } else {
                parent.into_owned()
            })
        })
        .collect();
    source_folders.sort();
    source_folders.dedup();
    if source_folders.is_empty() || source_folders.len() > 16 {
        return Err("scope_limit".into());
    }
    drop(reader);
    let source = observe_scoped_source(&binding.root, &source_folders)?;
    let imports_available = !source.limited;
    let mut reader = EvidenceReader::start(&vault, &source)?;
    let import_result = if imports_available {
        reader.call("infer_imports", json!({"maxFiles":MAX_FILES,"sourceFolders":source_folders,"ignore":source.ignored_names,"reconcile":false,"reviewMode":"full","allowLargeResponse":true}))?
    } else {
        json!({})
    };
    if imports_available
        && import_result
            .pointer("/readBoundary/contract")
            .and_then(Value::as_str)
            != Some("confinedSourceReads:v1")
    {
        return Err("reader_boundary_unavailable".into());
    }
    let imports = rows(&import_result, "edges");
    let scope_paths: HashSet<_> = nodes
        .iter()
        .filter(|n| scope.iter().any(|s| s == string(n, "slug")))
        .map(|n| string(n, "path"))
        .filter(|p| !p.is_empty())
        .collect();
    let mut implicated_paths = HashSet::new();
    for edge in &imports {
        if scope_paths.contains(string(edge, "from")) || scope_paths.contains(string(edge, "to")) {
            implicated_paths.insert(string(edge, "from"));
            implicated_paths.insert(string(edge, "to"));
        }
    }
    for node in &nodes {
        if contained.contains(string(node, "slug"))
            && implicated_paths.contains(string(node, "path"))
            && !scope.iter().any(|s| s == string(node, "slug"))
        {
            scope.push(string(node, "slug").into());
        }
    }
    scope.sort();
    scope.dedup();
    if scope.len() > 40 {
        return Err("scope_limit".into());
    }
    let mut documents = Vec::new();
    for chunk in scope.chunks(20) {
        let result = reader.call("get_concepts", json!({"slugs":chunk,"body":"full"}))?;
        for row in rows(&result, "concepts") {
            if row.get("ok").and_then(Value::as_bool) == Some(false)
                || row.pointer("/bodyInfo/truncated").and_then(Value::as_bool) == Some(true)
                || row.get("body").is_none()
            {
                return Err("scope_changed".into());
            }
            let fm = row.get("frontmatter").ok_or("scope_invalid")?;
            documents.push(json!({"uid":string(&row,"uid"),"slug":string(&row,"slug"),"title":string(fm,"title"),"kind":string(fm,"kind"),"path":fm.get("path"),"body":string(&row,"body"),"bodyDigest":digest(string(&row,"body").as_bytes())}));
        }
    }
    let growth = reader.call(
        "query_ontology",
        json!({"operation":"growth_plan","limit":100}),
    )?;
    let next_reads = growth.get("nextReads").cloned().unwrap_or(json!({}));
    let recorded_reads: Vec<_> = rows(&next_reads, "rows")
        .into_iter()
        .filter(|r| scope.iter().any(|s| s == string(r, "slug")))
        .collect();
    let mut source_paths: Vec<String> = documents
        .iter()
        .map(|n| string(n, "path").to_string())
        .filter(|p| !p.is_empty())
        .collect();
    source_paths.sort();
    source_paths.dedup();
    let witnesses_limited = source_paths.len() > 16;
    source_paths.truncate(16);
    let witnesses: Vec<Value> = source_paths
        .iter()
        .map(|path| source_witness(&binding.root, &source, path))
        .collect();
    let drift = read_drift(&vault_path, &binding.root.to_string_lossy(), &documents);
    let basis = EvidenceBasis {
        project_slug,
        selected_uids,
        source_id: binding.source_id,
        source_fingerprint: source.fingerprint,
        source_roots: source_folders.clone(),
        graph_digest: string(&graph, "graphHash").into(),
        body_digest,
        binding_digest: binding.binding_digest,
    };
    if !check_basis(&vault_path, &basis, &witnesses)? {
        return Err("changed_during_read".into());
    }
    let mut limits = vec![
        "static_imports_only",
        "implementation_parent_folders_only_other_callers_unmeasured",
        "two_recorded_dependency_hops",
        "source_ranges_only",
        "historical_gaps_unverified",
    ];
    if !imports_available {
        limits.push("source_scan_unavailable");
    }
    if witnesses_limited {
        limits.push("witness_file_limit");
    }
    let files_scanned = import_result
        .get("filesScanned")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let mut identity = serde_json::to_vec(&basis).map_err(|_| "scope_invalid")?;
    identity.extend(serde_json::to_vec(&witnesses).map_err(|_| "scope_invalid")?);
    Ok(json!({
        "contract":"grayAreaEvidence:v1","snapshotId":digest(&identity),"measuredAt":chrono::Utc::now().to_rfc3339(),"basis":basis,
        "nodes":documents,"edges":edges,"imports":imports,"drift":drift,"recordedReads":recorded_reads,"witnesses":witnesses,
        "coverage":{"filesScanned":files_scanned,"inventoryFiles":source.files.len(),"sourceFolders":source_folders,"maxFiles":MAX_FILES,"importsAvailable":imports_available,"importsLimited":files_scanned >= MAX_FILES as u64,"unresolvedImports":rows(&import_result,"unresolved").len(),"unsupported":["runtime dispatch","unsupported languages"],"readsLimited":next_reads.get("limited").and_then(Value::as_bool).unwrap_or(true),"recordedReadsTotal":next_reads.get("total").and_then(Value::as_u64).unwrap_or(0),"limits":limits}
    }))
}

fn read_drift(vault: &str, source: &str, docs: &[Value]) -> Vec<Value> {
    let doc_paths: Vec<_> = docs
        .iter()
        .map(|n| format!("{}.md", string(n, "slug")))
        .collect();
    let source_paths: Vec<_> = docs
        .iter()
        .map(|n| string(n, "path").to_string())
        .filter(|p| !p.is_empty())
        .collect();
    let dates = |root: &str, repo_paths, vault_paths| -> HashMap<String, String> {
        crate::git::evidence::git_paths_last_change(root.into(), repo_paths, vault_paths)
            .ok()
            .and_then(|r| serde_json::to_value(r).ok())
            .and_then(|r| r.as_array().cloned())
            .unwrap_or_default()
            .iter()
            .filter_map(|r| {
                r.get("lastChangedAt")
                    .and_then(Value::as_str)
                    .map(|date| (string(r, "path").into(), date.into()))
            })
            .collect()
    };
    let doc_dates = dates(vault, vec![], doc_paths);
    let source_dates = dates(source, source_paths, vec![]);
    docs.iter().filter_map(|doc| {
        let slug = string(doc,"slug"); let path = string(doc,"path");
        let before = doc_dates.get(&format!("{slug}.md"))?; let after = source_dates.get(path)?;
        let before_date = chrono::DateTime::parse_from_rfc3339(before).ok()?; let after_date = chrono::DateTime::parse_from_rfc3339(after).ok()?;
        (after_date > before_date).then(|| json!({"slug":slug,"path":path,"documentChangedAt":before,"sourceChangedAt":after}))
    }).collect()
}

fn check_basis(
    vault_path: &str,
    basis: &EvidenceBasis,
    witnesses: &[Value],
) -> Result<bool, String> {
    if witnesses.len() > 16 {
        return Ok(false);
    }
    let vault = crate::canonical_root(vault_path)?;
    let binding = resolve_binding(&vault, &basis.project_slug)?;
    if binding.source_id != basis.source_id
        || binding.binding_digest != basis.binding_digest
        || vault_digest(&vault)? != basis.body_digest
    {
        return Ok(false);
    }
    verify_identity(&binding)?;
    if basis.source_roots.is_empty() {
        return Ok(false);
    }
    let source = observe_scoped_source(&binding.root, &basis.source_roots)?;
    if source.fingerprint != basis.source_fingerprint {
        return Ok(false);
    }
    for witness in witnesses.iter().filter(|w| string(w, "status") == "read") {
        let path = string(witness, "path");
        if !excerpt_source_path(Path::new(path)) {
            return Ok(false);
        }
        let text = read_text(&binding.root, Path::new(path))?;
        if text.as_bytes().contains(&0)
            || text.len() > 256 * 1024
            || digest(text.as_bytes()).trim_start_matches("sha256:")
                != string(witness, "fullFileSha256")
        {
            return Ok(false);
        }
    }
    Ok(true)
}
#[tauri::command(async)]
pub fn check_gray_area_evidence(
    vault_path: String,
    basis: EvidenceBasis,
    witnesses: Vec<Value>,
) -> Result<bool, String> {
    check_basis(&vault_path, &basis, &witnesses)
}

#[tauri::command(async)]
pub fn preview_gray_area_scope(
    vault_path: String,
    project_slug: String,
    selected_source_path: Option<String>,
    expected_binding_digest: Option<String>,
) -> Result<Value, Value> {
    let vault = crate::canonical_root(&vault_path).map_err(Value::String)?;
    let binding = crate::gray_area_scope::resolve_binding_metadata(&vault, &project_slug)
        .map_err(Value::String)?;
    if let Some(reason) = crate::vault_root_rejection(&binding.root) {
        return Err(json!(format!("vault-root-rejected:{reason}")));
    }
    if selected_source_path.is_some() != expected_binding_digest.is_some()
        || expected_binding_digest
            .as_ref()
            .is_some_and(|digest| digest != &binding.binding_digest)
    {
        return Err(json!("binding_changed"));
    }
    if let Some(selected) = selected_source_path {
        if std::fs::canonicalize(selected).ok().as_ref() != Some(&binding.root) {
            return Err(json!("source_selection_mismatch"));
        }
    }
    if let Err(error) = crate::canonical_source_root(&binding.root.to_string_lossy()) {
        return Err(if error == "source-root-not-granted" {
            json!({"code":"source-root-not-granted","sourcePath":binding.root.to_string_lossy(),"bindingDigest":binding.binding_digest})
        } else {
            Value::String(error)
        });
    }
    verify_identity(&binding).map_err(Value::String)?;
    Ok(
        json!({"projectSlug":project_slug,"sourcePath":binding.root.to_string_lossy(),"sourceId":binding.source_id,"bindingDigest":binding.binding_digest,"maxFiles":MAX_FILES}),
    )
}

#[cfg(all(test, unix))]
#[path = "gray_area_tests.rs"]
mod unix_tests;

#[cfg(all(test, not(unix)))]
mod unsupported_platform_tests {
    use super::*;
    use std::fs;

    #[test]
    fn existing_folders_do_not_enable_the_unsupported_reader_or_change_files() {
        let root = std::env::temp_dir().join(format!(
            "atlas-gray-unsupported-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let root = crate::canonical_root(root.to_str().unwrap()).unwrap();
        fs::create_dir(root.join(".ontology-atlas")).unwrap();
        let source = b"export const untouched = true;\n";
        fs::write(root.join("source.ts"), source).unwrap();
        let source_id = crate::source_digest(&[b"folder", root.to_string_lossy().as_bytes()]);
        let binding = json!({"projectSlug":"project","sourceId":source_id,"rootPath":root,"kind":"folder","boundAt":"2026-09-28","receipt":{"projectSlug":"project","sourceId":source_id,"sourceKind":"folder"}});
        let sidecar = json!({"contractVersion":1,"bindings":[binding]}).to_string();
        fs::write(root.join(".ontology-atlas/project-sources.json"), &sidecar).unwrap();
        let basis = EvidenceBasis {
            project_slug: "project".into(),
            selected_uids: vec!["node".into()],
            source_id,
            source_fingerprint: "unmeasured".into(),
            source_roots: vec![".".into()],
            graph_digest: "unmeasured".into(),
            body_digest: "unmeasured".into(),
            binding_digest: "unmeasured".into(),
        };
        let path = root.to_string_lossy().into_owned();
        assert_eq!(
            preview_gray_area_scope(path.clone(), "project".into(), None, None).unwrap_err(),
            json!("unsupported_platform")
        );
        assert_eq!(
            read_gray_area_evidence(
                path.clone(),
                "project".into(),
                vec!["node".into()],
                "unmeasured".into()
            )
            .err()
            .as_deref(),
            Some("unsupported_platform")
        );
        assert_eq!(
            check_gray_area_evidence(path, basis, vec![])
                .err()
                .as_deref(),
            Some("unsupported_platform")
        );
        assert_eq!(
            read_text(&root, Path::new("source.ts")).err().as_deref(),
            Some("unsupported_platform")
        );
        assert_eq!(
            observe_scoped_source(&root, &[".".into()]).err().as_deref(),
            Some("unsupported_platform")
        );
        assert_eq!(fs::read(root.join("source.ts")).unwrap(), source);
        assert_eq!(
            fs::read_to_string(root.join(".ontology-atlas/project-sources.json")).unwrap(),
            sidecar
        );
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
        assert_eq!(
            fs::read_dir(root.join(".ontology-atlas")).unwrap().count(),
            1
        );
        fs::remove_dir_all(root).unwrap();
    }
}
