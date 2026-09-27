use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

pub(crate) fn read_text(root: &Path, relative: &Path) -> Result<String, String> {
    if relative
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("unsafe_path".into());
    }
    #[cfg(unix)]
    {
        let handle = crate::agent_setup::open_absolute_directory_no_follow(root)?;
        let parent = crate::agent_setup::open_relative_directory(
            &handle,
            relative.parent().unwrap_or(Path::new("")),
        )?
        .ok_or("source_unavailable")?;
        let name = std::ffi::CString::new(
            relative
                .file_name()
                .ok_or("unsafe_path")?
                .as_encoded_bytes(),
        )
        .map_err(|_| "unsafe_path")?;
        crate::agent_setup::read_entry_text(&parent, &name)?
            .ok_or_else(|| "source_unavailable".into())
    }
    #[cfg(not(unix))]
    {
        let _ = root;
        Err("unsupported_platform".into())
    }
}

pub(crate) struct BoundSource {
    pub root: PathBuf,
    pub source_id: String,
    pub kind: String,
    pub binding_digest: String,
}
pub(crate) fn resolve_binding(vault: &Path, project: &str) -> Result<BoundSource, String> {
    let text = read_text(vault, Path::new(".ontology-atlas/project-sources.json"))?;
    let data: Value = serde_json::from_str(&text).map_err(|_| "binding_invalid")?;
    binding_from_value(&data, project)
}
fn binding_from_value(data: &Value, project: &str) -> Result<BoundSource, String> {
    if data.get("contractVersion").and_then(Value::as_u64) != Some(1) {
        return Err("binding_invalid".into());
    }
    let matches: Vec<_> = data
        .get("bindings")
        .and_then(Value::as_array)
        .ok_or("binding_invalid")?
        .iter()
        .filter(|b| b.get("projectSlug").and_then(Value::as_str) == Some(project))
        .collect();
    if matches.len() != 1 {
        return Err("binding_ambiguous".into());
    }
    let binding = matches[0];
    let root = binding
        .get("rootPath")
        .and_then(Value::as_str)
        .ok_or("binding_invalid")?;
    let source_id = binding
        .get("sourceId")
        .and_then(Value::as_str)
        .ok_or("binding_invalid")?;
    let kind = binding
        .get("kind")
        .and_then(Value::as_str)
        .ok_or("binding_invalid")?;
    if !matches!(kind, "git" | "folder")
        || !Path::new(root).is_absolute()
        || binding.get("boundAt").and_then(Value::as_str).is_none()
    {
        return Err("binding_invalid".into());
    }
    let receipt = binding.get("receipt").ok_or("binding_invalid")?;
    if receipt.get("projectSlug").and_then(Value::as_str) != Some(project)
        || receipt.get("sourceId").and_then(Value::as_str) != Some(source_id)
        || receipt.get("sourceKind").and_then(Value::as_str) != Some(kind)
    {
        return Err("binding_invalid".into());
    }
    Ok(BoundSource {
        root: crate::canonical_root(root)?,
        source_id: source_id.into(),
        kind: kind.into(),
        binding_digest: digest(
            serde_json::to_string(binding)
                .map_err(|_| "binding_invalid")?
                .as_bytes(),
        ),
    })
}

pub(crate) fn vault_digest(vault: &Path) -> Result<String, String> {
    let mut files = Vec::new();
    collect_markdown(vault, vault, 0, &mut files)?;
    files.sort();
    if files.len() > 500 {
        return Err("vault_limit".into());
    }
    let mut hash = Sha256::new();
    let mut total = 0;
    for path in files {
        let text = read_text(vault, &path)?;
        total += text.len();
        if total > 8 * 1024 * 1024 {
            return Err("vault_limit".into());
        }
        hash.update(path.to_string_lossy().as_bytes());
        hash.update([0]);
        hash.update(text.as_bytes());
        hash.update([0]);
    }
    if let Some(root) = crate::git::find_repo_root(vault)? {
        hash.update(crate::run_source_git(&root, &["rev-parse", "HEAD"])?);
    }
    Ok(format!("sha256:{:x}", hash.finalize()))
}
fn collect_markdown(
    root: &Path,
    dir: &Path,
    depth: usize,
    out: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if depth > 12 || out.len() > 500 {
        return Err("vault_limit".into());
    }
    for item in fs::read_dir(dir).map_err(|_| "vault_unavailable")? {
        let item = item.map_err(|_| "vault_unavailable")?;
        let name = item.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || matches!(name.as_ref(), "node_modules" | "sources") {
            continue;
        }
        let kind = item.file_type().map_err(|_| "vault_unavailable")?;
        if kind.is_symlink() {
            return Err("unsafe_path".into());
        }
        if kind.is_dir() {
            collect_markdown(root, &item.path(), depth + 1, out)?;
        } else if name.ends_with(".md") {
            out.push(
                item.path()
                    .strip_prefix(root)
                    .map_err(|_| "unsafe_path")?
                    .to_path_buf(),
            );
        }
    }
    Ok(())
}

