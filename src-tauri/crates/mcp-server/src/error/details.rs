//! The fields a refusal derives from the call, one type per kind of mistake an agent can repair:
//! what it got wrong, what was allowed, and the nearest allowed value. Field names are the ones the
//! agent reads in `structuredContent`; field order is the order they are written in.

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use super::{Refusal, ToolError};

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

/// A tool name the server does not have. An empty name carries no fields, and neither does one with
/// a full stop, which the JavaScript server's pattern cannot read back out of its message.
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
        let details = (!name.is_empty() && !name.contains('.')).then(|| UnknownToolDetails {
            received: name.to_string(),
            suggestion: suggestion.map(str::to_string),
            allowed: allowed.iter().map(|tool| (*tool).to_string()).collect(),
        });
        Self::UnknownTool(Box::new(Refusal {
            details,
            ..Refusal::new(message)
        }))
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
        // A name that is empty has nothing to repair by name, so the answer carries its words only.
        let named = unknown.iter().all(|field| !field.name.is_empty());
        let details = named.then(|| UnknownArgumentDetails {
            tool: tool.to_string(),
            unknown,
            allowed,
            received,
        });
        Self::UnknownArgument(Box::new(Refusal {
            details,
            ..Refusal::new(message)
        }))
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

/// Fields of a row (a concept to add, a relation) the tool does not take.
#[derive(Debug)]
pub struct UnknownFieldsDetails {
    pub row: String,
    pub unknown: Vec<UnknownField>,
    pub allowed: Vec<String>,
    pub received: Vec<String>,
}

impl Serialize for UnknownFieldsDetails {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("rowName", &self.row)?;
        if let [only] = self.unknown.as_slice() {
            map.serialize_entry("receivedField", &only.name)?;
            if let Some(nearest) = &only.suggestion {
                map.serialize_entry("suggestion", nearest)?;
            }
        }
        map.serialize_entry("unknownFields", &self.unknown)?;
        map.serialize_entry("allowedFields", &self.allowed)?;
        map.serialize_entry("receivedFields", &self.received)?;
        map.end()
    }
}

/// A value outside the set a field allows.
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

/// What an `invalid_arguments` refusal may carry.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum InvalidArgumentsDetails {
    UnknownFields(UnknownFieldsDetails),
    AllowedValue(AllowedValueDetails),
}

