//! The vocabulary a source receipt may use: gaps (what is wrong) and actions (what to do). One list
//! for the receipt that is written and the inventory that reads it, so neither accepts what the
//! other silently rejects.

/// What is wrong. Messages print these names verbatim, so no prose is needed.
pub const SOURCE_GAP_IDS: [&str; 9] = [
    "source_unbound",
    "multiple_active_sources",
    "receipt_missing",
    "receipt_malformed",
    "source_role_evidence_missing",
    "declared_source_path_missing",
    "source_inventory_truncated",
    "ontology_changed",
    "source_changed",
];

/// What to do. A new name needs its sentence where the meaning readiness hints are written.
pub const SOURCE_ACTION_IDS: [&str; 8] = [
    "connect_source",
    "repair_source_binding",
    "measure_source",
    "record_source_role",
    "repair_source_path",
    "review_inventory_limit",
    "remeasure_source",
    "use_current_evidence",
];

pub fn is_gap_id(id: &str) -> bool {
    SOURCE_GAP_IDS.contains(&id)
}

pub fn is_action_id(id: &str) -> bool {
    SOURCE_ACTION_IDS.contains(&id)
}
