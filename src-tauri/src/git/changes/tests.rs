use super::*;

#[test]
fn parse_porcelain_reads_status_codes_and_paths() {
    let rows = parse_porcelain("?? docs/new.md\n M docs/edit.md\nD  docs/gone.md\n");
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].index, '?');
    assert_eq!(rows[0].worktree, '?');
    assert_eq!(rows[0].path, "docs/new.md");
    assert_eq!(rows[1].index, ' ');
    assert_eq!(rows[1].worktree, 'M');
    assert_eq!(rows[2].index, 'D');
}

#[test]
fn parse_porcelain_reads_rename_source() {
    let rows = parse_porcelain("R  docs/old.md -> docs/new.md\n");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].index, 'R');
    assert_eq!(rows[0].renamed_from.as_deref(), Some("docs/old.md"));
    assert_eq!(rows[0].path, "docs/new.md");
}

#[test]
fn classify_change_maps_status_codes() {
    let mk = |i: char, w: char| PorcelainRow {
        index: i,
        worktree: w,
        path: "x".into(),
        renamed_from: None,
    };
    assert_eq!(classify_change(&mk('?', '?')), "added");
    assert_eq!(classify_change(&mk('A', ' ')), "added");
    assert_eq!(classify_change(&mk(' ', 'M')), "modified");
    assert_eq!(classify_change(&mk('D', ' ')), "deleted");
    assert_eq!(classify_change(&mk(' ', 'D')), "deleted");
    assert_eq!(classify_change(&mk('R', ' ')), "renamed");
}

#[test]
fn find_staged_outside_vault_flags_staged_paths_beyond_pathspec() {
    let rows = parse_porcelain("M  src/other.rs\nM  docs/inside.md\n?? docs/untracked.md\n");
    let outside = find_staged_outside_vault(&rows, "docs");
    assert_eq!(outside, vec!["src/other.rs".to_string()]);
}

#[test]
fn find_staged_outside_vault_dot_pathspec_never_flags() {
    let rows = parse_porcelain("M  src/other.rs\n");
    assert!(find_staged_outside_vault(&rows, ".").is_empty());
}

#[test]
fn format_snapshot_summary_counts_and_slugs() {
    let changes = vec![
        ChangeEntry {
            path: "docs/a.md".into(),
            status: "added".into(),
            kind: None,
            slug: "a".into(),
            renamed_from: None,
        },
        ChangeEntry {
            path: "docs/b.md".into(),
            status: "modified".into(),
            kind: None,
            slug: "b".into(),
            renamed_from: None,
        },
    ];
    let summary = format_snapshot_summary(&changes);
    assert!(summary.contains("+1 concept"));
    assert!(summary.contains("~1 updated"));
    assert!(summary.contains("(a, b)"));
}

#[test]
fn format_snapshot_summary_truncates_slug_list() {
    let changes: Vec<ChangeEntry> = (0..5)
        .map(|i| ChangeEntry {
            path: format!("docs/n{i}.md"),
            status: "added".into(),
            kind: None,
            slug: format!("n{i}"),
            renamed_from: None,
        })
        .collect();
    let summary = format_snapshot_summary(&changes);
    assert!(summary.contains("+5 concepts"));
    assert!(summary.contains("+2)")); // 3 shown + overflow 2
}

#[test]
fn build_commit_message_embeds_auto_summary_for_custom_message() {
    let changes = vec![ChangeEntry {
        path: "docs/a.md".into(),
        status: "added".into(),
        kind: None,
        slug: "a".into(),
        renamed_from: None,
    }];
    let msg = build_commit_message(
        "my subject",
        "ontology snapshot: +1 concept (a)",
        &changes,
        true,
    );
    assert!(msg.starts_with("my subject\n\n"));
    assert!(msg.contains("ontology snapshot: +1 concept (a)"));
    assert!(msg.contains("  A  docs/a.md"));
}

#[test]
fn read_kind_slug_extracts_frontmatter_fields() {
    let dir = std::env::temp_dir().join(format!("atlas-git-test-{}", std::process::id()));
    let _ = fs::create_dir_all(&dir);
    let file = dir.join("node.md");
    fs::write(
        &file,
        "---\nkind: capability\nslug: \"my-cap\"\n---\n# Body\n",
    )
    .unwrap();
    let (kind, slug) = read_kind_slug(&file);
    assert_eq!(kind.as_deref(), Some("capability"));
    assert_eq!(slug.as_deref(), Some("my-cap"));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn read_kind_slug_reads_no_further_than_the_frontmatter() {
    let dir = std::env::temp_dir().join(format!("atlas-git-front-{}", std::process::id()));
    let _ = fs::create_dir_all(&dir);
    let file = dir.join("node.md");
    let mut bytes = b"---\nkind: element\nslug: reader\n---\n".to_vec();
    bytes.extend_from_slice(&[0xff, 0xfe, b'\n']);
    fs::write(&file, bytes).unwrap();
    let (kind, slug) = read_kind_slug(&file);
    assert_eq!(kind.as_deref(), Some("element"));
    assert_eq!(slug.as_deref(), Some("reader"));
    let _ = fs::remove_dir_all(&dir);
}