/// A slug that names no node, with where to look and what looks alike.
#[derive(Debug, Serialize)]
pub struct NotFoundDetails {
    #[serde(rename = "missingSubject")]
    pub subject: String,
    #[serde(rename = "missingSlug")]
    pub slug: String,
    #[serde(rename = "recoveryTools")]
    pub recovery_tools: [&'static str; 2],
    /// The tool that creates the node, when creating it is a way forward.
    #[serde(rename = "createTool", skip_serializing_if = "Option::is_none")]
    pub create_tool: Option<&'static str>,
    #[serde(rename = "similarSlugs")]
    pub similar: Vec<String>,
}

impl NotFoundDetails {
    pub fn new(subject: &str, slug: &str, similar: Vec<String>, can_create: bool) -> Self {
        Self {
            subject: subject.to_string(),
            slug: slug.to_string(),
            recovery_tools: ["list_concepts", "find_evidence"],
            create_tool: can_create.then_some("add_concepts"),
            similar,
        }
    }
}

/// A slug that is taken, with the tools that change a node that already exists.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum ConflictDetails {
    DocExists {
        #[serde(rename = "conflictSubject")]
        subject: &'static str,
        #[serde(rename = "conflictSlug")]
        slug: String,
        #[serde(rename = "recoveryTools")]
        recovery_tools: [&'static str; 2],
        #[serde(rename = "avoidTools")]
        avoid_tools: [&'static str; 1],
    },
    TargetExists {
        #[serde(rename = "conflictSubject")]
        subject: &'static str,
        #[serde(rename = "conflictSlug")]
        slug: String,
        #[serde(rename = "recoveryTools")]
        recovery_tools: [&'static str; 1],
        #[serde(rename = "overwriteOption")]
        overwrite_option: &'static str,
    },
}

impl ConflictDetails {
    /// `add_concepts` found the document already there.
    pub fn doc_exists(slug: &str) -> Self {
        Self::DocExists {
            subject: "Doc already exists",
            slug: slug.to_string(),
            recovery_tools: ["patch_concept", "rename_concept"],
            avoid_tools: ["delete_concept"],
        }
    }

    /// `rename_concept` found the target slug taken.
    pub fn target_exists(slug: &str) -> Self {
        Self::TargetExists {
            subject: "Target slug already exists",
            slug: slug.to_string(),
            recovery_tools: ["rename_concept"],
            overwrite_option: "overwrite",
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
    fn an_empty_name_carries_no_fields_and_neither_does_a_tool_name_with_a_full_stop() {
        let error = ToolError::unknown_tool("", None, &["a"]);
        assert_eq!(error.message(), "Unknown tool: . Allowed tools: a.");
        assert_eq!(
            structured(&error),
            r#"{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: . Allowed tools: a."}"#
        );
        assert_eq!(
            structured(&ToolError::unknown_tool("a.b", None, &["a"])),
            r#"{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: a.b. Allowed tools: a."}"#
        );
        let argument =
            ToolError::unknown_arguments("t", vec![field("", None)], Vec::new(), names(&[""]));
        assert_eq!(
            structured(&argument),
            r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown argument \"\" for t. Allowed arguments: no arguments. Received arguments: ."}"#
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
            "git_status",
            vec![field("zz", None)],
            Vec::new(),
            names(&["zz"]),
        );
        assert_eq!(
            none.message(),
            r#"Unknown argument "zz" for git_status. Allowed arguments: no arguments. Received arguments: zz."#
        );
        assert_eq!(
            structured(&none),
            concat!(
                r#"{"ok":false,"errorCode":"unknown_argument","error":"Unknown argument \"zz\" for git_status. Allowed arguments: no arguments. Received arguments: zz.","#,
                r#""toolName":"git_status","receivedArgument":"zz","unknownArguments":[{"name":"zz"}],"#,
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

    #[test]
    fn a_row_failure_is_the_code_and_the_derived_fields() {
        let error = ToolError::unknown_tool("x", None, &["a"]);
        assert_eq!(
            to_string(&error.row()).expect("writes"),
            r#"{"errorCode":"unknown_tool","receivedTool":"x","allowedTools":["a"]}"#
        );
    }

    #[test]
    fn the_fields_of_a_value_a_row_a_slug_and_a_conflict_have_the_names_agents_read() {
        let value = InvalidArgumentsDetails::AllowedValue(AllowedValueDetails {
            name: "body".to_string(),
            received: "fulll".to_string(),
            suggestion: Some("full".to_string()),
            allowed: names(&["excerpt", "full"]),
        });
        assert_eq!(
            to_string(&value).expect("writes"),
            r#"{"valueName":"body","receivedValue":"fulll","suggestion":"full","allowedValues":["excerpt","full"]}"#
        );
        let rows = InvalidArgumentsDetails::UnknownFields(UnknownFieldsDetails {
            row: "concepts[0]".to_string(),
            unknown: vec![field("titel", Some("title"))],
            allowed: names(&["slug", "title"]),
            received: names(&["titel"]),
        });
        assert_eq!(
            to_string(&rows).expect("writes"),
            concat!(
                r#"{"rowName":"concepts[0]","receivedField":"titel","suggestion":"title","#,
                r#""unknownFields":[{"name":"titel","suggestion":"title"}],"allowedFields":["slug","title"],"receivedFields":["titel"]}"#
            )
        );
        let missing =
            NotFoundDetails::new("from", "domains/pay", names(&["domains/payment"]), true);
        assert_eq!(
            to_string(&missing).expect("writes"),
            concat!(
                r#"{"missingSubject":"from","missingSlug":"domains/pay","recoveryTools":["list_concepts","find_evidence"],"#,
                r#""createTool":"add_concepts","similarSlugs":["domains/payment"]}"#
            )
        );
        assert_eq!(
            to_string(&ConflictDetails::doc_exists("a/b")).expect("writes"),
            concat!(
                r#"{"conflictSubject":"Doc already exists","conflictSlug":"a/b","#,
                r#""recoveryTools":["patch_concept","rename_concept"],"avoidTools":["delete_concept"]}"#
            )
        );
        assert_eq!(
            to_string(&ConflictDetails::target_exists("a/b")).expect("writes"),
            concat!(
                r#"{"conflictSubject":"Target slug already exists","conflictSlug":"a/b","#,
                r#""recoveryTools":["rename_concept"],"overwriteOption":"overwrite"}"#
            )
        );
    }
}
