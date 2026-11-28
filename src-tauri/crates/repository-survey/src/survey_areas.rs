//! A repository too large for one flat map is surveyed by area: the product root's folders, the
//! largest split into its subfolders while the list has room, so a folder holding most of the code
//! is shown as its children. Ability rows are shared between areas so every area shows some before
//! any shows more, and product-facing kinds come before library exports.

use std::collections::{BTreeMap, HashMap, HashSet};

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::folder_tree::{FolderTree, TreeFile, ROOT};

/// Area rows one survey lists; at about 200 characters a row the section stays near 12 KB.
pub const AREA_ROW_LIMIT: usize = 60;

#[derive(Debug, Clone)]
pub struct Area {
    pub path: String,
    /// The files directly in the folder, not its subfolders.
    pub own: bool,
    /// One row naming the smaller folders that did not fit.
    pub rest: bool,
    pub members: Vec<String>,
    pub files: usize,
    pub lines: usize,
    /// The folder in the tree, for an area that is one.
    pub folder: Option<usize>,
}

fn path_or_dot(path: &str) -> String {
    if path.is_empty() {
        ".".to_string()
    } else {
        path.to_string()
    }
}

fn tree_area(tree: &FolderTree, at: usize) -> Option<Area> {
    let folder = tree.get(at)?;
    Some(Area {
        path: path_or_dot(&folder.path),
        own: false,
        rest: false,
        members: Vec::new(),
        files: folder.total,
        lines: folder.lines,
        folder: Some(at),
    })
}

fn own_area(tree: &FolderTree, at: usize) -> Option<Area> {
    let folder = tree.get(at)?;
    Some(Area {
        path: path_or_dot(&folder.path),
        own: true,
        rest: false,
        members: Vec::new(),
        files: folder.files.len(),
        lines: folder.files.iter().map(|file| file.lines).sum(),
        folder: Some(at),
    })
}

/// What a folder holds one level down: its own files as one area and each code subfolder as
/// another. A lone subfolder is looked through, so `src/main/java/org/app` opens as its children.
pub fn parts_of(tree: &FolderTree, node: usize) -> Vec<Area> {
    let mut parts = Vec::new();
    let mut current = node;
    while let Some(folder) = tree.get(current) {
        if !folder.files.is_empty() {
            parts.extend(own_area(tree, current));
        }
        if let [only] = folder.children.as_slice() {
            current = *only;
            continue;
        }
        parts.extend(
            folder
                .children
                .iter()
                .filter_map(|child| tree_area(tree, *child)),
        );
        break;
    }
    parts
}

/// A folder's parts in at most `rows` rows: when they do not fit, its own files, its largest
/// subfolders and one row naming the rest; `None` when that leaves fewer than two subfolders of
/// its own.
fn parts_within(tree: &FolderTree, node: usize, rows: usize) -> Option<Vec<Area>> {
    let parts = parts_of(tree, node);
    if parts.len() <= rows {
        return Some(parts);
    }
    let (own, mut folders): (Vec<Area>, Vec<Area>) = parts.into_iter().partition(|part| part.own);
    folders.sort_by(|left, right| {
        right
            .lines
            .cmp(&left.lines)
            .then_with(|| answer_format::collation::compare_text(&left.path, &right.path))
    });
    let shown = rows.checked_sub(own.len() + 1)?;
    if shown < 2 {
        return None;
    }
    let rest: Vec<Area> = folders.split_off(shown);
    let folder_path = tree
        .get(node)
        .map_or(String::new(), |folder| folder.path.clone());
    let mut areas = own;
    areas.extend(folders);
    areas.push(Area {
        path: path_or_dot(&folder_path),
        own: false,
        rest: true,
        members: rest.iter().map(|area| area.path.clone()).collect(),
        files: rest.iter().map(|area| area.files).sum(),
        lines: rest.iter().map(|area| area.lines).sum(),
        folder: None,
    });
    Some(areas)
}

/// The areas of a repository's product files, largest first. The largest area is split while it
/// has two or more code subfolders and they fit; one holding most of the code is split even when
/// its smaller subfolders must share one row, which ends the splitting.
pub fn survey_areas(product: &[TreeFile]) -> (FolderTree, Vec<Area>) {
    let tree = FolderTree::of(product);
    let root_lines = tree.get(ROOT).map_or(0, |root| root.lines);
    let mut areas = parts_within(&tree, ROOT, AREA_ROW_LIMIT)
        .or_else(|| tree_area(&tree, ROOT).map(|area| vec![area]))
        .unwrap_or_default();
    while !areas.is_empty() && !areas.iter().any(|area| area.rest) {
        let mut largest = 0;
        for (index, area) in areas.iter().enumerate() {
            if areas
                .get(largest)
                .is_none_or(|best| area.lines > best.lines)
            {
                largest = index;
            }
        }
        let Some(biggest) = areas.get(largest) else {
            break;
        };
        let (true, Some(folder)) = (!biggest.own, biggest.folder) else {
            break;
        };
        let children = parts_of(&tree, folder);
        if children.iter().filter(|part| !part.own).count() < 2 {
            break;
        }
        let rows = AREA_ROW_LIMIT.saturating_sub(areas.len() - 1);
        let holds_most = biggest.lines * 2 > root_lines;
        let parts = if children.len() <= rows {
            Some(children)
        } else if holds_most {
            parts_within(&tree, folder, rows)
        } else {
            None
        };
        let Some(parts) = parts else {
            break;
        };
        let mut next: Vec<Area> = Vec::new();
        for (index, area) in areas.into_iter().enumerate() {
            if index == largest {
                next.extend(parts.iter().cloned());
            } else {
                next.push(area);
            }
        }
        areas = next;
    }
    areas.sort_by(|left, right| {
        right
            .lines
            .cmp(&left.lines)
            .then_with(|| answer_format::collation::compare_text(&left.path, &right.path))
    });
    (tree, areas)
}

