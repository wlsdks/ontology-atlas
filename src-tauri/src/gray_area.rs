use crate::gray_area_rpc::EvidenceReader;
use crate::gray_area_scope::{
    digest, observe_scoped_source, read_text, resolve_binding, safe_source_path, vault_digest,
    verify_identity,
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
    let mut reader = EvidenceReader::start(
        &vault,
        &crate::gray_area_scope::SourceObservation::empty(),
    )?;
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
    let witnesses:Vec<Value>=source_paths.iter().map(|path|{
        if !safe_source_path(Path::new(path)){return json!({"path":path,"status":"refused","reason":"source_path_refused"});}
        let entry=source.entries.iter().find(|e|e.path==*path);
        if !entry.is_some_and(|e|e.kind=="file"&&e.size<=256*1024){return json!({"path":path,"status":"refused","reason":"source_file_unavailable"});}
        let captured=entry.and_then(|e|e.text.clone()).or_else(||read_text(&binding.root,Path::new(path)).ok());
        let Some(text)=captured else{return json!({"path":path,"status":"refused","reason":"source_bytes_unavailable"});};
        if text.is_empty()||text.len()>256*1024{return json!({"path":path,"status":"refused","reason":"source_file_limit"});}
        let lines:Vec<_>=text.lines().collect();let end=lines.len().min(80);let excerpt=lines[..end].join("\n");
        if excerpt.len()>8*1024{return json!({"path":path,"status":"refused","reason":"source_range_limit"});}
        json!({"path":path,"status":"read","text":excerpt,"actualRange":{"startLine":1,"endLine":end},"fullFileSha256":digest(text.as_bytes()).trim_start_matches("sha256:"),"citation":format!("{path}:1-{end}"),"fileComplete":lines.len()<=80})
    }).collect();
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
        crate::git::git_paths_last_change(root.into(), repo_paths, vault_paths)
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
        if !safe_source_path(Path::new(path)) {
            return Ok(false);
        }
        let text = read_text(&binding.root, Path::new(path))?;
        if digest(text.as_bytes()).trim_start_matches("sha256:")
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
pub fn preview_gray_area_scope(vault_path: String, project_slug: String) -> Result<Value, String> {
    let vault = crate::canonical_root(&vault_path)?;
    let binding = resolve_binding(&vault, &project_slug)?;
    verify_identity(&binding)?;
    Ok(
        json!({"projectSlug":project_slug,"sourcePath":binding.root.to_string_lossy(),"sourceId":binding.source_id,"bindingDigest":binding.binding_digest,"maxFiles":MAX_FILES}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gray_area_scope::observe_source;
    use std::fs;
    use std::path::PathBuf;
    struct Fixture {
        root: PathBuf,
        vault: PathBuf,
        code: PathBuf,
        basis: EvidenceBasis,
    }
    impl Fixture {
        fn new() -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let serial = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "atlas-gray-{}-{nonce}-{serial}",
                std::process::id()
            ));
            fs::create_dir(&root).unwrap();
            let vault = root.join("vault");
            let code = root.join("code");
            fs::create_dir_all(vault.join(".ontology-atlas")).unwrap();
            fs::create_dir_all(code.join("src")).unwrap();
            fs::write(
                vault.join("project.md"),
                "---\nkind: project\nslug: project\n---\n## Uncertainty\nnot read\n",
            )
            .unwrap();
            fs::write(code.join("src/a.ts"), "export const value = true;\n").unwrap();
            let code = crate::canonical_root(code.to_str().unwrap()).unwrap();
            let vault = crate::canonical_root(vault.to_str().unwrap()).unwrap();
            let source_id = crate::source_digest(&[b"folder", code.to_string_lossy().as_bytes()]);
            let binding = json!({"projectSlug":"project","sourceId":source_id,"rootPath":code,"kind":"folder","boundAt":"2026-09-28","receipt":{"projectSlug":"project","sourceId":source_id,"sourceKind":"folder"}});
            fs::write(
                vault.join(".ontology-atlas/project-sources.json"),
                json!({"contractVersion":1,"bindings":[binding]}).to_string(),
            )
            .unwrap();
            let bound = resolve_binding(&vault, "project").unwrap();
            let basis = EvidenceBasis {
                project_slug: "project".into(),
                selected_uids: vec!["node".into()],
                source_id,
                source_fingerprint: observe_source(&code).unwrap().fingerprint,
                source_roots: vec![".".into()],
                graph_digest: "unchanged-graph".into(),
                body_digest: vault_digest(&vault).unwrap(),
                binding_digest: bound.binding_digest,
            };
            Self {
                root,
                vault,
                code,
                basis,
            }
        }
        fn current(&self) -> bool {
            check_basis(self.vault.to_str().unwrap(), &self.basis, &[]).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    #[test]
    fn a_body_only_same_size_same_mtime_edit_invalidates_the_snapshot() {
        let f = Fixture::new();
        assert!(f.current());
        let path = f.vault.join("project.md");
        let time = fs::metadata(&path).unwrap().modified().unwrap();
        let text = fs::read_to_string(&path)
            .unwrap()
            .replace("not read", "now read");
        fs::write(&path, text).unwrap();
        fs::File::open(path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(time))
            .unwrap();
        assert!(!f.current());
    }
    #[test]
    fn source_content_and_new_scan_limit_invalidate_without_a_git_timestamp() {
        let f = Fixture::new();
        let path = f.code.join("src/a.ts");
        let time = fs::metadata(&path).unwrap().modified().unwrap();
        fs::write(&path, "export const value = null;\n").unwrap();
        fs::File::open(path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(time))
            .unwrap();
        assert!(!f.current());
        let g = Fixture::new();
        fs::write(g.code.join("src/large.ts"), vec![b'x'; 512 * 1024 + 1]).unwrap();
        assert!(!g.current());
    }
    #[test]
    fn resolver_only_edits_and_negative_candidate_additions_invalidate_currentness() {
        let mut f = Fixture::new();
        let config = f.code.join("tsconfig.json");
        fs::write(
            &config,
            r#"{"compilerOptions":{"paths":{"policy":["src/old.ts"]}}}"#,
        )
        .unwrap();
        f.basis.source_fingerprint = observe_source(&f.code).unwrap().fingerprint;
        let time = fs::metadata(&config).unwrap().modified().unwrap();
        fs::write(
            &config,
            r#"{"compilerOptions":{"paths":{"policy":["src/new.ts"]}}}"#,
        )
        .unwrap();
        fs::File::open(config)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(time))
            .unwrap();
        assert!(!f.current());
        let g = Fixture::new();
        fs::write(g.code.join("src/policy.ts"), "export const policy=true;").unwrap();
        assert!(!g.current());
    }
    #[test]
    fn replacing_a_directory_with_identical_names_and_bytes_invalidates_its_identity() {
        let f = Fixture::new();
        let original = f.code.join("src");
        let moved = f.code.join("previous");
        fs::rename(&original, &moved).unwrap();
        fs::create_dir(&original).unwrap();
        fs::copy(moved.join("a.ts"), original.join("a.ts")).unwrap();
        fs::remove_dir_all(moved).unwrap();
        assert!(!f.current());
    }
    #[test]
    fn a_rebound_root_is_not_the_same_evidence_even_with_identical_code() {
        let f = Fixture::new();
        let path = f.vault.join(".ontology-atlas/project-sources.json");
        let mut data: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        data["bindings"][0]["boundAt"] = json!("2026-09-29");
        fs::write(path, data.to_string()).unwrap();
        assert!(!f.current());
    }
    #[test]
    fn preview_does_not_scan_and_a_changed_approval_is_refused_before_spawning() {
        let f = Fixture::new();
        fs::write(f.code.join("src/large.ts"), vec![b'x'; 512 * 1024 + 1]).unwrap();
        assert!(
            preview_gray_area_scope(f.vault.to_string_lossy().into_owned(), "project".into())
                .is_ok()
        );
        assert_eq!(
            read_gray_area_evidence(
                f.vault.to_string_lossy().into_owned(),
                "project".into(),
                vec!["node".into()],
                "other-binding".into()
            )
            .unwrap_err(),
            "binding_changed"
        );
    }
    #[test]
    fn credential_names_are_excluded_from_hashing_and_passed_to_the_import_ignore_list() {
        let f = Fixture::new();
        fs::write(f.code.join("src/secrets.ts"), "private value").unwrap();
        let before = observe_source(&f.code).unwrap();
        fs::write(f.code.join("src/secrets.ts"), "changed private value").unwrap();
        let after = observe_source(&f.code).unwrap();
        assert_eq!(before.fingerprint, after.fingerprint);
        assert!(after.ignored_names.contains(&"secrets.ts".into()));
        assert!(!after.files.iter().any(|p| p.contains("secrets")));
    }
    #[cfg(unix)]
    #[test]
    fn symlinked_source_files_and_sidecars_do_not_grant_reads() {
        let f = Fixture::new();
        let outside = f.root.join("outside");
        fs::write(&outside, "private").unwrap();
        std::os::unix::fs::symlink(&outside, f.code.join("src/link.ts")).unwrap();
        assert!(!f.current());
        assert!(observe_source(&f.code)
            .unwrap()
            .entries
            .iter()
            .any(|e| e.path == "src/link.ts" && e.kind == "symlink" && e.text.is_none()));
        let sidecar = f.vault.join(".ontology-atlas/project-sources.json");
        fs::remove_file(&sidecar).unwrap();
        std::os::unix::fs::symlink(outside, sidecar).unwrap();
        assert!(resolve_binding(&f.vault, "project").is_err());
    }
}
