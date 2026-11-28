//! Every ability the survey lists, tooling left out, at most 120 rows shared fairly between kinds,
//! each with its evidence as `path:Lline`. What a kind leaves out is counted per kind, never
//! dropped silently; `found` keeps every row for a survey that shares the rows another way. A
//! documented row whose name an earlier row already answers to is the same ability found twice
//! and is dropped.
//!
//! Rows come from the entry points, the exports of a library, folders whose files each declare the
//! operation they are named after, dispatchers that route by command name, and headings the docs
//! share with the code. Subcommands, flags, settings, workers and the JVM families are not read by
//! this build (`GAPS`).

use std::collections::HashSet;
use std::sync::LazyLock;

use indexmap::IndexMap;
use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::declaration_index::{declaration_index, DeclarationIndex};
use crate::documented_abilities::{documented_abilities, Documents, VocabularyFile};
use crate::entry_points::{executable_name, EntryPoint};
use crate::js_pattern::js_regex;
use crate::library_exports::{library_abilities, FAMILY_SIZE};
use crate::name_key::name_key;
use crate::sibling_families::sibling_families;
use crate::source_class::SourceClass;
use crate::survey_files::SurveyFiles;
use crate::tooling_path::is_tooling;
use crate::unit_collection::Collection;

pub const ABILITY_LIMIT: usize = 120;
const SCAN_UNITS: usize = 256 * 1024;

/// What this build of the survey does not read, said in the map so a builder looks for it.
pub const GAPS: &str = "Subcommands, flags, settings, background workers and JVM operation families are not listed by this build; read them from the outlines.";

static MAIN_LINE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"^func main\(\)|^fn main\(\)|^if __name__ == ["']__main__["']"#));

#[derive(Debug, Default)]
pub struct AbilityRows {
    /// At most [`ABILITY_LIMIT`] rows, fairly shared between kinds.
    pub rows: Vec<AbilityRow>,
    pub omitted: usize,
    pub omitted_by_kind: IndexMap<&'static str, usize>,
    /// Every row, before the limit.
    pub found: Vec<AbilityRow>,
}

fn line_of(text: &str, pattern: &Regex) -> usize {
    text.split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .position(|line| pattern.is_match(line))
        .map_or(1, |at| at + 1)
}

fn entry_ability(files: &SurveyFiles<'_>, entry: &EntryPoint) -> AbilityRow {
    let text = files.text(&entry.path, SCAN_UNITS);
    if entry.kind == AbilityKind::Executable {
        let line = line_of(&text, &MAIN_LINE);
        return AbilityRow::at(
            AbilityKind::Executable,
            &executable_name(&entry.path),
            &entry.path,
            line,
        )
        .with_symbol(&entry.symbol);
    }
    let needle = if entry.kind == AbilityKind::Route {
        entry.symbol.rsplit(' ').next().unwrap_or(&entry.symbol)
    } else {
        &entry.symbol
    };
    let line = if matches!(
        entry.kind,
        AbilityKind::Route | AbilityKind::Plugin | AbilityKind::Command
    ) {
        let escaped = regex::escape(needle);
        let pattern = js_regex(&format!(
            "[\"'`]{escaped}[\"'`]|\\b(?:class|def|function|func)\\s+{escaped}\\b"
        ));
        line_of(&text, &pattern)
    } else {
        1
    };
    AbilityRow::at(
        entry.kind,
        entry.name.as_deref().unwrap_or(&entry.symbol),
        &entry.path,
        line,
    )
    .with_symbol(&entry.symbol)
}

fn keys_of(row: &AbilityRow) -> Vec<String> {
    std::iter::once(row.name.as_str())
        .chain(row.symbol.as_deref())
        .chain(row.members.iter().flatten().map(String::as_str))
        .map(|name| name_key(name.strip_prefix("--").unwrap_or(name)))
        .filter(|key| !key.is_empty())
        .collect()
}

/// How many rows each kind keeps of `limit`: every kind gets an equal share, and a share a small
/// kind leaves unused goes to the kinds that still have rows, so 130 dispatched operations cannot
/// crowd out 45 commands.
pub fn fair_shares(
    counts: &IndexMap<&'static str, usize>,
    limit: usize,
) -> IndexMap<&'static str, usize> {
    let mut shares: IndexMap<&'static str, usize> = counts.keys().map(|kind| (*kind, 0)).collect();
    let mut left = limit;
    let mut open: Vec<&'static str> = counts
        .iter()
        .filter(|(_, count)| **count > 0)
        .map(|(kind, _)| *kind)
        .collect();
    while left > 0 && !open.is_empty() {
        let share = (left / open.len()).max(1);
        for kind in &open {
            let total = counts.get(kind).copied().unwrap_or(0);
            let held = shares.get(kind).copied().unwrap_or(0);
            let take = share.min(total.saturating_sub(held)).min(left);
            shares.insert(kind, held + take);
            left -= take;
            if left == 0 {
                break;
            }
        }
        open.retain(|kind| {
            shares.get(kind).copied().unwrap_or(0) < counts.get(kind).copied().unwrap_or(0)
        });
    }
    shares
}

