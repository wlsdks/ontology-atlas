//! Which frontmatter key holds which relation, and how a stored reference is matched to the node
//! it names. One edge is one edge however it was written: `depends_on:` is an alias of
//! `dependencies:`, a reference may be a last segment or a declared alias, and `contains` between
//! kinds that have a typed list is stored in that list.

use answer_format::whitespace::trim;

use crate::new_node::array_defaults;
use crate::node_fields::{FieldPatch, NodeFields};
use crate::setting::Setting;

/// The relation types a write may name.
pub const WRITE_RELATION_TYPES: [&str; 8] = [
    "depends_on",
    "relates",
    "contains",
    "describes",
    "domains",
    "capabilities",
    "elements",
    "domain",
];

/// The frontmatter key a relation type is stored under.
pub fn relation_key(relation_type: &str) -> Option<&'static str> {
    Some(match relation_type {
        "depends_on" => "dependencies",
        "relates" => "relates",
        "contains" => "contains",
        "describes" => "describes",
        "domains" => "domains",
        "capabilities" => "capabilities",
        "elements" => "elements",
        "domain" => "domain",
        _ => return None,
    })
}

/// Which node a name means. The server answers from the vault's documents.
pub trait NameResolver {
    fn resolve(&self, name: &str) -> Option<String>;
}

impl<F: Fn(&str) -> Option<String>> NameResolver for F {
    fn resolve(&self, name: &str) -> Option<String> {
        self(name)
    }
}

fn alias_keys(key: &str) -> &'static [&'static str] {
    if key == "dependencies" {
        &["depends_on"]
    } else {
        &[]
    }
}

/// The entries of a relation list under its key and its aliases, as written.
pub fn refs_for(fields: &NodeFields, key: &str) -> Vec<Setting> {
    std::iter::once(key)
        .chain(alias_keys(key).iter().copied())
        .filter_map(|name| match fields.get(name) {
            Some(Setting::List(items)) => Some(items.clone()),
            _ => None,
        })
        .flatten()
        .collect()
}

fn ref_matches(resolver: &dyn NameResolver, stored: &Setting, canonical: &str) -> bool {
    let Setting::Text(text) = stored else {
        return false;
    };
    let candidate = trim(text);
    if candidate.is_empty() {
        return false;
    }
    candidate == canonical || resolver.resolve(candidate).as_deref() == Some(canonical)
}

pub fn exists(fields: &NodeFields, key: &str, canonical: &str, resolver: &dyn NameResolver) -> bool {
    if key == "domain" {
        return fields
            .get("domain")
            .is_some_and(|stored| ref_matches(resolver, stored, canonical));
    }
    refs_for(fields, key)
        .iter()
        .any(|stored| ref_matches(resolver, stored, canonical))
}

/// `refs` without the entries that name `canonical`.
pub fn without_target(refs: Vec<Setting>, canonical: &str, resolver: &dyn NameResolver) -> Vec<Setting> {
    refs.into_iter()
        .filter(|stored| !ref_matches(resolver, stored, canonical))
        .collect()
}

/// The patch that sets a relation list and folds its alias spelling into the canonical key. A list
/// emptied by a removal is written as creation writes that key: kept as `[]` for a list the kind
/// always carries, otherwise the key goes.
pub fn key_patch(fields: &NodeFields, key: &str, next: Vec<Setting>) -> FieldPatch {
    let value = if next.is_empty() {
        let kind = fields.text("kind").unwrap_or_default();
        if array_defaults(kind).contains(&key) {
            Setting::List(Vec::new())
        } else {
            Setting::Null
        }
    } else {
        Setting::List(next)
    };
    let mut patch = vec![(key.to_string(), value)];
    for alias in alias_keys(key) {
        if fields.get(alias).is_some() {
            patch.push(((*alias).to_string(), Setting::Null));
        }
    }
    patch
}

/// The keys of a `relation_notes` map that name `canonical`.
pub fn matching_note_keys(
    notes: &[(String, Setting)],
    canonical: &str,
    resolver: &dyn NameResolver,
) -> Vec<String> {
    notes
        .iter()
        .filter(|(key, _)| ref_matches(resolver, &Setting::Text(key.clone()), canonical))
        .map(|(key, _)| key.clone())
        .collect()
}

/// The typed list `contains` stands for between two kinds, when they have one: a project holds
/// domains, a domain holds capabilities, so the edge is written in the vocabulary of the lists.
pub fn typed_containment(from_kind: Option<&str>, to_kind: Option<&str>) -> Option<&'static str> {
    let holders: &[&str] = match to_kind? {
        "domain" => &["project"],
        "capability" => &["project", "domain"],
        "element" => &["project", "domain", "capability"],
        _ => return None,
    };
    let list = match to_kind? {
        "domain" => "domains",
        "capability" => "capabilities",
        _ => "elements",
    };
    holders.contains(&from_kind?).then_some(list)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contains_between_kinds_with_a_typed_list_is_stored_in_that_list() {
        assert_eq!(typed_containment(Some("project"), Some("domain")), Some("domains"));
        assert_eq!(typed_containment(Some("domain"), Some("capability")), Some("capabilities"));
        assert_eq!(typed_containment(Some("capability"), Some("element")), Some("elements"));
        assert_eq!(typed_containment(Some("element"), Some("domain")), None);
        assert_eq!(typed_containment(Some("domain"), Some("document")), None);
        assert_eq!(typed_containment(None, Some("domain")), None);
    }

    #[test]
    fn a_removal_leaves_the_list_as_creation_would_and_folds_the_alias() {
        let fields = NodeFields::from_entries(vec![
            ("kind".into(), Setting::text("domain")),
            ("depends_on".into(), Setting::texts(["x"])),
        ]);
        let patch = key_patch(&fields, "dependencies", Vec::new());
        assert_eq!(
            patch,
            vec![
                ("dependencies".to_string(), Setting::Null),
                ("depends_on".to_string(), Setting::Null)
            ]
        );
        let capabilities = key_patch(&fields, "capabilities", Vec::new());
        assert_eq!(capabilities, vec![("capabilities".to_string(), Setting::List(Vec::new()))]);
    }
}
