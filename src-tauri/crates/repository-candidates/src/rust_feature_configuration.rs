//! Where a Rust repository's Cargo features are switched on in source: for every package of the
//! root manifest (the root package and the literal members of its workspace), each declared feature
//! with the `cfg` and `cfg_attr` attributes that name it. The answer is provenance a person can
//! check, not a claim about what runs: no predicate is evaluated, no macro expanded, no build
//! script run.

use std::collections::HashSet;

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use serde::Serialize;

use crate::cargo_manifest::{read_cargo_manifest, CargoManifest};
use crate::repository_files::{join, parent_of, Probe, RepositoryFiles};
use crate::rust_feature_attributes::{extract_rust_feature_attributes, AttributeForm, Polarity};
use crate::rust_source_files::discover_rust_files;
use crate::scan_limits::RUST_SOURCE_MAX_BYTES;

const CONTRACT: &str = "rustFeatureConfigurationEvidence:v1";
const SCOPE: &str = "literal_cfg_feature_attributes_in_conventional_cargo_targets";
const SOURCE_FILE_LIMIT: usize = 5000;
const REFERENCES_PER_FEATURE: usize = 5;
const PACKAGE_LIMIT: usize = 24;
const FEATURE_LIMIT: usize = 48;
const DIRECT_MAPPING_LIMIT: usize = 100;
const DIRECT_MAPPING_MAX_LENGTH: usize = 512;
const WORKSPACE_MEMBER_LIMIT: usize = 100;
const UNSUPPORTED_WORKSPACE_MEMBER_SAMPLE_LIMIT: usize = 50;
const UNSUPPORTED_PREDICATE_SAMPLE_LIMIT: usize = 20;

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

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Default, Serialize)]
pub struct FormCounts {
    pub cfg: usize,
    pub cfg_attr: usize,
}

#[derive(Debug, Default, Serialize)]
pub struct PolarityCounts {
    pub positive: usize,
    pub negative: usize,
    pub compound: usize,
    pub unknown: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureReference {
    pub path: String,
    pub line: usize,
    pub form: &'static str,
    pub meaning: &'static str,
    pub polarity: &'static str,
    pub predicate: String,
    pub source_role: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureEvidence {
    pub name: String,
    pub direct_mappings_count: usize,
    pub direct_mappings: Vec<String>,
    pub direct_mappings_limited: bool,
    pub reference_count: usize,
    pub by_form: FormCounts,
    pub by_polarity: PolarityCounts,
    pub references: Vec<FeatureReference>,
    pub references_limited: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageEvidence {
    pub manifest: String,
    pub package_name: Option<String>,
    pub features_declared: usize,
    pub features_limited: bool,
    pub features: Vec<FeatureEvidence>,
}

#[derive(Debug, Serialize)]
pub struct UnsupportedWorkspaceMember {
    pub member: String,
    pub reason: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct UnsupportedPredicate {
    pub path: String,
    pub line: usize,
    pub form: &'static str,
    pub predicate: String,
    pub reason: &'static str,
}

#[derive(Debug, Serialize)]
pub struct UnsupportedPredicates {
    pub count: usize,
    pub samples: Vec<UnsupportedPredicate>,
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
    pub packages: Vec<PackageEvidence>,
    pub unsupported_workspace_members: Vec<UnsupportedWorkspaceMember>,
    pub unsupported_workspace_members_limited: bool,
    pub unsupported_predicates: UnsupportedPredicates,
    pub write_policy: WritePolicy,
    pub limitations: Vec<&'static str>,
}

fn nothing_observed(status: &'static str) -> ConfigurationEvidence {
    ConfigurationEvidence {
        contract: CONTRACT,
        status,
        claim_boundary: ClaimBoundary {
            compile_time_predicate_locations: false,
            predicate_evaluation: false,
            runtime_impact: false,
            import_dependency: false,
            macro_consumers: false,
            semantic_dependency: false,
        },
        coverage: Coverage {
            scope: SCOPE,
            workspace_mode: "root_package",
            workspace_members_declared: 0,
            workspace_members_considered: 0,
            workspace_members_limited: false,
            workspace_members_eligible: 0,
            workspace_members_skipped: 0,
            package_limit: PACKAGE_LIMIT,
            packages_discovered: usize::from(status != "not_present"),
            packages_scanned: 0,
            packages_limited: false,
            source_files_discovered: 0,
            source_files_scanned: 0,
            source_files_skipped: 0,
            source_file_limit: SOURCE_FILE_LIMIT,
            source_files_limited: false,
            predicate_forms: ["cfg", "cfg_attr"],
            predicate_evaluation: false,
            macro_expansion: false,
            build_scripts_executed: false,
        },
        packages: Vec::new(),
        unsupported_workspace_members: Vec::new(),
        unsupported_workspace_members_limited: false,
        unsupported_predicates: UnsupportedPredicates {
            count: 0,
            samples: Vec::new(),
            limited: false,
        },
        write_policy: WritePolicy {
            automatic_relation: false,
            write_allowed: false,
            human_approval_required: true,
        },
        limitations: vec![
            "Rust feature configuration evidence was not available for this repository root.",
        ],
    }
}

/// The evidence of a repository that has no root `Cargo.toml`.
pub fn not_present() -> ConfigurationEvidence {
    nothing_observed("not_present")
}

struct PackageCandidate {
    manifest_path: String,
    manifest: CargoManifest,
}

impl PackageCandidate {
    fn root(&self) -> &str {
        parent_of(&self.manifest_path)
    }
}

/// Why a workspace member cannot name a package folder, before the disk is asked.
fn member_issue(member: &str) -> Option<&'static str> {
    let names_a_drive = member
        .chars()
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && member.chars().nth(1) == Some(':');
    if member.is_empty()
        || trim(member) != member
        || member.starts_with('/')
        || member.contains('\\')
        || names_a_drive
    {
        return Some("invalid-member-path");
    }
    if member.contains(['*', '?', '[', ']', '{', '}']) {
        return Some("glob-not-supported");
    }
    None
}

/// The member as a folder below the root with `.` and `..` folded, or `None` when it climbs out.
fn folded_member(member: &str) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    for part in member.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            name => parts.push(name),
        }
    }
    Some(parts.join("/"))
}

