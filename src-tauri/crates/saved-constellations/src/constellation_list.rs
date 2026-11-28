//! The saved constellations in the order a person arranged them, each with how many members it
//! keeps. A member that points at an ontology node and one that points at a source or a wiki page
//! are counted apart; neither count says the node is current or the page is accepted.

use std::cmp::Ordering;
use std::collections::HashMap;

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use serde::Serialize;

use crate::collections_validation::{Collections, Folder};

/// What a constellation's purpose says: recorded when the person wrote one, else unknown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum Purpose {
    Recorded { status: &'static str, value: String },
    Unknown { status: &'static str },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Constellation {
    pub id: String,
    pub name: String,
    pub purpose: Purpose,
    pub order: u64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(rename = "memberCount")]
    pub member_count: usize,
    #[serde(rename = "ontologyMemberCount")]
    pub ontology_member_count: usize,
    #[serde(rename = "referenceMemberCount")]
    pub reference_member_count: usize,
}

fn purpose_of(purpose: Option<&str>) -> Purpose {
    match purpose.map(trim).filter(|text| !text.is_empty()) {
        Some(value) => Purpose::Recorded {
            status: "recorded",
            value: value.to_string(),
        },
        None => Purpose::Unknown { status: "unknown" },
    }
}

fn arranged(left: &Folder, right: &Folder) -> Ordering {
    left.order
        .cmp(&right.order)
        .then_with(|| compare_text(&left.name, &right.name))
        .then_with(|| compare_text(&left.id, &right.id))
}

/// Every constellation of `collections`: by order, then name, then id.
pub fn list_constellations(collections: &Collections) -> Vec<Constellation> {
    let mut members: HashMap<&str, (usize, usize)> = HashMap::new();
    for item in &collections.items {
        if let Some(folder) = item.folder_id.as_deref() {
            let counts = members.entry(folder).or_default();
            counts.0 += 1;
            counts.1 += usize::from(item.ontology);
        }
    }
    let mut folders: Vec<&Folder> = collections
        .folders
        .iter()
        .filter(|folder| folder.constellation.is_some())
        .collect();
    folders.sort_by(|left, right| arranged(left, right));
    folders
        .into_iter()
        .filter_map(|folder| {
            let facts = folder.constellation.as_ref()?;
            let (all, ontology) = members.get(folder.id.as_str()).copied().unwrap_or_default();
            Some(Constellation {
                id: folder.id.clone(),
                name: trim(&folder.name).to_string(),
                purpose: purpose_of(facts.purpose.as_deref()),
                order: folder.order,
                created_at: facts.created_at.clone(),
                updated_at: facts.updated_at.clone(),
                member_count: all,
                ontology_member_count: ontology,
                reference_member_count: all - ontology,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collections_validation::{validate, Collections};

    fn collections(text: &str) -> Collections {
        let value: serde_json::Value = serde_json::from_str(text).expect("json");
        validate(value.as_object().expect("object")).expect("valid")
    }

    #[test]
    fn constellations_come_by_order_then_name_with_trimmed_text_and_member_counts() {
        let made = |id: &str, name: &str, order: u32, purpose: &str| {
            format!(
                r#"{{"id":"1f6c0b1a-8f2e-4c3a-9d5e-00000000000{id}","name":"{name}","parentId":null,"order":{order},"presentation":"constellation"{purpose},"createdAt":"2026-02-01T00:00:00.000Z","updatedAt":"2026-02-01T00:00:00.000Z"}}"#
            )
        };
        let plain = r#"{"id":"1f6c0b1a-8f2e-4c3a-9d5e-000000000009","name":"Plain","parentId":null,"order":0}"#;
        let folders = [
            made("1", " Beta ", 1, r#","purpose":"  Why  ""#),
            made("2", "Alpha", 1, r#","purpose":"   ""#),
            made("3", "First", 0, ""),
            plain.to_string(),
        ]
        .join(",");
        let item = |id: u32, folder: &str, target: &str| {
            format!(
                r#"{{"id":"2f6c0b1a-8f2e-4c3a-9d5e-00000000000{id}","folderId":"1f6c0b1a-8f2e-4c3a-9d5e-00000000000{folder}","label":"x","order":0,"target":{target}}}"#
            )
        };
        let items = [
            item(1, "1", r#"{"kind":"ontology","uid":"3f6c0b1a-8f2e-4c3a-9d5e-000000000001","lastKnownPath":"a.md"}"#),
            item(2, "1", r#"{"kind":"wiki","path":"wiki/a.md"}"#),
            item(3, "9", r#"{"kind":"source","path":"s.md"}"#),
        ]
        .join(",");
        let listed = list_constellations(&collections(&format!(
            r#"{{"folders":[{folders}],"items":[{items}]}}"#
        )));
        let names: Vec<&str> = listed.iter().map(|row| row.name.as_str()).collect();
        // Names are compared as written, so the padded " Beta " comes before "Alpha".
        assert_eq!(names, ["First", "Beta", "Alpha"]);
        assert_eq!(listed[2].purpose, Purpose::Unknown { status: "unknown" });
        assert_eq!(
            listed[1].purpose,
            Purpose::Recorded {
                status: "recorded",
                value: "Why".to_string()
            }
        );
        assert_eq!(
            (
                listed[1].member_count,
                listed[1].ontology_member_count,
                listed[1].reference_member_count
            ),
            (2, 1, 1)
        );
    }
}
