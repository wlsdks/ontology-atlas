//! Why a tool call failed, as the agent reads it: a code, a message, and the fields that tell it how
//! to repair the call.
//!
//! One variant of [`ToolError`] per `errorCode`, so the code is the variant and never read back out
//! of the message. The fields a message names (the unknown argument, the nearest allowed one, the
//! slugs that look alike) are typed values beside the message, written into `structuredContent`
//! from there; no message is parsed.

mod details;

use std::convert::Infallible;
use std::fmt;

use answer_format::json::to_raw;
use answer_format::OrderedMap;
use serde::Serialize;
use serde_json::value::RawValue;
use thiserror::Error;

pub use details::{
    AllowedValueDetails, ConflictDetails, InvalidArgumentsDetails, NotFoundDetails,
    UnknownArgumentDetails, UnknownField, UnknownFieldsDetails, UnknownToolDetails,
};

/// The `errorCode` values, as an agent reads them.
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

/// Extra fields that tell the agent how to repair the call, written after the details. A key may
/// not be `ok`, `errorCode` or `error`: those three are the answer's own.
#[derive(Debug, Default, Serialize)]
pub struct Repair(OrderedMap<Box<RawValue>>);

impl Repair {
    /// The repair fields of any answer struct, in its field order.
    pub fn from_fields<T: Serialize + ?Sized>(fields: &T) -> Result<Self, serde_json::Error> {
        let object = to_raw(fields)?;
        let mut map: OrderedMap<Box<RawValue>> = serde_json::from_str(object.get())?;
        for reserved in ["ok", "errorCode", "error"] {
            map.remove(reserved);
        }
        Ok(Self(map))
    }
}

/// A refusal: the words the agent reads, and what goes with them. `D` is the typed fields its code
/// derives from the call, none for a code that carries none.
#[derive(Debug)]
pub struct Refusal<D = Infallible> {
    pub message: String,
    pub details: Option<D>,
    pub repair: Option<Repair>,
    /// A hint that a slug which does not resolve attaches, lifted into `structuredContent`.
    pub growth_hint: Option<Box<RawValue>>,
}

impl<D> Refusal<D> {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            details: None,
            repair: None,
            growth_hint: None,
        }
    }

    pub fn with_details(message: impl Into<String>, details: D) -> Self {
        Self {
            details: Some(details),
            ..Self::new(message)
        }
    }

    #[must_use]
    pub fn with_repair(mut self, repair: Repair) -> Self {
        self.repair = Some(repair);
        self
    }

    #[must_use]
    pub fn with_growth_hint(mut self, hint: Box<RawValue>) -> Self {
        self.growth_hint = Some(hint);
        self
    }
}

impl<D> fmt::Display for Refusal<D> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

/// A handler's failure. Each variant is one `errorCode`.
#[derive(Debug, Error)]
pub enum ToolError {
    #[error("{0}")]
    UnknownTool(Box<Refusal<UnknownToolDetails>>),
    #[error("{0}")]
    UnknownArgument(Box<Refusal<UnknownArgumentDetails>>),
    #[error("{0}")]
    InvalidArguments(Box<Refusal<InvalidArgumentsDetails>>),
    #[error("{0}")]
    NotFound(Box<Refusal<NotFoundDetails>>),
    #[error("{0}")]
    Conflict(Box<Refusal<ConflictDetails>>),
    /// A write refused because the file changed after the agent read it.
    #[error("{0}")]
    VaultConflict(Box<Refusal>),
    #[error("{0}")]
    ArchitectureProfileNotFound(Box<Refusal>),
    #[error("{0}")]
    ArchitectureProfileMissing(Box<Refusal>),
    #[error("{0}")]
    ArchitectureProfileRequired(Box<Refusal>),
    /// Any other failure, and a handler that stopped unexpectedly.
    #[error("{0}")]
    Failed(Box<Refusal>),
    #[cfg(feature = "test-hooks")]
    #[error("{0}")]
    NotPorted(Box<Refusal>),
}

