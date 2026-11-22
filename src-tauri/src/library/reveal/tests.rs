use super::*;
use std::fs;

/// Reveal reaches Explorer, so the vault guard must refuse Windows path syntax before
/// anything is handed to the shell: a parent hop, a drive prefix and a UNC prefix. Only
/// refusals are exercised, because an accepted path would open a real Explorer window.
#[cfg(windows)]
#[test]
fn reveal_refuses_windows_path_escapes_before_the_shell() {
    let root = std::env::temp_dir().join(format!("atlas-reveal-guard-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("vault\\docs")).unwrap();
    fs::write(root.join("outside.md"), "outside").unwrap();
    let vault = root.join("vault").to_string_lossy().to_string();
    for escape in [
        "..\\outside.md",
        "docs\\..\\..\\outside.md",
        "C:\\Windows\\win.ini",
        "\\\\server\\share\\note.md",
        "\\Windows\\win.ini",
    ] {
        assert_eq!(
            reveal_vault_file_blocking(vault.clone(), escape.into()).unwrap_err(),
            "relative path must stay inside the selected vault",
            "{escape}"
        );
    }
    fs::remove_dir_all(root).ok();
}

/// Reveal selects one existing vault file and nothing else: a URL, a program name or a file
/// URL is a path inside the vault that does not exist, so it never reaches the file manager.
#[test]
fn reveal_refuses_a_url_or_a_program_before_the_shell() {
    let root = std::env::temp_dir().join(format!("atlas-reveal-url-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let vault = root.to_string_lossy().to_string();
    for target in [
        "https://example.com/note.md",
        "file:///etc/hosts",
        "calc.exe",
        "xdg-open",
        "",
    ] {
        assert!(
            reveal_vault_file_blocking(vault.clone(), target.into()).is_err(),
            "{target:?} reached the file manager"
        );
    }
    fs::remove_dir_all(root).ok();
}

/// The plugin's reveal is called as a plain function, so this shows the Windows shell call
/// itself succeeds. It opens a real Explorer window, so it runs only on CI runners.
#[cfg(windows)]
#[test]
fn reveal_selects_a_real_vault_file_through_the_windows_shell_on_ci() {
    if std::env::var_os("CI").is_none() {
        return;
    }
    let root = std::env::temp_dir().join(format!("atlas-reveal-real-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("docs")).unwrap();
    fs::write(root.join("docs\\note.md"), "note").unwrap();
    let vault = root.to_string_lossy().to_string();
    reveal_vault_file_blocking(vault, "docs\\note.md".into()).unwrap();
    fs::remove_dir_all(root).ok();
}

/// On every platform an absolute path and a folder stop before the file manager is called.
#[test]
fn reveal_refuses_an_absolute_path_and_a_folder_before_the_shell() {
    let root = std::env::temp_dir().join(format!("atlas-reveal-folder-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("docs")).unwrap();
    let vault = root.to_string_lossy().to_string();
    let outside = std::env::temp_dir().to_string_lossy().to_string();
    assert!(reveal_vault_file_blocking(vault.clone(), outside).is_err());
    assert_eq!(
        reveal_vault_file_blocking(vault, "docs".into()).unwrap_err(),
        "reveal target must be a file"
    );
    fs::remove_dir_all(root).ok();
}
