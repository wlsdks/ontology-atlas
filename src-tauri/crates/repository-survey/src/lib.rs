//! The breadth map of a repository: its size, product units, entry points and the abilities a
//! builder has to place, from one parallel read of its source files. See `README.md` for the map
//! of modules.

mod ability_row;
mod ability_rows;
mod bounded_lines;
mod breadth_map;
mod declaration_index;
mod dispatched_operations;
mod doc_pages;
mod documented_abilities;
mod entry_points;
mod entry_signals;
mod folder_tree;
mod git_ignored_paths;
mod js_pattern;
mod library_exports;
mod main_files;
mod name_key;
mod readme_purpose;
mod sibling_families;
mod source_class;
mod survey_areas;
mod survey_files;
mod survey_text;
mod tooling_path;
mod unit_collection;
mod unit_exports;
mod unit_imports;

pub use ability_row::{ability_row_text, AbilityKind, AbilityRow};
pub use ability_rows::{ABILITY_LIMIT, GAPS};
pub use breadth_map::{
    build_breadth_map, render_breadth_map, AreaRow, BreadthMap, Size, Survey, SurveyRequest,
    UnitRow, SURVEY_RESPONSE_CHARS,
};
pub use git_ignored_paths::git_ignored_paths;
pub use source_class::SourceClass;
pub use survey_files::SurveyFiles;
pub use survey_text::{format_count, repo_line, repo_text};
pub use unit_collection::{MAX_FILES, SURVEY_IGNORE};