/// The fields a refusal's code derives from the call, borrowed for writing.
#[derive(Serialize)]
#[serde(untagged)]
enum DetailsRef<'a> {
    UnknownTool(&'a UnknownToolDetails),
    UnknownArgument(&'a UnknownArgumentDetails),
    InvalidArguments(&'a InvalidArgumentsDetails),
    NotFound(&'a NotFoundDetails),
    Conflict(&'a ConflictDetails),
}

impl ToolError {
    /// A failure with no more to say than its words.
    pub fn failed(message: impl Into<String>) -> Self {
        Self::Failed(Box::new(Refusal::new(message)))
    }

    /// An argument the call got wrong, with no fields beyond the words.
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidArguments(Box::new(Refusal::new(message)))
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(Box::new(Refusal::new(message)))
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::Conflict(Box::new(Refusal::new(message)))
    }

    pub fn code(&self) -> ErrorCode {
        match self {
            Self::UnknownTool(_) => ErrorCode::UnknownTool,
            Self::UnknownArgument(_) => ErrorCode::UnknownArgument,
            Self::InvalidArguments(_) => ErrorCode::InvalidArguments,
            Self::NotFound(_) => ErrorCode::NotFound,
            Self::Conflict(_) => ErrorCode::Conflict,
            Self::VaultConflict(_) => ErrorCode::VaultConflict,
            Self::ArchitectureProfileNotFound(_) => ErrorCode::ArchitectureProfileNotFound,
            Self::ArchitectureProfileMissing(_) => ErrorCode::ArchitectureProfileMissing,
            Self::ArchitectureProfileRequired(_) => ErrorCode::ArchitectureProfileRequired,
            Self::Failed(_) => ErrorCode::ToolError,
            #[cfg(feature = "test-hooks")]
            Self::NotPorted(_) => ErrorCode::NotPorted,
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::UnknownTool(refusal) => &refusal.message,
            Self::UnknownArgument(refusal) => &refusal.message,
            Self::InvalidArguments(refusal) => &refusal.message,
            Self::NotFound(refusal) => &refusal.message,
            Self::Conflict(refusal) => &refusal.message,
            Self::VaultConflict(refusal)
            | Self::ArchitectureProfileNotFound(refusal)
            | Self::ArchitectureProfileMissing(refusal)
            | Self::ArchitectureProfileRequired(refusal)
            | Self::Failed(refusal) => &refusal.message,
            #[cfg(feature = "test-hooks")]
            Self::NotPorted(refusal) => &refusal.message,
        }
    }

    fn details(&self) -> Option<DetailsRef<'_>> {
        match self {
            Self::UnknownTool(refusal) => refusal.details.as_ref().map(DetailsRef::UnknownTool),
            Self::UnknownArgument(refusal) => {
                refusal.details.as_ref().map(DetailsRef::UnknownArgument)
            }
            Self::InvalidArguments(refusal) => {
                refusal.details.as_ref().map(DetailsRef::InvalidArguments)
            }
            Self::NotFound(refusal) => refusal.details.as_ref().map(DetailsRef::NotFound),
            Self::Conflict(refusal) => refusal.details.as_ref().map(DetailsRef::Conflict),
            _ => None,
        }
    }

    fn repair(&self) -> Option<&Repair> {
        match self {
            Self::UnknownTool(refusal) => refusal.repair.as_ref(),
            Self::UnknownArgument(refusal) => refusal.repair.as_ref(),
            Self::InvalidArguments(refusal) => refusal.repair.as_ref(),
            Self::NotFound(refusal) => refusal.repair.as_ref(),
            Self::Conflict(refusal) => refusal.repair.as_ref(),
            Self::VaultConflict(refusal)
            | Self::ArchitectureProfileNotFound(refusal)
            | Self::ArchitectureProfileMissing(refusal)
            | Self::ArchitectureProfileRequired(refusal)
            | Self::Failed(refusal) => refusal.repair.as_ref(),
            #[cfg(feature = "test-hooks")]
            Self::NotPorted(refusal) => refusal.repair.as_ref(),
        }
    }

    fn growth_hint(&self) -> Option<&RawValue> {
        let hint = match self {
            Self::NotFound(refusal) => &refusal.growth_hint,
            Self::UnknownTool(refusal) => &refusal.growth_hint,
            Self::UnknownArgument(refusal) => &refusal.growth_hint,
            Self::InvalidArguments(refusal) => &refusal.growth_hint,
            Self::Conflict(refusal) => &refusal.growth_hint,
            Self::VaultConflict(refusal)
            | Self::ArchitectureProfileNotFound(refusal)
            | Self::ArchitectureProfileMissing(refusal)
            | Self::ArchitectureProfileRequired(refusal)
            | Self::Failed(refusal) => &refusal.growth_hint,
            #[cfg(feature = "test-hooks")]
            Self::NotPorted(refusal) => &refusal.growth_hint,
        };
        hint.as_deref()
    }

    /// The `structuredContent` of a failed call: `ok: false`, the code, the message, the fields the
    /// code derives, the repair fields and the growth hint.
    pub fn structured(&self) -> Structured<'_> {
        Structured {
            ok: false,
            error_code: self.code(),
            error: self.message(),
            details: self.details(),
            repair: self.repair(),
            growth_hint: self.growth_hint(),
        }
    }

    /// The same failure as one row of a batch answer: the code and the derived fields.
    pub fn row(&self) -> RowFailure<'_> {
        RowFailure {
            error_code: self.code(),
            details: self.details(),
        }
    }
}

