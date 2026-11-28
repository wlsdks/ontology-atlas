//! Judging the parsed collection document as the script server did: the same checks in the same
//! order, so the first thing wrong is the one named, in the sentence agents were given.
//!
//! The document is read as JSON values, not as a typed struct, because each check says what a
//! value that is the wrong kind of thing means (a number where text belongs is invalid, a missing
//! `parentId` is invalid, an explicit `null` is a top-level folder).

use std::collections::{HashMap, HashSet};

use answer_format::utf16;
use answer_format::whitespace::trim;
use serde_json::{Map, Value};
use vault_document::schema::is_node_uid;

const MAX_FOLDER_NAME_UNITS: usize = 120;
const MAX_PURPOSE_UNITS: usize = 4000;
const MAX_ITEM_LABEL_UNITS: usize = 240;
/// `Number.MAX_SAFE_INTEGER`, the largest whole number a JavaScript order can be.
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

const INVALID_FOLDER: &str = "A collection folder is invalid.";
const INVALID_ITEM: &str = "A collection item is invalid.";

/// A folder of the collection file. A constellation is a folder that has a presentation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub order: u64,
    parent_id: Option<String>,
    pub constellation: Option<ConstellationFacts>,
}

/// What a constellation folder holds beyond a plain folder's name and order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstellationFacts {
    pub purpose: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// What an item is: where it is kept and whether it points at an ontology node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    pub folder_id: Option<String>,
    pub ontology: bool,
}

/// A collection file that passed every check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Collections {
    pub folders: Vec<Folder>,
    pub items: Vec<Item>,
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the number was checked to be a whole number between zero and the largest safe integer"
)]
fn safe_order(value: Option<&Value>) -> Option<u64> {
    let number = value?;
    if let Some(whole) = number.as_u64() {
        return (whole <= MAX_SAFE_INTEGER).then_some(whole);
    }
    let float = number.as_f64()?;
    (float.fract() == 0.0 && (0.0..=MAX_SAFE_INTEGER as f64).contains(&float))
        .then_some(float as u64)
}

fn text_of<'a>(fields: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    fields.get(key).and_then(Value::as_str)
}

/// `YYYY-MM-DDTHH:MM:SS` with an optional `.mmm`, then `Z`, naming a real day.
fn is_iso_instant(value: Option<&Value>) -> bool {
    let Some(text) = value.and_then(Value::as_str) else {
        return false;
    };
    has_instant_shape(text).is_some() && answer_format::iso_time::parse_iso(text).is_some()
}

fn has_instant_shape(text: &str) -> Option<()> {
    let whole = text.strip_suffix('Z')?;
    let seconds = match whole.len() {
        19 => whole,
        23 => {
            let fraction = whole.get(19..)?.strip_prefix('.')?;
            fraction
                .bytes()
                .all(|byte| byte.is_ascii_digit())
                .then_some(())?;
            whole.get(..19)?
        }
        _ => return None,
    };
    seconds
        .bytes()
        .enumerate()
        .all(|(at, byte)| match at {
            4 | 7 => byte == b'-',
            10 => byte == b'T',
            13 | 16 => byte == b':',
            _ => byte.is_ascii_digit(),
        })
        .then_some(())
}

