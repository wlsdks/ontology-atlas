use super::append::MeaningTransitionArtifactInput;
use super::envelope::digest_hex;
use super::*;
#[cfg(not(unix))]
use super::{
    append::append_meaning_transition_bundle,
    history::list_meaning_transition_history,
    read::{read_meaning_transition_artifact_text, read_meaning_transition_record_text},
};
use std::fs;

#[cfg(unix)]
pub(super) fn fixture() -> (
    std::path::PathBuf,
    String,
    String,
    MeaningTransitionArtifactInput,
) {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let root = std::env::temp_dir().join(format!(
        "atlas-transition-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    fs::create_dir_all(&root).unwrap();
    let id = "95f4ba81-41f7-483b-a617-2a4be815be32";
    let name = format!("2026-09-14T08-00-00-000Z-{id}.md");
    let content = "proposal bytes".to_string();
    let digest = format!("sha256:{}", digest_hex(content.as_bytes()));
    let body = format!("---\nschema: \"atlas-meaning-transition/v1\"\nevent_id: \"{id}\"\ncreated_at: \"2026-09-14T08:00:00.000Z\"\nproposal: {{\"artifact\":{{\"contentDigest\":\"{digest}\"}}}}\ncodeEvidence: {{\"diffArtifact\":null}}\n---\n## Remaining questions\n\nNone recorded.\n");
    let artifact = MeaningTransitionArtifactInput { digest, content };
    (root, name, body, artifact)
}
#[cfg(unix)]
pub(super) fn identity(root: &std::path::Path) -> MeaningTransitionRootIdentity {
    observe_meaning_transition_root(root.to_string_lossy().into_owned()).unwrap()
}

#[cfg(not(unix))]
#[test]
fn unsupported_platform_refuses_every_archive_entrypoint_without_creating_files() {
    let root = std::env::temp_dir().join(format!(
        "atlas-transition-unsupported-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir(&root).unwrap();
    let path = root.to_string_lossy().into_owned();
    let expected = MeaningTransitionRootIdentity {
        canonical_path: fs::canonicalize(&root)
            .unwrap()
            .to_string_lossy()
            .into_owned(),
    };
    let id = "95f4ba81-41f7-483b-a617-2a4be815be32";
    let name = format!("2026-09-14T08-00-00-000Z-{id}.md");
    let content = "proposal bytes".to_string();
    let digest = format!("sha256:{}", digest_hex(content.as_bytes()));
    let body = format!("---\nschema: \"atlas-meaning-transition/v1\"\nevent_id: \"{id}\"\ncreated_at: \"2026-09-14T08:00:00.000Z\"\nproposal: {{\"artifact\":{{\"contentDigest\":\"{digest}\"}}}}\ncodeEvidence: {{\"diffArtifact\":null}}\n---\n## Remaining questions\n\nNone recorded.\n");
    let artifact = || MeaningTransitionArtifactInput {
        digest: digest.clone(),
        content: content.clone(),
    };

    assert!(observe_meaning_transition_root(path.clone()).is_err());
    assert!(append_meaning_transition_bundle(
        path.clone(),
        expected.clone(),
        name.clone(),
        body,
        vec![artifact()]
    )
    .is_err());
    assert!(read_meaning_transition_record_text(path.clone(), expected.clone(), name).is_err());
    assert!(read_meaning_transition_artifact_text(path.clone(), expected.clone(), digest).is_err());
    assert!(list_meaning_transition_history(path, expected, 0, 10).is_err());
    assert!(!root.join(".ontology-atlas").exists());
    fs::remove_dir_all(root).unwrap();
}
