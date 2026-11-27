//! The public module skeleton the family design assigns to this crate stays reachable.

#[allow(
    unused_imports,
    reason = "the import is the check: it stops compiling if a module goes missing or private"
)]
use {
    vault_document::documents as _, vault_document::frontmatter as _, vault_document::library as _,
    vault_document::markdown_tree as _, vault_document::schema as _,
    vault_document::side_files as _, vault_document::validation as _, vault_document::wiki as _,
    vault_document::writes as _,
};

#[test]
fn every_assigned_module_is_public() {}
