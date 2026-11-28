//! The one line a person reads to decide: what a write will do to the vault.
//!
//! The words are the JavaScript server's, which clients and the app's permission card already show.
//! Every value an agent sent is spelled through [`shown`], so a control character in a slug cannot
//! reshape the card; the JavaScript server forgot that for the slug of a one-row batch.

use answer_format::json::quote;

use super::shown_text::shown;
use crate::arguments::Arguments;
use crate::raw_json::string_member;
use crate::write_tool::WriteTool;

/// What the agent sent, read the way the card needs it: a value of another type is no value.
struct Sent<'a>(&'a Arguments);

impl Sent<'_> {
    /// A string argument, spelled safely; empty is a string.
    fn text(&self, key: &str) -> Option<String> {
        self.0.string(key).map(|value| shown(&value))
    }

    /// A string argument that is not empty, the way a JavaScript `if (value)` reads it.
    fn named(&self, key: &str) -> Option<String> {
        self.text(key).filter(|value| !value.is_empty())
    }

    /// A string argument written as JSON, so a path shows its quotes.
    fn quoted(&self, key: &str) -> Option<String> {
        self.0.string(key).map(|value| shown(&quote(&value)))
    }

    fn count(&self, key: &str) -> Option<usize> {
        self.0.elements(key).map(|rows| rows.len())
    }
}

/// What `tool` will do, called with `arguments`, in one line without a final stop.
pub fn summary(tool: WriteTool, arguments: &Arguments) -> String {
    let sent = Sent(arguments);
    match tool {
        WriteTool::AddConcept => match sent.named("slug") {
            Some(slug) => format!("Create concept {slug}"),
            None => "Create one concept".to_string(),
        },
        WriteTool::AddConcepts => create_concepts(&sent),
        WriteTool::AddRelation => match (sent.named("from"), sent.named("to")) {
            (Some(from), Some(to)) => format!("Link {from} \u{2192} {to}"),
            _ => "Add one relation".to_string(),
        },
        WriteTool::AddRelations => add_relations(&sent),
        WriteTool::RemoveRelation => match (sent.named("from"), sent.named("to")) {
            (Some(from), Some(to)) => format!("Remove the link {from} \u{2192} {to}"),
            _ => "Remove one relation".to_string(),
        },
        WriteTool::PatchConcept => match sent.named("slug") {
            Some(slug) => format!("Edit concept {slug}"),
            None => "Edit one concept".to_string(),
        },
        WriteTool::RenameConcept => match (sent.text("oldSlug"), sent.text("newSlug")) {
            (Some(old), Some(new)) => format!("Rename {old} \u{2192} {new}"),
            _ => "Rename one concept".to_string(),
        },
        WriteTool::MergeConcepts => match (sent.text("fromSlug"), sent.text("intoSlug")) {
            (Some(from), Some(into)) => format!("Merge {from} into {into}"),
            _ => "Merge concepts".to_string(),
        },
        WriteTool::DeleteConcept => match sent.named("slug") {
            Some(slug) => format!("Delete concept {slug}"),
            None => "Delete one concept".to_string(),
        },
        WriteTool::AbsorbDocument => match sent.quoted("filePath") {
            Some(path) => format!("Absorb {path} into typed nodes"),
            None => "Absorb a document into typed nodes".to_string(),
        },
        WriteTool::ConnectProjectSource => connect_project_source(&sent),
        WriteTool::FinalizeProjectMeaning => finalize_project_meaning(&sent),
        #[cfg(feature = "test-hooks")]
        WriteTool::TestWrite => "Write one test file".to_string(),
    }
}

fn create_concepts(sent: &Sent<'_>) -> String {
    let rows = sent.0.elements("concepts");
    let only = match rows.as_deref() {
        Some([row]) => string_member(row, "slug")
            .map(|slug| shown(&slug))
            .filter(|slug| !slug.is_empty()),
        _ => None,
    };
    match (only, sent.count("concepts")) {
        (Some(slug), _) => format!("Create concept {slug}"),
        (None, None) => "Create concepts".to_string(),
        (None, Some(count)) => format!("Create {count} concept(s)"),
    }
}

fn add_relations(sent: &Sent<'_>) -> String {
    let rows = sent.0.elements("relations");
    let only = match rows.as_deref() {
        Some([row]) => string_member(row, "from").zip(string_member(row, "to")),
        _ => None,
    };
    match (only, sent.count("relations")) {
        (Some((from, to)), _) => format!("Link {} \u{2192} {}", shown(&from), shown(&to)),
        (None, None) => "Add relations".to_string(),
        (None, Some(count)) => format!("Add {count} relation(s)"),
    }
}

fn connect_project_source(sent: &Sent<'_>) -> String {
    let Some(project) = sent.text("projectSlug") else {
        return "Connect a source folder to this vault".to_string();
    };
    match sent.quoted("rootPath") {
        Some(root) => format!("Connect {project} to the source folder {root}"),
        None => {
            format!("Connect {project} to the source folder inferred from this vault's location")
        }
    }
}

