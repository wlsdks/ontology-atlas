//! What a first map still lacks against the code it describes. See `README.md`.

mod ability_placement;
mod area_coverage;
mod code_in_text;
mod coverage;
mod dependency_both_ways;
mod line_cites;
mod name_matching;
mod node_fields;
mod not_mapped_lines;
mod remedies;
mod rule_without_read_lines;
mod survey_findings;

pub use coverage::{
    measure_against_survey, AreaSummary, Breadth, Coverage, CoveragePage, MapNext, Measured,
    ReadSummary, UnplacedRow, UNPLACED_PAGE_ROWS,
};
pub use dependency_both_ways::two_way_dependency_findings;
pub use remedies::remedy;
pub use rule_without_read_lines::rule_cite_findings;
