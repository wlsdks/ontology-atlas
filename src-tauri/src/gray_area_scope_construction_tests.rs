use super::*;

fn construction_folder(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "atlas-construction-{label}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&path).unwrap();
    fs::canonicalize(path).unwrap()
}

#[cfg(unix)]
#[test]
fn construction_excludes_a_nested_destination_before_capturing_its_text() {
    let root = construction_folder("destination");
    let vault = root.join("atlas");
    fs::create_dir_all(&vault).unwrap();
    fs::write(root.join("source.ts"), "export const value = 1;").unwrap();
    fs::write(vault.join("private.ts"), "NEVER_COPY_VAULT_TEXT").unwrap();
    let first = observe_construction_source(&root, &vault).unwrap();
    assert_eq!(first.files, vec!["source.ts"]);
    assert!(first
        .entries
        .iter()
        .all(|entry| !entry.path.starts_with("atlas")));
    assert!(first.excluded.iter().any(|path| path == "atlas"));
    fs::write(vault.join("private.ts"), "a changed document").unwrap();
    let later = observe_construction_source(&root, &vault).unwrap();
    assert_eq!(first.fingerprint, later.fingerprint);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn construction_refuses_the_destination_itself_and_source_inside_it() {
    let vault = construction_folder("vault-root");
    let child = vault.join("sources");
    fs::create_dir_all(&child).unwrap();
    assert!(observe_construction_source(&vault, &vault).is_err());
    assert!(observe_construction_source(&child, &vault).is_err());
    fs::remove_dir_all(vault).unwrap();
}

#[cfg(unix)]
#[test]
fn construction_keeps_a_sibling_with_the_same_prefix_and_excludes_unsafe_files() {
    let root = construction_folder("prefix");
    let vault = root.join("atlas");
    fs::create_dir_all(&vault).unwrap();
    fs::create_dir_all(root.join("atlas-code")).unwrap();
    fs::write(root.join("atlas-code/role.py"), "value = '한글'").unwrap();
    fs::write(root.join("secret.py"), "SECRET_TOKEN").unwrap();
    fs::write(root.join("binary.py"), b"x\0y").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(root.join("atlas-code/role.py"), root.join("linked.py")).unwrap();
    let captured = observe_construction_source(&root, &vault).unwrap();
    assert!(captured
        .entries
        .iter()
        .any(|entry| entry.path == "atlas-code/role.py" && entry.text.is_none()));
    assert!(captured.entries.iter().all(|entry| entry
        .text
        .as_deref()
        .is_none_or(|text| !text.contains("SECRET_TOKEN"))));
    assert!(captured
        .entries
        .iter()
        .find(|entry| entry.path == "binary.py")
        .unwrap()
        .text
        .is_none());
    #[cfg(unix)]
    assert!(captured
        .entries
        .iter()
        .find(|entry| entry.path == "linked.py")
        .unwrap()
        .text
        .is_none());
    fs::remove_dir_all(root).unwrap();
}