/// A path inside the vault written one way only: `/`-separated, relative, no empty, `.` or `..`
/// part, no drive letter, backslash or control character.
fn is_exact_vault_path(value: Option<&Value>) -> bool {
    let Some(text) = value.and_then(Value::as_str) else {
        return false;
    };
    let mut characters = text.chars();
    let drive_prefix = matches!(
        (characters.next(), characters.next()),
        (Some(letter), Some(':')) if letter.is_ascii_alphabetic()
    );
    !text.is_empty()
        && !text.starts_with('/')
        && !drive_prefix
        && !text.contains('\\')
        && !text
            .chars()
            .any(|character| u32::from(character) < 0x20 || u32::from(character) == 0x7f)
        && text
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

fn folder_of(value: &Value) -> Result<Folder, String> {
    let invalid = || INVALID_FOLDER.to_string();
    let fields = value.as_object().ok_or_else(invalid)?;
    let id = text_of(fields, "id").filter(|id| is_node_uid(id));
    let name = text_of(fields, "name")
        .filter(|name| !trim(name).is_empty() && utf16::len(name) <= MAX_FOLDER_NAME_UNITS);
    // `parentId` must be written: `null` for a top-level folder, else the parent's id.
    let parent_id = match fields.get("parentId") {
        Some(Value::Null) => Some(None),
        Some(Value::String(parent)) if is_node_uid(parent) => Some(Some(parent.clone())),
        _ => None,
    };
    let (Some(id), Some(name), Some(parent_id), Some(order)) =
        (id, name, parent_id, safe_order(fields.get("order")))
    else {
        return Err(invalid());
    };
    let constellation = if text_of(fields, "presentation") == Some("constellation") {
        let purpose_fits = match fields.get("purpose") {
            None => true,
            Some(Value::String(purpose)) => utf16::len(purpose) <= MAX_PURPOSE_UNITS,
            Some(_) => false,
        };
        let (Some(created_at), Some(updated_at)) =
            (text_of(fields, "createdAt"), text_of(fields, "updatedAt"))
        else {
            return Err("A constellation folder is invalid.".to_string());
        };
        if parent_id.is_some()
            || !purpose_fits
            || !is_iso_instant(fields.get("createdAt"))
            || !is_iso_instant(fields.get("updatedAt"))
        {
            return Err("A constellation folder is invalid.".to_string());
        }
        Some(ConstellationFacts {
            purpose: text_of(fields, "purpose").map(ToString::to_string),
            created_at: created_at.to_string(),
            updated_at: updated_at.to_string(),
        })
    } else {
        let any_metadata = ["presentation", "purpose", "createdAt", "updatedAt"]
            .iter()
            .any(|key| fields.contains_key(*key));
        if any_metadata {
            return Err(
                "Constellation metadata requires the constellation presentation.".to_string(),
            );
        }
        None
    };
    Ok(Folder {
        id: id.to_string(),
        name: name.to_string(),
        order,
        parent_id,
        constellation,
    })
}

/// A folder that is its own parent, or whose chain of parents comes back to it or loops.
fn check_acyclic(folders: &[Folder], folder: &Folder) -> Result<(), String> {
    let Some(parent) = &folder.parent_id else {
        return Ok(());
    };
    if *parent == folder.id {
        return Err("A collection folder cannot contain itself.".to_string());
    }
    let by_id: HashMap<&str, &Folder> = folders
        .iter()
        .map(|each| (each.id.as_str(), each))
        .collect();
    let mut visited: HashSet<&str> = HashSet::new();
    let mut cursor = Some(parent.as_str());
    while let Some(current) = cursor {
        if current == folder.id {
            return Err("A collection folder cannot move into its descendant.".to_string());
        }
        if !visited.insert(current) {
            return Err("The collection folder hierarchy contains a cycle.".to_string());
        }
        let above = by_id
            .get(current)
            .ok_or_else(|| "The destination collection folder does not exist.".to_string())?;
        cursor = above.parent_id.as_deref();
    }
    Ok(())
}

/// The item and the key that says which target it holds, for the one-target-per-folder check.
fn item_of(value: &Value, folder_ids: &HashSet<&str>) -> Result<(String, Item, String), String> {
    let invalid = || INVALID_ITEM.to_string();
    let fields = value.as_object().ok_or_else(invalid)?;
    let id = text_of(fields, "id").filter(|id| is_node_uid(id));
    let folder_id = match fields.get("folderId") {
        Some(Value::Null) => Some(None),
        Some(Value::String(folder)) if folder_ids.contains(folder.as_str()) => {
            Some(Some(folder.clone()))
        }
        _ => None,
    };
    let label_fits = text_of(fields, "label")
        .is_some_and(|label| !trim(label).is_empty() && utf16::len(label) <= MAX_ITEM_LABEL_UNITS);
    let target = fields
        .get("target")
        .filter(|target| matches!(target, Value::Object(_) | Value::Array(_)));
    let (Some(id), Some(folder_id), true, Some(_), Some(target)) = (
        id,
        folder_id,
        label_fits,
        safe_order(fields.get("order")),
        target,
    ) else {
        return Err(invalid());
    };
    let invalid_target = || "A collection target is invalid.".to_string();
    let target = target.as_object().ok_or_else(invalid_target)?;
    let (ontology, target_key) = match text_of(target, "kind") {
        Some(kind @ ("source" | "wiki")) if is_exact_vault_path(target.get("path")) => (
            false,
            format!("{kind}:{}", text_of(target, "path").unwrap_or_default()),
        ),
        Some("ontology")
            if target
                .get("uid")
                .and_then(Value::as_str)
                .is_some_and(is_node_uid)
                && is_exact_vault_path(target.get("lastKnownPath")) =>
        {
            (
                true,
                format!("ontology:{}", text_of(target, "uid").unwrap_or_default()),
            )
        }
        _ => return Err(invalid_target()),
    };
    let placement = format!("{}\0{target_key}", folder_id.as_deref().unwrap_or("null"));
    Ok((
        id.to_string(),
        Item {
            folder_id,
            ontology,
        },
        placement,
    ))
}

/// The document's folders and items, or the sentence for the first thing wrong. The document is an
/// object of the supported schema.
pub fn validate(document: &Map<String, Value>) -> Result<Collections, String> {
    let (Some(Value::Array(folder_values)), Some(Value::Array(item_values))) =
        (document.get("folders"), document.get("items"))
    else {
        return Err("Folders and items must be arrays.".to_string());
    };
    let mut folders: Vec<Folder> = Vec::with_capacity(folder_values.len());
    let mut folder_ids: HashSet<&str> = HashSet::new();
    for value in folder_values {
        let folder = folder_of(value)?;
        let id = value.get("id").and_then(Value::as_str).unwrap_or_default();
        if !folder_ids.insert(id) {
            return Err("Collection folder IDs must be unique.".to_string());
        }
        folders.push(folder);
    }
    for folder in &folders {
        if folder
            .parent_id
            .as_deref()
            .is_some_and(|parent| !folder_ids.contains(parent))
        {
            return Err("A collection folder has a missing parent.".to_string());
        }
    }
    for folder in &folders {
        check_acyclic(&folders, folder)?;
    }
    let mut items: Vec<Item> = Vec::with_capacity(item_values.len());
    let mut item_ids: HashSet<String> = HashSet::new();
    let mut placements: HashSet<String> = HashSet::new();
    for value in item_values {
        let (id, item, placement) = item_of(value, &folder_ids)?;
        if !item_ids.insert(id) {
            return Err("Collection item IDs must be unique.".to_string());
        }
        if !placements.insert(placement) {
            return Err("The same target cannot appear twice in one folder.".to_string());
        }
        items.push(item);
    }
    Ok(Collections { folders, items })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FOLDER: &str = "1f6c0b1a-8f2e-4c3a-9d5e-000000000001";
    const OTHER: &str = "1f6c0b1a-8f2e-4c3a-9d5e-000000000002";
    const ITEM: &str = "2f6c0b1a-8f2e-4c3a-9d5e-000000000001";
    const NODE: &str = "3f6c0b1a-8f2e-4c3a-9d5e-000000000001";

    fn constellation(id: &str) -> String {
        format!(
            r#"{{"id":"{id}","name":"Week","parentId":null,"order":0,"presentation":"constellation","createdAt":"2026-02-01T00:00:00.000Z","updatedAt":"2026-02-02T00:00:00Z"}}"#
        )
    }

    fn item(id: &str, folder: &str, target: &str) -> String {
        format!(r#"{{"id":"{id}","folderId":"{folder}","label":"A","order":0,"target":{target}}}"#)
    }

    fn judged(folders: &[String], items: &[String]) -> Result<Collections, String> {
        let text = format!(
            r#"{{"folders":[{}],"items":[{}]}}"#,
            folders.join(","),
            items.join(",")
        );
        let value: Value = serde_json::from_str(&text).expect("json");
        validate(value.as_object().expect("object"))
    }

    #[test]
    fn each_way_the_file_is_wrong_is_named_in_the_sentence_agents_were_given() {
        let ontology = format!(r#"{{"kind":"ontology","uid":"{NODE}","lastKnownPath":"a/b.md"}}"#);
        let folder = || vec![constellation(FOLDER)];
        let wrong = |text: &str| text.to_string();
        let cases: Vec<(Vec<String>, Vec<String>, String)> = vec![
            (
                vec![wrong(r#"{"id":"x","name":"n","parentId":null,"order":0}"#)],
                vec![],
                wrong(INVALID_FOLDER),
            ),
            (
                // Written without `parentId`: not the same as `null`.
                vec![wrong(&format!(
                    r#"{{"id":"{FOLDER}","name":"n","order":0}}"#
                ))],
                vec![],
                wrong(INVALID_FOLDER),
            ),
            (
                vec![wrong(&format!(
                    r#"{{"id":"{FOLDER}","name":"n","parentId":null,"order":0,"purpose":"p"}}"#
                ))],
                vec![],
                wrong("Constellation metadata requires the constellation presentation."),
            ),
            (
                vec![constellation(FOLDER).replace("2026-02-01", "2026-02-30")],
                vec![],
                wrong("A constellation folder is invalid."),
            ),
            (
                vec![constellation(FOLDER), constellation(FOLDER)],
                vec![],
                wrong("Collection folder IDs must be unique."),
            ),
            (
                folder(),
                vec![item(ITEM, FOLDER, r#"{"kind":"wiki","path":"../up.md"}"#)],
                wrong("A collection target is invalid."),
            ),
            (
                folder(),
                vec![item(ITEM, OTHER, &ontology)],
                wrong(INVALID_ITEM),
            ),
            (
                folder(),
                vec![
                    item(ITEM, FOLDER, &ontology),
                    item(OTHER, FOLDER, &ontology),
                ],
                wrong("The same target cannot appear twice in one folder."),
            ),
        ];
        for (folders, items, sentence) in cases {
            assert_eq!(judged(&folders, &items).err(), Some(sentence));
        }
        let kept = judged(&folder(), &[item(ITEM, FOLDER, &ontology)]).expect("valid");
        assert_eq!(kept.items.len(), 1);
        assert!(kept.items[0].ontology);
    }

    #[test]
    fn a_folder_that_is_its_own_ancestor_is_refused_by_how() {
        let child = |id: &str, parent: &str| {
            format!(r#"{{"id":"{id}","name":"n","parentId":"{parent}","order":0}}"#)
        };
        let own = judged(&[child(FOLDER, FOLDER)], &[]);
        assert_eq!(
            own.err().as_deref(),
            Some("A collection folder cannot contain itself.")
        );
        let cycle = judged(&[child(FOLDER, OTHER), child(OTHER, FOLDER)], &[]);
        assert_eq!(
            cycle.err().as_deref(),
            Some("A collection folder cannot move into its descendant.")
        );
    }
}