/// The `structuredContent` of a failed call.
#[derive(Serialize)]
pub struct Structured<'a> {
    ok: bool,
    #[serde(rename = "errorCode")]
    error_code: ErrorCode,
    error: &'a str,
    #[serde(flatten)]
    details: Option<DetailsRef<'a>>,
    #[serde(flatten)]
    repair: Option<&'a Repair>,
    #[serde(rename = "growthHint", skip_serializing_if = "Option::is_none")]
    growth_hint: Option<&'a RawValue>,
}

/// A failed row of a batch answer.
#[derive(Serialize)]
pub struct RowFailure<'a> {
    #[serde(rename = "errorCode")]
    error_code: ErrorCode,
    #[serde(flatten)]
    details: Option<DetailsRef<'a>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use answer_format::json::to_string;

    fn structured(error: &ToolError) -> String {
        to_string(&error.structured()).expect("writes")
    }

    #[test]
    fn a_code_is_its_variant_whatever_the_words_say() {
        assert_eq!(
            ToolError::failed("Unknown tool: x. File not found; must be set").code(),
            ErrorCode::ToolError
        );
        assert_eq!(ToolError::not_found("anything").code(), ErrorCode::NotFound);
        assert_eq!(ToolError::conflict("anything").code(), ErrorCode::Conflict);
        assert_eq!(
            ToolError::invalid("anything").code(),
            ErrorCode::InvalidArguments
        );
    }

    #[test]
    fn a_refusal_with_no_details_is_the_code_and_the_words() {
        assert_eq!(
            structured(&ToolError::failed("something broke")),
            r#"{"ok":false,"errorCode":"tool_error","error":"something broke"}"#
        );
        assert_eq!(
            structured(&ToolError::VaultConflict(Box::new(Refusal::new(
                "changed since read"
            )))),
            r#"{"ok":false,"errorCode":"vault_conflict","error":"changed since read"}"#
        );
    }

    #[test]
    fn repair_fields_and_a_growth_hint_follow_the_code_and_the_words() {
        #[derive(Serialize)]
        struct Fields<'a> {
            #[serde(rename = "expectedHead")]
            expected_head: &'a str,
            error: &'a str,
        }
        let repair = Repair::from_fields(&Fields {
            expected_head: "abc",
            error: "reserved, dropped",
        })
        .expect("writes");
        let hint = to_raw("hint").expect("writes");
        let error = ToolError::ArchitectureProfileMissing(Box::new(
            Refusal::new("Profile \"x\" is missing")
                .with_repair(repair)
                .with_growth_hint(hint),
        ));
        assert_eq!(
            structured(&error),
            concat!(
                r#"{"ok":false,"errorCode":"architecture_profile_missing","#,
                r#""error":"Profile \"x\" is missing","expectedHead":"abc","growthHint":"hint"}"#
            )
        );
    }
}
