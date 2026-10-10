use super::confined::{publish_confined, read_confined};
#[cfg(unix)]
use super::confined::{publish_in_open_parent, verify_archive_directory_identity};
use super::envelope::{
    artifact_file_name, digest_hex, referenced_artifact_digests, validate_digest,
    validate_record_envelope,
};
use super::{
    checked_root, MeaningTransitionRootIdentity, ARTIFACT_DIRECTORY, ARTIFACT_LIMIT, DIRECTORY,
    RECORD_LIMIT,
};
use serde::{Deserialize, Serialize};

const MAX_ARTIFACTS: usize = 32;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MeaningTransitionArtifactInput {
    pub(super) digest: String,
    pub(super) content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeaningTransitionArtifactResult {
    digest: String,
    file_name: String,
    created: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MeaningTransitionAppendResult {
    record_file_name: String,
    record_created: bool,
    artifacts: Vec<MeaningTransitionArtifactResult>,
}

#[tauri::command]
pub(crate) fn append_meaning_transition_bundle(
    root_path: String,
    expected_root_identity: MeaningTransitionRootIdentity,
    record_file_name: String,
    record_content: String,
    artifacts: Vec<MeaningTransitionArtifactInput>,
) -> Result<MeaningTransitionAppendResult, String> {
    append_bundle_after_artifacts(
        root_path,
        expected_root_identity,
        record_file_name,
        record_content,
        artifacts,
        || Ok(()),
    )
}

fn append_bundle_after_artifacts(
    root_path: String,
    expected: MeaningTransitionRootIdentity,
    record_file_name: String,
    record_content: String,
    artifacts: Vec<MeaningTransitionArtifactInput>,
    before_record: impl FnOnce() -> Result<(), String>,
) -> Result<MeaningTransitionAppendResult, String> {
    validate_record_envelope(&record_file_name, &record_content)?;
    if artifacts.is_empty() || artifacts.len() > MAX_ARTIFACTS {
        return Err("meaning transition bundle must contain 1 to 32 artifacts".into());
    }
    let mut prepared = Vec::with_capacity(artifacts.len());
    let mut names = std::collections::HashSet::new();
    for artifact in artifacts {
        if artifact.content.len() > ARTIFACT_LIMIT {
            return Err("meaning transition artifact exceeds the supported byte budget".into());
        }
        let file_name = artifact_file_name(&artifact.digest)?;
        if digest_hex(artifact.content.as_bytes()) != validate_digest(&artifact.digest)? {
            return Err("meaning transition artifact digest does not match its bytes".into());
        }
        if !names.insert(file_name.clone()) {
            return Err("meaning transition bundle repeats an artifact digest".into());
        }
        prepared.push((artifact, file_name));
    }
    let supplied = prepared
        .iter()
        .map(|(artifact, _)| artifact.digest.clone())
        .collect::<std::collections::HashSet<_>>();
    if supplied != referenced_artifact_digests(&record_content)? {
        return Err(
            "meaning transition bundle artifacts must exactly match record references".into(),
        );
    }
    let root = checked_root(&root_path, &expected)?;
    #[cfg(unix)]
    let archive_handle = {
        let root_handle = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
        let (handle, _) =
            crate::agent_setup::open_entry_parent(&root_handle, &format!("{DIRECTORY}/.record"))?;
        handle
    };
    #[cfg(unix)]
    let archive_identity = {
        use std::os::unix::fs::MetadataExt;
        let metadata = archive_handle
            .metadata()
            .map_err(|error| error.to_string())?;
        (metadata.dev(), metadata.ino())
    };
    #[cfg(unix)]
    verify_archive_directory_identity(&root, archive_identity)?;
    let mut results = Vec::with_capacity(prepared.len());
    for (artifact, file_name) in &prepared {
        let relative = format!("{ARTIFACT_DIRECTORY}/{file_name}");
        let created = publish_confined(
            &root_path,
            &root,
            &expected,
            &relative,
            artifact.content.as_bytes(),
            ARTIFACT_LIMIT,
        )?;
        let reopened = read_confined(&root_path, &expected, &relative, ARTIFACT_LIMIT)?;
        if reopened != artifact.content.as_bytes()
            || digest_hex(&reopened) != validate_digest(&artifact.digest)?
        {
            return Err("meaning transition artifact failed publication readback".into());
        }
        results.push(MeaningTransitionArtifactResult {
            digest: artifact.digest.clone(),
            file_name: file_name.clone(),
            created,
        });
    }
    before_record()?;
    checked_root(&root_path, &expected)?;
    #[cfg(unix)]
    verify_archive_directory_identity(&root, archive_identity)?;
    for (artifact, file_name) in &prepared {
        let reopened = read_confined(
            &root_path,
            &expected,
            &format!("{ARTIFACT_DIRECTORY}/{file_name}"),
            ARTIFACT_LIMIT,
        )?;
        if digest_hex(&reopened) != validate_digest(&artifact.digest)? {
            return Err("meaning transition artifact changed before record publication".into());
        }
    }
    #[cfg(unix)]
    let record_created = {
        verify_archive_directory_identity(&root, archive_identity)?;
        let name = std::ffi::CString::new(record_file_name.as_bytes())
            .map_err(|error| error.to_string())?;
        publish_in_open_parent(
            &archive_handle,
            &name,
            record_content.as_bytes(),
            RECORD_LIMIT,
        )?
    };
    #[cfg(not(unix))]
    let record_created = publish_confined(
        &root_path,
        &root,
        &expected,
        &format!("{DIRECTORY}/{record_file_name}"),
        record_content.as_bytes(),
        RECORD_LIMIT,
    )?;
    let reopened = read_confined(
        &root_path,
        &expected,
        &format!("{DIRECTORY}/{record_file_name}"),
        RECORD_LIMIT,
    )?;
    if reopened != record_content.as_bytes() {
        return Err("meaning transition record failed publication readback".into());
    }
    Ok(MeaningTransitionAppendResult {
        record_file_name,
        record_created,
        artifacts: results,
    })
}

#[cfg(all(test, unix))]
mod tests;
