//! The exact new text of the vault files a write changes. A write names what it means to change;
//! this crate turns that into whole file texts that differ from the old ones in those lines and
//! nowhere else, in the one format the app's own editor also writes. It reads documents that
//! `vault-document` already read and writes nothing: applying a plan is `confined-files`' job.
//!
//! | Question | File |
//! |---|---|
//! | What can a key be set to? | `setting.rs` |
//! | How is one entry spelled in the file? | `serialized_frontmatter.rs` |
//! | How are lines of a file changed, a body replaced, a new file made? | `document_edit.rs` |
//! | What are a node's keys while a patch is judged? | `node_fields.rs` |
//! | What does a new node start with? | `new_node.rs` |
//! | Who is a node: mint, check, merge? | `identity.rs` |
//! | Which key holds a relation and when does a stored reference name a node? | `relation_keys.rs` |
//! | What moves when a node is renamed, merged or changes kind? | `backlink_rewrite.rs` |
//! | Is a file reserved for a person? | `reservation.rs` |
//! | A file read for editing | `source_document.rs` |

mod backlink_rewrite;
mod document_edit;
mod identity;
mod new_node;
mod node_fields;
mod relation_keys;
mod reservation;
mod serialized_frontmatter;
mod setting;
mod source_document;

pub use backlink_rewrite::{
    containment_key_for, expected_modified, plan_redirect, KeptEntry, Redirect, RedirectPlan,
    ReferrerUpdate, Rewrite,
};
pub use document_edit::{edit_frontmatter, new_file, replace_body, EditRefusal, KeyChange};
pub use identity::{
    check_identity_patch, check_node_identity, fill_missing_uid, merge_identity_history,
    IdentityRefusal, MergeHistory, NodeUids,
};
pub use new_node::{array_defaults, new_node_fields, NewNode, CREATABLE_KINDS};
pub use node_fields::{normalized_references, patched, stored_setting, FieldPatch, NodeFields};
pub use relation_keys::{
    exists, key_patch, matching_note_keys, refs_for, relation_key, typed_containment,
    without_target, NameResolver, WRITE_RELATION_TYPES,
};
pub use reservation::reservation_in;
pub use serialized_frontmatter::entry_text;
pub use setting::Setting;
pub use source_document::{SourceDocument, SourceRefusal};
