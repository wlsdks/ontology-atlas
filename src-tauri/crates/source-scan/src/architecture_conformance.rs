//! Source measured against an architecture profile: which role each scanned file plays, which role
//! imports which, and the imports the profile's rules forbid. The answer says `violated` when a
//! forbidden import was seen, `conforms` when every edge was mapped and ruled, and `unknown`
//! when something could not be judged (an unsupported language, an edge between files no role
//! owns, a role no file matched): never `conforms` by default.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::Serialize;

use answer_format::collation::compare_text;

use crate::architecture_profile::{ArchitectureProfile, DependencyPolicy, ProfilePattern};
use crate::import_edges::{ImportKind, ImportUsage, UsageCounts};
use crate::import_scan::ImportScan;
use crate::path_pattern::{normalize_path, PathPattern};

const MATCHED_FILE_SAMPLE_LIMIT: usize = 20;
const VIOLATION_SAMPLE_LIMIT: usize = 50;
const EVIDENCE_PER_ROLE_EDGE: usize = 3;

/// Compiles each distinct pattern once per call.
struct Matcher {
    compiled: HashMap<String, Option<PathPattern>>,
}

impl Matcher {
    fn new() -> Self {
        Self {
            compiled: HashMap::new(),
        }
    }

    fn matches(&mut self, path: &str, pattern: &str) -> bool {
        let compiled = self
            .compiled
            .entry(pattern.to_string())
            .or_insert_with(|| PathPattern::new(pattern));
        compiled
            .as_ref()
            .is_some_and(|compiled| compiled.matches(&normalize_path(path)))
    }