/// Where the feature evidence of the root manifest of `files` is read.
pub fn collect_configuration_evidence(files: &RepositoryFiles<'_>) -> ConfigurationEvidence {
    const ROOT_MANIFEST: &str = "Cargo.toml";
    match files.probe(ROOT_MANIFEST) {
        Probe::Missing => return nothing_observed("not_present"),
        Probe::File => {}
        Probe::OutsideRoot | Probe::Folder | Probe::Other => return nothing_observed("unsupported"),
    }
    let Some(root_manifest) = read_cargo_manifest(files, ROOT_MANIFEST) else {
        return nothing_observed("unsupported");
    };

    let mut unsupported_members: Vec<UnsupportedWorkspaceMember> = Vec::new();
    let mut candidates: Vec<PackageCandidate> = Vec::new();
    let mut candidate_paths: HashSet<String> = HashSet::new();
    let mut eligible_members = 0_usize;
    let declared = root_manifest.workspace_members.len();
    if root_manifest.package_name.is_some() {
        candidate_paths.insert(ROOT_MANIFEST.to_string());
        candidates.push(PackageCandidate {
            manifest_path: ROOT_MANIFEST.to_string(),
            manifest: root_manifest.clone(),
        });
    }
    let mut members: Vec<String> = Vec::new();
    for member in &root_manifest.workspace_members {
        if !members.contains(member) {
            members.push(member.clone());
        }
    }
    answer_format::utf16::sort(&mut members);
    let considered = members.len().min(WORKSPACE_MEMBER_LIMIT);
    for member in members.iter().take(considered) {
        let issue = member_issue(member);
        let folder = if issue.is_none() { folded_member(member) } else { None };
        let (Some(folder), None) = (folder, issue) else {
            unsupported_members.push(UnsupportedWorkspaceMember {
                member: member.clone(),
                reason: issue.unwrap_or("outside-root"),
            });
            continue;
        };
        let manifest_path = join(&folder, ROOT_MANIFEST);
        match files.probe(&manifest_path) {
            Probe::Missing => {
                unsupported_members.push(UnsupportedWorkspaceMember {
                    member: member.clone(),
                    reason: "manifest-not-found",
                });
                continue;
            }
            Probe::OutsideRoot => {
                unsupported_members.push(UnsupportedWorkspaceMember {
                    member: member.clone(),
                    reason: "outside-root",
                });
                continue;
            }
            Probe::File | Probe::Folder | Probe::Other => {}
        }
        let Some(manifest) = read_cargo_manifest(files, &manifest_path)
            .filter(|manifest| manifest.package_name.is_some())
        else {
            unsupported_members.push(UnsupportedWorkspaceMember {
                member: member.clone(),
                reason: "package-table-not-found",
            });
            continue;
        };
        eligible_members += 1;
        if candidate_paths.insert(manifest_path.clone()) {
            candidates.push(PackageCandidate {
                manifest_path,
                manifest,
            });
        }
    }
    let members_limited = members.len() > considered;
    let unsupported_total = unsupported_members.len();
    unsupported_members.truncate(UNSUPPORTED_WORKSPACE_MEMBER_SAMPLE_LIMIT);
    let unsupported_members_limited =
        members_limited || unsupported_total > unsupported_members.len();
    candidates.sort_by(|left, right| compare_text(&left.manifest_path, &right.manifest_path));

    let workspace_mode = if declared > 0 {
        "literal_direct_members"
    } else {
        "root_package"
    };
    let workspace_coverage = |coverage: &mut Coverage| {
        coverage.workspace_mode = workspace_mode;
        coverage.workspace_members_declared = declared;
        coverage.workspace_members_considered = considered;
        coverage.workspace_members_limited = members_limited;
        coverage.workspace_members_eligible = eligible_members;
        coverage.workspace_members_skipped = members.len() - eligible_members;
    };
    if candidates.is_empty() {
        let mut evidence = nothing_observed("unsupported");
        workspace_coverage(&mut evidence.coverage);
        evidence.unsupported_workspace_members = unsupported_members;
        evidence.unsupported_workspace_members_limited = unsupported_members_limited;
        return evidence;
    }

    let selected = candidates.len().min(PACKAGE_LIMIT);
    let package_roots: Vec<String> = candidates
        .iter()
        .map(|candidate| candidate.root().to_string())
        .collect();
    let mut packages = Vec::new();
    let mut source_files = SourceFileCoverage::default();
    let mut remaining_budget = SOURCE_FILE_LIMIT;
    let mut unsupported_predicate_count = 0_usize;
    let mut unsupported_predicate_samples: Vec<UnsupportedPredicate> = Vec::new();
    for candidate in candidates.iter().take(selected) {
        let excluded: Vec<String> = package_roots
            .iter()
            .filter(|root| root.as_str() != candidate.root())
            .cloned()
            .collect();
        let read = read_package(files, candidate, &excluded, remaining_budget);
        source_files.add(&read.coverage);
        remaining_budget = remaining_budget.saturating_sub(read.coverage.selected);
        unsupported_predicate_count += read.unsupported_count;
        for sample in read.unsupported_samples {
            if unsupported_predicate_samples.len() >= UNSUPPORTED_PREDICATE_SAMPLE_LIMIT {
                break;
            }
            unsupported_predicate_samples.push(sample);
        }
        packages.push(read.package);
    }
    let packages_limited = candidates.len() > PACKAGE_LIMIT;
    let limited = packages_limited
        || source_files.limited
        || source_files.skipped > 0
        || unsupported_predicate_count > 0
        || unsupported_total > 0
        || members_limited
        || packages.iter().any(|package| {
            package.features_limited
                || package
                    .features
                    .iter()
                    .any(|feature| feature.direct_mappings_limited)
        });
    let mut evidence = nothing_observed(if limited { "limited" } else { "observed" });
    evidence.claim_boundary.compile_time_predicate_locations = true;
    evidence.coverage.packages_discovered = candidates.len();
    evidence.coverage.packages_scanned = selected;
    evidence.coverage.packages_limited = packages_limited;
    evidence.coverage.source_files_discovered = source_files.discovered;
    evidence.coverage.source_files_scanned = source_files.scanned;
    evidence.coverage.source_files_skipped = source_files.skipped;
    evidence.coverage.source_files_limited = source_files.limited;
    workspace_coverage(&mut evidence.coverage);
    evidence.packages = packages;
    evidence.unsupported_workspace_members = unsupported_members;
    evidence.unsupported_workspace_members_limited = unsupported_members_limited;
    evidence.unsupported_predicates = UnsupportedPredicates {
        count: unsupported_predicate_count,
        limited: unsupported_predicate_count > unsupported_predicate_samples.len(),
        samples: unsupported_predicate_samples,
    };
    evidence.limitations = vec![
        "Literal cfg feature predicates are source provenance, not proof of runtime behavior or semantic dependency.",
        "Predicate truth, target combinations, build scripts, macro expansion, use/mod imports, and downstream consumers are not evaluated.",
        "When a workspace, package, feature, mapping, or source-file limit is reached, reported discovery counts are bounded observations rather than complete repository totals.",
        "Source locations are scanned only in conventional Cargo targets (src, tests, examples, benches, and build.rs); custom target paths are outside this receipt.",
    ];
    evidence
}

