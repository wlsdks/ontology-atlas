use super::*;

#[test]
fn safe_relative_path_refuses_escapes_and_options() {
    assert_eq!(
        safe_relative_path("src/widgets/app-nav-rail/"),
        Some("src/widgets/app-nav-rail".into())
    );
    assert_eq!(
        safe_relative_path("  cli/src/index.mjs "),
        Some("cli/src/index.mjs".into())
    );
    assert_eq!(safe_relative_path("../secrets"), None);
    assert_eq!(safe_relative_path("src/../../etc"), None);
    assert_eq!(safe_relative_path("/etc/passwd"), None);
    assert_eq!(safe_relative_path("--output=x"), None);
    assert_eq!(safe_relative_path(""), None);
    assert_eq!(
        safe_relative_path("docs/..hidden/a.md"),
        Some("docs/..hidden/a.md".into())
    );
}
