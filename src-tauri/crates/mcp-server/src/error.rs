//! Why a tool call failed, as the agent reads it: a code, a message, and the fields that tell it how
//! to repair the call.
//!
//! The code is a variant of [`ErrorCode`] chosen where the failure is made, never read back out of
//! the message. The fields a message names (the unknown argument, the nearest allowed one) are typed
//! values beside the message, written into `structuredContent` from there; no message is parsed.
//! A family that needs another kind of field adds its own type to [`Details`] with the failure that
//! carries it.

mod details;

use serde::Serialize;
use thiserror::Error;

pub use details::{
    AllowedValueDetails, CompactUnavailableDetails, LargeResponseDetails, MissingNodeDetails,
    ProfileMissingDetails, ProfileNotFoundDetails, ProfileRequiredDetails, ReceivedValue,
    RepairFields, UnknownArgumentDetails, UnknownField, UnknownToolDetails,
};

/// The `errorCode` values an agent branches on. The set is shared with the JavaScript server and
/// with saved prompts: a code may be added, and an existing one keeps its meaning.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidArguments,
    UnknownArgument,
    UnknownTool,
    NotFound,
    Conflict,
    VaultConflict,
    ArchitectureProfileNotFound,
    ArchitectureProfileMissing,
    ArchitectureProfileRequired,
    ToolError,
    /// Only a test build has tools that are not ported yet.
    #[cfg(feature = "test-hooks")]
    NotPorted,
}

/// The fields a code derives from the call, written after the message.
#[derive(Debug, Serialize)]
#[serde(untagged)]
enum Details {
    UnknownTool(UnknownToolDetails),
    UnknownArgument(UnknownArgumentDetails),
    AllowedValue(AllowedValueDetails),
    MissingNode(MissingNodeDetails),
    ProfileMissing(ProfileMissingDetails),
    ProfileNotFound(ProfileNotFoundDetails),
    ProfileRequired(ProfileRequiredDetails),
    LargeResponse(LargeResponseDetails),
    CompactUnavailable(CompactUnavailableDetails),
    Repair(RepairFields),
}

/// A handler's failure: a code, the words, and the fields the code derives from the call.
#[derive(Debug, Error)]
#[error("{message}")]
pub struct ToolError {
    code: ErrorCode,
    message: String,
    /// Boxed: most failures have none, and a `Result` of a tool is returned by every handler.
    details: Option<Box<Details>>,
}

impl ToolError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }

    /// Any failure with no more to say than its words, and a handler that stopped unexpectedly.
    pub fn failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::ToolError, message)
    }

    /// An argument the call got wrong.
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidArguments, message)
    }

    pub fn code(&self) -> ErrorCode {
        self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    /// This failure as one row of a batch answer.
    pub fn as_row(&self) -> RowFailure<'_> {
        RowFailure {
            error: &self.message,
            error_code: self.code,
            details: self.details.as_deref(),
        }
    }

    /// The `structuredContent` of a failed call: `ok: false`, the code, the message and the fields
    /// the code derives.
    pub fn structured(&self) -> Structured<'_> {
        Structured {
            ok: false,
            error_code: self.code,
            error: &self.message,
            details: self.details.as_deref(),
        }
    }
}

/// The one place a refusal of the source-reading crate becomes a code: the kind it carries, never
/// the words it says.
impl From<source_scan::SourceScanError> for ToolError {
    fn from(error: source_scan::SourceScanError) -> Self {
        let message = error.to_string();
        match error.code() {
            source_scan::ScanErrorCode::Invalid => Self::invalid(message),
            source_scan::ScanErrorCode::NotFound => Self::new(ErrorCode::NotFound, message),
            source_scan::ScanErrorCode::Failed => Self::failed(message),
        }
    }
}

/// A failed row of a batch answer: the words and code of the failure and the fields its code
/// derives, written after the row's own `ok` and the name it was asked for.
#[derive(Serialize)]
pub struct RowFailure<'a> {
    error: &'a str,
    #[serde(rename = "errorCode")]
    error_code: ErrorCode,
    #[serde(flatten)]
    details: Option<&'a Details>,
}

/// The `structuredContent` of a failed call.
#[derive(Serialize)]
pub struct Structured<'a> {
    ok: bool,
    #[serde(rename = "errorCode")]
    error_code: ErrorCode,
    error: &'a str,
    #[serde(flatten)]
    details: Option<&'a Details>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use answer_format::json::to_string;

    #[test]
    fn a_refusal_of_the_source_reader_gets_its_code_from_its_kind_not_its_words() {
        use source_scan::SourceScanError;
        let sentence = "profile must be invalid, missing and not found all at once";
        let codes: Vec<ErrorCode> = [
            SourceScanError::invalid(sentence),
            SourceScanError::not_found(sentence),
            SourceScanError::failed(sentence),
            SourceScanError::NoCommit,
        ]
        .into_iter()
        .map(|error| ToolError::from(error).code())
        .collect();
        assert_eq!(
            codes,
            [
                ErrorCode::InvalidArguments,
                ErrorCode::NotFound,
                ErrorCode::ToolError,
                ErrorCode::ToolError
            ]
        );
    }

    #[test]
    fn every_code_is_written_as_agents_know_it() {
        let written: Vec<String> = [
            ErrorCode::InvalidArguments,
            ErrorCode::UnknownArgument,
            ErrorCode::UnknownTool,
            ErrorCode::NotFound,
            ErrorCode::Conflict,
            ErrorCode::VaultConflict,
            ErrorCode::ArchitectureProfileNotFound,
            ErrorCode::ArchitectureProfileMissing,
            ErrorCode::ArchitectureProfileRequired,
            ErrorCode::ToolError,
        ]
        .iter()
        .map(|code| to_string(code).expect("writes"))
        .collect();
        assert_eq!(
            written,
            [
                "\"invalid_arguments\"",
                "\"unknown_argument\"",
                "\"unknown_tool\"",
                "\"not_found\"",
                "\"conflict\"",
                "\"vault_conflict\"",
                "\"architecture_profile_not_found\"",
                "\"architecture_profile_missing\"",
                "\"architecture_profile_required\"",
                "\"tool_error\"",
            ]
        );
    }
}
