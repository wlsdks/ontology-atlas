//! What `finalize_project_meaning` holds an `answered` row to: placement against the survey's
//! abilities, reads and cites against this session, ability-to-ability edges and the project's
//! `Not mapped yet` lines. `validate_vault` reports the same measure as `finalizeGate`, so an
//! agent sees the refusal before it asks for it.

use std::collections::HashMap;

use confined_files::SourceFiles;
use repository_survey::{repo_text, AbilityKind, AbilityRow, Survey};
use serde::Serialize;
use source_reads::ReadsUnder;
use vault_document::LoadedDocument;

use crate::ability_placement::{place_abilities, Placement};
use crate::area_coverage::{measure_areas, AreaCoverage};
use crate::capability_links::{capability_links, CapabilityLinks};
use crate::dependency_both_ways::dependency_edges;
use crate::node_fields::{kind_of, project_of};
use crate::not_mapped_lines::{line_gap, lines_to_keep};
use crate::read_depth::{
    cite_repair, measure_reads, measure_rules, read_call, CapabilityRow, ReadDepth, RuleDepth,
};
use crate::role_placement::{measure_roles, RoleDepth, ROLE_REPAIR};

const LISTED: usize = 12;
const EDGES_PER_CAPABILITY: usize = 2;
const ABILITY_EDGES_PER_CAPABILITY: usize = 3;

/// The measure of a map's depth. Fields are read through the functions of this file.
pub struct BuildDepth<'a> {
    /// The survey's ability count and the rows no node places; `None` without a surveyed repository.
    abilities: Option<(usize, Vec<&'a AbilityRow>)>,
    reads: Option<ReadDepth>,
    rules: RuleDepth,
    ability_edges: CapabilityLinks<'a>,
    roles: Option<RoleDepth>,
    areas: Option<AreaCoverage<'a>>,
    capabilities: usize,
    depends_on: usize,
}

/// What the depth is measured from. `source` and `survey` are both there or both absent.
pub struct BuildDepthInput<'a> {
    pub documents: &'a [LoadedDocument],
    pub survey: Option<&'a Survey>,
    /// `None` when no repository is grounded; an empty record when one is and nothing was read.
    pub reads: Option<&'a ReadsUnder>,
    pub source: Option<&'a dyn SourceFiles>,
}

pub fn measure_build_depth<'a>(input: &BuildDepthInput<'a>) -> BuildDepth<'a> {
    let documents = input.documents;
    let abilities = input.survey.map(|survey| {
        let rows = &survey.map.abilities;
        let placements = place_abilities(documents, rows);
        let unplaced = rows
            .iter()
            .zip(&placements)
            .filter(|(_, placement)| **placement == Placement::Unplaced)
            .map(|(row, _)| row)
            .collect();
        (rows.len(), unplaced)
    });
    let areas = match (input.survey, input.source) {
        (Some(survey), Some(source)) => {
            let file_lines: HashMap<&str, usize> = survey
                .collection
                .files
                .iter()
                .map(|file| (file.path.as_str(), file.lines))
                .collect();
            measure_areas(documents, survey.map.areas.as_deref(), &file_lines, input.reads, source)
        }
        _ => None,
    };
    BuildDepth {
        abilities,
        reads: input
            .reads
            .map(|reads| measure_reads(documents, reads, input.source)),
        rules: measure_rules(documents, input.reads, input.source),
        ability_edges: capability_links(documents),
        roles: input
            .reads
            .and_then(|reads| measure_roles(documents, reads, input.source)),
        areas,
        capabilities: documents
            .iter()
            .filter(|document| kind_of(document) == "capability")
            .count(),
        depends_on: dependency_edges(documents).len(),
    }
}

fn listed<T>(rows: &[T], render: impl Fn(&T) -> String) -> String {
    let shown: Vec<String> = rows.iter().take(LISTED).map(&render).collect();
    let more = rows.len() - shown.len();
    if more > 0 {
        format!("{} and {more} more", shown.join(", "))
    } else {
        shown.join(", ")
    }
}

