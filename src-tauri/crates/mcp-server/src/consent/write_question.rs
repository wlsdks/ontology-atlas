//! The one line a person reads to decide: what a write will do to the vault.
//!
//! The words are the JavaScript server's, which clients and the app's permission card already show,
//! except where that card said less than the write does (spec rows 130, 131 and 136).
//! Every value an agent sent is spelled through [`shown`], so a control character in a slug cannot
//! reshape the card; the JavaScript server forgot that for the slug of a one-row batch.

use answer_format::json::quote;
use confined_files::AbsorbedPlace;

use super::shown_text::shown;
use crate::arguments::Arguments;
use crate::raw_json::{string_member, Kind};
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

/// What `tool` will do, called with `arguments`, in one line without a final stop. `absorbed` is
/// where the file an `absorb_document` call names really is: the card shows that, not the name the
/// agent typed, which can be a link to somewhere else.
pub fn summary(tool: WriteTool, arguments: &Arguments, absorbed: Option<&AbsorbedPlace>) -> String {
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
        WriteTool::RemoveRelation => remove_relation(&sent),
        WriteTool::PatchConcept => edit_concepts(&sent),
        WriteTool::RenameConcept => rename_concept(&sent),
        WriteTool::MergeConcepts => match (sent.text("fromSlug"), sent.text("intoSlug")) {
            (Some(from), Some(into)) => format!("Merge {from} into {into}"),
            _ => "Merge concepts".to_string(),
        },
        WriteTool::DeleteConcept => match sent.named("slug") {
            Some(slug) => format!("Delete concept {slug}"),
            None => "Delete one concept".to_string(),
        },
        WriteTool::AbsorbDocument => absorb_document(&sent, absorbed),
        WriteTool::ConnectProjectSource => connect_project_source(&sent),
        WriteTool::DisconnectProjectSource => {
            "Disconnect a source folder from this vault".to_string()
        }
        WriteTool::FinalizeProjectMeaning => finalize_project_meaning(&sent),
        #[cfg(feature = "test-hooks")]
        WriteTool::TestWrite => "Write one test file".to_string(),
    }
}

/// `absorb_document` rewrites a file, so the card names the file it will really rewrite, and says
/// when that file is not in the repository.
fn absorb_document(sent: &Sent<'_>, absorbed: Option<&AbsorbedPlace>) -> String {
    let Some(typed) = sent.0.string("filePath") else {
        return "Absorb a document into typed nodes".to_string();
    };
    match absorbed {
        Some(place) => {
            let path = shown(&quote(&place.path().to_string_lossy()));
            let outside = if place.is_outside_repository() {
                " (outside the repository)"
            } else {
                ""
            };
            format!("Absorb {path}{outside} into typed nodes")
        }
        None => format!("Absorb {} into typed nodes", shown(&quote(&typed))),
    }
}

/// `remove_relation` removes one link, or with `replaceWith` swaps its target for another.
fn remove_relation(sent: &Sent<'_>) -> String {
    let (from, to) = (sent.named("from"), sent.named("to"));
    let Some(replacement) = sent
        .0
        .get("replaceWith")
        .filter(|raw| matches!(Kind::of(raw), Kind::Object | Kind::Array))
    else {
        return match (from, to) {
            (Some(from), Some(to)) => format!("Remove the link {from} \u{2192} {to}"),
            _ => "Remove one relation".to_string(),
        };
    };
    match (from, to, string_member(replacement, "to")) {
        (Some(from), Some(to), Some(new_to)) => {
            let new_to = shown(&new_to);
            format!("Replace the link {from} \u{2192} {to} with {from} \u{2192} {new_to}")
        }
        _ => "Replace one relation".to_string(),
    }
}

