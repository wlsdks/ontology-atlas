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

#[test]
fn a_path_written_as_pathspec_magic_hides_no_other_path() {
    let scratch = crate::git::test_support::Scratch::new("evidence-literal");
    std::fs::create_dir_all(scratch.work.join("src")).unwrap();
    scratch.commit("src/pay.ts", "pay");
    let wanted = [
        ("src/pay.ts".to_string(), "src/pay.ts".to_string()),
        (":!src".to_string(), ":!src".to_string()),
        (":(glob)**".to_string(), ":(glob)**".to_string()),
    ];
    let last = last_changes(&scratch.work, &wanted).unwrap();
    assert!(last.contains_key(&0), "src/pay.ts keeps its change date");
    assert!(!last.contains_key(&1), "an exclude pathspec matches nothing");
    assert!(!last.contains_key(&2), "a glob pathspec matches nothing");
}
