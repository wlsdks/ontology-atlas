//! The tools that change the vault. Each is one file named for the tool; the files beside them
//! hold what two or more share. The checkpoint every tool passes (read-only mode, consent, the
//! write lock) is `write_checkpoint`; what follows from reaching a handler is here.

mod add_concepts;
mod add_relations;
mod answer_fields;
mod delete_concept;
mod merge_concepts;
mod object_checks;
mod patch_concept;
mod patch_document;
mod sent_setting;
mod slug_refusal;
mod redirect_support;
mod relation_support;
mod remove_relation;
mod rename_concept;
mod vault_view;
mod write_aftermath;
mod write_gates;
mod write_support;

pub use add_concepts::{call as add_concepts, call_one as add_concept};
pub use add_relations::{call as add_relations, call_one as add_relation};
pub use delete_concept::call as delete_concept;
pub use merge_concepts::call as merge_concepts;
pub use patch_concept::call as patch_concept;
pub use remove_relation::call as remove_relation;
pub use rename_concept::call as rename_concept;
