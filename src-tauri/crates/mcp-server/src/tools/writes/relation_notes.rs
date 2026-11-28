//! The note kept beside an edge: the `relation_notes` map of a node.

use vault_edit::{NodeFields, Setting};

/// The `relation_notes` map of a node, as written.
pub fn notes_of(fields: &NodeFields) -> Vec<(String, Setting)> {
    match fields.get("relation_notes") {
        Some(Setting::Map(members)) => members.clone(),
        _ => Vec::new(),
    }
}

/// `notes` as a patch value: no notes is no key.
pub fn notes_value(notes: Vec<(String, Setting)>) -> Setting {
    if notes.is_empty() {
        Setting::Null
    } else {
        Setting::Map(notes)
    }
}

pub fn set_note(notes: &mut Vec<(String, Setting)>, target: &str, why: &str) {
    match notes.iter_mut().find(|(held, _)| held == target) {
        Some((_, held)) => *held = Setting::text(why),
        None => notes.push((target.to_string(), Setting::text(why))),
    }
}
