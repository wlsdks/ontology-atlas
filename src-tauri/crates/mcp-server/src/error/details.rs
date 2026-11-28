//! The fields a failure derives from the call, one type per kind of mistake an agent can repair:
//! what it got wrong, what was allowed, and the nearest allowed value. Field names are the ones the
//! agent reads in `structuredContent`; field order is the order they are written in.

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use super::{Details, ErrorCode, ToolError};

/// A name the agent sent and the allowed name nearest to it, when one is near enough to be a typo.
#[derive(Debug, Serialize)]
pub struct UnknownField {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

fn quoted_list(unknown: &[UnknownField]) -> String {
    unknown
        .iter()
        .map(|field| match &field.suggestion {
            Some(nearest) => format!("\"{}\" (did you mean \"{nearest}\"?)", field.name),
            None => format!("\"{}\"", field.name),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn did_you_mean(suggestion: Option<&str>) -> String {
    suggestion
        .map(|nearest| format!(" Did you mean \"{nearest}\"?"))
        .unwrap_or_default()
}

fn or_word(names: &[String], none: &str) -> String {
    if names.is_empty() {
        none.to_string()
    } else {
        names.join(", ")
    }
}

/// A tool name the server does not have, whatever the name holds: the fields are the typed values
/// the message was written from, so an empty name or one with a full stop carries them too.
#[derive(Debug, Serialize)]
pub struct UnknownToolDetails {
    #[serde(rename = "receivedTool")]
    pub received: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
    #[serde(rename = "allowedTools")]
    pub allowed: Vec<String>,
}

impl ToolError {
    /// `name` is not a tool; `allowed` are the tools that are, sorted.
    pub fn unknown_tool(name: &str, suggestion: Option<&str>, allowed: &[&str]) -> Self {
        let message = format!(
            "Unknown tool: {name}.{} Allowed tools: {}.",
            did_you_mean(suggestion),
            allowed.join(", ")
        );
        Self {
            details: Some(Box::new(Details::UnknownTool(UnknownToolDetails {
                received: name.to_string(),
                suggestion: suggestion.map(str::to_string),
                allowed: allowed.iter().map(|tool| (*tool).to_string()).collect(),
            }))),
            ..Self::new(ErrorCode::UnknownTool, message)
        }
    }

    /// The call named arguments `tool` does not take. `unknown` are those, in the order sent,
    /// `allowed` and `received` the argument names sorted.
    pub fn unknown_arguments(
        tool: &str,
        unknown: Vec<UnknownField>,
        allowed: Vec<String>,
        received: Vec<String>,
    ) -> Self {
        let allowed_text = or_word(&allowed, "no arguments");
        let received_text = or_word(&received, "none");
        let message = match unknown.as_slice() {
            [only] => format!(
                "Unknown argument \"{}\" for {tool}.{} Allowed arguments: {allowed_text}. Received arguments: {received_text}.",
                only.name,
                did_you_mean(only.suggestion.as_deref())
            ),
            _ => format!(
                "Unknown arguments for {tool}: {}. Allowed arguments: {allowed_text}. Received arguments: {received_text}.",
                quoted_list(&unknown)
            ),
        };
        Self {
            details: Some(Box::new(Details::UnknownArgument(UnknownArgumentDetails {
                tool: tool.to_string(),
                unknown,
                allowed,
                received,
            }))),
            ..Self::new(ErrorCode::UnknownArgument, message)
        }
    }
}

/// A tool name the server answered before and no longer runs: the call that does its job now.
#[derive(Debug, Serialize)]
pub struct RetiredToolDetails {
    #[serde(rename = "retiredTool")]
    pub retired: String,
    pub replacement: String,
}

impl ToolError {
    /// `name` was a tool and now runs nothing; `replacement` says what to call or run instead.
    pub fn tool_retired(name: &str, replacement: &str) -> Self {
        Self {
            details: Some(Box::new(Details::RetiredTool(RetiredToolDetails {
                retired: name.to_string(),
                replacement: replacement.to_string(),
            }))),
            ..Self::new(
                ErrorCode::ToolRetired,
                format!("{name} is retired and no longer runs; use {replacement}."),
            )
        }
    }
}

/// Arguments a tool does not take. One unknown argument is written with the fields of a single
/// mistake, several with the shorter list form.
#[derive(Debug)]
pub struct UnknownArgumentDetails {
    pub tool: String,
    pub unknown: Vec<UnknownField>,
    pub allowed: Vec<String>,
    pub received: Vec<String>,
}

impl Serialize for UnknownArgumentDetails {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("toolName", &self.tool)?;
        match self.unknown.as_slice() {
            [only] => {
                map.serialize_entry("receivedArgument", &only.name)?;
                if let Some(nearest) = &only.suggestion {
                    map.serialize_entry("suggestion", nearest)?;
                }
                map.serialize_entry("unknownArguments", &self.unknown)?;
                map.serialize_entry("allowedArguments", &self.allowed)?;
                map.serialize_entry("receivedArguments", &self.received)?;
            }
            _ => {
                map.serialize_entry("receivedArguments", &self.received)?;
                map.serialize_entry("unknownArguments", &self.unknown)?;
                map.serialize_entry("allowedArguments", &self.allowed)?;
            }
        }
        map.end()
    }
}

/// What the agent sent where only a few values are allowed, in the words the message names it:
/// the text itself for a string, the kind of value for anything else.
#[derive(Debug, Clone, Copy)]
pub enum ReceivedValue<'a> {
    Text(&'a str),
    Other(&'static str),
}

impl ReceivedValue<'_> {
    fn quoted(self) -> String {
        match self {
            Self::Text(text) => format!("\"{text}\""),
            Self::Other(kind) => kind.to_string(),
        }
    }

    fn plain(self) -> String {
        match self {
            Self::Text(text) => text.to_string(),
            Self::Other(kind) => kind.to_string(),
        }
    }
}

/// A node that is not in the vault, and where the agent may go from there.
#[derive(Debug, Default, Serialize)]
pub struct MissingNodeDetails {
    #[serde(rename = "missingSubject")]
    pub subject: &'static str,
    #[serde(rename = "missingSlug", skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    #[serde(rename = "missingUid", skip_serializing_if = "Option::is_none")]
    pub uid: Option<String>,
    #[serde(rename = "recoveryTools")]
    pub recovery_tools: Vec<&'static str>,
    #[serde(rename = "createTool", skip_serializing_if = "Option::is_none")]
    pub create_tool: Option<&'static str>,
    #[serde(rename = "similarSlugs", skip_serializing_if = "Option::is_none")]
    pub similar_slugs: Option<Vec<String>>,
    #[serde(rename = "referencedBy", skip_serializing_if = "Option::is_none")]
    pub referenced_by: Option<Vec<vault_document::Reference>>,
    #[serde(rename = "growthHint", skip_serializing_if = "Option::is_none")]
    pub growth_hint: Option<vault_document::GrowthHint>,
}

impl ToolError {
    /// A node the vault does not hold, with the fields that point the agent to the next call.
    pub fn missing_node(message: impl Into<String>, details: MissingNodeDetails) -> Self {
        Self {
            details: Some(Box::new(Details::MissingNode(details))),
            ..Self::new(ErrorCode::NotFound, message)
        }
    }
}

/// A value outside the few an argument allows.
#[derive(Debug, Serialize)]
pub struct AllowedValueDetails {
    #[serde(rename = "valueName")]
    pub name: String,
    #[serde(rename = "receivedValue")]
    pub received: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
    #[serde(rename = "allowedValues")]
    pub allowed: Vec<String>,
}

impl ToolError {
    /// `name` held `received`, which is not one of `allowed`. The nearest allowed value is offered
    /// for a text near enough to be a typo of one.
    pub fn not_an_allowed_value(name: &str, received: ReceivedValue<'_>, allowed: &[&str]) -> Self {
        let suggestion = match received {
            ReceivedValue::Text(text) => crate::suggestions::closest_allowed_value(text, allowed),
            ReceivedValue::Other(_) => None,
        };
        let message = format!(
            "{name} must be one of: {}. Received: {}.{}",
            allowed.join(", "),
            received.quoted(),
            did_you_mean(suggestion.as_deref())
        );
        Self {
            details: Some(Box::new(Details::AllowedValue(AllowedValueDetails {
                name: name.to_string(),
                received: received.plain(),
                suggestion,
                allowed: allowed.iter().map(|value| (*value).to_string()).collect(),
            }))),
            ..Self::new(ErrorCode::InvalidArguments, message)
        }
    }
}

/// The vault holds no architecture profile; profiles live in `architecture/`.
#[derive(Debug, Serialize)]
pub struct ProfileMissingDetails {
    #[serde(rename = "profileDirectory")]
    pub directory: &'static str,
}

/// The profile an agent named is not one of the vault's.
#[derive(Debug, Serialize)]
pub struct ProfileNotFoundDetails {
    #[serde(rename = "profileSlug")]
    pub slug: String,
    #[serde(rename = "availableProfileSlugs")]
    pub available: Vec<String>,
}

/// Several profiles exist and the call named none.
#[derive(Debug, Serialize)]
pub struct ProfileRequiredDetails {
    #[serde(rename = "availableProfileSlugs")]
    pub available: Vec<String>,
}

impl ToolError {
    /// No architecture profile is in the vault.
    pub fn profile_missing(message: impl Into<String>) -> Self {
        Self {
            details: Some(Box::new(Details::ProfileMissing(ProfileMissingDetails {
                directory: "architecture/",
            }))),
            ..Self::new(ErrorCode::ArchitectureProfileMissing, message)
        }
    }

    /// `slug` names no profile; `available` are the slugs that exist.
    pub fn profile_not_found(slug: &str, available: Vec<String>) -> Self {
        Self {
            details: Some(Box::new(Details::ProfileNotFound(ProfileNotFoundDetails {
                slug: slug.to_string(),
                available,
            }))),
            ..Self::new(
                ErrorCode::ArchitectureProfileNotFound,
                format!("Architecture profile not found: {slug}."),
            )
        }
    }

    /// Several profiles exist and none was named.
    pub fn profile_required(available: Vec<String>) -> Self {
        let message = format!(
            "Multiple architecture profiles exist; pass profileSlug. Available profiles: {}.",
            available.join(", ")
        );
        Self {
            details: Some(Box::new(Details::ProfileRequired(ProfileRequiredDetails {
                available,
            }))),
            ..Self::new(ErrorCode::ArchitectureProfileRequired, message)
        }
    }
}

/// The arguments that fetch a whole import scan.
#[derive(Debug, Serialize)]
pub struct FullImportArguments {
    #[serde(rename = "reviewMode")]
    pub review_mode: &'static str,
    #[serde(rename = "allowLargeResponse")]
    pub allow_large_response: bool,
}

#[derive(Debug, Serialize)]
pub struct CompactImportArguments {
    #[serde(rename = "reviewMode")]
    pub review_mode: &'static str,
}

/// An import scan too large to send without the caller's confirmation.
#[derive(Debug, Serialize)]
pub struct LargeResponseDetails {
    #[serde(rename = "largeResponseConfirmationRequired")]
    pub confirmation_required: bool,
    #[serde(rename = "estimatedFullResponseBytes")]
    pub estimated_bytes: usize,
    #[serde(rename = "automaticLimitBytes")]
    pub limit_bytes: usize,
    #[serde(rename = "retryArguments")]
    pub retry: FullImportArguments,
    #[serde(rename = "boundedAlternative")]
    pub bounded_alternative: CompactImportArguments,
}

/// What a compact import review needs that this call lacks.
#[derive(Debug, Serialize)]
pub struct CompactRequirements {
    pub reconcile: bool,
    #[serde(rename = "loadableActiveVault")]
    pub loadable_active_vault: bool,
}

/// An import scan too large to send whole, with no vault to review it against.
#[derive(Debug, Serialize)]
pub struct CompactUnavailableDetails {
    #[serde(rename = "estimatedFullResponseBytes")]
    pub estimated_bytes: usize,
    #[serde(rename = "automaticLimitBytes")]
    pub limit_bytes: usize,
    #[serde(rename = "requiredForCompact")]
    pub required: CompactRequirements,
    #[serde(rename = "explicitFullOverride")]
    pub explicit_full: FullImportArguments,
}

impl ToolError {
    /// An explicit whole-scan request over the delivery limit: the caller must confirm it.
    pub fn large_response(
        message: impl Into<String>,
        estimated_bytes: usize,
        limit_bytes: usize,
    ) -> Self {
        Self {
            details: Some(Box::new(Details::LargeResponse(LargeResponseDetails {
                confirmation_required: true,
                estimated_bytes,
                limit_bytes,
                retry: FullImportArguments {
                    review_mode: "full",
                    allow_large_response: true,
                },
                bounded_alternative: CompactImportArguments {
                    review_mode: "next",
                },
            }))),
            ..Self::failed(message)
        }
    }

    /// A scan over the delivery limit that cannot be sent compactly either.
    pub fn compact_unavailable(
        message: impl Into<String>,
        estimated_bytes: usize,
        limit_bytes: usize,
    ) -> Self {
        Self {
            details: Some(Box::new(Details::CompactUnavailable(
                CompactUnavailableDetails {
                    estimated_bytes,
                    limit_bytes,
                    required: CompactRequirements {
                        reconcile: true,
                        loadable_active_vault: true,
                    },
                    explicit_full: FullImportArguments {
                        review_mode: "full",
                        allow_large_response: true,
                    },
                },
            ))),
            ..Self::failed(message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use answer_format::json::to_string;

    fn structured(error: &ToolError) -> String {
        to_string(&error.structured()).expect("writes")
    }

    fn field(name: &str, suggestion: Option<&str>) -> UnknownField {
        UnknownField {
            name: name.to_string(),
            suggestion: suggestion.map(str::to_string),
        }
    }

    fn names(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_string()).collect()
    }

    #[test]
    fn an_unknown_tool_with_a_suggestion_lists_what_is_allowed() {
        let error = ToolError::unknown_tool("list_concept", Some("list_concepts"), &["a", "b"]);
        assert_eq!(
            error.message(),
            r#"Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: a, b."#
        );
        assert_eq!(
            structured(&error),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: list_concept. Did you mean \"list_concepts\"? Allowed tools: a, b.","#,
                r#""receivedTool":"list_concept","suggestion":"list_concepts","allowedTools":["a","b"]}"#
            )
        );
    }

    #[test]
    fn a_retired_tool_names_itself_and_the_call_that_replaces_it() {
        let error = ToolError::tool_retired("git_status", "your own git: `git status`");
        assert_eq!(
            structured(&error),
            concat!(
                r#"{"ok":false,"errorCode":"tool_retired","error":"git_status is retired and no longer runs; use your own git: `git status`.","#,
                r#""retiredTool":"git_status","replacement":"your own git: `git status`"}"#
            )
        );
    }

    #[test]
    fn an_empty_name_or_one_with_a_full_stop_carries_its_fields_too() {
        assert_eq!(
            structured(&ToolError::unknown_tool("", None, &["a"])),
            r#"{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: . Allowed tools: a.","receivedTool":"","allowedTools":["a"]}"#
        );
        assert_eq!(
            structured(&ToolError::unknown_tool("srv.a", Some("a"), &["a"])),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: srv.a. Did you mean \"a\"? Allowed tools: a.","#,
                r#""receivedTool":"srv.a","suggestion":"a","allowedTools":["a"]}"#
            )
        );
        let argument =
            ToolError::unknown_arguments("t", vec![field("", None)], Vec::new(), names(&[""]));
        assert_eq!(
            structured(&argument),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown argument \"\" for t. Allowed arguments: no arguments. Received arguments: .","#,
                r#""toolName":"t","receivedArgument":"","unknownArguments":[{"name":""}],"allowedArguments":[],"receivedArguments":[""]}"#
            )
        );
        let comma = ToolError::unknown_arguments(
            "t",
            vec![field("a,b", None), field(" c ", None)],
            Vec::new(),
            names(&[" c ", "a,b"]),
        );
        assert_eq!(
            structured(&comma),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown arguments for t: \"a,b\", \" c \". Allowed arguments: no arguments. Received arguments:  c , a,b.","#,
                r#""toolName":"t","receivedArguments":[" c ","a,b"],"unknownArguments":[{"name":"a,b"},{"name":" c "}],"allowedArguments":[]}"#
            )
        );
    }

    #[test]
    fn a_single_unknown_argument_names_its_tool_and_the_nearest_allowed_one() {
        let error = ToolError::unknown_arguments(
            "list_concepts",
            vec![field("limt", Some("limit"))],
            names(&["domain", "limit"]),
            names(&["limt"]),
        );
        assert_eq!(
            error.message(),
            r#"Unknown argument "limt" for list_concepts. Did you mean "limit"? Allowed arguments: domain, limit. Received arguments: limt."#
        );
        assert_eq!(
            structured(&error),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown argument \"limt\" for list_concepts. Did you mean \"limit\"? Allowed arguments: domain, limit. Received arguments: limt.","#,
                r#""toolName":"list_concepts","receivedArgument":"limt","suggestion":"limit","#,
                r#""unknownArguments":[{"name":"limt","suggestion":"limit"}],"allowedArguments":["domain","limit"],"#,
                r#""receivedArguments":["limt"]}"#
            )
        );
        let none = ToolError::unknown_arguments(
            "list_kinds",
            vec![field("zz", None)],
            Vec::new(),
            names(&["zz"]),
        );
        assert_eq!(
            none.message(),
            r#"Unknown argument "zz" for list_kinds. Allowed arguments: no arguments. Received arguments: zz."#
        );
        assert_eq!(
            structured(&none),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown argument \"zz\" for list_kinds. Allowed arguments: no arguments. Received arguments: zz.","#,
                r#""toolName":"list_kinds","receivedArgument":"zz","unknownArguments":[{"name":"zz"}],"#,
                r#""allowedArguments":[],"receivedArguments":["zz"]}"#
            )
        );
    }

    #[test]
    fn several_unknown_arguments_each_carry_their_own_hint() {
        let error = ToolError::unknown_arguments(
            "list_concepts",
            vec![field("bogus", None), field("limt", Some("limit"))],
            names(&["domain", "limit"]),
            names(&["bogus", "limt"]),
        );
        assert_eq!(
            error.message(),
            r#"Unknown arguments for list_concepts: "bogus", "limt" (did you mean "limit"?). Allowed arguments: domain, limit. Received arguments: bogus, limt."#
        );
        assert_eq!(
            structured(&error),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown arguments for list_concepts: \"bogus\", \"limt\" (did you mean \"limit\"?). Allowed arguments: domain, limit. Received arguments: bogus, limt.","#,
                r#""toolName":"list_concepts","receivedArguments":["bogus","limt"],"#,
                r#""unknownArguments":[{"name":"bogus"},{"name":"limt","suggestion":"limit"}],"allowedArguments":["domain","limit"]}"#
            )
        );
    }
}

