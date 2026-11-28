//! The survey `analyze_repo_structure` returns by default: the breadth map. Size, every product
//! unit with its main files, exported names and import edges, the entry points, the abilities to
//! place, and the documents, so the agent can outline the whole product before reading any part of
//! it. It proposes no node: a folder is evidence, and the agent names what the product does.
//! Static text scans plus one read of Git's ignored paths; no repository code runs.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::Path;

use indexmap::IndexMap;

use crate::ability_row::{ability_row_text, AbilityRow, MEMBERS_SHOWN};
use crate::ability_rows::{abilities_of, fair_shares, ABILITY_LIMIT};
use crate::doc_pages::{doc_pages, DocPage};
use crate::documented_abilities::Documents;
use crate::entry_points::{entry_points_of, EntryPoint};
use crate::folder_tree::TreeFile;
use crate::main_files::main_files_of;
use crate::readme_purpose::{readme_purpose, ReadmePurpose};
use crate::source_class::SourceClass;
use crate::survey_areas::{abilities_by_area, survey_areas, Area, AreaLocator};
use crate::survey_files::SurveyFiles;
use crate::survey_text::{format_count, repo_text};
use crate::unit_collection::{
    collect_source_units, CollectOptions, Collection, SurveyedFile, UnitScope,
};
use crate::unit_exports::{exports_of_text, EXPORTS_PER_UNIT};
use crate::unit_imports::{unit_imports, IMPORTS_PER_UNIT};

const SCAN_UNITS: usize = 256 * 1024;
/// The flat map's ceiling without its abilities: a few hundred files fit whole; a larger
/// repository is mapped by area.
const BREADTH_TEXT_BUDGET: usize = 24 * 1024;
const MAP_TEXT_LIMIT: usize = 30 * 1024;
/// The characters any `analyze_repo_structure` response forwards at most: hosts rejected a
/// 56,806-character survey and accepted 43,935 characters.
pub const SURVEY_RESPONSE_CHARS: usize = 40_000;
/// An area's path is the rootPath that opens it, so it is cut only where a root path would be.
const AREA_PATH_CHARS: usize = 400;

#[derive(Debug, Clone)]
pub struct MainFile {
    pub path: String,
    pub lines: usize,
}

#[derive(Debug, Clone)]
pub struct UnitRow {
    pub path: String,
    pub files: usize,
    pub lines: usize,
    pub main_files: Vec<MainFile>,
    pub exports: Vec<String>,
    pub imported_by: usize,
    pub imports: Vec<String>,
    pub imports_omitted: usize,
}

/// A file that holds abilities, with how many. Every ability the survey found is counted, also
/// those the listed rows cut, so a build is measured against the whole floor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AbilityFile {
    pub path: String,
    pub abilities: usize,
}

#[derive(Debug, Clone)]
pub struct AreaRow {
    pub path: String,
    pub files: usize,
    pub lines: usize,
    pub own: bool,
    pub rest: bool,
    pub members: Vec<String>,
    pub main_files: Vec<MainFile>,
    pub abilities: usize,
    /// The files of the area that hold abilities, in the order the abilities were found. The
    /// survey's text never lists them; a build's coverage is measured by them.
    pub ability_files: Vec<AbilityFile>,
}

#[derive(Debug, Clone)]
pub struct Size {
    pub product_files: usize,
    pub product_lines: usize,
    pub units: usize,
    pub outside: IndexMap<&'static str, (usize, usize)>,
    pub truncated: bool,
}

#[derive(Debug, Clone)]
pub struct BreadthMap {
    pub root_path: String,
    pub size: Size,
    pub units: Vec<UnitRow>,
    pub areas: Option<Vec<AreaRow>>,
    pub entry_points: Vec<EntryPoint>,
    pub entry_points_omitted: usize,
    pub abilities: Vec<AbilityRow>,
    pub abilities_omitted: usize,
    pub abilities_omitted_by_kind: IndexMap<&'static str, usize>,
    pub readme: Option<ReadmePurpose>,
    pub pages: Vec<DocPage>,
    pub pages_omitted: usize,
    pub next: String,
}