fn ability_label(row: &AbilityRow) -> String {
    let members = row.members.as_ref().map_or_else(String::new, |members| {
        let shown: Vec<String> = members.iter().take(4).map(|name| repo_text(name, 80)).collect();
        format!(": {}{}", shown.join(", "), if members.len() > 4 { ", ..." } else { "" })
    });
    if row.kind == AbilityKind::Family {
        let named = if !row.name.is_empty() && row.name != row.path {
            format!("{} family in {}", repo_text(&row.name, 160), repo_text(&row.path, 160))
        } else {
            format!("{} family", repo_text(&row.path, 160))
        };
        return format!("the {named} ({}{members})", repo_text(&row.evidence, 160));
    }
    let symbol = row
        .symbol
        .as_deref()
        .filter(|symbol| !symbol.is_empty() && *symbol != row.name)
        .map_or_else(String::new, |symbol| format!(" {}", repo_text(symbol, 120)));
    format!(
        "{} ({}, {}{symbol}{members})",
        repo_text(&row.name, 120),
        row.kind.word(),
        repo_text(&row.evidence, 160)
    )
}

/// Why finalize refuses a project whose `## Uncertainty` does not keep the summary line the measure
/// gives, or keeps one after every area is mapped; `None` when it does not. Only a repository
/// surveyed by area whose unmapped areas hold abilities needs the line.
pub fn not_mapped_lines_refusal(
    project_slug: &str,
    project_body: &str,
    depth: &BuildDepth<'_>,
) -> Option<String> {
    let areas = depth.areas.as_ref()?;
    let gap = line_gap(project_body, areas)?;
    if areas.not_mapped.is_empty() {
        return Some(
            [
                format!("finalize_project_meaning blocked: {project_slug} {gap}, and the app would keep offering to map the rest from them. Nothing was written."),
                format!("Next call: patch_concept({{\"slug\":\"{project_slug}\", \"body\": ...}}) without the Not mapped yet lines under ## Uncertainty, then finalize_project_meaning again."),
            ]
            .join("\n"),
        );
    }
    let mut lines = vec![
        format!("finalize_project_meaning blocked: {project_slug} {gap}, and the app shows how much of the code is on the map from that line. Nothing was written."),
        format!("Next call: patch_concept({{\"slug\":\"{project_slug}\", \"body\": ...}}) so the body's ## Uncertainty holds exactly these lines, replacing any earlier Not mapped yet lines, then finalize_project_meaning again:"),
    ];
    lines.extend(lines_to_keep(areas));
    Some(lines.join("\n"))
}

fn fallback(id: &str, gap: &str) -> String {
    format!("Only if that cannot be done, mark {id} partial with \"- Gap: {gap}\".")
}