/// A name that is already taken, and how to go on from there.
#[derive(Debug, Default, Serialize)]
pub struct ConflictDetails {
    #[serde(rename = "rowName", skip_serializing_if = "Option::is_none")]
    pub row_name: Option<String>,
    #[serde(rename = "conflictSubject")]
    pub subject: &'static str,
    #[serde(rename = "conflictSlug")]
    pub slug: String,
    #[serde(rename = "firstSeenAt", skip_serializing_if = "Option::is_none")]
    pub first_seen_at: Option<String>,
    #[serde(rename = "recoveryTools", skip_serializing_if = "Vec::is_empty")]
    pub recovery_tools: Vec<&'static str>,
    #[serde(rename = "avoidTools", skip_serializing_if = "Vec::is_empty")]
    pub avoid_tools: Vec<&'static str>,
    #[serde(rename = "overwriteOption", skip_serializing_if = "Option::is_none")]
    pub overwrite_option: Option<&'static str>,
}

impl ToolError {
    pub fn conflict_with(message: impl Into<String>, details: ConflictDetails) -> Self {
        Self {
            details: Some(Box::new(Details::Conflict(details))),
            ..Self::new(ErrorCode::Conflict, message)
        }
    }
}

/// A row of a batch with a field it does not have.
#[derive(Debug, Serialize)]
pub struct UnknownFieldDetails {
    #[serde(rename = "rowName")]
    pub row_name: String,
    #[serde(rename = "receivedField", skip_serializing_if = "Option::is_none")]
    pub received_field: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
    #[serde(rename = "unknownFields")]
    pub unknown: Vec<UnknownField>,
    #[serde(rename = "allowedFields")]
    pub allowed: Vec<String>,
    #[serde(rename = "receivedFields")]
    pub received: Vec<String>,
}