fn finalize_project_meaning(sent: &Sent<'_>) -> String {
    let project = sent
        .text("projectSlug")
        .unwrap_or_else(|| "the project".to_string());
    let receipt = format!(
        "re-measure the source folder connected to {project} and write its project meaning receipt"
    );
    if sent.0.elements("answers").is_some() {
        format!("Write the competency answers section of {project}, {receipt}")
    } else {
        let mut capitalised = receipt.chars();
        match capitalised.next() {
            Some(first) => format!("{}{}", first.to_uppercase(), capitalised.as_str()),
            None => receipt,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(text: &str) -> Arguments {
        Arguments::from_fields(serde_json::from_str(text).expect("arguments"))
    }

    fn said(tool: WriteTool, text: &str) -> String {
        summary(tool, &arguments(text))
    }

    /// Each expected line is what the JavaScript server's `describeWrite` returns for the call.
    #[test]
    fn each_tool_says_what_it_will_do_in_the_words_the_card_already_shows() {
        use WriteTool::*;
        let cases: &[(WriteTool, &str, &str)] = &[
            (AddConcepts, r#"{"concepts":[{"slug":"elements/a","kind":"element","title":"A"}]}"#, "Create concept elements/a"),
            (AddConcepts, r#"{"concepts":[{"kind":"element"}]}"#, "Create 1 concept(s)"),
            (AddConcepts, r#"{"concepts":[{"slug":"a"},{"slug":"b"}]}"#, "Create 2 concept(s)"),
            (AddConcepts, r#"{"concepts":[]}"#, "Create 0 concept(s)"),
            (AddConcepts, r#"{"concepts":"x"}"#, "Create concepts"),
            (AddConcept, r#"{"slug":"s"}"#, "Create concept s"),
            (AddConcept, r#"{"slug":""}"#, "Create one concept"),
            (AddRelations, r#"{"relations":[{"from":"a","to":"b"}]}"#, "Link a \u{2192} b"),
            (AddRelations, r#"{"relations":[{"from":"a"},{"from":"b"}]}"#, "Add 2 relation(s)"),
            (AddRelations, r#"{}"#, "Add relations"),
            (AddRelation, r#"{"from":"a","to":"b"}"#, "Link a \u{2192} b"),
            (AddRelation, r#"{"from":"a"}"#, "Add one relation"),
            (RemoveRelation, r#"{"from":"a","to":"b"}"#, "Remove the link a \u{2192} b"),
            (RemoveRelation, r#"{"from":5,"to":"b"}"#, "Remove one relation"),
            (PatchConcept, r#"{"slug":"s"}"#, "Edit concept s"),
            (RenameConcept, r#"{"oldSlug":"a","newSlug":"b"}"#, "Rename a \u{2192} b"),
            (MergeConcepts, r#"{"fromSlug":"a","intoSlug":"b"}"#, "Merge a into b"),
            (DeleteConcept, r#"{}"#, "Delete one concept"),
            (AbsorbDocument, r#"{"filePath":"/tmp/a b.md"}"#, "Absorb \"/tmp/a b.md\" into typed nodes"),
            (ConnectProjectSource, r#"{}"#, "Connect a source folder to this vault"),
            (ConnectProjectSource, r#"{"projectSlug":"p"}"#, "Connect p to the source folder inferred from this vault's location"),
            (ConnectProjectSource, r#"{"projectSlug":"p","rootPath":"/r"}"#, "Connect p to the source folder \"/r\""),
            (FinalizeProjectMeaning, r#"{"projectSlug":"p"}"#, "Re-measure the source folder connected to p and write its project meaning receipt"),
            (FinalizeProjectMeaning, r#"{"answers":[]}"#, "Write the competency answers section of the project, re-measure the source folder connected to the project and write its project meaning receipt"),
            (FinalizeProjectMeaning, r#"{"projectSlug":"p","answers":[{}]}"#, "Write the competency answers section of p, re-measure the source folder connected to p and write its project meaning receipt"),
        ];
        for (tool, call, expected) in cases {
            assert_eq!(said(*tool, call), *expected, "{} {call}", tool.name());
        }
    }

    #[test]
    fn a_hidden_character_in_any_value_is_spelled_out_never_shown_as_a_line_break() {
        assert_eq!(
            said(WriteTool::AddConcepts, r#"{"concepts":[{"slug":"a\nb"}]}"#),
            "Create concept a\\u{a}b"
        );
        assert_eq!(
            said(
                WriteTool::AddRelations,
                r#"{"relations":[{"from":"a\u2028","to":"b"}]}"#
            ),
            "Link a\\u{2028} \u{2192} b"
        );
        assert_eq!(
            said(WriteTool::AbsorbDocument, r#"{"filePath":"x\ny"}"#),
            "Absorb \"x\\ny\" into typed nodes",
            "a path is written as JSON, which already spells a line break"
        );
        assert_eq!(
            said(
                WriteTool::RenameConcept,
                r#"{"oldSlug":"a\u202eb","newSlug":"c"}"#
            ),
            "Rename a\\u{202e}b \u{2192} c"
        );
    }
}
