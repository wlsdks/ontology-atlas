//! What a map still lacks against its survey, as counts and the first rows to act on. The answer
//! is small by design: counts, then ten unplaced abilities per page (`unplacedOffset` pages through
//! the rest, on a cursor of its own so that paging the problem list never skips an unplaced row),
//! and the next files to map. A reader who wants the rest asks for the next page; a full list in
//! every answer was about 7,000 tokens a call.

use std::collections::HashMap;

use confined_files::SourceFiles;
use repository_survey::{AbilityRow, Survey};
use serde::Serialize;
use source_reads::ReadsUnder;
use vault_document::{Issue, LoadedDocument};

use crate::ability_placement::{place_abilities, Placement};
use crate::area_coverage::{measure_areas, AreaCoverage};
use crate::capability_links::capability_links;
use crate::line_cites::{cited_lines_exist, line_cites, served_lines, CitedText};
use crate::node_fields::{kind_of, node_path};
use crate::not_mapped_lines::lines_to_keep;
use crate::rule_without_read_lines::cited_lines_decide;
use crate::survey_findings::{survey_findings, SurveyEvidence};

/// Unplaced abilities one page lists.
pub const UNPLACED_PAGE_ROWS: usize = 10;
/// Members of a family an unplaced row names; the row also counts them all.
const MEMBERS_SHOWN: usize = 6;
/// Files and areas the next mapping call names.
const MAP_NEXT_FILES: usize = 18;
const MAP_NEXT_AREAS: usize = 7;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UnplacedRow {
    pub kind: &'static str,
    pub name: String,
    pub path: String,
    pub evidence: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub members: Option<Vec<String>>,
    #[serde(rename = "memberCount", skip_serializing_if = "Option::is_none")]
    pub member_count: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MapNext {
    pub area: String,
    pub uncovered: usize,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AreaSummary {
    pub counted: usize,
    #[serde(rename = "notMapped")]
    pub not_mapped: usize,
    pub abilities: usize,
    pub uncovered: usize,
    #[serde(rename = "mappedPercent", skip_serializing_if = "Option::is_none")]
    pub mapped_percent: Option<u8>,
    /// The `Not mapped yet` lines the project keeps under `## Uncertainty`, exactly as written.
    #[serde(rename = "keepLines")]
    pub keep_lines: Vec<String>,
    #[serde(rename = "mapNext")]
    pub map_next: Vec<MapNext>,
}

/// How many capabilities with a `path:` have a cite of read lines that hold their condition.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReadSummary {
    pub capabilities: usize,
    pub read: usize,
    /// The capabilities still to read. While this session has served nothing it counts only those
    /// whose cites name no lines that exist: a cite made in an earlier session is not unread.
    pub unread: usize,
}

/// How many dependencies run between capabilities, and how many capabilities have none.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct AbilityEdgeSummary {
    pub edges: usize,
    #[serde(rename = "capabilitiesWithoutEdge")]
    pub capabilities_without_edge: usize,
}

/// How the survey's abilities sit on the map, and the rows still unplaced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Breadth {
    pub abilities: usize,
    pub node: usize,
    pub named: usize,
    pub excluded: usize,
    pub unplaced: Vec<UnplacedRow>,
}

/// The whole measure. A write that wants to say only what changed compares two of these.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Coverage {
    pub breadth: Breadth,
    pub areas: Option<AreaSummary>,
    pub reads: Option<ReadSummary>,
    /// `None` below two capabilities: one has nothing to depend on.
    pub ability_edges: Option<AbilityEdgeSummary>,
}

#[derive(Serialize, Clone, Copy)]
struct AbilityCounts {
    surveyed: usize,
    #[serde(rename = "onNode")]
    on_node: usize,
    named: usize,
    excluded: usize,
    unplaced: usize,
}

#[derive(Serialize, Clone, Copy)]
struct AreaCounts {
    counted: usize,
    #[serde(rename = "notMapped")]
    not_mapped: usize,
    abilities: usize,
    uncovered: usize,
    #[serde(rename = "mappedPercent", skip_serializing_if = "Option::is_none")]
    mapped_percent: Option<u8>,
}

/// Where the next page of unplaced abilities starts; a cursor of its own.
#[derive(Serialize, Clone, Copy)]
struct UnplacedOffset {
    offset: usize,
    returned: usize,
    total: usize,
    #[serde(rename = "hasMore")]
    has_more: bool,
    #[serde(rename = "nextOffset")]
    next_offset: Option<usize>,
}

/// One page of the measure: every count, then ten unplaced rows from `unplaced_offset` and the
/// cursor to the next ten.
#[derive(Serialize, Clone, Copy)]
pub struct CoveragePage<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    abilities: Option<AbilityCounts>,
    #[serde(skip_serializing_if = "Option::is_none")]
    areas: &'a Option<AreaSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reads: &'a Option<ReadSummary>,
    #[serde(rename = "abilityEdges", skip_serializing_if = "Option::is_none")]
    ability_edges: Option<AbilityEdgeSummary>,
    #[serde(skip_serializing_if = "<[UnplacedRow]>::is_empty")]
    unplaced: &'a [UnplacedRow],
    #[serde(rename = "unplacedOffset", skip_serializing_if = "Option::is_none")]
    unplaced_offset: Option<UnplacedOffset>,
}

