//! The candidate scan behind `analyze_repo_structure` with `view: "analysis"`: what a repository's
//! manifests, documents and source layout offer as candidate domains, capabilities and elements.
//! Every read goes through `confined-files`; the answer is evidence a person judges, never a
//! finished ontology.

pub mod authored_markdown;
pub mod candidate_text;
pub mod package_contracts;
pub mod repository_files;
pub mod scan_limits;
pub mod scan_tables;
pub mod semantic_excerpt;
pub mod semantic_risk;
pub mod toml_lines;
