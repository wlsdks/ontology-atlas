pub(crate) mod create;
pub(crate) mod library_collections;
pub(crate) mod location;
pub(crate) mod read;
pub(crate) mod scope;
pub(crate) mod walk;
pub(crate) mod watch;
pub(crate) mod write;

#[cfg(test)]
mod vault_scope_tests {
    use super::read::read_vault_text_file;
    use super::scope::{canonical_root, resolve_existing_inside};
    use super::walk::list_vault_directory;
    use super::write::{remove_vault_entry, write_vault_text_file};

    #[test]
    fn every_vault_door_refuses_an_ungranted_root_and_opens_a_granted_one() {
        let base = std::env::temp_dir().join(format!("atlas-scope-doors-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(base.join("vault/nested")).unwrap();
        std::fs::create_dir_all(home.join(".ssh")).unwrap();
        std::fs::write(base.join("vault/note.md"), b"# note").unwrap();
        std::fs::write(home.join(".ssh/id_rsa"), b"fixture, not a key").unwrap();
        let vault = std::fs::canonicalize(base.join("vault")).unwrap();
        let home_path = home.to_string_lossy().to_string();
        let vault_path = vault.to_string_lossy().to_string();
        let scope = crate::vault_grants::EnforcedScope::granting(&[vault.clone()]);

        let refused = |result: Result<(), String>| {
            let err = result.unwrap_err();
            assert!(err.contains("not-granted"), "{err}");
        };
        refused(read_vault_text_file(home_path.clone(), ".ssh/id_rsa".into()).map(|_| ()));
        refused(write_vault_text_file(
            home_path.clone(),
            "planted.md".into(),
            "x".into(),
        ));
        refused(remove_vault_entry(
            home_path.clone(),
            ".ssh/id_rsa".into(),
            None,
        ));
        refused(list_vault_directory(home_path.clone(), String::new(), None).map(|_| ()));
        refused(crate::git::validate_vault_dir(&home_path).map(|_| ()));
        refused(canonical_root(&base.to_string_lossy()).map(|_| ()));
        assert!(!home.join("planted.md").exists());
        assert!(home.join(".ssh/id_rsa").exists());

        assert!(read_vault_text_file(vault_path.clone(), "note.md".into()).is_ok());
        assert!(canonical_root(&vault.join("nested").to_string_lossy()).is_ok());
        assert!(crate::git::validate_vault_dir(&vault_path).is_ok());

        let judged = crate::jev::jev_judge(home_path.clone(), "{}".into()).unwrap_err();
        assert!(judged.contains("not-granted"), "{judged}");
        let verified = crate::agent_setup::verify_mcp_server(home_path.clone(), None);
        assert!(!verified.ok);
        assert!(
            verified
                .failure
                .as_deref()
                .unwrap_or("")
                .contains("not-granted"),
            "{:?}",
            verified.failure
        );
        refused(super::location::open_vault_in_finder(home_path.clone()));
        let report =
            crate::library::discover_source_candidates(vec![crate::library::SourceDiscoveryRoot {
                root_path: home_path.clone(),
                label: "home".into(),
                skip_relative: Vec::new(),
            }])
            .unwrap();
        assert!(
            report.candidates.is_empty(),
            "an ungranted root yields no candidates"
        );
        assert_eq!(report.unreadable_roots, vec!["home".to_string()]);

        drop(scope);
        let _ = std::fs::remove_dir_all(&base);
    }

    // The grant gate is permissive here (production `initialize` never runs in unit
    // tests); this pins the path-containment half of the boundary the gate rides on.
    // Unix-only: it needs a real symlink; canonicalisation guards both platforms.
    #[cfg(unix)]
    #[test]
    fn a_symlink_that_escapes_the_root_is_refused() {
        use std::os::unix::fs::symlink;
        let base = std::env::temp_dir().join(format!("atlas-scope-symlink-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let vault = base.join("vault");
        let outside = base.join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.txt"), b"secret").unwrap();
        symlink(&outside, vault.join("escape")).unwrap();

        let root = vault.to_string_lossy().to_string();
        std::fs::write(vault.join("inside.md"), b"# ok").unwrap();
        assert!(resolve_existing_inside(&root, "inside.md").is_ok());
        // The same relative path through the symlink canonicalises outside the root
        // and is refused, so a tracked symlink cannot read another directory.
        let err = resolve_existing_inside(&root, "escape/secret.txt").unwrap_err();
        assert!(err.contains("stay inside"), "{err}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn canonical_root_resolves_a_real_directory_and_rejects_a_missing_one() {
        let base = std::env::temp_dir().join(format!("atlas-scope-canon-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        assert!(canonical_root(&base.to_string_lossy()).is_ok());
        assert!(canonical_root(&base.join("missing").to_string_lossy()).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }
}
