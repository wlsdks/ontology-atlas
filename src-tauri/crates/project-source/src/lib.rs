//! The code folder a project node describes. See `README.md`.

mod competency_evidence;
mod composed_name;
mod folder_state;
mod git_state;
mod ordered_json;
mod probe_error;
mod project_graph_hash;
mod source_bindings;
mod source_digest;
mod source_folder_inference;
mod source_inventory_limits;
mod source_probe;
mod source_range_citation;
mod source_receipt;
mod source_receipt_view;
mod source_vocabulary;
mod source_witnesses;
mod vault_exclusion;

pub use competency_evidence::{
    competency_evidence_citations, competency_evidence_paths, COMPETENCY_HEADING,
};
pub use git_state::find_git_root;
pub use probe_error::ProbeError;
pub use project_graph_hash::project_graph_hash;
pub use source_bindings::{
    read_source_bindings, remove_source_bindings, write_source_binding, BindingWriteFailure,
    BindingsRead, NewBinding, Removal, StoredBinding, SOURCE_STATE_RELATIVE_PATH,
};
pub use source_digest::source_digest;
pub use source_folder_inference::{infer_source_folder, InferenceMarker, InferredFolder};
pub use source_inventory_limits::{
    SOURCE_INVENTORY_MAX_DEPTH, SOURCE_INVENTORY_MAX_HASH_BYTES, SOURCE_INVENTORY_VERSION,
    SOURCE_PRUNE_DIR_NAMES,
};
pub use source_probe::{inspect_project_source, SourceKind, SourceProbe};
pub use source_range_citation::{
    is_persistable_evidence_reference, is_persistable_path_witness,
    is_persistable_relative_path, parse_source_range_citation, SourceRangeCitation,
};
pub use source_receipt::{
    mint_source_receipt, witness_inventory_paths, ActionRef, Diagnostics, GapRef, MintInput,
    SourceReceipt, Witness, WitnessSummary, SOURCE_RECEIPT_VERSION,
};
pub use source_receipt_view::{
    read_source_view, sanitize_receipt, LiveWitnessCheck, SourceView,
};
pub use source_vocabulary::{is_action_id, is_gap_id, SOURCE_ACTION_IDS, SOURCE_GAP_IDS};
pub use source_witnesses::{derive_witness_claims, normalized_witness_path, WitnessClaim};
pub use vault_exclusion::{excluded_vault_folder, filter_status, vault_folder_inside};