pub fn abilities_of(
    files: &SurveyFiles<'_>,
    collection: &Collection,
    entry_points: &[EntryPoint],
    documents: &Documents<'_>,
) -> AbilityRows {
    let mut rows: Vec<AbilityRow> = Vec::new();
    let mut seen: HashSet<(AbilityKind, String, String)> = HashSet::new();
    let mut names: HashSet<String> = HashSet::new();
    let mut push = |row: AbilityRow, merge: bool, rows: &mut Vec<AbilityRow>| {
        let key = (row.kind, row.path.clone(), row.name.clone());
        if seen.contains(&key) || is_tooling(&row.path) {
            return;
        }
        let own = name_key(row.name.strip_prefix("--").unwrap_or(&row.name));
        if merge && !own.is_empty() && names.contains(&own) {
            return;
        }
        seen.insert(key);
        names.extend(keys_of(&row));
        rows.push(row);
    };
    let product: Vec<_> = collection
        .files
        .iter()
        .filter(|file| file.class == SourceClass::Product && !is_tooling(&file.path))
        .collect();
    // The collection's own files: a second walk would ask Git again and could see a different
    // tree.
    let index: DeclarationIndex = declaration_index(collection);
    for entry in entry_points {
        if entry.kind == AbilityKind::Library {
            let exported = library_abilities(files, collection, &entry.path, &index);
            if !exported.is_empty() {
                for row in exported {
                    push(row, false, &mut rows);
                }
                continue;
            }
        }
        push(entry_ability(files, entry), false, &mut rows);
    }
    // After the export surface, so a folder a package file already re-exports stays one row.
    let product_paths: Vec<&str> = product.iter().map(|file| file.path.as_str()).collect();
    for row in sibling_families(&product_paths, &index, FAMILY_SIZE) {
        push(row, false, &mut rows);
    }
    for file in &product {
        for row in file
            .reading
            .iter()
            .flat_map(|reading| reading.dispatched.iter())
        {
            push(row.clone(), false, &mut rows);
        }
    }
    let vocabulary: Vec<VocabularyFile<'_>> = product
        .iter()
        .map(|file| VocabularyFile {
            path: &file.path,
            lines: file.lines,
        })
        .collect();
    let read = |path: &str, limit: usize| files.text(path, limit);
    for row in documented_abilities(&read, documents, &vocabulary, &index) {
        push(row, true, &mut rows);
    }
    let mut counts: IndexMap<&'static str, usize> = IndexMap::new();
    for row in &rows {
        *counts.entry(row.kind.word()).or_insert(0) += 1;
    }
    let shares = fair_shares(&counts, ABILITY_LIMIT);
    let mut kept: IndexMap<&'static str, usize> = IndexMap::new();
    let mut listed = Vec::new();
    for row in &rows {
        let taken = kept.entry(row.kind.word()).or_insert(0);
        if *taken >= shares.get(row.kind.word()).copied().unwrap_or(0) {
            continue;
        }
        *taken += 1;
        listed.push(row.clone());
    }
    let omitted_by_kind = counts
        .iter()
        .filter_map(|(kind, count)| {
            let omitted = count.saturating_sub(shares.get(kind).copied().unwrap_or(0));
            (omitted > 0).then_some((*kind, omitted))
        })
        .collect();
    AbilityRows {
        omitted: rows.len() - listed.len(),
        rows: listed,
        omitted_by_kind,
        found: rows,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn counts(pairs: &[(&'static str, usize)]) -> IndexMap<&'static str, usize> {
        pairs.iter().copied().collect()
    }

    #[test]
    fn a_share_a_small_kind_leaves_goes_to_the_kinds_with_rows_left() {
        let shares = fair_shares(
            &counts(&[("operation", 130), ("command", 45), ("route", 2)]),
            120,
        );
        assert_eq!(shares.get("route"), Some(&2));
        assert_eq!(shares.get("command"), Some(&45));
        assert_eq!(shares.get("operation"), Some(&73));
    }

    #[test]
    fn a_kind_without_rows_takes_nothing() {
        let shares = fair_shares(&counts(&[("route", 0), ("export", 3)]), 120);
        assert_eq!(shares.get("route"), Some(&0));
        assert_eq!(shares.get("export"), Some(&3));
    }
}
