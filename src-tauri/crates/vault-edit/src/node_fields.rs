//! The keys of one node as a write holds them: in file order, each with its setting. A patch is
//! applied here to learn what the node would be (its identity, its kind) before any line is
//! changed.

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use vault_document::frontmatter::Frontmatter;
use vault_document::schema::GRAPH_ARRAY_KEYS;

use crate::setting::Setting;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct NodeFields(Vec<(String, Setting)>);

impl NodeFields {
    pub fn from_frontmatter(frontmatter: &Frontmatter) -> Self {
        Self(
            frontmatter
                .iter()
                .map(|(key, value)| (key.as_str().to_string(), Setting::from(value)))
                .collect(),
        )
    }

    pub fn from_entries(entries: Vec<(String, Setting)>) -> Self {
        Self(entries)
    }

    pub fn entries(&self) -> &[(String, Setting)] {
        &self.0
    }

    pub fn get(&self, key: &str) -> Option<&Setting> {
        self.0.iter().find(|(held, _)| held == key).map(|(_, value)| value)
    }

    pub fn text(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(Setting::as_text)
    }

    /// Sets `key` where it already sits, or after the last key.
    pub fn set(&mut self, key: &str, value: Setting) {
        match self.0.iter_mut().find(|(held, _)| held == key) {
            Some((_, held)) => *held = value,
            None => self.0.push((key.to_string(), value)),
        }
    }

    pub fn remove(&mut self, key: &str) {
        self.0.retain(|(held, _)| held != key);
    }

    /// `frontmatter.kind` when it is a non-blank text: what makes a file a node.
    pub fn node_kind(&self) -> Option<&str> {
        self.text("kind").filter(|kind| !trim(kind).is_empty())
    }

    pub fn has_settled_uid(&self) -> bool {
        self.text("uid").is_some_and(|uid| !trim(uid).is_empty())
    }
}

/// A reference list as it is stored: each name trimmed, blanks and repeats dropped, in the one
/// order every list uses; anything that is not a name follows, as it was.
pub fn normalized_references(items: &[Setting]) -> Setting {
    let mut names: Vec<String> = Vec::new();
    let mut others: Vec<Setting> = Vec::new();
    for item in items {
        match item {
            Setting::Text(text) => {
                let name = trim(text);
                if !name.is_empty() && !names.iter().any(|seen| seen == name) {
                    names.push(name.to_string());
                }
            }
            other => others.push(other.clone()),
        }
    }
    names.sort_by(|left, right| compare_text(left, right));
    Setting::List(
        names
            .into_iter()
            .map(Setting::Text)
            .chain(others)
            .collect(),
    )
}

/// What a patch value is once stored: a graph relation list is normalized, anything else is as
/// sent.
pub fn stored_setting(key: &str, value: Setting) -> Setting {
    match value {
        Setting::List(items) if GRAPH_ARRAY_KEYS.contains(&key) => normalized_references(&items),
        other => other,
    }
}

/// A patch: `Null` removes a key, anything else sets it.
pub type FieldPatch = Vec<(String, Setting)>;

/// The node after `patch`, without touching any line.
pub fn patched(fields: &NodeFields, patch: &FieldPatch) -> NodeFields {
    let mut next = fields.clone();
    for (key, value) in patch {
        match value {
            Setting::Null => next.remove(key),
            other => next.set(key, stored_setting(key, other.clone())),
        }
    }
    next
}
