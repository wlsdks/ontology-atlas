use super::*;

#[test]
fn safe_relative_path_refuses_escapes_and_options() {
    assert_eq!(
        safe_relative_path("src/widgets/app-nav-rail/"),
        Some("src/widgets/app-nav-rail".into())
    );
    assert_eq!(
        safe_relative_path("  mcp/src/index.js "),
        Some("mcp/src/index.js".into())
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
fn the_walk_names_the_newest_commit_beside_its_time() {
    let scratch = crate::git::test_support::Scratch::new("evidence-newest-commit");
    scratch.commit("pay.md", "first");
    let first = scratch.git(&["rev-parse", "HEAD"]);
    scratch.commit("other.md", "unrelated");
    let wanted = [("pay.md".to_string(), "pay.md".to_string())];
    let last = last_changes(&scratch.work, &wanted).unwrap();
    let newest = last.get(&0).expect("pay.md is dated");
    assert_eq!(newest.hash, first);
    assert!(!newest.at.is_empty());
}

#[test]
fn a_path_written_as_pathspec_magic_hides_no_other_path() {
    // An exclude pattern drops the other path from the walk; malformed magic makes
    // Git refuse the whole walk. Read as names, neither touches the other date.
    for (index, planted) in [":!src", ":@x"].into_iter().enumerate() {
        let scratch = crate::git::test_support::Scratch::new(&format!("evidence-literal-{index}"));
        std::fs::create_dir_all(scratch.work.join("src")).unwrap();
        scratch.commit("src/pay.ts", "pay");
        let wanted = [
            ("src/pay.ts".to_string(), "src/pay.ts".to_string()),
            (planted.to_string(), planted.to_string()),
        ];
        let last = last_changes(&scratch.work, &wanted).unwrap();
        assert!(
            last.contains_key(&0),
            "{planted}: src/pay.ts keeps its change date"
        );
    }
}
