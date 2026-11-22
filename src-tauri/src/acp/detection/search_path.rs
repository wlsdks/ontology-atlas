use std::ffi::{OsStr, OsString};
use std::path::{Component, Path, PathBuf};

fn is_node_modules_bin(entry: &Path) -> bool {
    let mut tail = entry.components().rev();
    matches!(tail.next(), Some(Component::Normal(last)) if last == ".bin")
        && matches!(tail.next(), Some(Component::Normal(parent)) if parent == "node_modules")
}

fn path_spellings(path: &Path) -> Vec<PathBuf> {
    let mut forms = vec![path.to_path_buf()];
    if let Ok(canonical) = std::fs::canonicalize(path) {
        if !forms.contains(&canonical) {
            forms.push(canonical);
        }
    }
    forms
}

fn under_untrusted_root(entry: &Path, roots: &[PathBuf]) -> bool {
    path_spellings(entry)
        .iter()
        .any(|form| roots.iter().any(|root| form.starts_with(root)))
}

pub(crate) fn path_without_vault_node_modules_bin(
    path_env: &str,
    vault_root: &Path,
    repo_root: Option<&Path>,
) -> String {
    let mut roots: Vec<PathBuf> = Vec::new();
    for root in std::iter::once(vault_root).chain(repo_root) {
        for form in path_spellings(root) {
            if !roots.contains(&form) {
                roots.push(form);
            }
        }
    }
    let kept: Vec<PathBuf> = std::env::split_paths(&OsString::from(path_env))
        .filter(|entry| !entry.as_os_str().is_empty() && entry.has_root())
        .filter(|entry| !is_node_modules_bin(entry) || !under_untrusted_root(entry, &roots))
        .collect();
    std::env::join_paths(kept)
        .map(|joined| joined.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path_env.to_string())
}

pub(crate) fn sanitized_process_path(path_env: &OsStr) -> OsString {
    let kept: Vec<PathBuf> = std::env::split_paths(path_env)
        .filter(|entry| !entry.as_os_str().is_empty() && entry.has_root())
        .collect();
    std::env::join_paths(kept).unwrap_or_else(|_| path_env.to_os_string())
}

#[cfg(test)]
mod tests;