/// Why an `answered` competency row is not supported by the map, one reason per row. Each leads
/// with the call that fixes the map (reading is the cheapest repair for evidence), and only then
/// the partial fallback. `answered` holds the ids of the rows given as answered.
pub fn competency_depth_refusals(answered: &[&str], depth: &BuildDepth<'_>) -> Vec<String> {
    let is_answered = |id: &str| answered.contains(&id);
    let mut reasons: Vec<String> = Vec::new();
    if let Some(reads) = depth
        .reads
        .as_ref()
        .filter(|reads| is_answered("evidence") && reads.capabilities > 0 && reads.unread.len() * 3 > reads.capabilities)
    {
        let unread: Vec<&CapabilityRow> = reads.unread.iter().collect();
        let served = if reads.served == 0 {
            " (this server process has served no reads; a restarted server keeps none)"
        } else {
            ""
        };
        reasons.push(format!(
            "- evidence: {} of {} capabilities cite no lines this server read that hold a condition{served}: {}. Next call: {}; each read returns the guards, defaults and callees that decide it. Patch each body with that rule and the cite of its lines, and finalize again. {}",
            reads.unread.len(),
            reads.capabilities,
            listed(&reads.unread, |row| format!("{} ({})", row.slug, row.path.as_deref().unwrap_or("null"))),
            read_call(&unread),
            fallback("evidence", "these abilities were outlined, not read"),
        ));
    }
    if is_answered("evidence") && reasons.is_empty() && depth.rules.judged_against_reads && !depth.rules.uncited.is_empty() {
        let uncited: Vec<&CapabilityRow> = depth.rules.uncited.iter().collect();
        reasons.push(format!(
            "- evidence: {} capabilities state a rule without citing read lines that hold its condition: {}. Next call: {}, and finalize again. {}",
            uncited.len(),
            listed(&depth.rules.uncited, |row| row.slug.clone()),
            cite_repair(&uncited),
            fallback("evidence", "some rules cite no read lines"),
        ));
    }
    if let Some((total, unplaced)) = depth
        .abilities
        .as_ref()
        .filter(|(_, unplaced)| is_answered("abilities") && !unplaced.is_empty())
    {
        let every: Vec<String> = unplaced.iter().map(|row| ability_label(row)).collect();
        reasons.push(format!(
            "- abilities: {} of {total} abilities the survey lists, the floor under the map, sit on no node by name and no exclusion: {}. Next call: add_concepts a capability for each thing a user or operator gets there, or patch_concept the node that covers it to name it in its title or in code form (`name`, a family or group names its members; a word in passing does not count), or exclude it in the project's ## Uncertainty with one line for it alone that cites its path:Lline or exact name and says why it is not an ability. {}",
            unplaced.len(),
            every.join("; "),
            fallback("abilities", "abilities not yet placed"),
        ));
    }
    if let Some(roles) = depth
        .roles
        .as_ref()
        .filter(|roles| is_answered("impact") && !roles.unplaced.is_empty())
    {
        let every: Vec<String> = roles.unplaced.iter().map(|role| role.label()).collect();
        reasons.push(format!(
            "- impact: {} implementation roles that two or more capabilities' reads pass through have no element, so \"what breaks if I change it\" has no node to start from: {}. Next call: {ROLE_REPAIR}. {}",
            roles.unplaced.len(),
            every.join("; "),
            fallback("impact", "shared roles not modelled as elements"),
        ));
    }
    if is_answered("impact")
        && depth.capabilities > 0
        && !reasons.iter().any(|reason| reason.starts_with("- impact:"))
    {
        let edges = &depth.ability_edges;
        if depth.depends_on * EDGES_PER_CAPABILITY < depth.capabilities {
            reasons.push(format!(
                "- impact: {} depends_on edges for {} capabilities, below one per two. Next call: add_relations with the dependencies the code shows, each why naming the call. {}",
                depth.depends_on,
                depth.capabilities,
                fallback("impact", "dependencies are recorded for only part of the map"),
            ));
        } else if depth.capabilities >= 3 && edges.edges * ABILITY_EDGES_PER_CAPABILITY < depth.capabilities {
            reasons.push(format!(
                "- impact: {} depends_on edges run from one capability to another for {} capabilities, so \"what else stops working\" ends at shared roles. Next call: add_relations for each ability that needs another to have run, be configured or be present (none touch {}), each why citing the read lines that show it. {}",
                edges.edges,
                depth.capabilities,
                listed(&edges.alone, |slug| (*slug).to_string()),
                fallback("impact", "conditions between abilities are recorded for only part of the map"),
            ));
        }
    }
    reasons
}