#[derive(Default)]
struct SourceFileCoverage {
    discovered: usize,
    selected: usize,
    scanned: usize,
    skipped: usize,
    limited: bool,
}

impl SourceFileCoverage {
    fn add(&mut self, other: &SourceFileCoverage) {
        self.discovered += other.discovered;
        self.scanned += other.scanned;
        self.skipped += other.skipped;
        self.limited |= other.limited;
    }
}

struct PackageRead {
    package: PackageEvidence,
    coverage: SourceFileCoverage,
    unsupported_count: usize,
    unsupported_samples: Vec<UnsupportedPredicate>,
}

struct FeatureCounts {
    reference_count: usize,
    by_form: FormCounts,
    by_polarity: PolarityCounts,
    references: Vec<FeatureReference>,
}

fn read_package(
    files: &RepositoryFiles<'_>,
    candidate: &PackageCandidate,
    excluded_roots: &[String],
    source_file_budget: usize,
) -> PackageRead {
    let package_root = candidate.root();
    let inventory = discover_rust_files(files, package_root, excluded_roots, source_file_budget);
    let manifest = &candidate.manifest;
    let selected_features: Vec<_> = manifest.features.iter().take(FEATURE_LIMIT).collect();
    let mut counts: Vec<FeatureCounts> = selected_features
        .iter()
        .map(|_| FeatureCounts {
            reference_count: 0,
            by_form: FormCounts::default(),
            by_polarity: PolarityCounts::default(),
            references: Vec::new(),
        })
        .collect();
    let mut unsupported_count = 0_usize;
    let mut unsupported_samples: Vec<UnsupportedPredicate> = Vec::new();
    let mut scanned = 0_usize;
    let mut skipped = 0_usize;
    for file in &inventory.files {
        let Some(text) = files
            .text(file)
            .ok()
            .filter(|text| text.len() <= RUST_SOURCE_MAX_BYTES)
        else {
            skipped += 1;
            continue;
        };
        scanned += 1;
        for attribute in extract_rust_feature_attributes(&text) {
            let mut note_unsupported = |reason: &'static str| {
                unsupported_count += 1;
                if unsupported_samples.len() < UNSUPPORTED_PREDICATE_SAMPLE_LIMIT {
                    unsupported_samples.push(UnsupportedPredicate {
                        path: file.clone(),
                        line: attribute.line,
                        form: attribute.form.name(),
                        predicate: attribute.predicate.clone(),
                        reason,
                    });
                }
            };
            if let Some(reason) = attribute.unsupported_reason {
                note_unsupported(reason);
                continue;
            }
            let declared = |name: &String| selected_features.iter().any(|row| &row.name == name);
            if attribute.features.iter().any(|name| !declared(name)) {
                note_unsupported("feature-not-declared-in-scanned-table");
            }
            for name in &attribute.features {
                let Some(position) = selected_features.iter().position(|row| &row.name == name)
                else {
                    continue;
                };
                let Some(bucket) = counts.get_mut(position) else {
                    continue;
                };
                bucket.reference_count += 1;
                match attribute.form {
                    AttributeForm::Cfg => bucket.by_form.cfg += 1,
                    AttributeForm::CfgAttr => bucket.by_form.cfg_attr += 1,
                }
                match attribute.polarity {
                    Polarity::Positive => bucket.by_polarity.positive += 1,
                    Polarity::Negative => bucket.by_polarity.negative += 1,
                    Polarity::Compound => bucket.by_polarity.compound += 1,
                    Polarity::Unknown => bucket.by_polarity.unknown += 1,
                }
                if bucket.references.len() < REFERENCES_PER_FEATURE {
                    bucket.references.push(FeatureReference {
                        path: file.clone(),
                        line: attribute.line,
                        form: attribute.form.name(),
                        meaning: match attribute.form {
                            AttributeForm::Cfg => "conditional_inclusion",
                            AttributeForm::CfgAttr => "conditional_attribute",
                        },
                        polarity: attribute.polarity.name(),
                        predicate: attribute.predicate.clone(),
                        source_role: source_role_of(file, package_root),
                    });
                }
            }
        }
    }
    let features = selected_features
        .iter()
        .zip(counts)
        .map(|(feature, mut bucket)| {
            let bounded: Vec<&String> = feature
                .values
                .iter()
                .filter(|value| value.encode_utf16().count() <= DIRECT_MAPPING_MAX_LENGTH)
                .collect();
            bucket.references.sort_by(|left, right| {
                compare_text(&left.path, &right.path).then(left.line.cmp(&right.line))
            });
            FeatureEvidence {
                name: feature.name.clone(),
                direct_mappings_count: feature.values.len(),
                direct_mappings_limited: feature.values.len() != bounded.len()
                    || bounded.len() > DIRECT_MAPPING_LIMIT,
                direct_mappings: bounded
                    .into_iter()
                    .take(DIRECT_MAPPING_LIMIT)
                    .cloned()
                    .collect(),
                reference_count: bucket.reference_count,
                by_form: bucket.by_form,
                by_polarity: bucket.by_polarity,
                references_limited: bucket.reference_count > bucket.references.len(),
                references: bucket.references,
            }
        })
        .collect();
    PackageRead {
        package: PackageEvidence {
            manifest: candidate.manifest_path.clone(),
            package_name: manifest.package_name.clone(),
            features_declared: manifest.features.len(),
            features_limited: manifest.features.len() > selected_features.len(),
            features,
        },
        coverage: SourceFileCoverage {
            discovered: inventory.discovered,
            selected: inventory.files.len(),
            scanned,
            skipped,
            limited: inventory.limited,
        },
        unsupported_count,
        unsupported_samples,
    }
}

