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
    let base =
        std::env::temp_dir().join(format!("atlas-acp-invalid-root-{}", std::process::id()));
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
    let base =
        std::env::temp_dir().join(format!("atlas-acp-replaced-root-{}", std::process::id()));
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