/// The area a repository path falls in, as an index into the areas: the deepest folder area
/// holding it, else the own-files area of its folder.
pub struct AreaLocator {
    folders: HashMap<String, usize>,
    owns: HashMap<String, usize>,
}

impl AreaLocator {
    pub fn new(areas: &[Area]) -> Self {
        let mut folders = HashMap::new();
        let mut owns = HashMap::new();
        for (index, area) in areas.iter().enumerate() {
            if area.rest {
                for member in &area.members {
                    folders.insert(member.clone(), index);
                }
            } else if area.own {
                owns.insert(area.path.clone(), index);
            } else {
                folders.insert(area.path.clone(), index);
            }
        }
        Self { folders, owns }
    }

    pub fn locate(&self, path: &str) -> Option<usize> {
        let parts: Vec<&str> = path.split('/').collect();
        for depth in (1..=parts.len()).rev() {
            let prefix = parts.get(..depth)?.join("/");
            if let Some(hit) = self.folders.get(&prefix) {
                return Some(*hit);
            }
        }
        let folder = path.rsplit_once('/').map_or(".", |(folder, _)| folder);
        self.owns
            .get(path)
            .or_else(|| self.owns.get(folder))
            .copied()
    }
}

fn is_backfill(kind: AbilityKind) -> bool {
    matches!(kind, AbilityKind::Export | AbilityKind::Api)
}

/// At most `limit` rows, as indexes into `rows`. Product-facing kinds come first: every area,
/// largest first, gets one row a round before any gets a second, so no area is left out while
/// another fills the list. A module API or a lone export is how the code is built, not what the
/// product does, so one is shown only for an area that has no other row, a module API before an
/// export.
pub fn abilities_by_area(
    rows: &[AbilityRow],
    areas: &[Area],
    locator: &AreaLocator,
    limit: usize,
) -> Vec<usize> {
    let lane_key = |row: &AbilityRow| locator.locate(&row.path).unwrap_or(areas.len());
    let lanes_of = |wanted: &dyn Fn(&AbilityRow) -> bool| -> Vec<(usize, Vec<usize>)> {
        let mut lanes: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
        for (index, row) in rows.iter().enumerate() {
            if wanted(row) {
                lanes.entry(lane_key(row)).or_default().push(index);
            }
        }
        lanes.into_iter().collect()
    };
    let mut picked: Vec<usize> = Vec::new();
    let mut shown_areas: HashSet<usize> = HashSet::new();
    let product_facing = lanes_of(&|row| !is_backfill(row.kind));
    let mut round = 0;
    while picked.len() < limit {
        let open: Vec<&(usize, Vec<usize>)> = product_facing
            .iter()
            .filter(|(_, lane)| lane.len() > round)
            .collect();
        if open.is_empty() {
            break;
        }
        for (key, lane) in open {
            if picked.len() == limit {
                break;
            }
            if let Some(index) = lane.get(round) {
                picked.push(*index);
                shown_areas.insert(*key);
            }
        }
        round += 1;
    }
    for kind in [AbilityKind::Api, AbilityKind::Export] {
        for (key, lane) in lanes_of(&|row| row.kind == kind) {
            if picked.len() == limit {
                break;
            }
            if !shown_areas.contains(&key) {
                if let Some(index) = lane.first() {
                    picked.push(*index);
                    shown_areas.insert(key);
                }
            }
        }
    }
    picked
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, lines: usize) -> TreeFile {
        TreeFile {
            path: path.to_string(),
            lines,
        }
    }

    #[test]
    fn the_largest_area_opens_into_its_subfolders_while_there_is_room() {
        let product = [
            file("src/a/x.ts", 100),
            file("src/b/y.ts", 50),
            file("web/z.ts", 10),
        ];
        let (_, areas) = survey_areas(&product);
        let listed: Vec<(&str, bool)> = areas
            .iter()
            .map(|area| (area.path.as_str(), area.own))
            .collect();
        assert_eq!(listed, [("src/a", false), ("src/b", false), ("web", false)]);
    }

    #[test]
    fn a_lone_subfolder_is_looked_through() {
        let product = [
            file("src/main/java/org/app/A.java", 10),
            file("src/main/java/org/app/B.java", 20),
        ];
        let (_, areas) = survey_areas(&product);
        assert_eq!(
            areas
                .iter()
                .map(|area| (area.path.as_str(), area.own))
                .collect::<Vec<_>>(),
            [("src/main/java/org/app", true)]
        );
    }

    #[test]
    fn every_area_shows_a_row_before_any_shows_a_second_and_exports_only_fill_a_bare_area() {
        let product = [file("a/x.ts", 100), file("b/y.ts", 50), file("c/z.ts", 10)];
        let (_, areas) = survey_areas(&product);
        let locator = AreaLocator::new(&areas);
        let row = |kind, path: &str| AbilityRow::at(kind, path, path, 1);
        let rows = [
            row(AbilityKind::Route, "a/1"),
            row(AbilityKind::Route, "a/2"),
            row(AbilityKind::Route, "b/1"),
            row(AbilityKind::Export, "c/1"),
            row(AbilityKind::Export, "a/3"),
        ];
        // a, b, then a's second row; c has only an export, shown last as its one row.
        assert_eq!(abilities_by_area(&rows, &areas, &locator, 10), [0, 2, 1, 3]);
        assert_eq!(abilities_by_area(&rows, &areas, &locator, 2), [0, 2]);
    }
}
