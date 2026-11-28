//! The configuration evidence of a repository without a Rust workspace: the answer says there is
//! none, with the same fields a repository that has some carries. A repository with a root
//! `Cargo.toml` is read by the JavaScript server only.

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimBoundary {
    pub compile_time_predicate_locations: bool,
    pub predicate_evaluation: bool,
    pub runtime_impact: bool,
    pub import_dependency: bool,
    pub macro_consumers: bool,
    pub semantic_dependency: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub scope: &'static str,
    pub workspace_mode: &'static str,
    pub workspace_members_declared: usize,
    pub workspace_members_considered: usize,
    pub workspace_members_limited: bool,
    pub workspace_members_eligible: usize,
    pub workspace_members_skipped: usize,
    pub package_limit: usize,
    pub packages_discovered: usize,
    pub packages_scanned: usize,
    pub packages_limited: bool,
    pub source_files_discovered: usize,
    pub source_files_scanned: usize,
    pub source_files_skipped: usize,
    pub source_file_limit: usize,
    pub source_files_limited: bool,
    pub predicate_forms: [&'static str; 2],
    pub predicate_evaluation: bool,
    pub macro_expansion: bool,
    pub build_scripts_executed: bool,
}

#[derive(Debug, Serialize)]
pub struct UnsupportedPredicates {
    pub count: usize,
    pub samples: [(); 0],
    pub limited: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePolicy {
    pub automatic_relation: bool,
    pub write_allowed: bool,
    pub human_approval_required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationEvidence {
    pub contract: &'static str,
    pub status: &'static str,
    pub claim_boundary: ClaimBoundary,
    pub coverage: Coverage,
    pub packages: [(); 0],
    pub unsupported_workspace_members: [(); 0],
    pub unsupported_workspace_members_limited: bool,
    pub unsupported_predicates: UnsupportedPredicates,
    pub write_policy: WritePolicy,
    pub limitations: [&'static str; 1],
}

/// The evidence of a repository that has no root `Cargo.toml`.
pub fn not_present() -> ConfigurationEvidence {
    ConfigurationEvidence {
        contract: "rustFeatureConfigurationEvidence:v1",
        status: "not_present",
        claim_boundary: ClaimBoundary {
            compile_time_predicate_locations: false,
            predicate_evaluation: false,
            runtime_impact: false,
            import_dependency: false,
            macro_consumers: false,
            semantic_dependency: false,
        },
        coverage: Coverage {
            scope: "literal_cfg_feature_attributes_in_conventional_cargo_targets",
            workspace_mode: "root_package",
            workspace_members_declared: 0,
            workspace_members_considered: 0,
            workspace_members_limited: false,
            workspace_members_eligible: 0,
            workspace_members_skipped: 0,
            package_limit: 24,
            packages_discovered: 0,
            packages_scanned: 0,
            packages_limited: false,
            source_files_discovered: 0,
            source_files_scanned: 0,
            source_files_skipped: 0,
            source_file_limit: 5000,
            source_files_limited: false,
            predicate_forms: ["cfg", "cfg_attr"],
            predicate_evaluation: false,
            macro_expansion: false,
            build_scripts_executed: false,
        },
        packages: [],
        unsupported_workspace_members: [],
        unsupported_workspace_members_limited: false,
        unsupported_predicates: UnsupportedPredicates {
            count: 0,
            samples: [],
            limited: false,
        },
        write_policy: WritePolicy {
            automatic_relation: false,
            write_allowed: false,
            human_approval_required: true,
        },
        limitations: ["Rust feature configuration evidence was not available for this repository root."],
    }
}