impl ToolError {
    /// `row_name` holds fields outside `allowed`; `received` is every field it holds, sorted.
    pub fn unknown_fields(
        row_name: &str,
        unknown: Vec<UnknownField>,
        allowed: &[&str],
        received: Vec<String>,
    ) -> Self {
        let received_text = if received.is_empty() {
            "none".to_string()
        } else {
            received.join(", ")
        };
        let allowed_text = allowed.join(", ");
        let message = match unknown.as_slice() {
            [only] => format!(
                "Unknown field \"{}\" in {row_name}.{} Allowed fields: {allowed_text}. Received fields: {received_text}.",
                only.name,
                did_you_mean(only.suggestion.as_deref()),
            ),
            _ => format!(
                "Unknown fields in {row_name}: {}. Allowed fields: {allowed_text}. Received fields: {received_text}.",
                quoted_list(&unknown)
            ),
        };
        let single = match unknown.as_slice() {
            [only] => Some((only.name.clone(), only.suggestion.clone())),
            _ => None,
        };
        Self {
            details: Some(Box::new(Details::UnknownFields(UnknownFieldDetails {
                row_name: row_name.to_string(),
                received_field: single.as_ref().map(|(name, _)| name.clone()),
                suggestion: single.and_then(|(_, suggestion)| suggestion),
                unknown,
                allowed: allowed.iter().map(|name| (*name).to_string()).collect(),
                received,
            }))),
            ..Self::new(ErrorCode::InvalidArguments, message)
        }
    }
}