/// The counts of the measure and nothing behind them: no unplaced rows, no lines to keep, no files
/// to map next. What a brief carries, because the rows are `validate_vault`'s to list.
#[derive(Serialize, Clone, Copy)]
pub struct CoverageCounts<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    abilities: Option<AbilityCounts>,
    #[serde(skip_serializing_if = "Option::is_none")]
    areas: Option<AreaCounts>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reads: &'a Option<ReadSummary>,
    #[serde(rename = "abilityEdges", skip_serializing_if = "Option::is_none")]
    ability_edges: Option<AbilityEdgeSummary>,
}

impl Coverage {
    fn ability_counts(&self) -> Option<AbilityCounts> {
        (self.breadth.abilities > 0).then_some(AbilityCounts {
            surveyed: self.breadth.abilities,
            on_node: self.breadth.node,
            named: self.breadth.named,
            excluded: self.breadth.excluded,
            unplaced: self.breadth.unplaced.len(),
        })
    }

    pub fn counts(&self) -> CoverageCounts<'_> {
        CoverageCounts {
            abilities: self.ability_counts(),
            areas: self.areas.as_ref().map(|areas| AreaCounts {
                counted: areas.counted,
                not_mapped: areas.not_mapped,
                abilities: areas.abilities,
                uncovered: areas.uncovered,
                mapped_percent: areas.mapped_percent,
            }),
            reads: &self.reads,
            ability_edges: self.ability_edges,
        }
    }

    /// A survey that found no abilities, no area and no read gives the answer nothing to say.
    fn says_nothing(&self) -> bool {
        self.breadth.abilities == 0
            && self.reads.is_none()
            && self.areas.as_ref().is_none_or(|areas| areas.counted == 0)
    }

    pub fn page(&self, unplaced_offset: usize) -> CoveragePage<'_> {
        let total = self.breadth.unplaced.len();
        let start = unplaced_offset.min(total);
        let end = (start + UNPLACED_PAGE_ROWS).min(total);
        let rows = self.breadth.unplaced.get(start..end).unwrap_or_default();
        let next = (end < total).then_some(end);
        CoveragePage {
            abilities: self.ability_counts(),
            areas: &self.areas,
            reads: &self.reads,
            ability_edges: self.ability_edges,
            unplaced: rows,
            unplaced_offset: (!rows.is_empty()).then_some(UnplacedOffset {
                offset: start,
                returned: rows.len(),
                total,
                has_more: next.is_some(),
                next_offset: next,
            }),
        }
    }
}

/// The share of surveyed abilities on the map in whole percent, never 100 while any is
/// uncovered; `None` without abilities.
fn mapped_percent(abilities: usize, uncovered: usize) -> Option<u8> {
    if abilities == 0 {
        return None;
    }
    let mapped = abilities - uncovered;
    let percent = (200 * mapped + abilities) / (2 * abilities);
    let percent = if uncovered > 0 {
        percent.min(99)
    } else {
        percent
    };
    u8::try_from(percent).ok()
}

fn map_next(coverage: &AreaCoverage<'_>) -> Vec<MapNext> {
    let mut batch: Vec<MapNext> = Vec::new();
    let mut files = 0;
    for area in &coverage.not_mapped {
        if batch.len() == MAP_NEXT_AREAS || files == MAP_NEXT_FILES {
            break;
        }
        if area.uncovered_files.is_empty() {
            continue;
        }
        let taken: Vec<String> = area
            .uncovered_files
            .iter()
            .take(MAP_NEXT_FILES - files)
            .map(|file| file.path.clone())
            .collect();
        files += taken.len();
        batch.push(MapNext {
            area: area.area.path.clone(),
            uncovered: area.uncovered,
            files: taken,
        });
    }
    if batch.is_empty() {
        if let Some(first) = coverage.not_mapped.first() {
            batch.push(MapNext {
                area: first.area.path.clone(),
                uncovered: first.uncovered,
                files: Vec::new(),
            });
        }
    }
    batch
}

fn area_summary(coverage: &AreaCoverage<'_>) -> AreaSummary {
    AreaSummary {
        counted: coverage.counted,
        not_mapped: coverage.not_mapped.len(),
        abilities: coverage.abilities,
        uncovered: coverage.uncovered,
        mapped_percent: mapped_percent(coverage.abilities, coverage.uncovered),
        keep_lines: lines_to_keep(coverage),
        map_next: map_next(coverage),
    }
}

fn unplaced_row(row: &AbilityRow) -> UnplacedRow {
    UnplacedRow {
        kind: row.kind.word(),
        name: row.name.clone(),
        path: row.path.clone(),
        evidence: row.evidence.clone(),
        members: row
            .members
            .as_ref()
            .map(|members| members.iter().take(MEMBERS_SHOWN).cloned().collect()),
        member_count: row.members.as_ref().map(Vec::len),
    }
}

