use super::*;
use crate::meaning_transition_archive::append::{
    append_meaning_transition_bundle, MeaningTransitionArtifactInput,
};
use crate::meaning_transition_archive::envelope::digest_hex;
use crate::meaning_transition_archive::tests::{fixture, identity};

#[cfg(unix)]
#[test]
fn invalid_names_oversize_and_malformed_history_are_fail_visible() {
    let (root, name, body, artifact) = fixture();
    let id = identity(&root);
    let path = root.to_string_lossy().into_owned();
    assert!(append_meaning_transition_bundle(
        path.clone(),
        id.clone(),
        format!("../{name}"),
        body.clone(),
        vec![artifact]
    )
    .is_err());
    let oversize = format!("{body}{}", "x".repeat(RECORD_LIMIT));
    let content = "proposal bytes".to_string();
    let oversize_artifact = MeaningTransitionArtifactInput {
        digest: format!("sha256:{}", digest_hex(content.as_bytes())),
        content,
    };
    assert!(append_meaning_transition_bundle(
        path.clone(),
        id.clone(),
        name,
        oversize,
        vec![oversize_artifact]
    )
    .is_err());
    assert!(!root.join(DIRECTORY).exists());
    fs::create_dir_all(root.join(DIRECTORY)).unwrap();
    fs::write(root.join(DIRECTORY).join("broken.md"), "bad").unwrap();
    let page = list_meaning_transition_history(path, id, 0, 10).unwrap();
    assert_eq!(page.total_members, 1);
    assert_eq!(page.entries[0].kind, "malformed");
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn history_pages_read_only_selected_records_and_keep_total_order() {
    let (root, _, _, _) = fixture();
    let directory = root.join(DIRECTORY);
    fs::create_dir_all(&directory).unwrap();
    let mut names = Vec::new();
    for index in 0..103 {
        let event = format!("00000000-0000-4000-8000-{index:012x}");
        let name = format!("2026-10-04T00-00-00-000Z-{event}.md");
        let body = format!(
            "---\nschema: \"atlas-meaning-transition/v2\"\nevent_id: \"{event}\"\ncreated_at: \"2026-10-04T00:00:00.000Z\"\n---\nfixture"
        );
        fs::write(directory.join(&name), body).unwrap();
        names.push(name);
    }
    fs::create_dir(directory.join("artifacts")).unwrap();
    names.sort_by(|left, right| right.cmp(left));
    let path = root.to_string_lossy().into_owned();
    let id = identity(&root);
    for (offset, count, next) in [
        (0, 20, Some(20)),
        (100, 3, None),
        (103, 0, None),
        (usize::MAX, 0, None),
    ] {
        HISTORY_MEMBER_READS.with(|reads| reads.set(0));
        let page = list_meaning_transition_history(path.clone(), id.clone(), offset, 20).unwrap();
        assert_eq!(page.total_members, 103);
        assert_eq!(page.next_offset, next);
        assert_eq!(page.entries.len(), count);
        assert_eq!(
            page.entries
                .iter()
                .map(|entry| entry.file_name.clone())
                .collect::<Vec<_>>(),
            names
                .iter()
                .skip(offset)
                .take(20)
                .cloned()
                .collect::<Vec<_>>()
        );
        assert!(page
            .entries
            .iter()
            .all(|entry| entry.kind == "record" && entry.problem.is_none()));
        assert_eq!(
            HISTORY_MEMBER_READS.with(|reads| reads.get()),
            count,
            "off-page records must not be opened"
        );
    }
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn history_pages_report_selected_unsafe_and_malformed_members() {
    use std::os::unix::fs::symlink;
    let (root, good_name, good_body, _) = fixture();
    let directory = root.join(DIRECTORY);
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join(&good_name), good_body).unwrap();
    let damaged = "2026-10-04T00-00-00-000Z-00000000-0000-4000-8000-000000000003.md";
    let linked = "2026-10-04T00-00-00-000Z-00000000-0000-4000-8000-000000000002.md";
    let oversize = "2026-10-04T00-00-00-000Z-00000000-0000-4000-8000-000000000001.md";
    fs::write(directory.join("zz-invalid.md"), "bad").unwrap();
    fs::write(directory.join(damaged), "bad").unwrap();
    symlink(root.join("missing-target"), directory.join(linked)).unwrap();
    fs::File::create(directory.join(oversize))
        .unwrap()
        .set_len((RECORD_LIMIT + 1) as u64)
        .unwrap();
    let path = root.to_string_lossy().into_owned();
    let id = identity(&root);
    let first = list_meaning_transition_history(path.clone(), id.clone(), 0, 3).unwrap();
    assert_eq!(first.total_members, 5);
    assert_eq!(first.next_offset, Some(3));
    assert_eq!(
        first
            .entries
            .iter()
            .map(|entry| entry.file_name.as_str())
            .collect::<Vec<_>>(),
        vec!["zz-invalid.md", damaged, linked]
    );
    assert!(first
        .entries
        .iter()
        .all(|entry| entry.kind == "malformed" && entry.problem.is_some()));
    let last = list_meaning_transition_history(path, id, 3, 3).unwrap();
    assert_eq!(last.total_members, 5);
    assert_eq!(last.next_offset, None);
    assert_eq!(last.entries[0].file_name, oversize);
    assert_eq!(last.entries[0].kind, "malformed");
    assert!(last.entries[0]
        .problem
        .as_ref()
        .unwrap()
        .contains("bounded regular file"));
    assert_eq!(last.entries[1].file_name, good_name);
    assert_eq!(last.entries[1].kind, "record");
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn history_member_inventory_stays_bounded_even_for_an_empty_page() {
    let (root, _, _, _) = fixture();
    let directory = root.join(DIRECTORY);
    fs::create_dir_all(directory.join("artifacts")).unwrap();
    for index in 0..MAX_HISTORY_MEMBERS {
        fs::write(directory.join(format!("member-{index}")), "bad").unwrap();
    }
    let path = root.to_string_lossy().into_owned();
    let id = identity(&root);
    let page = list_meaning_transition_history(path.clone(), id.clone(), usize::MAX, 20).unwrap();
    assert_eq!(page.total_members, MAX_HISTORY_MEMBERS);
    assert!(page.entries.is_empty());
    assert_eq!(page.next_offset, None);
    let extra = directory.join("one-extra");
    fs::write(&extra, "bad").unwrap();
    assert!(
        list_meaning_transition_history(path.clone(), id.clone(), usize::MAX, 20)
            .unwrap_err()
            .contains("member budget")
    );
    fs::remove_file(extra).unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn history_refuses_a_symlinked_sidecar_ancestor() {
    use std::os::unix::fs::symlink;
    let (root, _, _, _) = fixture();
    let id = identity(&root);
    let outside = root.with_extension("outside");
    fs::create_dir_all(outside.join("meaning-transitions")).unwrap();
    symlink(&outside, root.join(".ontology-atlas")).unwrap();
    assert!(
        list_meaning_transition_history(root.to_string_lossy().into_owned(), id, 0, 10).is_err()
    );
    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(outside).unwrap();
}
