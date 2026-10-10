use super::confined::read_confined;
use super::envelope::{artifact_file_name, digest_hex, validate_digest, validate_record_file_name};
use super::{
    MeaningTransitionRootIdentity, ARTIFACT_DIRECTORY, ARTIFACT_LIMIT, DIRECTORY, RECORD_LIMIT,
};

#[tauri::command(async)]
pub(crate) fn read_meaning_transition_record_text(
    root_path: String,
    expected_root_identity: MeaningTransitionRootIdentity,
    file_name: String,
) -> Result<String, String> {
    validate_record_file_name(&file_name)?;
    let bytes = read_confined(
        &root_path,
        &expected_root_identity,
        &format!("{DIRECTORY}/{file_name}"),
        RECORD_LIMIT,
    )?;
    String::from_utf8(bytes).map_err(|_| "meaning transition record is not UTF-8".into())
}

#[tauri::command(async)]
pub(crate) fn read_meaning_transition_artifact_text(
    root_path: String,
    expected_root_identity: MeaningTransitionRootIdentity,
    digest: String,
) -> Result<String, String> {
    let name = artifact_file_name(&digest)?;
    let bytes = read_confined(
        &root_path,
        &expected_root_identity,
        &format!("{ARTIFACT_DIRECTORY}/{name}"),
        ARTIFACT_LIMIT,
    )?;
    if digest_hex(&bytes) != validate_digest(&digest)? {
        return Err("meaning transition artifact digest does not match stored bytes".into());
    }
    String::from_utf8(bytes).map_err(|_| "meaning transition artifact is not UTF-8".into())
}

#[cfg(all(test, unix))]
mod tests;