/// `test` for a file a test folder or a test naming convention holds, else `production`.
fn source_role_of(file: &str, package_root: &str) -> &'static str {
    let inside = file
        .strip_prefix(package_root)
        .map_or(file, |rest| rest.trim_start_matches('/'));
    let lowered = inside.to_lowercase();
    let segments: Vec<&str> = lowered.split('/').collect();
    if segments
        .iter()
        .any(|segment| *segment == "test" || *segment == "tests")
    {
        return "test";
    }
    let file_name = segments.last().copied().unwrap_or_default();
    let stem = file_name.strip_suffix(".rs").unwrap_or(file_name);
    let named_for_a_test = stem.ends_with(".test")
        || stem.ends_with(".spec")
        || (stem.starts_with("test_") && stem.chars().count() > "test_".len())
        || (stem.ends_with("_test") && stem.chars().count() > "_test".len());
    if named_for_a_test {
        "test"
    } else {
        "production"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_test_folder_and_a_test_name_make_a_reference_a_test_and_nothing_else_does() {
        assert_eq!(source_role_of("crates/a/tests/it.rs", "crates/a"), "test");
        assert_eq!(source_role_of("crates/a/src/lexer_test.rs", "crates/a"), "test");
        assert_eq!(source_role_of("crates/a/src/test_util.rs", "crates/a"), "test");
        assert_eq!(source_role_of("crates/a/src/lib.rs", "crates/a"), "production");
        assert_eq!(source_role_of("src/contest.rs", ""), "production");
    }

    #[test]
    fn a_member_that_cannot_name_a_folder_inside_the_root_says_why() {
        assert_eq!(member_issue("/abs"), Some("invalid-member-path"));
        assert_eq!(member_issue(" a"), Some("invalid-member-path"));
        assert_eq!(member_issue("a\\b"), Some("invalid-member-path"));
        assert_eq!(member_issue("C:/x"), Some("invalid-member-path"));
        assert_eq!(member_issue("crates/*"), Some("glob-not-supported"));
        assert_eq!(member_issue("crates/a"), None);
        assert_eq!(folded_member("crates/./a/../b"), Some("crates/b".to_string()));
        assert_eq!(folded_member("../x"), None);
    }
}
