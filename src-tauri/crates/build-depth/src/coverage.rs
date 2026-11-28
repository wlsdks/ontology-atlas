//! What a map still lacks against its survey, as counts and the first rows to act on. The answer
//! is small by design: counts, ten unplaced abilities per page (`offset` pages through the rest),
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
use crate::node_fields::{kind_of, node_path};
use crate::not_mapped_lines::lines_to_keep;
use crate::survey_findings::{survey_findings, SurveyEvidence};

/// Unplaced abilities one page lists.
pub const UNPLACED_PAGE_ROWS: usize = 10;
/// Files and areas the next mapping call names.
const MAP_NEXT_FILES: usize = 18;
const MAP_NEXT_AREAS: usize = 7;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UnplacedRow {
    pub kind: &'static str,
    pub name: String,
    pub evidence: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReadSummary {
    pub capabilities: usize,
    pub read: usize,
    /// Files this session served.
    pub served: usize,
}

/// How the survey's abilities sit on the map, and the rows still unplaced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Breadth {
    pub abilities: usize,
    pub not_listed: usize,
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
}

#[derive(Serialize, Clone, Copy)]
struct UnplacedPage<'a> {
    total: usize,
    offset: usize,
    returned: usize,
    /// Where the next ten start, when there are more.
    #[serde(rename = "nextOffset", skip_serializing_if = "Option::is_none")]
    next_offset: Option<usize>,
    rows: &'a [UnplacedRow],
}

#[derive(Serialize, Clone, Copy)]
struct BreadthPage<'a> {
    abilities: usize,
    #[serde(rename = "notListed", skip_serializing_if = "is_zero")]
    not_listed: usize,
    node: usize,
    named: usize,
    excluded: usize,
    unplaced: UnplacedPage<'a>,
}

#[allow(clippy::trivially_copy_pass_by_ref, reason = "serde passes a reference")]
fn is_zero(count: &usize) -> bool {
    *count == 0
}

/// One page of the measure: every count, and ten unplaced rows from `offset`.
#[derive(Serialize, Clone, Copy)]
pub struct CoveragePage<'a> {
    breadth: BreadthPage<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    areas: &'a Option<AreaSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reads: &'a Option<ReadSummary>,
}

impl Coverage {
    /// A survey that found no abilities, no area and no read gives the answer nothing to say.
    fn says_nothing(&self) -> bool {
        self.breadth.abilities == 0
            && self.reads.is_none()
            && self
                .areas
                .as_ref()
                .is_none_or(|areas| areas.counted == 0)
    }

    pub fn page(&self, offset: usize) -> CoveragePage<'_> {
        let total = self.breadth.unplaced.len();
        let start = offset.min(total);
        let end = (start + UNPLACED_PAGE_ROWS).min(total);
        let rows = self.breadth.unplaced.get(start..end).unwrap_or_default();
        CoveragePage {
            breadth: BreadthPage {
                abilities: self.breadth.abilities,
                not_listed: self.breadth.not_listed,
                node: self.breadth.node,
                named: self.breadth.named,
                excluded: self.breadth.excluded,
                unplaced: UnplacedPage {
                    total,
                    offset: start,
                    returned: rows.len(),
                    next_offset: (end < total).then_some(end),
                    rows,
                },
            },
            areas: &self.areas,
            reads: &self.reads,
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
    let percent = if uncovered > 0 { percent.min(99) } else { percent };
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
        evidence: row.evidence.clone(),
        symbol: row.symbol.clone(),
    }
}

fn read_summary(documents: &[LoadedDocument], reads: &ReadsUnder) -> Option<ReadSummary> {
    if reads.reads.is_empty() {
        return None;
    }
    let capabilities: Vec<&LoadedDocument> = documents
        .iter()
        .filter(|document| kind_of(document) == "capability" && node_path(document).is_some())
        .collect();
    let read = capabilities
        .iter()
        .filter(|document| {
            node_path(document).is_some_and(|path| reads.reads.contains_key(&path))
        })
        .count();
    Some(ReadSummary {
        capabilities: capabilities.len(),
        read,
        served: reads.reads.len(),
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
            not_listed: survey.map.abilities_omitted,
            node: count(Placement::Node),
            named: count(Placement::Named),
            excluded: count(Placement::Excluded),
            unplaced,
        },
        areas: areas.as_ref().map(area_summary),
        reads: read_summary(documents, reads),
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
            evidence: format!("a.ts:L{at}"),
            symbol: None,
        };
        let coverage = Coverage {
            breadth: Breadth {
                abilities: 25,
                not_listed: 0,
                node: 0,
                named: 0,
                excluded: 0,
                unplaced: (0..25).map(row).collect(),
            },
            areas: None,
            reads: None,
        };
        let first = serde_json::to_value(coverage.page(0)).expect("serializes");
        assert_eq!(first["breadth"]["unplaced"]["total"], 25);
        assert_eq!(first["breadth"]["unplaced"]["returned"], 10);
        let last = serde_json::to_value(coverage.page(20)).expect("serializes");
        assert_eq!(last["breadth"]["unplaced"]["returned"], 5);
        assert_eq!(last["breadth"]["unplaced"]["rows"][0]["name"], "n20");
    }
}
