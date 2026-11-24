use super::*;

#[test]
fn permission_policy_reads_the_path_not_the_title() {
    // Judged by path, not title text, which varies.
    let base = std::env::temp_dir().join(format!("atlas-acp-perm-{}", std::process::id()));
    let vault = base.join("vault");
    let outside = base.join("outside");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    let session_root = std::fs::canonicalize(&vault).unwrap();

    assert_eq!(
        permission_verdict(
            &session_root,
            Some(vault.join("notes.md").to_str().unwrap())
        ),
        PermissionVerdict::AllowInsideVault
    );
    assert_eq!(
        permission_verdict(
            &session_root,
            Some(outside.join("notes.md").to_str().unwrap())
        ),
        PermissionVerdict::Ask,
        "a path outside the vault must ask"
    );
    assert_eq!(
        permission_verdict(&session_root, Some("../escape.md")),
        PermissionVerdict::Ask,
        "a relative path climbing out is outside"
    );
    assert_eq!(
        permission_verdict(&session_root, None),
        PermissionVerdict::Ask,
        "an unknown path must ask"
    );

    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn permission_policy_rejects_invalid_vault_roots_instead_of_allowing_everything() {
    let base = std::env::temp_dir().join(format!("atlas-acp-invalid-root-{}", std::process::id()));
    let outside = base.join("outside.md");
    let not_a_directory = base.join("not-a-directory");
    std::fs::create_dir_all(&base).unwrap();
    std::fs::write(&outside, "outside").unwrap();
    std::fs::write(&not_a_directory, "file").unwrap();

    for invalid_root in [
        Path::new(""),
        Path::new("relative-vault"),
        Path::new("/"),
        base.join("missing").as_path(),
        not_a_directory.as_path(),
    ] {
        assert_eq!(
            permission_verdict(invalid_root, Some(outside.to_str().unwrap())),
            PermissionVerdict::Ask,
            "invalid vault root {invalid_root:?} must not auto-allow any path"
        );
    }

    let _ = std::fs::remove_dir_all(&base);
}

#[cfg(unix)]
#[test]
fn permission_policy_rejects_a_session_root_replaced_by_an_outside_symlink() {
    let base = std::env::temp_dir().join(format!("atlas-acp-replaced-root-{}", std::process::id()));
    let vault = base.join("vault");
    let outside = base.join("outside");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    let session_root = std::fs::canonicalize(&vault).unwrap();
    let secret = outside.join("secret.md");
    std::fs::write(&secret, "outside").unwrap();

    std::fs::remove_dir(&vault).unwrap();
    std::os::unix::fs::symlink(&outside, &vault).unwrap();

    assert_eq!(
        permission_verdict(&session_root, Some(secret.to_str().unwrap())),
        PermissionVerdict::Ask,
        "a root replaced by an outside link after session start must not be accepted"
    );

    let _ = std::fs::remove_dir_all(&base);
}

#[cfg(unix)]
#[test]
fn a_symlink_inside_the_vault_pointing_out_is_not_inside() {
    let base = std::env::temp_dir().join(format!("atlas-acp-link-{}", std::process::id()));
    let vault = base.join("vault");
    let outside = base.join("outside");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    let session_root = std::fs::canonicalize(&vault).unwrap();
    let real = outside.join("secret.md");
    std::fs::write(&real, "x").unwrap();
    let trap = vault.join("looks-inside.md");
    std::os::unix::fs::symlink(&real, &trap).unwrap();

    assert_eq!(
        permission_verdict(&session_root, Some(trap.to_str().unwrap())),
        PermissionVerdict::Ask,
        "a link inside the vault that points outside is outside"
    );
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn a_parent_step_below_a_missing_directory_is_not_inside() {
    let base = std::env::temp_dir().join(format!("atlas-acp-parent-{}", std::process::id()));
    let vault = base.join("vault");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::create_dir_all(base.join("outside")).unwrap();
    let session_root = std::fs::canonicalize(&vault).unwrap();
    let climbing = format!(
        "{}/missing-dir/../../outside/secret.md",
        session_root.display()
    );

    assert_eq!(
        permission_verdict(&session_root, Some(&climbing)),
        PermissionVerdict::Ask,
        "a path whose `..` climbs out from under a missing directory is outside"
    );
    let _ = std::fs::remove_dir_all(&base);
}

#[cfg(unix)]
#[test]
fn a_link_inside_the_vault_that_lands_in_a_dot_folder_is_hidden() {
    let base = std::env::temp_dir().join(format!("atlas-acp-hidden-link-{}", std::process::id()));
    let vault = base.join("vault");
    std::fs::create_dir_all(vault.join(".git/hooks")).unwrap();
    std::fs::create_dir_all(vault.join(".claude")).unwrap();
    std::fs::create_dir_all(vault.join("docs")).unwrap();
    std::fs::write(vault.join(".git/config"), "x").unwrap();
    std::os::unix::fs::symlink("../.git/config", vault.join("docs/gitconfig")).unwrap();
    std::os::unix::fs::symlink(".git", vault.join("vcs")).unwrap();
    std::os::unix::fs::symlink(".claude", vault.join("agent")).unwrap();
    let root = std::fs::canonicalize(&vault).unwrap();

    for edited in [
        "docs/gitconfig",
        "vcs/hooks/pre-commit",
        "agent/settings.json",
    ] {
        assert_eq!(
            permission_verdict(&root, Some(root.join(edited).to_str().unwrap())),
            PermissionVerdict::AllowInsideVaultHidden,
            "{edited} resolves into a dot folder"
        );
    }
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn a_plain_dot_path_is_hidden_and_an_ordinary_one_is_not() {
    let base = std::env::temp_dir().join(format!("atlas-acp-hidden-plain-{}", std::process::id()));
    let vault = base.join("vault");
    std::fs::create_dir_all(&vault).unwrap();
    let root = std::fs::canonicalize(&vault).unwrap();

    assert_eq!(
        permission_verdict(&root, Some(root.join(".env.local").to_str().unwrap())),
        PermissionVerdict::AllowInsideVaultHidden
    );
    assert_eq!(
        permission_verdict(&root, Some(root.join("notes/a.md").to_str().unwrap())),
        PermissionVerdict::AllowInsideVault
    );
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn only_a_file_read_inside_the_code_folder_passes_never_a_folder_sweep_or_a_dot_or_secret_file() {
    let base = std::env::temp_dir().join(format!("atlas-acp-code-{}", std::process::id()));
    let code = base.join("code");
    let outside = base.join("outside");
    std::fs::create_dir_all(code.join("src")).unwrap();
    std::fs::create_dir_all(code.join(".git")).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::write(code.join("src").join("main.rs"), "").unwrap();
    std::fs::write(code.join(".env"), "").unwrap();
    std::fs::write(code.join(".git").join("config"), "").unwrap();
    std::fs::write(outside.join("secret.txt"), "").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(
        outside.join("secret.txt"),
        code.join("src").join("escape.txt"),
    )
    .unwrap();
    let root = std::fs::canonicalize(&code).unwrap();
    let at = |path: std::path::PathBuf| inside_code_folder(&root, Some(path.to_str().unwrap()));

    assert!(
        at(code.join("src").join("main.rs")),
        "a source file reads without asking"
    );
    assert!(
        !at(code.clone()),
        "a sweep of the folder itself asks, since it would reach dot files"
    );
    assert!(
        !at(code.join("src")),
        "a sweep of a folder below it asks too"
    );
    assert!(
        !at(code.join("src").join("missing.rs")),
        "a file that does not exist asks"
    );
    assert!(!at(code.join(".env")), "a dot file asks");
    assert!(!at(code.join(".git").join("config")), "a dot folder asks");
    assert!(
        !at(outside.join("secret.txt")),
        "a file outside the code folder asks"
    );
    #[cfg(unix)]
    assert!(
        !at(code.join("src").join("escape.txt")),
        "a link inside that points outside asks"
    );
    assert!(
        !at(code.join("src").join("..").join("..").join("outside")),
        "a climbing path asks"
    );
    assert!(
        !inside_code_folder(&root, Some("src/main.rs")),
        "a relative path asks"
    );
    assert!(!inside_code_folder(&root, None), "no path asks");

    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn a_code_folder_file_whose_name_marks_a_key_or_setting_still_asks() {
    let base = std::env::temp_dir().join(format!("atlas-acp-code-secret-{}", std::process::id()));
    let code = base.join("code");
    for folder in ["src", "deploy", "repo.git", "tokens", "secrets"] {
        std::fs::create_dir_all(code.join(folder)).unwrap();
    }
    let root = std::fs::canonicalize(&code).unwrap();
    let plant = |relative: &str| {
        let path = code.join(relative);
        std::fs::write(&path, "").unwrap();
        inside_code_folder(&root, Some(path.to_str().unwrap()))
    };

    for name in [
        "deploy/prod.env",
        "deploy/secrets.prod.yaml",
        "deploy/client_secret_1.json",
        "deploy/terraform.tfstate",
        "deploy/prod.tfvars",
        "deploy/serviceAccountKey.json",
        "deploy/id_rsa_deploy",
        "deploy/server.pem",
        "deploy/deploy_key",
        "deploy/github-token.txt",
        "deploy/credentials.json",
        "deploy/auth.json",
        "repo.git/config",
        "secrets/config.yaml",
    ] {
        assert!(!plant(name), "{name} asks");
    }
    assert!(
        plant("tokens/colors.css"),
        "a folder of design tokens is not a key"
    );
    assert!(
        plant("src/keyboard.ts"),
        "a word that only contains `key` reads"
    );

    #[cfg(unix)]
    {
        std::fs::write(code.join(".env"), "").unwrap();
        std::os::unix::fs::symlink(code.join(".env"), code.join("src").join("settings.txt"))
            .unwrap();
        let link = code.join("src").join("settings.txt");
        assert!(
            !inside_code_folder(&root, Some(link.to_str().unwrap())),
            "a link inside that lands on a dot file asks"
        );
    }

    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn a_padded_or_invisible_character_path_asks_since_the_tool_reads_another_file() {
    let base = std::env::temp_dir().join(format!("atlas-acp-code-pad-{}", std::process::id()));
    let code = base.join("code").join("src");
    std::fs::create_dir_all(&code).unwrap();
    let decoy = code.join("main.rs ");
    std::fs::write(&decoy, "").unwrap();
    std::fs::write(code.join("main.rs\u{200b}"), "").unwrap();
    let root = std::fs::canonicalize(base.join("code")).unwrap();

    assert!(
        !inside_code_folder(&root, Some(decoy.to_str().unwrap())),
        "a trailing space asks"
    );
    let invisible = format!("{}/main.rs\u{200b}", code.to_str().unwrap());
    assert!(
        !inside_code_folder(&root, Some(&invisible)),
        "a zero-width character asks"
    );

    let _ = std::fs::remove_dir_all(&base);
}
