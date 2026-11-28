//! The relation types a write may name, the key each is stored under, and where `contains` lands
//! between kinds that have a typed list.

use vault_edit::{
    exists, relation_key, typed_containment, NameResolver, NodeFields, Setting,
    WRITE_RELATION_TYPES,
};

use super::object_checks::one_of;
use super::vault_view::VaultView;
use crate::error::ToolError;

/// A relation type a write may name, as the vault's key and the word the caller used.
pub fn relation_type<'a>(value: Option<&Setting>, name: &str) -> Result<&'a str, ToolError> {
    one_of(value, name, &WRITE_RELATION_TYPES)
}

pub fn key_of(relation_type: &str) -> &'static str {
    relation_key(relation_type).unwrap_or("relates")
}

pub fn kind_of(view: &VaultView<'_>, slug: Option<&str>) -> Option<String> {
    view.document(slug?)
        .and_then(|document| document.frontmatter().text("kind"))
        .map(str::to_string)
}

/// The type an existing `contains` edge is stored under: the typed key an add wrote it as, or a
/// raw `contains` entry written before that mapping.
pub fn stored_containment_type(
    fields: &NodeFields,
    requested: &str,
    to_kind: Option<&str>,
    canonical_to: &str,
    resolver: &dyn NameResolver,
) -> String {
    if requested != "contains" {
        return requested.to_string();
    }
    let typed = typed_containment(fields.text("kind"), to_kind);
    match typed {
        Some(typed) if exists(fields, key_of(typed), canonical_to, resolver) => typed.to_string(),
        _ => requested.to_string(),
    }
}

pub fn containment_notice(
    requested: &str,
    stored: &str,
    from_kind: Option<&str>,
    to_kind: Option<&str>,
) -> Option<String> {
    (requested == "contains" && stored != "contains").then(|| {
        format!(
            "\"contains\" from a {} to a {} is written as the typed key \"{stored}\"; cite it as --{stored}--> in competency Relations rows.",
            from_kind.unwrap_or("undefined"),
            to_kind.unwrap_or("undefined"),
        )
    })
}
