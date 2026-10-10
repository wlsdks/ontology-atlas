use super::*;
use crate::meaning_transition_archive::history::list_meaning_transition_history;
use crate::meaning_transition_archive::read::{
    read_meaning_transition_artifact_text, read_meaning_transition_record_text,
};
use crate::meaning_transition_archive::tests::{fixture, identity};
use std::fs;

#[cfg(unix)]
#[test]
fn bundle_is_artifact_first_record_last_and_idempotent() {
    let (root, name, body, artifact) = fixture();
    let id = identity(&root);
    let path = root.to_string_lossy().into_owned();
    let digest = artifact.digest.clone();
    let first = append_meaning_transition_bundle(
        path.clone(),
        id.clone(),
        name.clone(),
        body.clone(),
        vec![artifact],
    )
    .unwrap();
    assert!(first.record_created && first.artifacts[0].created);
    let retry_artifact = MeaningTransitionArtifactInput {
        digest: digest.clone(),
        content: "proposal bytes".into(),
    };
    let retry = append_meaning_transition_bundle(
        path.clone(),
        id.clone(),
        name.clone(),
        body.clone(),
        vec![retry_artifact],
    )
    .unwrap();
    assert!(!retry.record_created && !retry.artifacts[0].created);
    assert_eq!(
        read_meaning_transition_artifact_text(path.clone(), id.clone(), digest).unwrap(),
        "proposal bytes"
    );
    assert_eq!(
        read_meaning_transition_record_text(path, id, name).unwrap(),
        body
    );
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn v2_envelope_retains_three_exact_artifacts_without_changing_v1() {
    let (root, name, _, _) = fixture();
    let id = identity(&root);
    let path = root.to_string_lossy().into_owned();
    let artifacts = ["before bytes", "preview bytes", "decision bytes"]
        .into_iter()
        .map(|content| MeaningTransitionArtifactInput {
            digest: format!("sha256:{}", digest_hex(content.as_bytes())),
            content: content.to_string(),
        })
        .collect::<Vec<_>>();
    let body = format!(
        "---\nschema: \"atlas-meaning-transition/v2\"\nevent_id: \"95f4ba81-41f7-483b-a617-2a4be815be32\"\ncreated_at: \"2026-09-14T08:00:00.000Z\"\nproposal: {{\"artifacts\":{{\"retainedBefore\":{{\"contentDigest\":\"{}\"}},\"preview\":{{\"contentDigest\":\"{}\"}},\"decision\":{{\"contentDigest\":\"{}\"}}}}}}\n---\n## Remaining questions\n\nNone recorded.\n",
        artifacts[0].digest, artifacts[1].digest, artifacts[2].digest,
    );
    let result = append_meaning_transition_bundle(
        path.clone(),
        id.clone(),
        name.clone(),
        body.clone(),
        artifacts,
    )
    .unwrap();
    assert!(result.record_created);
    assert_eq!(result.artifacts.len(), 3);
    assert_eq!(
        read_meaning_transition_record_text(path, id, name).unwrap(),
        body
    );
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn conflicting_record_and_bad_artifact_preserve_published_bytes() {
    let (root, name, body, artifact) = fixture();
    let id = identity(&root);
    let path = root.to_string_lossy().into_owned();
    append_meaning_transition_bundle(
        path.clone(),
        id.clone(),
        name.clone(),
        body.clone(),
        vec![artifact],
    )
    .unwrap();
    let content = "other".to_string();
    let bad = MeaningTransitionArtifactInput {
        digest: format!("sha256:{}", digest_hex(b"proposal bytes")),
        content,
    };
    assert!(append_meaning_transition_bundle(
        path.clone(),
        id.clone(),
        name.clone(),
        body.replace("None", "Changed"),
        vec![bad]
    )
    .is_err());
    assert_eq!(
        read_meaning_transition_record_text(path, id, name).unwrap(),
        body
    );
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn interruption_before_record_leaves_no_visible_transition() {
    let (root, name, body, artifact) = fixture();
    let id = identity(&root);
    let path = root.to_string_lossy().into_owned();
    let digest = artifact.digest.clone();
    let result =
        append_bundle_after_artifacts(path.clone(), id.clone(), name, body, vec![artifact], || {
            Err("simulated interruption".into())
        });
    assert!(result.is_err());
    assert_eq!(
        list_meaning_transition_history(path.clone(), id.clone(), 0, 10)
            .unwrap()
            .total_members,
        0
    );
    assert_eq!(
        read_meaning_transition_artifact_text(path, id, digest).unwrap(),
        "proposal bytes"
    );
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn mutated_artifact_blocks_record_publication() {
    let (root, name, body, artifact) = fixture();
    let id = identity(&root);
    let path = root.to_string_lossy().into_owned();
    let artifact_name = artifact_file_name(&artifact.digest).unwrap();
    let result =
        append_bundle_after_artifacts(path.clone(), id.clone(), name, body, vec![artifact], || {
            fs::write(
                root.join(ARTIFACT_DIRECTORY).join(&artifact_name),
                "mutated",
            )
            .map_err(|error| error.to_string())
        });
    assert!(result.is_err());
    assert_eq!(
        list_meaning_transition_history(path, id, 0, 10)
            .unwrap()
            .total_members,
        0
    );
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn archive_replacement_between_artifact_and_record_is_rejected() {
    let (root, name, body, artifact) = fixture();
    let id = identity(&root);
    let path = root.to_string_lossy().into_owned();
    let artifact_name = artifact_file_name(&artifact.digest).unwrap();
    let moved = root.join("original-transition-archive");
    let result = append_bundle_after_artifacts(path, id, name, body, vec![artifact], || {
        fs::rename(root.join(DIRECTORY), &moved).map_err(|error| error.to_string())?;
        fs::create_dir_all(root.join(ARTIFACT_DIRECTORY)).map_err(|error| error.to_string())?;
        fs::copy(
            moved.join("artifacts").join(&artifact_name),
            root.join(ARTIFACT_DIRECTORY).join(artifact_name),
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    });
    assert!(result.is_err());
    assert_eq!(fs::read_dir(root.join(DIRECTORY)).unwrap().count(), 1);
    fs::remove_dir_all(root).unwrap();
}
