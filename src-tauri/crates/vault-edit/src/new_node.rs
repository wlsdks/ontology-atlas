//! The frontmatter a new node starts with: its identity, its name, the lists its kind always
//! carries, and the rest in the order a person reads a file (`preferred_order`).

use crate::node_fields::{normalized_references, NodeFields};
use crate::setting::Setting;

/// What a kind writes on creation.
struct KindShape {
    /// Lists written even when empty.
    array_defaults: &'static [&'static str],
    preferred_order: Vec<&'static str>,
}

const REVIEW_KEYS: [&str; 5] = [
    "review_state",
    "review_note",
    "reviewed_by",
    "reviewed_at",
    "reviewed_digest",
];

fn kind_shape(kind: &str) -> Option<KindShape> {
    let (array_defaults, middle): (&[&str], &[&str]) = match kind {
        "project" => (
            &["domains", "capabilities", "elements"],
            &["display", "description", "status", "dependencies", "domains", "capabilities", "elements"],
        ),
        "domain" => (
            &["capabilities"],
            &["display", "description", "depends_on", "capabilities"],
        ),
        "capability" => (
            &["elements"],
            &["display", "description", "domain", "depends_on", "elements", "path"],
        ),
        "element" => (&[], &["display", "description", "domain", "path", "depends_on"]),
        "document" => (&[], &["display", "describes", "relates"]),
        _ => return None,
    };
    let leading: &[&str] = &["uid", "merged_uids", "slug", "kind", "title"];
    let evidence_checked = !matches!(kind, "project" | "document");
    let mut order: Vec<&'static str> = leading.to_vec();
    order.extend_from_slice(middle);
    order.push("created_by");
    if evidence_checked {
        order.push("evidence_checked");
    }
    order.extend(REVIEW_KEYS);
    Some(KindShape {
        array_defaults,
        preferred_order: order,
    })
}

/// The lists a node of `kind` is created with even when they are empty: a relation list emptied by
/// a removal is left as creation would have left it.
pub fn array_defaults(kind: &str) -> &'static [&'static str] {
    kind_shape(kind.trim()).map_or(&[], |shape| shape.array_defaults)
}

/// The kinds `add_concepts` may create.
pub const CREATABLE_KINDS: [&str; 5] = ["project", "domain", "capability", "element", "document"];

/// A new node as the call described it.
#[derive(Debug, Clone, Default)]
pub struct NewNode {
    pub slug: String,
    pub kind: String,
    pub title: String,
    pub domain: Option<String>,
    pub domains: Option<Vec<String>>,
    pub capabilities: Option<Vec<String>>,
    pub elements: Option<Vec<String>>,
    pub path: Option<String>,
    /// `display_<locale>` keys with their names, in the order sent.
    pub display_names: Vec<(String, String)>,
    pub created_by: String,
}

fn list(names: &[String]) -> Setting {
    normalized_references(&names.iter().cloned().map(Setting::Text).collect::<Vec<_>>())
}

/// The keys of the new file in order, or `None` for a kind the format does not have.
pub fn new_node_fields(node: &NewNode, uid: &str) -> Option<NodeFields> {
    let shape = kind_shape(&node.kind)?;
    let mut accumulator = NodeFields::from_entries(vec![
        ("uid".to_string(), Setting::text(uid)),
        ("slug".to_string(), Setting::text(&node.slug)),
        ("kind".to_string(), Setting::text(&node.kind)),
        ("title".to_string(), Setting::text(&node.title)),
    ]);
    let given = |key: &str| match key {
        "domains" => node.domains.as_deref(),
        "capabilities" => node.capabilities.as_deref(),
        "elements" => node.elements.as_deref(),
        _ => None,
    };
    for key in shape.array_defaults {
        accumulator.set(key, given(key).map_or_else(|| Setting::List(Vec::new()), list));
    }
    let mut extras: Vec<(String, Setting)> = Vec::new();
    if let Some(domain) = &node.domain {
        extras.push(("domain".to_string(), Setting::text(domain)));
    }
    for key in ["domains", "capabilities", "elements"] {
        if let Some(names) = given(key) {
            extras.push((key.to_string(), list(names)));
        }
    }
    if let Some(path) = &node.path {
        extras.push(("path".to_string(), Setting::text(path)));
    }
    for (key, name) in &node.display_names {
        extras.push((key.clone(), Setting::text(name)));
    }
    extras.push(("created_by".to_string(), Setting::text(&node.created_by)));
    for (key, value) in extras {
        accumulator.set(&key, value);
    }
    let mut ordered: Vec<(String, Setting)> = Vec::new();
    for key in &shape.preferred_order {
        if let Some(value) = accumulator.get(key) {
            ordered.push(((*key).to_string(), value.clone()));
        }
        if *key == "display" {
            for (held, value) in accumulator.entries() {
                if is_locale_display(held) {
                    ordered.push((held.clone(), value.clone()));
                }
            }
        }
    }
    for (key, value) in accumulator.entries() {
        if !ordered.iter().any(|(held, _)| held == key) {
            ordered.push((key.clone(), value.clone()));
        }
    }
    Some(NodeFields::from_entries(ordered))
}

fn is_locale_display(key: &str) -> bool {
    key.strip_prefix("display_")
        .is_some_and(|locale| locale.len() == 2 && locale.bytes().all(|byte| byte.is_ascii_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(fields: &NodeFields) -> Vec<&str> {
        fields.entries().iter().map(|(key, _)| key.as_str()).collect()
    }

    #[test]
    fn a_capability_is_written_in_reading_order_with_its_default_list_and_labels_after_display() {
        let node = NewNode {
            slug: "capabilities/pay".into(),
            kind: "capability".into(),
            title: "Pay".into(),
            domain: Some("domains/billing".into()),
            path: Some("src/pay.ts".into()),
            display_names: vec![("display_ko".into(), "결제".into())],
            created_by: "agent:codex".into(),
            ..NewNode::default()
        };
        let fields = new_node_fields(&node, "u").expect("a kind");
        assert_eq!(
            keys(&fields),
            ["uid", "slug", "kind", "title", "display_ko", "domain", "elements", "path", "created_by"]
        );
        assert_eq!(fields.get("elements"), Some(&Setting::List(Vec::new())));
    }

    #[test]
    fn a_key_the_kind_has_no_place_for_goes_last_and_an_unknown_kind_is_refused() {
        let node = NewNode {
            slug: "p".into(),
            kind: "project".into(),
            title: "P".into(),
            path: Some("src".into()),
            created_by: "agent:unknown".into(),
            ..NewNode::default()
        };
        let fields = new_node_fields(&node, "u").expect("a kind");
        assert_eq!(
            keys(&fields),
            ["uid", "slug", "kind", "title", "domains", "capabilities", "elements", "created_by", "path"]
        );
        assert!(new_node_fields(&NewNode { kind: "widget".into(), ..node }, "u").is_none());
    }
}
