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
    let binding = resolve_binding_metadata(vault, project)?;
    crate::canonical_root(&binding.root.to_string_lossy())?;
    Ok(binding)
}
pub(crate) fn resolve_binding_metadata(vault: &Path, project: &str) -> Result<BoundSource, String> {
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
    let root = fs::canonicalize(root).map_err(|_| "source_unavailable")?;
    if !root.is_dir() {
        return Err("source_unavailable".into());
    }
    if crate::source_digest(&[kind.as_bytes(), root.to_string_lossy().as_bytes()]) != source_id {
        return Err("binding_identity_changed".into());
    }
    Ok(BoundSource {
        root,
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotEntry {
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub identity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<String>>,
}
pub(crate) struct SourceObservation {
    pub fingerprint: String,
    pub files: Vec<String>,
    pub limited: bool,
    pub ignored_names: Vec<String>,
    pub entries: Vec<SnapshotEntry>,
    pub excluded: Vec<String>,
    text_bytes: usize,
    code_roots: Vec<String>,
}
impl SourceObservation {
    pub(crate) fn empty() -> Self {
        Self {
            fingerprint: String::new(),
            files: Vec::new(),
            limited: false,
            ignored_names: vec!["target".into()],
            entries: Vec::new(),
            excluded: Vec::new(),
            text_bytes: 0,
            code_roots: Vec::new(),
        }
    }
}
#[cfg(test)]
pub(crate) fn observe_source(root: &Path) -> Result<SourceObservation, String> {
    observe_scoped_source(root, &[".".into()])
}
pub(crate) fn observe_scoped_source(
    root: &Path,
    code_roots: &[String],
) -> Result<SourceObservation, String> {
    let mut result = SourceObservation {
        fingerprint: String::new(),
        files: Vec::new(),
        limited: false,
        ignored_names: vec!["target".into()],
        entries: Vec::new(),
        excluded: Vec::new(),
        text_bytes: 0,
        code_roots: code_roots.to_vec(),
    };
    #[cfg(unix)]
    {
        let handle = crate::agent_setup::open_absolute_directory_no_follow(root)?;
        capture_directory(&handle, Path::new(""), 0, &mut result)?;
    }
    #[cfg(not(unix))]
    return Err("unsupported_platform".into());
    result.entries.sort_by(|a, b| a.path.cmp(&b.path));
    result.files.sort();
    result.excluded.sort();
    result.ignored_names.sort();
    result.ignored_names.dedup();
    let mut hash = Sha256::new();
    hash.update(serde_json::to_vec(code_roots).map_err(|_| "source_unavailable")?);
    for entry in &result.entries {
        hash.update(serde_json::to_vec(entry).map_err(|_| "source_unavailable")?);
        hash.update([0]);
    }
    if let Some(repo) = crate::git::find_repo_root(root)? {
        hash.update(crate::run_source_git(&repo, &["rev-parse", "HEAD"])?);
    }
    hash.update(serde_json::to_vec(&result.excluded).map_err(|_| "source_unavailable")?);
    hash.update([u8::from(result.limited)]);
    hash.update(serde_json::to_vec(&result.ignored_names).map_err(|_| "source_unavailable")?);
    result.fingerprint = format!("sha256:{:x}", hash.finalize());
    Ok(result)
}
fn text_input(path: &Path, code_roots: &[String]) -> bool {
    let file = path.to_string_lossy();
    (matches!(
        path.extension().and_then(|x| x.to_str()),
        Some("ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "mts" | "cts" | "py" | "rs" | "go")
    ) && code_roots
        .iter()
        .any(|root| root == "." || file == *root || file.starts_with(&format!("{root}/"))))
        || matches!(
            path.file_name().and_then(|x| x.to_str()),
            Some(
                "tsconfig.json" | "package.json" | "pnpm-workspace.yaml" | "Cargo.toml" | "go.mod"
            )
        )
}
#[cfg(unix)]
fn capture_directory(
    handle: &fs::File,
    relative: &Path,
    depth: usize,
    result: &mut SourceObservation,
) -> Result<(), String> {
    use std::io::Read;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::fs::MetadataExt;
    if depth > 12 || result.entries.len() >= 12000 {
        result.limited = true;
        return Ok(());
    }
    let meta = handle.metadata().map_err(|_| "source_unavailable")?;
    let mut names = Vec::new();
    let stream = unsafe { libc::fdopendir(libc::dup(handle.as_raw_fd())) };
    if stream.is_null() {
        return Err("source_unavailable".into());
    }
    loop {
        let entry = unsafe { libc::readdir(stream) };
        if entry.is_null() {
            break;
        }
        let raw = unsafe { std::ffi::CStr::from_ptr((*entry).d_name.as_ptr()) };
        let Ok(name) = raw.to_str() else {
            unsafe { libc::closedir(stream) };
            return Err("source_filename_unsupported".into());
        };
        if name == "." || name == ".." {
            continue;
        }
        if name.starts_with('.')
            || matches!(
                name,
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
            result
                .excluded
                .push(relative.join(name).to_string_lossy().into_owned());
            continue;
        }
        if !safe_source_path(Path::new(name)) {
            result.ignored_names.push(name.into());
            result
                .excluded
                .push(relative.join(name).to_string_lossy().into_owned());
            continue;
        }
        names.push(name.to_string());
        if names.len() > 12000 {
            result.limited = true;
            break;
        }
    }
    unsafe { libc::closedir(stream) };
    names.sort();
    result.entries.push(SnapshotEntry {
        path: if relative.as_os_str().is_empty() {
            ".".into()
        } else {
            relative.to_string_lossy().into_owned()
        },
        kind: "directory".into(),
        size: 0,
        identity: format!("{}:{}", meta.dev(), meta.ino()),
        text: None,
        children: Some(names.clone()),
    });
    for name in names {
        if result.entries.len() >= 12000 {
            result.limited = true;
            break;
        }
        let name_c = std::ffi::CString::new(name.as_bytes()).map_err(|_| "unsafe_path")?;
        let mut info = std::mem::MaybeUninit::<libc::stat>::uninit();
        if unsafe {
            libc::fstatat(
                handle.as_raw_fd(),
                name_c.as_ptr(),
                info.as_mut_ptr(),
                libc::AT_SYMLINK_NOFOLLOW,
            )
        } != 0
        {
            return Err("source_changed_during_read".into());
        }
        let info = unsafe { info.assume_init() };
        let mode = info.st_mode & libc::S_IFMT;
        let kind = if mode == libc::S_IFDIR {
            "directory"
        } else if mode == libc::S_IFREG {
            "file"
        } else if mode == libc::S_IFLNK {
            "symlink"
        } else {
            "other"
        };
        let path = relative.join(&name);
        if kind == "file" && !text_input(&path, &result.code_roots) {
            result.files.push(path.to_string_lossy().into_owned());
            result.entries.push(SnapshotEntry {
                path: path.to_string_lossy().into_owned(),
                kind: kind.into(),
                size: info.st_size.max(0) as u64,
                identity: format!("{}:{}", info.st_dev, info.st_ino),
                text: None,
                children: None,
            });
            continue;
        }
        if kind == "directory" || kind == "file" {
            let flags = libc::O_RDONLY
                | libc::O_NOFOLLOW
                | libc::O_NONBLOCK
                | libc::O_CLOEXEC
                | if kind == "directory" {
                    libc::O_DIRECTORY
                } else {
                    0
                };
            let fd = unsafe { libc::openat(handle.as_raw_fd(), name_c.as_ptr(), flags) };
            if fd < 0 {
                return Err("source_changed_during_read".into());
            }
            let file = unsafe { fs::File::from_raw_fd(fd) };
            let opened = file.metadata().map_err(|_| "source_unavailable")?;
            if opened.dev() != info.st_dev as u64 || opened.ino() != info.st_ino as u64 {
                return Err("source_changed_during_read".into());
            }
            if kind == "directory" {
                capture_directory(&file, &path, depth + 1, result)?;
                continue;
            }
            let mut text = None;
            if text_input(&path, &result.code_roots) {
                if opened.len() > 512 * 1024
                    || result.text_bytes + opened.len() as usize > 32 * 1024 * 1024
                {
                    result.limited = true;
                } else {
                    let mut bytes = Vec::new();
                    (&file)
                        .take(512 * 1024 + 1)
                        .read_to_end(&mut bytes)
                        .map_err(|_| "source_unavailable")?;
                    let after = file.metadata().map_err(|_| "source_unavailable")?;
                    if bytes.len() != opened.len() as usize
                        || after.len() != opened.len()
                        || after.mtime() != opened.mtime()
                        || after.mtime_nsec() != opened.mtime_nsec()
                        || after.ctime() != opened.ctime()
                        || after.ctime_nsec() != opened.ctime_nsec()
                    {
                        return Err("source_changed_during_read".into());
                    }
                    result.text_bytes += bytes.len();
                    if !bytes.contains(&0) {
                        text = String::from_utf8(bytes).ok();
                    }
                }
            }
            result.files.push(path.to_string_lossy().into_owned());
            result.entries.push(SnapshotEntry {
                path: path.to_string_lossy().into_owned(),
                kind: kind.into(),
                size: opened.len(),
                identity: format!("{}:{}", opened.dev(), opened.ino()),
                text,
                children: None,
            });
        } else {
            result.entries.push(SnapshotEntry {
                path: path.to_string_lossy().into_owned(),
                kind: kind.into(),
                size: info.st_size.max(0) as u64,
                identity: format!("{}:{}", info.st_dev, info.st_ino),
                text: None,
                children: None,
            });
        }
    }
    Ok(())
}
pub(crate) fn source_witness(root: &Path, source: &SourceObservation, path: &str) -> Value {
    use serde_json::json;
    if !excerpt_source_path(Path::new(path)) {
        return json!({"path":path,"status":"refused","reason":"source_path_refused"});
    }
    let entry = source.entries.iter().find(|e| e.path == *path);
    if !entry.is_some_and(|e| e.kind == "file" && e.size <= 256 * 1024) {
        return json!({"path":path,"status":"refused","reason":"source_file_unavailable"});
    }
    let captured = entry
        .and_then(|e| e.text.clone())
        .or_else(|| read_text(root, Path::new(path)).ok());
    let Some(text) = captured else {
        return json!({"path":path,"status":"refused","reason":"source_bytes_unavailable"});
    };
    if text.as_bytes().contains(&0) {
        return json!({"path":path,"status":"refused","reason":"binary_source"});
    }
    if text.is_empty() || text.len() > 256 * 1024 {
        return json!({"path":path,"status":"refused","reason":"source_file_limit"});
    }
    let lines: Vec<_> = text.lines().collect();
    let end = lines.len().min(80);
    let excerpt = lines[..end].join("\n");
    if excerpt.len() > 8 * 1024 {
        return json!({"path":path,"status":"refused","reason":"source_range_limit"});
    }
    json!({"path":path,"status":"read","text":excerpt,"actualRange":{"startLine":1,"endLine":end},"fullFileSha256":digest(text.as_bytes()).trim_start_matches("sha256:"),"citation":format!("{path}:1-{end}"),"fileComplete":lines.len()<=80})
}
pub(crate) fn safe_source_path(path: &Path) -> bool {
    let Some(literal) = path.to_str() else {
        return false;
    };
    if literal.chars().count() > 1024
        || literal
            .chars()
            .any(|c| c.is_control() || matches!(c, '\\' | ':' | '#'))
    {
        return false;
    }
    literal.split('/').all(|name| {
        if name.is_empty()
            || name.starts_with('.')
            || matches!(
                name,
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
            return false;
        }
        let part = Path::new(name);
        let stem = part
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
                | "privatekey"
                | "id_rsa"
                | "id_ed25519"
        ) && !matches!(
            part.extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str(),
            "pem" | "key" | "p12" | "pfx" | "jks" | "keystore"
        )
    })
}
pub(crate) fn excerpt_source_path(path: &Path) -> bool {
    safe_source_path(path)
        && (matches!(
            path.extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str(),
            "c" | "cc"
                | "cpp"
                | "cs"
                | "css"
                | "go"
                | "h"
                | "hpp"
                | "html"
                | "java"
                | "js"
                | "jsx"
                | "kt"
                | "kts"
                | "mjs"
                | "mts"
                | "php"
                | "py"
                | "rb"
                | "rs"
                | "scss"
                | "sh"
                | "swift"
                | "ts"
                | "tsx"
                | "vue"
                | "zig"
                | "markdown"
                | "md"
                | "rst"
                | "txt"
        ) || matches!(
            path.file_name().and_then(|x| x.to_str()),
            Some(
                "Cargo.toml"
                    | "Gemfile"
                    | "go.mod"
                    | "package.json"
                    | "pyproject.toml"
                    | "requirements.txt"
                    | "setup.cfg"
                    | "setup.py"
            )
        ))
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