fn ability_edges(documents: &[LoadedDocument]) -> Option<AbilityEdgeSummary> {
    let links = capability_links(documents);
    (links.capabilities >= 2).then(|| AbilityEdgeSummary {
        edges: links.edges,
        capabilities_without_edge: links.alone.len(),
    })
}

/// A capability is read when its body cites lines this session served that hold a condition:
/// opening a file, or line 1 of it, is not reading the rule. `None` when no capability has a path.
fn read_summary(
    documents: &[LoadedDocument],
    reads: &ReadsUnder,
    source: &dyn SourceFiles,
) -> Option<ReadSummary> {
    let capabilities: Vec<&LoadedDocument> = documents
        .iter()
        .filter(|document| kind_of(document) == "capability" && node_path(document).is_some())
        .collect();
    if capabilities.is_empty() {
        return None;
    }
    let mut texts = CitedText::default();
    let (mut unread, mut uncited) = (0, 0);
    for document in &capabilities {
        let body = document.body().unwrap_or_default();
        let cites = line_cites(&body, Some(source));
        let read = cites.iter().any(|cite| {
            served_lines(reads, cite) && cited_lines_decide(Some(source), &mut texts, cite)
        });
        if read {
            continue;
        }
        unread += 1;
        if !cites
            .iter()
            .any(|cite| cited_lines_exist(source, &mut texts, cite))
        {
            uncited += 1;
        }
    }
    Some(ReadSummary {
        capabilities: capabilities.len(),
        read: capabilities.len() - unread,
        unread: if reads.reads.is_empty() {
            uncited
        } else {
            unread
        },
    })
}

/// The coverage of the vault against `survey`, and the findings the survey and the reads add.
pub struct Measured {
    /// `None` when the survey found nothing to place and nothing to map.
    pub coverage: Option<Coverage>,
    pub findings: Vec<(String, Issue)>,
}

pub fn measure_against_survey(
    documents: &[LoadedDocument],
    survey: &Survey,
    reads: &ReadsUnder,
    source: &dyn SourceFiles,
) -> Measured {
    let abilities = &survey.map.abilities;
    let placements = place_abilities(documents, abilities);
    let count = |wanted: Placement| placements.iter().filter(|held| **held == wanted).count();
    let unplaced: Vec<UnplacedRow> = abilities
        .iter()
        .zip(&placements)
        .filter(|(_, placement)| **placement == Placement::Unplaced)
        .map(|(row, _)| unplaced_row(row))
        .collect();
    let file_lines: HashMap<&str, usize> = survey
        .collection
        .files
        .iter()
        .map(|file| (file.path.as_str(), file.lines))
        .collect();
    let areas = measure_areas(
        documents,
        survey.map.areas.as_deref(),
        &file_lines,
        Some(reads),
        source,
    );
    let findings = survey_findings(
        documents,
        &SurveyEvidence {
            source,
            collection: &survey.collection,
            reads,
        },
        areas.as_ref(),
    );
    let coverage = Coverage {
        breadth: Breadth {
            abilities: abilities.len(),
            node: count(Placement::Node),
            named: count(Placement::Named),
            excluded: count(Placement::Excluded),
            unplaced,
        },
        areas: areas.as_ref().map(area_summary),
        reads: read_summary(documents, reads, source),
        ability_edges: ability_edges(documents),
    };
    Measured {
        coverage: (!coverage.says_nothing()).then_some(coverage),
        findings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_share_is_never_a_hundred_percent_while_one_ability_is_uncovered() {
        assert_eq!(mapped_percent(0, 0), None);
        assert_eq!(mapped_percent(200, 1), Some(99));
        assert_eq!(mapped_percent(4, 1), Some(75));
        assert_eq!(mapped_percent(4, 0), Some(100));
    }

    #[test]
    fn a_page_lists_ten_unplaced_rows_from_its_offset_and_a_later_page_the_rest() {
        let row = |at: usize| UnplacedRow {
            kind: "command",
            name: format!("n{at}"),
            path: "a.ts".to_string(),
            evidence: format!("a.ts:L{at}"),
            members: None,
            member_count: None,
        };
        let coverage = Coverage {
            breadth: Breadth {
                abilities: 25,
                node: 0,
                named: 0,
                excluded: 0,
                unplaced: (0..25).map(row).collect(),
            },
            areas: None,
            reads: None,
            ability_edges: None,
        };
        let first = serde_json::to_value(coverage.page(0)).expect("serializes");
        assert_eq!(first["abilities"]["surveyed"], 25);
        assert_eq!(first["unplaced"].as_array().map(Vec::len), Some(10));
        assert_eq!(first["unplacedOffset"]["total"], 25);
        assert_eq!(first["unplacedOffset"]["nextOffset"], 10);
        let last = serde_json::to_value(coverage.page(20)).expect("serializes");
        assert_eq!(last["unplacedOffset"]["returned"], 5);
        assert_eq!(last["unplacedOffset"]["hasMore"], false);
        assert_eq!(last["unplaced"][0]["name"], "n20");
    }
}
