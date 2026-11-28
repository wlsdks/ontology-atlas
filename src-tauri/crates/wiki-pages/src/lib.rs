//! The wiki page contract. See `README.md`.

mod concept_index;
mod folder_judgement;
mod page_check;
mod page_links;
mod problem;
mod wiki_template;

pub use concept_index::{ConceptEntry, ConceptIndex};
pub use folder_judgement::{judge_folder, FolderPage};
pub use page_check::{check_page, PageCheck};
pub use page_links::page_links;
pub use problem::{Detail, Problem, Values};
pub use wiki_template::{
    cited_sources, is_advisory_code, is_wiki_furniture_slug, WIKI_ADVISORY_CODES, WIKI_DIR,
};