    fn any(&mut self, path: &str, patterns: &[String]) -> bool {
        patterns.iter().any(|pattern| self.matches(path, pattern))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConformanceStatus {
    Violated,
    Unknown,
    Conforms,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleReport {
    pub id: String,
    pub paths: Vec<String>,
    pub matched_file_count: usize,
    pub matched_files: Vec<String>,
    pub matched_files_limited: bool,
}

#[derive(Debug, Serialize)]
pub struct RoleEdgeEvidence {
    pub from: String,
    pub to: String,
    pub kind: ImportKind,
    #[serde(rename = "importUsage")]
    pub import_usage: ImportUsage,
}

/// How many of an observed role edge's imports were of each usage.
#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct ObservedUsageCounts {
    pub value: usize,
    pub type_only: usize,
    pub unknown: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservedRoleEdge {
    pub from_role: String,
    pub to_role: String,
    pub count: usize,
    pub import_usage_counts: ObservedUsageCounts,
    pub evidence: Vec<RoleEdgeEvidence>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Violation {
    pub from_role: String,
    pub to_role: String,
    pub from: String,
    pub to: String,
    pub kind: ImportKind,
    pub import_usage: ImportUsage,
    pub rule: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnknownTally {
    pub coverage_incomplete: bool,
    pub unmapped_edges: usize,
    pub unruled_edges: usize,
    pub unknown_import_usages: usize,
    pub empty_roles: Vec<String>,
}

/// The usages of every scanned edge; `missing` counts edges that carry none, which a scan of
/// this server never produces and a record writer reads to refuse an unreliable receipt.
#[derive(Debug, Serialize)]
pub struct SourceUsageCounts {
    pub value: usize,
    pub type_only: usize,
    pub unknown: usize,
    pub missing: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformanceSource {
    pub root_path: String,
    pub files_scanned: usize,
    pub supported_languages: Vec<&'static str>,
    pub import_usage_counts: SourceUsageCounts,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conformance {
    pub contract: &'static str,
    pub status: ConformanceStatus,
    pub roles: Vec<RoleReport>,
    pub observed_role_edges: Vec<ObservedRoleEdge>,
    pub excluded_by_usage: usize,
    pub violation_count: usize,
    pub violations: Vec<Violation>,
    pub violations_limited: bool,
    pub unknown: UnknownTally,
    pub source: ConformanceSource,
}

enum Decision {
    Allowed,
    Forbidden(String),
    /// The profile has no rule for the role.
    Unruled,
}

fn rule_for(profile: &ArchitectureProfile, from_role: &str, to_role: &str) -> Decision {
    if from_role == to_role {
        return Decision::Allowed;
    }
    if profile.dependency_policy == DependencyPolicy::LowerOnly {
        let index_of = |id: &str| profile.roles.iter().position(|role| role.id == id);
        return if index_of(from_role) < index_of(to_role) {
            Decision::Allowed
        } else {
            Decision::Forbidden("lower-only".to_string())
        };
    }
    match profile.allows.get(from_role) {
        None => Decision::Unruled,
        Some(targets) if targets.iter().any(|target| target == to_role) => Decision::Allowed,
        Some(_) => Decision::Forbidden(format!("allow-{from_role}")),
    }
}

/// Measures the edges of `scan` against `profile`.
pub fn evaluate_architecture_conformance(
    profile: &ArchitectureProfile,
    scan: &ImportScan,
) -> Conformance {
    let mut matcher = Matcher::new();
    let mut files_by_role: BTreeMap<&str, BTreeSet<String>> = profile
        .roles
        .iter()
        .map(|role| (role.id.as_str(), BTreeSet::new()))
        .collect();
    let mut observed: Vec<ObservedRoleEdge> = Vec::new();
    let mut observed_index: HashMap<(String, String), usize> = HashMap::new();
    let mut violations: Vec<Violation> = Vec::new();
    let (mut unmapped, mut unruled, mut unknown_usages, mut excluded_by_usage) = (0, 0, 0, 0);
    let mut usage_tally = UsageCounts::default();
    for edge in &scan.edges {
        usage_tally.add(edge.import_usage);
    }

    for edge in &scan.edges {
        // Rules govern scoped sources; unmodeled targets remain unknown.
        let in_scope = matcher.any(&edge.from, &profile.scope_paths)
            && !matcher.any(&edge.from, &profile.exclude_paths);
        if !in_scope || matcher.any(&edge.to, &profile.exclude_paths) {
            continue;
        }
        let roles_of = |matcher: &mut Matcher, path: &str| -> Vec<&str> {
            profile
                .roles
                .iter()
                .filter(|role| matcher.any(path, &role.paths))
                .map(|role| role.id.as_str())
                .collect()
        };
        let from_roles = roles_of(&mut matcher, &edge.from);
        let to_roles = roles_of(&mut matcher, &edge.to);
        let ([from_role], [to_role]) = (from_roles.as_slice(), to_roles.as_slice()) else {
            unmapped += 1;
            continue;
        };
        let (from_role, to_role) = (*from_role, *to_role);
        let from_path = normalize_path(&edge.from);
        let to_path = normalize_path(&edge.to);
        if let Some(files) = files_by_role.get_mut(from_role) {
            files.insert(from_path.clone());
        }
        if let Some(files) = files_by_role.get_mut(to_role) {
            files.insert(to_path.clone());
        }
        let at = *observed_index
            .entry((from_role.to_string(), to_role.to_string()))
            .or_insert_with(|| {
                observed.push(ObservedRoleEdge {
                    from_role: from_role.to_string(),
                    to_role: to_role.to_string(),
                    count: 0,
                    import_usage_counts: ObservedUsageCounts::default(),
                    evidence: Vec::new(),
                });
                observed.len() - 1
            });
        let Some(row) = observed.get_mut(at) else {
            continue;
        };
        row.count += 1;
        match edge.import_usage {
            ImportUsage::Value => row.import_usage_counts.value += 1,
            ImportUsage::TypeOnly => row.import_usage_counts.type_only += 1,
            ImportUsage::Unknown => row.import_usage_counts.unknown += 1,
        }
        if row.evidence.len() < EVIDENCE_PER_ROLE_EDGE {
            row.evidence.push(RoleEdgeEvidence {
                from: from_path.clone(),
                to: to_path.clone(),
                kind: edge.kind,
                import_usage: edge.import_usage,
            });
        }
        if edge.import_usage == ImportUsage::Unknown {
            unknown_usages += 1;
            continue;
        }
        if !profile
            .dependency_usages
            .iter()
            .any(|usage| usage == edge.import_usage.word())
        {
            excluded_by_usage += 1;
            continue;
        }
        match rule_for(profile, from_role, to_role) {
            Decision::Unruled => unruled += 1,
            Decision::Allowed => {}
            Decision::Forbidden(rule) => violations.push(Violation {
                from_role: from_role.to_string(),
                to_role: to_role.to_string(),
                from: from_path,
                to: to_path,
                kind: edge.kind,
                import_usage: edge.import_usage,
                rule,
            }),
        }
    }

    let roles: Vec<RoleReport> = profile
        .roles
        .iter()
        .map(|role| {
            let mut matched: Vec<&String> = files_by_role
                .get(role.id.as_str())
                .map(|files| files.iter().collect())
                .unwrap_or_default();
            matched.sort_by(|left, right| answer_format::utf16::compare(left, right));
            RoleReport {
                id: role.id.clone(),
                paths: role.paths.clone(),
                matched_file_count: matched.len(),
                matched_files: matched
                    .iter()
                    .take(MATCHED_FILE_SAMPLE_LIMIT)
                    .map(|file| (*file).clone())
                    .collect(),
                matched_files_limited: matched.len() > MATCHED_FILE_SAMPLE_LIMIT,
            }
        })
        .collect();
    let empty_roles: Vec<String> = roles
        .iter()
        .filter(|role| role.matched_files.is_empty())
        .map(|role| role.id.clone())
        .collect();
    let coverage_incomplete = !scan.coverage.all_detected_languages_supported;
    let has_unknown = coverage_incomplete
        || unmapped > 0
        || unruled > 0
        || unknown_usages > 0
        || !empty_roles.is_empty();
    let status = if !violations.is_empty() {
        ConformanceStatus::Violated
    } else if has_unknown {
        ConformanceStatus::Unknown
    } else {
        ConformanceStatus::Conforms
    };
    observed.sort_by(|left, right| {
        compare_text(
            &format!("{}:{}", left.from_role, left.to_role),
            &format!("{}:{}", right.from_role, right.to_role),
        )
    });
    let violation_count = violations.len();
    violations.truncate(VIOLATION_SAMPLE_LIMIT);
    Conformance {
        contract: "architectureConformance:v1",
        status,
        roles,
        observed_role_edges: observed,
        excluded_by_usage,
        violation_count,
        violations,
        violations_limited: violation_count > VIOLATION_SAMPLE_LIMIT,
        unknown: UnknownTally {
            coverage_incomplete,
            unmapped_edges: unmapped,
            unruled_edges: unruled,
            unknown_import_usages: unknown_usages,
            empty_roles,
        },
        source: ConformanceSource {
            root_path: scan.root_path.clone(),
            files_scanned: scan.files_scanned,
            supported_languages: scan.coverage.supported_languages.to_vec(),
            import_usage_counts: SourceUsageCounts {
                value: usage_tally.value,
                type_only: usage_tally.type_only,
                unknown: usage_tally.unknown,
                missing: 0,
            },
        },
    }
}

/// What a person should do next, in the order they are asked.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum NextAction {
    InspectViolations {
        id: &'static str,
        count: usize,
    },
    CloseMeasurementGaps {
        id: &'static str,
        unknown: UnknownTally,
    },
    PlanWithinArchitecture {
        id: &'static str,
        #[serde(rename = "profileSlug")]
        profile_slug: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefRole<'a> {
    pub id: &'a str,
    pub paths: &'a [String],
    pub allowed_dependencies: Option<Vec<&'a str>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefProfile<'a> {
    pub uid: &'a str,
    pub slug: &'a str,
    pub project_uid: &'a str,
    pub title: &'a str,
    pub patterns: &'a [ProfilePattern],
    pub scope_paths: &'a [String],
    pub exclude_paths: &'a [String],
    pub roles: Vec<BriefRole<'a>>,
    pub dependency_policy: &'static str,
    pub dependency_usages: &'a [String],
    pub evidence: &'a [String],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlanContract {
    pub contract: &'static str,
    pub required_fields: [&'static str; 7],
}

/// When and with what the source was measured.
#[derive(Debug, Serialize)]
pub struct MeasuredStamp {
    pub at: String,
    pub tool: MeasuredTool,
    pub source: MeasuredSource,
}

#[derive(Debug, Serialize)]
pub struct MeasuredTool {
    pub name: &'static str,
    pub version: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum MeasuredSource {
    Git { revision: String, dirty: bool },
    Folder { fingerprint: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchitectureBrief<'a> {
    pub contract: &'static str,
    pub side_effect: u8,
    pub profile: BriefProfile<'a>,
    pub conformance: Conformance,
    pub agent_plan_contract: AgentPlanContract,
    pub next_actions: Vec<NextAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub measured: Option<MeasuredStamp>,
}

pub fn build_architecture_brief<'a>(
    profile: &'a ArchitectureProfile,
    scan: &ImportScan,
    measured: Option<MeasuredStamp>,
) -> ArchitectureBrief<'a> {
    let conformance = evaluate_architecture_conformance(profile, scan);
    let mut next_actions = Vec::new();
    if !conformance.violations.is_empty() {
        next_actions.push(NextAction::InspectViolations {
            id: "inspect_violations",
            count: conformance.violations.len(),
        });
    }
    if conformance.status == ConformanceStatus::Unknown {
        next_actions.push(NextAction::CloseMeasurementGaps {
            id: "close_measurement_gaps",
            unknown: conformance.unknown.clone(),
        });
    }
    next_actions.push(NextAction::PlanWithinArchitecture {
        id: "plan_within_architecture",
        profile_slug: profile.slug.clone(),
    });
    let roles = profile
        .roles
        .iter()
        .enumerate()
        .map(|(index, role)| BriefRole {
            id: &role.id,
            paths: &role.paths,
            allowed_dependencies: if profile.dependency_policy == DependencyPolicy::LowerOnly {
                Some(
                    profile
                        .roles
                        .iter()
                        .skip(index + 1)
                        .map(|lower| lower.id.as_str())
                        .collect(),
                )
            } else {
                profile
                    .allows
                    .get(&role.id)
                    .map(|targets| targets.iter().map(String::as_str).collect())
            },
        })
        .collect();
    ArchitectureBrief {
        contract: "architectureBrief:v1",
        side_effect: 0,
        profile: BriefProfile {
            uid: &profile.uid,
            slug: &profile.slug,
            project_uid: &profile.project_uid,
            title: &profile.title,
            patterns: &profile.patterns,
            scope_paths: &profile.scope_paths,
            exclude_paths: &profile.exclude_paths,
            roles,
            dependency_policy: profile.dependency_policy.word(),
            dependency_usages: &profile.dependency_usages,
            evidence: &profile.evidence,
        },
        conformance,
        agent_plan_contract: AgentPlanContract {
            contract: "architectureChangePlan:v1",
            required_fields: [
                "touchedRoles",
                "plannedPaths",
                "expectedNewDependencies",
                "crossedBoundaries",
                "preservedInterfaces",
                "verificationCommands",
                "unknowns",
            ],
        },
        next_actions,
        measured,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::architecture_profile::ProfileRole;
    use crate::import_coverage::ImportCoverage;
    use crate::import_edges::{ImportEdge, SourceRole};

    fn profile(
        policy: DependencyPolicy,
        roles: &[&str],
        allows: &[(&str, &[&str])],
    ) -> ArchitectureProfile {
        ArchitectureProfile {
            uid: "00000000-0000-4000-8000-000000000001".to_string(),
            slug: "architecture/layers".to_string(),
            project_uid: "00000000-0000-4000-8000-000000000002".to_string(),
            title: "Layers".to_string(),
            patterns: Vec::new(),
            scope_paths: vec!["src/**".to_string()],
            exclude_paths: vec!["src/generated/**".to_string()],
            roles: roles
                .iter()
                .map(|role| ProfileRole {
                    id: (*role).to_string(),
                    paths: vec![format!("src/{role}/**")],
                })
                .collect(),
            dependency_policy: policy,
            dependency_usages: vec!["value".to_string()],
            allows: allows
                .iter()
                .map(|(role, targets)| {
                    (
                        (*role).to_string(),
                        targets.iter().map(|target| (*target).to_string()).collect(),
                    )
                })
                .collect(),
            evidence: Vec::new(),
            document_slug: "architecture/layers".to_string(),
        }
    }

    fn scan(edges: &[(&str, &str, ImportUsage)], languages_all_supported: bool) -> ImportScan {
        let mut coverage = ImportCoverage::new(!languages_all_supported, false, 0);
        coverage.all_detected_languages_supported = languages_all_supported;
        ImportScan {
            root_path: "/repo".to_string(),
            files_scanned: edges.len(),
            coverage,
            edges: edges
                .iter()
                .map(|(from, to, usage)| ImportEdge {
                    from: (*from).to_string(),
                    to: (*to).to_string(),
                    kind: ImportKind::Static,
                    source_role: SourceRole::Production,
                    import_usage: *usage,
                })
                .collect(),
            external_imports: Vec::new(),
            unresolved: Vec::new(),
            module_edges: Vec::new(),
            package_import_evidence: None,
            read_boundary: None,
        }
    }

    fn layers() -> ArchitectureProfile {
        profile(DependencyPolicy::LowerOnly, &["ui", "domain", "data"], &[])
    }

    #[test]
    fn an_import_that_climbs_the_layers_is_a_violation_even_when_other_edges_are_unknown() {
        let found = evaluate_architecture_conformance(
            &layers(),
            &scan(
                &[
                    ("src/ui/a.ts", "src/domain/b.ts", ImportUsage::Value),
                    ("src/data/c.ts", "src/ui/a.ts", ImportUsage::Value),
                    ("src/ui/a.ts", "src/unowned/x.ts", ImportUsage::Value),
                ],
                true,
            ),
        );
        assert_eq!(found.status, ConformanceStatus::Violated);
        assert_eq!(found.violation_count, 1);
        let violation = &found.violations[0];
        assert_eq!(
            (
                violation.from.as_str(),
                violation.to.as_str(),
                violation.rule.as_str()
            ),
            ("src/data/c.ts", "src/ui/a.ts", "lower-only")
        );
        assert_eq!(found.unknown.unmapped_edges, 1);
    }

    #[test]
    fn an_edge_no_role_owns_or_a_role_no_file_matched_makes_the_answer_unknown_not_conforming() {
        let unowned = evaluate_architecture_conformance(
            &layers(),
            &scan(
                &[
                    ("src/ui/a.ts", "src/domain/b.ts", ImportUsage::Value),
                    ("src/domain/b.ts", "src/data/c.ts", ImportUsage::Value),
                    ("src/ui/a.ts", "src/unowned/x.ts", ImportUsage::Value),
                ],
                true,
            ),
        );
        assert_eq!(unowned.status, ConformanceStatus::Unknown);
        assert_eq!(unowned.unknown.unmapped_edges, 1);

        let empty_role = evaluate_architecture_conformance(
            &layers(),
            &scan(
                &[("src/ui/a.ts", "src/domain/b.ts", ImportUsage::Value)],
                true,
            ),
        );
        assert_eq!(empty_role.status, ConformanceStatus::Unknown);
        assert_eq!(empty_role.unknown.empty_roles, ["data"]);

        let unknown_usage = evaluate_architecture_conformance(
            &layers(),
            &scan(
                &[
                    ("src/ui/a.ts", "src/domain/b.ts", ImportUsage::Value),
                    ("src/domain/b.ts", "src/data/c.ts", ImportUsage::Unknown),
                ],
                true,
            ),
        );
        assert_eq!(unknown_usage.status, ConformanceStatus::Unknown);
        assert_eq!(unknown_usage.unknown.unknown_import_usages, 1);

        let unsupported_language = evaluate_architecture_conformance(
            &layers(),
            &scan(
                &[
                    ("src/ui/a.ts", "src/domain/b.ts", ImportUsage::Value),
                    ("src/domain/b.ts", "src/data/c.ts", ImportUsage::Value),
                ],
                false,
            ),
        );
        assert_eq!(unsupported_language.status, ConformanceStatus::Unknown);
        assert!(unsupported_language.unknown.coverage_incomplete);
    }

    #[test]
    fn only_a_scan_whose_every_edge_was_mapped_and_ruled_conforms() {
        let found = evaluate_architecture_conformance(
            &layers(),
            &scan(
                &[
                    ("src/ui/a.ts", "src/domain/b.ts", ImportUsage::Value),
                    ("src/domain/b.ts", "src/data/c.ts", ImportUsage::Value),
                    ("src/domain/b.ts", "src/domain/d.ts", ImportUsage::Value),
                    ("src/data/c.ts", "src/ui/a.ts", ImportUsage::TypeOnly),
                    ("src/ui/a.ts", "src/generated/g.ts", ImportUsage::Value),
                ],
                true,
            ),
        );
        assert_eq!(found.status, ConformanceStatus::Conforms);
        assert_eq!(found.violation_count, 0);
        assert_eq!(
            found.excluded_by_usage, 1,
            "a type-only climb is outside the profile's usages"
        );
        let rows: Vec<_> = found
            .observed_role_edges
            .iter()
            .map(|row| (row.from_role.as_str(), row.to_role.as_str(), row.count))
            .collect();
        assert_eq!(
            rows,
            [
                ("data", "ui", 1),
                ("domain", "data", 1),
                ("domain", "domain", 1),
                ("ui", "domain", 1)
            ]
        );
    }

    #[test]
    fn an_explicit_profile_judges_by_its_allow_lists_and_is_unknown_for_a_role_without_one() {
        let explicit = profile(
            DependencyPolicy::Explicit,
            &["ui", "domain", "data"],
            &[("ui", &["domain"]), ("domain", &["data"])],
        );
        let forbidden = evaluate_architecture_conformance(
            &explicit,
            &scan(
                &[("src/ui/a.ts", "src/data/c.ts", ImportUsage::Value)],
                true,
            ),
        );
        assert_eq!(forbidden.status, ConformanceStatus::Violated);
        assert_eq!(forbidden.violations[0].rule, "allow-ui");

        let unruled = evaluate_architecture_conformance(
            &explicit,
            &scan(
                &[
                    ("src/ui/a.ts", "src/domain/b.ts", ImportUsage::Value),
                    ("src/domain/b.ts", "src/data/c.ts", ImportUsage::Value),
                    ("src/data/c.ts", "src/domain/b.ts", ImportUsage::Value),
                ],
                true,
            ),
        );
        assert_eq!(unruled.status, ConformanceStatus::Unknown);
        assert_eq!(unruled.unknown.unruled_edges, 1);
    }
}