/// One block of the gate `finalize_project_meaning` applies, with its count.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum FinalizeBlock {
    Abilities { row: &'static str, unplaced: usize },
    ReadsMissing {
        row: &'static str,
        #[serde(rename = "capabilitiesNotRead")]
        capabilities_not_read: usize,
        of: usize,
    },
    RulesUncited {
        row: &'static str,
        #[serde(rename = "rulesWithoutReadLines")]
        rules_without_read_lines: usize,
    },
    RolesUnplaced {
        row: &'static str,
        #[serde(rename = "rolesWithoutElement")]
        roles_without_element: usize,
    },
    Dependencies {
        row: &'static str,
        #[serde(rename = "dependsOn")]
        depends_on: usize,
        capabilities: usize,
    },
    AbilityEdges {
        row: &'static str,
        #[serde(rename = "abilityEdges")]
        ability_edges: usize,
        capabilities: usize,
    },
    NotMappedLines { row: &'static str },
}

/// The gate `finalize_project_meaning` applies to a row it is given as `answered`, and to the
/// project's `Not mapped yet` lines, as one entry per block. Empty when finalize would let every
/// row through.
pub fn finalize_gate(documents: &[LoadedDocument], depth: &BuildDepth<'_>) -> Vec<FinalizeBlock> {
    let mut blocks = Vec::new();
    if let Some((_, unplaced)) = depth.abilities.as_ref().filter(|(_, unplaced)| !unplaced.is_empty()) {
        blocks.push(FinalizeBlock::Abilities {
            row: "abilities",
            unplaced: unplaced.len(),
        });
    }
    let reads_missing = depth
        .reads
        .as_ref()
        .filter(|reads| reads.capabilities > 0 && reads.unread.len() * 3 > reads.capabilities);
    if let Some(reads) = reads_missing {
        blocks.push(FinalizeBlock::ReadsMissing {
            row: "evidence",
            capabilities_not_read: reads.unread.len(),
            of: reads.capabilities,
        });
    } else if depth.rules.judged_against_reads && !depth.rules.uncited.is_empty() {
        blocks.push(FinalizeBlock::RulesUncited {
            row: "evidence",
            rules_without_read_lines: depth.rules.uncited.len(),
        });
    }
    if let Some(roles) = depth.roles.as_ref().filter(|roles| !roles.unplaced.is_empty()) {
        blocks.push(FinalizeBlock::RolesUnplaced {
            row: "impact",
            roles_without_element: roles.unplaced.len(),
        });
    } else if depth.capabilities > 0 && depth.depends_on * EDGES_PER_CAPABILITY < depth.capabilities {
        blocks.push(FinalizeBlock::Dependencies {
            row: "impact",
            depends_on: depth.depends_on,
            capabilities: depth.capabilities,
        });
    } else if depth.capabilities >= 3
        && depth.ability_edges.edges * ABILITY_EDGES_PER_CAPABILITY < depth.capabilities
    {
        blocks.push(FinalizeBlock::AbilityEdges {
            row: "impact",
            ability_edges: depth.ability_edges.edges,
            capabilities: depth.capabilities,
        });
    }
    if let (Some(project), Some(areas)) = (project_of(documents), depth.areas.as_ref()) {
        let body = project.body().map(std::borrow::Cow::into_owned).unwrap_or_default();
        if line_gap(&body, areas).is_some() {
            blocks.push(FinalizeBlock::NotMappedLines {
                row: "not-mapped-lines",
            });
        }
    }
    blocks
}

#[cfg(test)]
mod tests {
    #![allow(
        clippy::disallowed_methods,
        reason = "a test plants the repository and the vault the depth is measured from"
    )]

    use std::path::Path;

    use confined_files::{DiskSource, ScanRoots, VaultRoot};
    use repository_survey::{SurveyAsked, SurveyCache, SurveyFiles};
    use vault_document::{DocumentCache, LoadedVault};

    use super::*;

    fn write(root: &Path, name: &str, text: &str) {
        let file = root.join(name);
        std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
        std::fs::write(file, text).expect("write");
    }

    #[test]
    fn capabilities_nobody_read_block_evidence_and_impact_and_the_refusal_says_what_to_read() {
        let folder = tempfile::tempdir().expect("temp dir");
        let base = folder.path().canonicalize().expect("real");
        let (repository, vault) = (base.join("repo"), base.join("vault"));
        for name in ["order", "refund", "invoice"] {
            write(
                &repository,
                &format!("src/{name}.ts"),
                &format!("export function {name}() {{ return 1; }}\n"),
            );
            write(
                &vault,
                &format!("capabilities/{name}.md"),
                &format!(
                    "---\nkind: capability\ntitle: {name}\npath: src/{name}.ts\nsymbol: {name}\n---\nOutlined only.\n"
                ),
            );
        }
        let root = ScanRoots::new(repository.clone(), repository.clone())
            .expect("roots")
            .allow(&repository, "rootPath")
            .expect("allowed");
        let source = DiskSource::new(&root, 1024 * 1024);
        let asked = SurveyAsked {
            label: "repo".to_string(),
            ignore: Vec::new(),
            vault_exclusion: None,
        };
        let survey = SurveyCache::default().survey(&root, &SurveyFiles::new(&source), &asked);
        let loaded = LoadedVault::load(
            &VaultRoot::open(&vault).expect("vault root"),
            &DocumentCache::new(),
        )
        .expect("vault");
        let reads = ReadsUnder::default();
        let depth = measure_build_depth(&BuildDepthInput {
            documents: loaded.documents(),
            survey: Some(&survey),
            reads: Some(&reads),
            source: Some(&source),
        });

        let gate = finalize_gate(loaded.documents(), &depth);
        assert!(gate.contains(&FinalizeBlock::ReadsMissing {
            row: "evidence",
            capabilities_not_read: 3,
            of: 3
        }));
        assert!(gate.contains(&FinalizeBlock::Dependencies {
            row: "impact",
            depends_on: 0,
            capabilities: 3
        }));

        let refusals = competency_depth_refusals(&["evidence", "impact"], &depth);
        assert!(
            refusals[0].starts_with("- evidence: 3 of 3 capabilities cite no lines"),
            "{refusals:?}"
        );
        assert!(refusals[0].contains("this server process has served no reads"));
        assert!(refusals
            .iter()
            .any(|reason| reason.starts_with("- impact: 0 depends_on edges for 3 capabilities")));
        assert!(competency_depth_refusals(&["scope"], &depth).is_empty());
    }
}
