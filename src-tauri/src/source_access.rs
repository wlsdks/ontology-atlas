use std::path::Path;

fn grant_selected_source(path: &Path) -> Result<String, String> {
    let root = std::fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !root.is_dir() {
        return Err("source root must be a directory".into());
    }
    if let Some(reason) = crate::vault_root_rejection(&root) {
        return Err(format!("source-root-rejected:{reason}"));
    }
    crate::vault_grants::grant_source_root(&root);
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command(async)]
pub fn pick_source_directory(dialog_title: Option<String>) -> Result<Option<String>, String> {
    let title = dialog_title
        .as_deref()
        .unwrap_or("Select connected code folder");
    rfd::FileDialog::new()
        .set_title(title)
        .pick_folder()
        .map(|path| grant_selected_source(&path))
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_source_selection_grants_reading_without_vault_writes_or_parent_access() {
        let root = std::env::temp_dir().join(format!("atlas-source-access-{}", std::process::id()));
        let source = root.join("source");
        std::fs::create_dir_all(&source).unwrap();
        let _scope = crate::vault_grants::EnforcedScope::granting(&[]);
        let chosen = grant_selected_source(&source).unwrap();
        assert!(crate::canonical_source_root(&chosen).is_ok());
        assert_eq!(
            crate::canonical_root(&chosen).unwrap_err(),
            "vault-root-not-granted"
        );
        assert_eq!(
            crate::canonical_source_root(root.to_str().unwrap()).unwrap_err(),
            "source-root-not-granted"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