/// `rename_concept` renames a concept, or with `newKind` changes its kind. A rename with
/// `overwrite` replaces a concept already at the new name. A kind change may also move it
/// (`newSlug`), set or remove its domain and replace its body, and the card names each of them as
/// the handler does it: a capability or an element takes the `domain` sent, any other kind loses
/// the one it had, and a body left out is regenerated when it is still the generated starter.
fn rename_concept(sent: &Sent<'_>) -> String {
    if sent.0.get("newKind").is_none() {
        let overwrites = sent.0.get("overwrite").is_some_and(|raw| raw.get() == "true");
        return match (sent.text("oldSlug"), sent.text("newSlug")) {
            (Some(old), Some(new)) if overwrites => {
                format!("Rename {old} \u{2192} {new}, replacing {new} if it exists")
            }
            (Some(old), Some(new)) => format!("Rename {old} \u{2192} {new}"),
            _ => "Rename one concept".to_string(),
        };
    }
    let Some(old) = sent.text("oldSlug") else {
        return "Change one concept kind".to_string();
    };
    let kind = match sent.text("newKind") {
        Some(kind) => format!("Change the kind of {old} to {kind}"),
        None => format!("Change the kind of {old}"),
    };
    let mut also = Vec::new();
    if let Some(new) = sent.text("newSlug") {
        also.push(format!("rename it to {new}"));
    }
    if let Some(new_kind) = sent.0.string("newKind") {
        if matches!(new_kind.as_str(), "capability" | "element") {
            if let Some(domain) = sent.named("domain") {
                also.push(format!("set its domain to {domain}"));
            }
        } else {
            also.push("remove its domain if it has one".to_string());
        }
        also.push(if sent.text("body").is_some() {
            "replace its body".to_string()
        } else {
            "replace its body if it is still the generated starter".to_string()
        });
    }
    match also.split_last() {
        None => kind,
        Some((last, [])) => format!("{kind} and {last}"),
        Some((last, rest)) => format!("{kind}, {} and {last}", rest.join(", ")),
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

fn edit_concepts(sent: &Sent<'_>) -> String {
    let Some(count) = sent.count("patches") else {
        return match sent.named("slug") {
            Some(slug) => format!("Edit concept {slug}"),
            None => "Edit one concept".to_string(),
        };
    };
    let rows = sent.0.elements("patches");
    let only = match rows.as_deref() {
        Some([row]) => string_member(row, "slug").map(|slug| shown(&slug)),
        _ => None,
    };
    match only {
        Some(slug) if count == 1 => format!("Edit concept {slug}"),
        _ => format!("Edit {count} concept(s)"),
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
    use confined_files::AbsorbRepository;

    use super::*;

    fn arguments(text: &str) -> Arguments {
        Arguments::from_fields(serde_json::from_str(text).expect("arguments"))
    }

    fn said(tool: WriteTool, text: &str) -> String {
        summary(tool, &arguments(text), None)
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
            (RemoveRelation, r#"{"from":"a","to":"b","replaceWith":{"to":"c"}}"#, "Replace the link a \u{2192} b with a \u{2192} c"),
            (RemoveRelation, r#"{"from":"a","to":"b","replaceWith":{}}"#, "Replace one relation"),
            (RemoveRelation, r#"{"from":"a","to":"b","replaceWith":null}"#, "Remove the link a \u{2192} b"),
            (PatchConcept, r#"{"slug":"s"}"#, "Edit concept s"),
            (RenameConcept, r#"{"oldSlug":"a","newSlug":"b"}"#, "Rename a \u{2192} b"),
            (RenameConcept, r#"{"oldSlug":"a"}"#, "Rename one concept"),
            (RenameConcept, r#"{"oldSlug":"a","newSlug":"b","overwrite":true}"#, "Rename a \u{2192} b, replacing b if it exists"),
            (RenameConcept, r#"{"oldSlug":"a","newSlug":"b","overwrite":false}"#, "Rename a \u{2192} b"),
            (RenameConcept, r#"{"oldSlug":"a","newKind":"domain"}"#, "Change the kind of a to domain, remove its domain if it has one and replace its body if it is still the generated starter"),
            (RenameConcept, r#"{"newKind":"domain"}"#, "Change one concept kind"),
            (RenameConcept, r#"{"oldSlug":"a","newKind":"element","domain":"d","newSlug":"b"}"#, "Change the kind of a to element, rename it to b, set its domain to d and replace its body if it is still the generated starter"),
            (RenameConcept, r#"{"oldSlug":"a","newKind":"element","domain":"d","body":"x"}"#, "Change the kind of a to element, set its domain to d and replace its body"),
            (RenameConcept, r#"{"oldSlug":"a","newKind":"capability","newSlug":"b","domain":"d","body":""}"#, "Change the kind of a to capability, rename it to b, set its domain to d and replace its body"),
            (RenameConcept, r#"{"oldSlug":"a","newKind":"domain","domain":"d"}"#, "Change the kind of a to domain, remove its domain if it has one and replace its body if it is still the generated starter"),
            (RenameConcept, r#"{"oldSlug":"a","newKind":"domain","domain":null,"body":"x"}"#, "Change the kind of a to domain, remove its domain if it has one and replace its body"),
            (RenameConcept, r#"{"oldSlug":"a","newKind":"capability"}"#, "Change the kind of a to capability and replace its body if it is still the generated starter"),
            (MergeConcepts, r#"{"fromSlug":"a","intoSlug":"b"}"#, "Merge a into b"),
            (DeleteConcept, r#"{}"#, "Delete one concept"),
            (AbsorbDocument, r#"{"filePath":"/tmp/a b.md"}"#, "Absorb \"/tmp/a b.md\" into typed nodes"),
            (ConnectProjectSource, r#"{}"#, "Connect a source folder to this vault"),
            (ConnectProjectSource, r#"{"projectSlug":"p"}"#, "Connect p to the source folder inferred from this vault's location"),
            (ConnectProjectSource, r#"{"projectSlug":"p","rootPath":"/r"}"#, "Connect p to the source folder \"/r\""),
            (DisconnectProjectSource, r#"{}"#, "Disconnect a source folder from this vault"),
            (FinalizeProjectMeaning, r#"{"projectSlug":"p"}"#, "Re-measure the source folder connected to p and write its project meaning receipt"),
            (FinalizeProjectMeaning, r#"{"answers":[]}"#, "Write the competency answers section of the project, re-measure the source folder connected to the project and write its project meaning receipt"),
            (FinalizeProjectMeaning, r#"{"projectSlug":"p","answers":[{}]}"#, "Write the competency answers section of p, re-measure the source folder connected to p and write its project meaning receipt"),
        ];
        for (tool, call, expected) in cases {
            assert_eq!(said(*tool, call), *expected, "{} {call}", tool.name());
        }
    }

    fn folder() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("card-")
            .tempdir()
            .expect("temporary folder")
    }

    fn absorb_card(repository: &std::path::Path, typed: &std::path::Path) -> String {
        let call = format!(r#"{{"filePath":{}}}"#, quote(&typed.to_string_lossy()));
        let place = AbsorbedPlace::locate(&typed.to_string_lossy(), AbsorbRepository::Grounded(repository)).ok();
        summary(WriteTool::AbsorbDocument, &arguments(&call), place.as_ref())
    }

    #[test]
    fn the_absorb_card_shows_the_file_it_will_rewrite_and_says_when_it_is_outside_the_repository() {
        let repository = folder();
        let elsewhere = folder();
        let inside = repository.path().join("AGENTS.md");
        let outside = elsewhere.path().join("notes.md");
        std::fs::write(&inside, "# A\n").expect("fixture");
        std::fs::write(&outside, "# N\n").expect("fixture");
        let real = |path: &std::path::Path| {
            quote(&confined_files::real_path(path).expect("real path").to_string_lossy())
        };
        assert_eq!(
            absorb_card(repository.path(), &inside),
            format!("Absorb {} into typed nodes", real(&inside))
        );
        assert_eq!(
            absorb_card(repository.path(), &outside),
            format!("Absorb {} (outside the repository) into typed nodes", real(&outside))
        );
        #[cfg(unix)]
        {
            let link = repository.path().join("looks-inside.md");
            std::os::unix::fs::symlink(&outside, &link).expect("link");
            assert_eq!(
                absorb_card(repository.path(), &link),
                format!("Absorb {} (outside the repository) into typed nodes", real(&outside)),
                "a link in the repository is shown as the file it leads to"
            );
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