/// What the survey is asked.
pub struct SurveyRequest<'a> {
    pub root_path: &'a str,
    pub ignore: &'a [String],
    pub vault_exclusion: Option<String>,
    pub git_ignored: &'a HashSet<String>,
    /// Files of an earlier survey that cannot have changed, by path; they are not read again.
    pub kept_files: &'a HashMap<&'a str, &'a SurveyedFile>,
}

/// The built map and the text the agent reads.
pub struct Survey {
    pub map: BreadthMap,
    pub text: String,
    pub collection: Collection,
}

fn file_within<'a>(unit_path: &str, path: &'a str) -> &'a str {
    if unit_path != "." {
        if let Some(rest) = path.strip_prefix(&format!("{unit_path}/")) {
            return rest;
        }
    }
    path
}

fn main_files_text(path: &str, main_files: &[MainFile]) -> String {
    main_files
        .iter()
        .map(|file| {
            if file.path == path {
                format!("({})", file.lines)
            } else {
                format!(
                    "{} ({})",
                    repo_text(file_within(path, &file.path), 160),
                    file.lines
                )
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn unit_main_files(
    files: &SurveyFiles<'_>,
    path: &str,
    scope: UnitScope,
    unit_files: &[TreeFile],
) -> (Vec<MainFile>, Vec<String>) {
    let picked = main_files_of(path, scope, unit_files);
    let mut exports: Vec<String> = Vec::new();
    for file in &picked {
        if exports.len() == EXPORTS_PER_UNIT {
            break;
        }
        let text = files.text(&file.path, SCAN_UNITS);
        for name in exports_of_text(&file.path, &text) {
            if !exports.contains(&name) {
                exports.push(name);
            }
            if exports.len() == EXPORTS_PER_UNIT {
                break;
            }
        }
    }
    let rows = picked
        .into_iter()
        .map(|file| MainFile {
            path: file.path,
            lines: file.lines,
        })
        .collect();
    (rows, exports)
}

fn render_row(row: &AbilityRow) -> String {
    ability_row_text(row, MEMBERS_SHOWN, true)
}

fn area_lines(areas: &[AreaRow]) -> Vec<String> {
    let mut lines = vec![
        String::new(),
        "Areas, largest first: path | files | lines | main files (relative to the area, lines) | abilities it holds".to_string(),
    ];
    for area in areas {
        let path = repo_text(&area.path, AREA_PATH_CHARS);
        if area.rest {
            let names = area
                .members
                .iter()
                .take(40)
                .map(|member| repo_text(file_within(&area.path, member), AREA_PATH_CHARS))
                .collect::<Vec<_>>()
                .join(", ");
            let more = if area.members.len() > 40 {
                format!(" +{}", area.members.len() - 40)
            } else {
                String::new()
            };
            lines.push(format!(
                "+{} smaller folders in {path} | {} | {} | {names}{more} | {}",
                area.members.len(),
                format_count(area.files),
                format_count(area.lines),
                area.abilities
            ));
            continue;
        }
        let own = if area.own {
            " (its own files, not its folders)"
        } else {
            ""
        };
        let main = main_files_text(&area.path, &area.main_files);
        lines.push(format!(
            "{path}{own} | {} | {} | {} | {}",
            format_count(area.files),
            format_count(area.lines),
            if main.is_empty() { "-" } else { &main },
            area.abilities
        ));
    }
    lines
}

/// The same map as plain rows, which is what the agent reads: one line per unit (or per area)
/// instead of an indented object per field keeps a 400-file repository near 12 KB. Main files are
/// written relative to their unit or area; join them to its path.
pub fn render_breadth_map(map: &BreadthMap) -> String {
    let size = &map.size;
    let outside = size
        .outside
        .iter()
        .map(|(kind, (files, lines))| {
            format!(
                "{kind} {} files {} lines",
                format_count(*files),
                format_count(*lines)
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    let outside_note = if outside.is_empty() {
        String::new()
    } else {
        format!(" (left out: {outside})")
    };
    let truncated = if size.truncated {
        "; the walk stopped at its file limit"
    } else {
        ""
    };
    let mut lines = vec![format!(
        "Breadth map of {}: {} product units, {} lines in {} files{outside_note}{truncated}.",
        repo_text(&map.root_path, 400),
        size.units,
        format_count(size.product_lines),
        format_count(size.product_files),
    )];
    if let Some(readme) = &map.readme {
        let purpose = repo_text(&readme.purpose, 700);
        lines.push(format!(
            "{}: {}",
            repo_text(&readme.path, 160),
            if purpose.is_empty() {
                "(no prose paragraph)"
            } else {
                &purpose
            }
        ));
    }
    if let Some(areas) = &map.areas {
        lines.extend(area_lines(areas));
    } else {
        lines.push(String::new());
        lines.push("Units: path | files | lines | main files (relative to the unit, lines) | exports | imported by N units | imports".to_string());
        for unit in &map.units {
            let imports = unit
                .imports
                .iter()
                .map(|path| repo_text(path, 160))
                .collect::<Vec<_>>()
                .join(", ")
                + &if unit.imports_omitted > 0 {
                    format!(" +{}", unit.imports_omitted)
                } else {
                    String::new()
                };
            let exports = unit
                .exports
                .iter()
                .map(|name| repo_text(name, 80))
                .collect::<Vec<_>>()
                .join(", ");
            lines.push(format!(
                "{} | {} | {} | {} | {} | {} | {}",
                repo_text(&unit.path, 160),
                unit.files,
                format_count(unit.lines),
                main_files_text(&unit.path, &unit.main_files),
                if exports.is_empty() { "-" } else { &exports },
                unit.imported_by,
                if imports.is_empty() { "-" } else { &imports }
            ));
        }
    }
    if !map.entry_points.is_empty() {
        lines.push(String::new());
        lines.push("Entry points: kind path symbol".to_string());
        for row in &map.entry_points {
            lines.push(format!(
                "{} {} {}",
                row.kind.word(),
                repo_text(&row.path, 160),
                repo_text(&row.symbol, 120)
            ));
        }
        if map.entry_points_omitted > 0 {
            lines.push(format!("+{} more", map.entry_points_omitted));
        }
    }
    if !map.abilities.is_empty() {
        lines.push(String::new());
        lines.push("Abilities to place, the floor: kind name evidence symbol (a family or group lists its members; a documented one names its heading)".to_string());
        lines.extend(map.abilities.iter().map(render_row));
        if map.abilities_omitted > 0 {
            let by_kind = map
                .abilities_omitted_by_kind
                .iter()
                .map(|(kind, count)| format!("{kind} {count}"))
                .collect::<Vec<_>>()
                .join(", ");
            let kinds = if by_kind.is_empty() {
                String::new()
            } else {
                format!(" ({by_kind})")
            };
            let omitted = map.abilities_omitted;
            lines.push(if map.areas.is_some() {
                format!("+{omitted} more not listed{kinds}: every area shows rows before any shows a second, and a module API or lone export only where an area has no other row; an area's own map lists the rest.")
            } else {
                format!("+{omitted} more not listed{kinds}: each kind keeps an equal share of 120 rows and of the map's 30 KB; call analyze_repo_structure with rootPath set to one folder to list them.")
            });
        }
    }
    if !map.pages.is_empty() {
        lines.push(String::new());
        lines.push("Docs: path - title".to_string());
        for page in &map.pages {
            lines.push(format!(
                "{} - {}",
                repo_text(&page.path, 160),
                repo_text(&page.title, 80)
            ));
        }
        if map.pages_omitted > 0 {
            lines.push(format!("+{} more", map.pages_omitted));
        }
    }
    lines.push(String::new());
    lines.push(format!("Next: {}", map.next));
    lines.join("\n")
}

fn flat_next(map: &BreadthMap, abilities_listed: usize) -> String {
    if map.size.units == 0 {
        return "No product source file was found here: check rootPath and ignore, or build the map from documents.".to_string();
    }
    format!(
        "{} product units, {} lines in {} files. Outline each unit's main file next (sourceReads mode \"outline\", up to 16 per call, sourceOnly true) and list every ability the product gives a user, an operator or another system from the outlines and docs. The {abilities_listed} abilities listed are the floor under that list, not all of it: each gets a capability, its name in the title or in code form (`name`) of the node that covers it (a family or group names its members), or one line in the project's ## Uncertainty that cites its path:Lline or exact name and says why it is excluded. Then read each capability by symbol (sourceReads {{path, symbol}}, three or four per call): the read returns the body with the guards, defaults and callees that decide it, each with path and lines to cite. Nothing is written yet; add_concepts and validate_vault report which abilities no node places and which rules cite no read lines.",
        map.size.units,
        format_count(map.size.product_lines),
        format_count(map.size.product_files),
    )
}

fn area_next(map: &BreadthMap, areas: &[AreaRow]) -> String {
    let size = &map.size;
    let opened = areas.iter().find(|area| !area.own && !area.rest);
    let open = opened.map(|area| {
        let joined = if area.path == "." {
            map.root_path.clone()
        } else {
            Path::new(&map.root_path)
                .join(&area.path)
                .to_string_lossy()
                .into_owned()
        };
        let argument = serde_json::json!({ "rootPath": joined });
        (
            format!("analyze_repo_structure({argument})"),
            repo_text(&area.path, AREA_PATH_CHARS),
        )
    });
    let open_text = open.map_or_else(String::new, |(call, path)| {
        format!("Open an area when the rows below do not show what a domain holds, like {call}: its map lists its units, entry points and every ability it holds, with paths relative to that folder, so write each node's path: from the repository root ({path}/...). ")
    });
    format!(
        "This repository is larger than one map, so it is listed as {} areas: {} lines in {} files. This run puts the whole product on the map and reads the main ability of every domain; reading the rest is a later request. 1. From this response alone, name the domains (a lasting responsibility; several areas usually share one) and write the project and every domain with add_concepts; each domain says which areas it holds. 2. Read by symbol the operation that decides the main ability of each domain (sourceReads {{path, symbol}}, three or four per call, sourceOnly true; outline a file first when you do not know its symbols). {open_text}3. Write every domain's capabilities: one per thing a user, an operator or another system gets, a family as one capability naming its members and how many of them were read. A capability whose code was not read states no rule and says so under ## Uncertainty. Every ability row below ends up as a capability, named in the node that covers it, or on one line of the project's ## Uncertainty that says why it is left out; the rows are a floor shared between areas, not all of them. Every write and validate_vault gives the Not mapped yet lines for the project's ## Uncertainty, led by \"Not mapped yet: N of M areas, R of T abilities.\": write them into the project exactly as given before finalize_project_meaning, which refuses without them, and end by telling the person about what share of the abilities is on the map and how many capabilities are still unread, which they can ask for next.",
        areas.len(),
        format_count(size.product_lines),
        format_count(size.product_files),
    )
}

type Omitted = Option<(usize, IndexMap<&'static str, usize>)>;

/// The first `count` rows, in the order the areas shared them.
fn keep_first(rows: &[AbilityRow], count: usize, map: &BreadthMap) -> (Vec<AbilityRow>, Omitted) {
    let kept: Vec<AbilityRow> = rows.iter().take(count).cloned().collect();
    let mut by_kind = map.abilities_omitted_by_kind.clone();
    for row in rows.iter().skip(count) {
        *by_kind.entry(row.kind.word()).or_insert(0) += 1;
    }
    let omitted = map.abilities_omitted + rows.len().saturating_sub(count);
    (kept, (omitted > 0).then_some((omitted, by_kind)))
}

/// `count` rows shared fairly between kinds.
fn keep_fair_shares(
    rows: &[AbilityRow],
    count: usize,
    map: &BreadthMap,
) -> (Vec<AbilityRow>, Omitted) {
    let mut counts: IndexMap<&'static str, usize> = IndexMap::new();
    for row in rows {
        *counts.entry(row.kind.word()).or_insert(0) += 1;
    }
    let shares = fair_shares(&counts, count);
    let mut taken: IndexMap<&'static str, usize> = IndexMap::new();
    let mut kept = Vec::new();
    for row in rows {
        let held = taken.entry(row.kind.word()).or_insert(0);
        if *held >= shares.get(row.kind.word()).copied().unwrap_or(0) {
            continue;
        }
        *held += 1;
        kept.push(row.clone());
    }
    let mut by_kind = map.abilities_omitted_by_kind.clone();
    for (kind, total) in &counts {
        let share = shares.get(kind).copied().unwrap_or(0);
        if *total > share {
            *by_kind.entry(kind).or_insert(0) += total - share;
        }
    }
    let omitted = map.abilities_omitted + rows.len() - kept.len();
    (kept, (omitted > 0).then_some((omitted, by_kind)))
}

type Keep = fn(&[AbilityRow], usize, &BreadthMap) -> (Vec<AbilityRow>, Omitted);

/// The map with its abilities section cut to fit the map's ceiling: a group shows fewer members
/// first (16, then 8, 4, 2, 1, none), each cut counted; a map still too long then keeps fewer rows
/// (`keep` says which), the rows left out added to `abilities_omitted`.
fn cap_abilities(map: &BreadthMap, fits: &dyn Fn(&BreadthMap) -> bool, keep: Keep) -> BreadthMap {
    let shown = |rows: &[AbilityRow], limit: usize| -> Vec<AbilityRow> {
        rows.iter()
            .map(|row| match &row.members {
                Some(members) if members.len() > limit => {
                    let mut cut = row.clone();
                    cut.members = Some(members.iter().take(limit).cloned().collect());
                    cut.members_omitted += members.len() - limit;
                    cut
                }
                _ => row.clone(),
            })
            .collect()
    };
    let mut capped = map.clone();
    for limit in [MEMBERS_SHOWN, 8, 4, 2, 1, 0] {
        capped = BreadthMap {
            abilities: shown(&map.abilities, limit),
            ..map.clone()
        };
        if fits(&capped) {
            return capped;
        }
    }
    let memberless = capped.abilities;
    let kept = |count: usize| -> BreadthMap {
        let (abilities, omitted) = keep(&memberless, count, map);
        let mut next = BreadthMap {
            abilities,
            ..map.clone()
        };
        if let Some((total, by_kind)) = omitted {
            next.abilities_omitted = total;
            next.abilities_omitted_by_kind = by_kind;
        }
        next
    };
    // Binary search on the row count: O(log rows) renders.
    let mut low = 0;
    let mut high = memberless.len();
    while low < high {
        let middle = (low + high).div_ceil(2);
        if fits(&kept(middle)) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    kept(low)
}

fn omitted_rows(found: &[AbilityRow], listed: &[usize]) -> (usize, IndexMap<&'static str, usize>) {
    let shown: HashSet<usize> = listed.iter().copied().collect();
    let mut by_kind: IndexMap<&'static str, usize> = IndexMap::new();
    for (index, row) in found.iter().enumerate() {
        if !shown.contains(&index) {
            *by_kind.entry(row.kind.word()).or_insert(0) += 1;
        }
    }
    (found.len() - shown.len(), by_kind)
}

/// A repository too large for one flat map, listed by area: every area with its size, main files
/// and the ability rows it holds, and the rows shared between areas.
fn area_map(
    files: &SurveyFiles<'_>,
    map: &BreadthMap,
    collection: &Collection,
    found: &[AbilityRow],
) -> BreadthMap {
    let product: Vec<TreeFile> = collection
        .files
        .iter()
        .filter(|file| file.class == SourceClass::Product && file.lines > 0)
        .map(|file| TreeFile {
            path: file.path.clone(),
            lines: file.lines,
        })
        .collect();
    let (_, areas) = survey_areas(&product);
    let locator = AreaLocator::new(&areas);
    let mut files_of: Vec<Vec<TreeFile>> = vec![Vec::new(); areas.len()];
    for file in &product {
        if let Some(held) = locator
            .locate(&file.path)
            .and_then(|at| files_of.get_mut(at))
        {
            held.push(file.clone());
        }
    }
    let mut held_abilities: Vec<IndexMap<&str, usize>> = vec![IndexMap::new(); areas.len()];
    for row in found {
        if let Some(files) = locator
            .locate(&row.path)
            .and_then(|at| held_abilities.get_mut(at))
        {
            *files.entry(row.path.as_str()).or_insert(0) += 1;
        }
    }
    let rows: Vec<AreaRow> = areas
        .iter()
        .enumerate()
        .map(|(index, area): (usize, &Area)| {
            let scope = if area.own {
                UnitScope::Files
            } else {
                UnitScope::Tree
            };
            let area_files = files_of.get(index).map_or(&[][..], Vec::as_slice);
            let main_files = if area.rest {
                Vec::new()
            } else {
                main_files_of(&area.path, scope, area_files)
                    .into_iter()
                    .map(|file| MainFile {
                        path: file.path,
                        lines: file.lines,
                    })
                    .collect()
            };
            let ability_files: Vec<AbilityFile> = held_abilities
                .get(index)
                .map(|files| {
                    files
                        .iter()
                        .map(|(path, abilities)| AbilityFile {
                            path: (*path).to_string(),
                            abilities: *abilities,
                        })
                        .collect()
                })
                .unwrap_or_default();
            AreaRow {
                path: area.path.clone(),
                files: area.files,
                lines: area.lines,
                own: area.own,
                rest: area.rest,
                members: area.members.clone(),
                main_files,
                abilities: ability_files.iter().map(|file| file.abilities).sum(),
                ability_files,
            }
        })
        .collect();
    let listed = abilities_by_area(found, &areas, &locator, ABILITY_LIMIT);
    let (omitted, by_kind) = omitted_rows(found, &listed);
    let _ = files;
    let mut by_area = BreadthMap {
        areas: Some(rows.clone()),
        abilities: listed
            .iter()
            .filter_map(|at| found.get(*at).cloned())
            .collect(),
        abilities_omitted: omitted,
        abilities_omitted_by_kind: if omitted > 0 {
            by_kind
        } else {
            IndexMap::new()
        },
        units: Vec::new(),
        ..map.clone()
    };
    by_area.next = area_next(&by_area, &rows);
    by_area
}

fn bytes_of(map: &BreadthMap) -> usize {
    render_breadth_map(map).len()
}

fn fit_breadth_map(
    files: &SurveyFiles<'_>,
    map: BreadthMap,
    collection: &Collection,
    found: &[AbilityRow],
) -> BreadthMap {
    let budget = bytes_of(&BreadthMap {
        abilities: Vec::new(),
        abilities_omitted: 0,
        ..map.clone()
    });
    if budget <= BREADTH_TEXT_BUDGET {
        return cap_abilities(
            &map,
            &|candidate| bytes_of(candidate) <= MAP_TEXT_LIMIT,
            keep_fair_shares,
        );
    }
    let by_area = area_map(files, &map, collection, found);
    cap_abilities(
        &by_area,
        &|candidate| {
            answer_format::utf16::len(&render_breadth_map(candidate)) <= SURVEY_RESPONSE_CHARS
        },
        keep_first,
    )
}

/// The default `analyze_repo_structure` response: one flat map of every unit when it fits, else
/// the map by area.
pub fn build_breadth_map(files: &SurveyFiles<'_>, request: &SurveyRequest<'_>) -> Survey {
    let collection = collect_source_units(
        files,
        &CollectOptions {
            ignore: request.ignore,
            vault_exclusion: request.vault_exclusion.clone(),
            git_ignored: request.git_ignored,
            kept_files: request.kept_files,
        },
    );
    let ignore_set: HashSet<&str> = request.ignore.iter().map(String::as_str).collect();
    let imports = unit_imports(
        files.source(),
        request.root_path,
        &collection,
        request.ignore,
    );
    let mut imported_by: IndexMap<&str, usize> = IndexMap::new();
    for targets in &imports {
        for target in targets {
            *imported_by.entry(target.as_str()).or_insert(0) += 1;
        }
    }
    let units: Vec<UnitRow> = collection
        .units
        .iter()
        .enumerate()
        .map(|(index, unit)| {
            let (main_files, exports) = unit_main_files(files, &unit.path, unit.scope, &unit.files);
            let mut sorted: Vec<String> = imports
                .get(index)
                .map(|listed: &BTreeSet<String>| listed.iter().cloned().collect())
                .unwrap_or_default();
            answer_format::utf16::sort(&mut sorted);
            let omitted = sorted.len().saturating_sub(IMPORTS_PER_UNIT);
            sorted.truncate(IMPORTS_PER_UNIT);
            UnitRow {
                path: unit.path.clone(),
                files: unit.files.len(),
                lines: unit.lines,
                main_files,
                exports,
                imported_by: imported_by.get(unit.path.as_str()).copied().unwrap_or(0),
                imports: sorted,
                imports_omitted: omitted,
            }
        })
        .collect();
    let mut outside: IndexMap<&'static str, (usize, usize)> = IndexMap::new();
    for row in &collection.excluded {
        let entry = outside.entry(row.class.word()).or_insert((0, 0));
        entry.0 += row.files;
        entry.1 += row.lines;
    }
    let entry_points = entry_points_of(files, &collection);
    let pages = doc_pages(files, &ignore_set);
    let readme = readme_purpose(files);
    // The vault's own pages are the map being built, not documentation of the product.
    let vault = request.vault_exclusion.as_deref();
    let in_vault = |path: &str| {
        vault.is_some_and(|prefix| {
            path == prefix
                || path
                    .strip_prefix(prefix)
                    .is_some_and(|rest| rest.starts_with('/'))
        })
    };
    let page_paths: Vec<String> = pages
        .all
        .iter()
        .filter(|path| !in_vault(path))
        .cloned()
        .collect();
    let abilities = abilities_of(
        files,
        &collection,
        &entry_points.rows,
        &Documents {
            readme: readme.as_ref().map(|row| row.path.as_str()),
            pages: &page_paths,
        },
    );
    let mut map = BreadthMap {
        root_path: request.root_path.to_string(),
        size: Size {
            product_files: collection.product_files,
            product_lines: collection.product_lines,
            units: units.len(),
            outside,
            truncated: collection.truncated,
        },
        units,
        areas: None,
        entry_points: entry_points.rows.clone(),
        entry_points_omitted: entry_points.omitted,
        abilities: abilities.rows.clone(),
        abilities_omitted: abilities.omitted,
        abilities_omitted_by_kind: abilities.omitted_by_kind.clone(),
        readme,
        pages: pages.rows,
        pages_omitted: pages.omitted,
        next: String::new(),
    };
    map.next = flat_next(&map, abilities.rows.len());
    let fitted = fit_breadth_map(files, map, &collection, &abilities.found);
    let text = render_breadth_map(&fitted);
    Survey {
        map: fitted,
        text,
        collection,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ability_row::AbilityKind;

    fn row(kind: AbilityKind, name: &str) -> AbilityRow {
        AbilityRow::at(kind, name, "a.ts", 1)
    }

    fn empty_map() -> BreadthMap {
        BreadthMap {
            root_path: "/r".to_string(),
            size: Size {
                product_files: 0,
                product_lines: 0,
                units: 0,
                outside: IndexMap::new(),
                truncated: false,
            },
            units: Vec::new(),
            areas: None,
            entry_points: Vec::new(),
            entry_points_omitted: 0,
            abilities: Vec::new(),
            abilities_omitted: 0,
            abilities_omitted_by_kind: IndexMap::new(),
            readme: None,
            pages: Vec::new(),
            pages_omitted: 0,
            next: "go".to_string(),
        }
    }

    #[test]
    fn a_map_that_does_not_fit_loses_member_names_first_then_rows_and_counts_both() {
        let family =
            row(AbilityKind::Family, "f").with_members((0..20).map(|n| format!("m{n}")).collect());
        let mut map = empty_map();
        map.abilities = vec![
            family,
            row(AbilityKind::Route, "GET /x"),
            row(AbilityKind::Route, "GET /y"),
        ];
        let full = bytes_of(&map);
        let fits_members = cap_abilities(
            &map,
            &|candidate| bytes_of(candidate) + 30 < full,
            keep_fair_shares,
        );
        assert_eq!(fits_members.abilities.len(), 3);
        let family_row = fits_members.abilities.first().expect("family kept");
        assert!(family_row.members_omitted > 0);
        let tight = cap_abilities(
            &map,
            &|candidate| candidate.abilities.len() <= 1,
            keep_fair_shares,
        );
        assert_eq!(tight.abilities.len(), 1);
        assert_eq!(tight.abilities_omitted, 2);
    }

    #[test]
    fn an_empty_repository_says_where_to_look_next() {
        let map = empty_map();
        assert!(flat_next(&map, 0).starts_with("No product source file was found here"));
        assert!(render_breadth_map(&map)
            .starts_with("Breadth map of /r: 0 product units, 0 lines in 0 files."));
    }
}