pub(crate) struct SourceObservation {
    pub fingerprint: String,
    pub files: Vec<String>,
    pub limited: bool,
    pub ignored_names: Vec<String>,
}
pub(crate) fn observe_source(root: &Path) -> Result<SourceObservation, String> {
    let mut result = SourceObservation {
        fingerprint: String::new(),
        files: Vec::new(),
        limited: false,
        ignored_names: vec!["target".into()],
    };
    let mut paths = Vec::new();
    collect_code(root, root, 0, &mut paths, &mut result)?;
    paths.sort();
    let mut hash = Sha256::new();
    let mut bytes = 0;
    for path in paths {
        let relative = path.to_string_lossy();
        let text = read_text(root, &path)?;
        bytes += text.len();
        if text.len() > 512 * 1024 || bytes > 32 * 1024 * 1024 {
            result.limited = true;
            break;
        }
        hash.update(relative.as_bytes());
        hash.update([0]);
        hash.update(text.as_bytes());
        hash.update([0]);
        result.files.push(relative.into_owned());
    }
    result.ignored_names.sort();
    result.ignored_names.dedup();
    if let Some(repo) = crate::git::find_repo_root(root)? {
        hash.update(crate::run_source_git(&repo, &["rev-parse", "HEAD"])?);
    }
    hash.update([u8::from(result.limited)]);
    hash.update(serde_json::to_vec(&result.ignored_names).map_err(|_| "source_unavailable")?);
    result.fingerprint = format!("sha256:{:x}", hash.finalize());
    Ok(result)
}
pub(crate) fn safe_source_path(path: &Path) -> bool {
    if path
        .components()
        .any(|c| !matches!(c,Component::Normal(v) if !v.to_string_lossy().starts_with('.')))
    {
        return false;
    }
    let stem = path
        .file_stem()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase();
    !matches!(
        stem.as_str(),
        "credential"
            | "credentials"
            | "secret"
            | "secrets"
            | "private-key"
            | "private_key"
            | "id_rsa"
            | "id_ed25519"
    ) && !matches!(
        path.extension().and_then(|x| x.to_str()),
        Some("pem" | "key" | "p12" | "pfx" | "jks" | "keystore")
    )
}
fn collect_code(
    root: &Path,
    dir: &Path,
    depth: usize,
    paths: &mut Vec<PathBuf>,
    result: &mut SourceObservation,
) -> Result<(), String> {
    if depth > 12 || paths.len() > 2000 {
        result.limited = true;
        return Ok(());
    }
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|_| "source_unavailable")?
        .collect::<Result<_, _>>()
        .map_err(|_| "source_unavailable")?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.')
            || matches!(
                name.as_str(),
                "node_modules"
                    | "out"
                    | "dist"
                    | "build"
                    | "target"
                    | "coverage"
                    | "__pycache__"
                    | "venv"
            )
        {
            continue;
        }
        let kind = entry.file_type().map_err(|_| "source_unavailable")?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            collect_code(root, &entry.path(), depth + 1, paths, result)?;
            continue;
        }
        let path = entry.path();
        let relative = path.strip_prefix(root).map_err(|_| "unsafe_path")?;
        if !safe_source_path(relative) {
            result.ignored_names.push(name);
            continue;
        }
        if !matches!(
            path.extension().and_then(|x| x.to_str()),
            Some("ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "mts" | "cts" | "py" | "rs" | "go")
        ) {
            continue;
        }
        if entry.metadata().map_err(|_| "source_unavailable")?.len() > 512 * 1024 {
            result.limited = true;
            continue;
        }
        paths.push(relative.to_path_buf());
        if paths.len() > 2000 {
            result.limited = true;
            return Ok(());
        }
    }
    Ok(())
}
pub(crate) fn verify_identity(binding: &BoundSource) -> Result<(), String> {
    let git_root = crate::git::find_repo_root(&binding.root)?;
    let kind = if git_root.is_some() { "git" } else { "folder" };
    if git_root.as_ref().is_some_and(|p| p != &binding.root) || kind != binding.kind {
        return Err("binding_identity_changed".into());
    }
    let root = binding.root.to_string_lossy();
    let expected = crate::source_digest(&[kind.as_bytes(), root.as_bytes()]);
    if expected != binding.source_id {
        return Err("binding_identity_changed".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn duplicate_bindings_are_refused_before_a_root_is_used() {
        let binding = json!({"projectSlug":"project"});
        assert!(binding_from_value(
            &json!({"contractVersion":1,"bindings":[binding.clone(),binding]}),
            "project"
        )
        .is_err());
    }
    #[test]
    fn full_body_digest_changes_even_when_graph_shape_and_text_length_do_not() {
        assert_ne!(
            digest(b"## Uncertainty\nnot read"),
            digest(b"## Uncertainty\nnow read")
        );
    }
    #[test]
    fn traversal_is_never_a_read_selector() {
        assert!(read_text(Path::new("/tmp"), Path::new("../outside")).is_err());
    }
}
