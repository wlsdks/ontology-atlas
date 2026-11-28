//! The breadth map of a repository: its size, product units, entry points and the abilities a
//! builder has to place, from one parallel read of its source files. See `README.md` for the map
//! of modules.

mod ability_row;
mod ability_rows;
mod bounded_lines;
mod breadth_map;
mod declaration_index;
mod declaring_line;
mod dispatched_operations;
mod doc_pages;
mod documented_abilities;
mod enclosing_declarations;
mod entry_points;
mod entry_signals;
mod flag_rows;
mod folder_tree;
mod git_ignored_paths;
mod js_pattern;
mod jvm_file_facts;
mod jvm_masking;
mod jvm_rows;
mod library_exports;
mod main_files;
mod name_key;
mod operator_language;
mod operator_rows;
mod readme_purpose;
mod setting_rows;
mod sibling_families;
mod source_class;
mod subcommand_rows;
mod survey_areas;
mod survey_files;
mod survey_text;
mod tooling_path;
mod unit_collection;
mod unit_exports;
mod unit_imports;
mod utf16_window;
mod worker_rows;

pub use ability_row::{ability_row_text, AbilityKind, AbilityRow};
pub use ability_rows::ABILITY_LIMIT;
pub use breadth_map::{
    build_breadth_map, render_breadth_map, AreaRow, BreadthMap, Size, Survey, SurveyRequest,
    UnitRow, SURVEY_RESPONSE_CHARS,
};
pub use git_ignored_paths::git_ignored_paths;
pub use source_class::SourceClass;
pub use survey_files::SurveyFiles;
pub use survey_text::{format_count, repo_line, repo_text};
pub use unit_collection::MAX_FILES;
