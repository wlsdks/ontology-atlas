//! The candidate scan behind `analyze_repo_structure` with `view: "analysis"`: what a repository's
//! manifests, documents and source layout offer as candidate domains, capabilities and elements.
//! Every read goes through `confined-files`; the answer is evidence a person judges, never a
//! finished ontology.

pub mod analysis_view;
pub mod authored_markdown;
pub mod candidate_nodes;
pub mod candidate_text;
pub mod meaning_gate;
pub mod native_evidence;
pub mod package_contracts;
pub mod project_detection;
pub mod repository_analysis;
pub mod repository_files;
pub mod rust_feature_configuration;
pub mod scan_limits;
pub mod scan_tables;
pub mod semantic_document;
pub mod semantic_evidence;
pub mod semantic_excerpt;
pub mod semantic_risk;
pub mod source_elements;
pub mod toml_lines;
