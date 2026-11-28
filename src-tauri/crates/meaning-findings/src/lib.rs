//! What a vault's nodes claim that their source does not back, and the schema checks a packet an
//! agent hands in is held to. See `README.md` for where each part lives.

pub mod packet_schema;

pub use packet_schema::{
    count_by, is_digest, is_persistable_evidence_reference, is_persistable_path_witness,
    is_persistable_relative_path, is_record, map_unique, non_blank, parse_source_range_citation,
    portable_source_ref, unique_strings, valid_timestamp, PacketFinding, PacketSeverity,
    SourceRangeCitation, NON_BLANK_DEFAULT_MAX,
};
