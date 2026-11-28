//! What a first map still lacks against the code it describes. See `README.md`.

mod ability_placement;
mod area_coverage;
mod code_in_text;
mod coverage;
mod dependency_both_ways;
mod finalize_depth;
mod line_cites;
mod name_matching;
mod node_fields;
mod not_mapped_lines;
mod read_depth;
mod remedies;
mod role_placement;
mod rule_without_read_lines;
mod session_cites;
mod survey_findings;

pub use coverage::{
    measure_against_survey, AbilityEdgeSummary, AreaSummary, Breadth, Coverage, CoverageCounts,
    CoveragePage, MapNext, Measured, ReadSummary, UnplacedRow, UNPLACED_PAGE_ROWS,
};
pub use dependency_both_ways::two_way_dependency_findings;
pub use finalize_depth::{
    competency_depth_refusals, finalize_gate, measure_build_depth, not_mapped_lines_refusal,
    BuildDepth, BuildDepthInput, FinalizeBlock,
};
pub use remedies::remedy;
pub use rule_without_read_lines::rule_cite_findings;
