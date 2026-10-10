use std::path::{Path, PathBuf};

/// Judged by the absolute `toolCall.rawInput.file_path`, not the title, whose
/// wording varies. No path means ask.
pub(crate) fn permission_verdict(vault_root: &Path, file_path: Option<&str>) -> PermissionVerdict {
    let Some(raw) = file_path else {
        return PermissionVerdict::Ask;
    };
    let raw = Path::new(raw);
    // The root must be the absolute directory `acp_start` verified; empty or `/` would
    // open the whole gate.
    if !vault_root.is_absolute() || !raw.is_absolute() {
        return PermissionVerdict::Ask;
    }
    let Ok(root) = std::fs::canonicalize(vault_root) else {
        return PermissionVerdict::Ask;
    };
    // A root replaced by a link after start is refused: the boundary never moves mid-session.
    if root != vault_root || !root.is_dir() || root.parent().is_none() {
        return PermissionVerdict::Ask;
    }
    let resolved = resolve_for_comparison(raw);
    if resolved.starts_with(&root) {
        PermissionVerdict::AllowInsideVault
    } else {
        PermissionVerdict::Ask
    }
}

/// Canonicalizes the deepest existing ancestor and re-appends the rest: a new file
/// cannot be canonicalized (`/var` vs `/private/var`), yet an inside link pointing
/// outside must resolve.
fn resolve_for_comparison(path: &Path) -> PathBuf {
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return canonical;
    }
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor = path;
    loop {
        if let Ok(canonical) = std::fs::canonicalize(cursor) {
            let mut out = canonical;
            for part in rest.iter().rev() {
                out.push(part);
            }
            return out;
        }
        match (cursor.file_name(), cursor.parent()) {
            (Some(name), Some(parent)) => {
                rest.push(name.to_os_string());
                cursor = parent;
            }
            // No canonicalizable ancestor: compare as is.
            _ => return path.to_path_buf(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PermissionVerdict {
    AllowInsideVault,
    Ask,
}

#[cfg(test)]
mod tests;
