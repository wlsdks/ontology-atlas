//! Unit-to-unit import edges from product code: no test file and no type-only import. The edges
//! are the import scan's own, placed on the units the map lists.

use std::collections::{BTreeSet, HashMap};

use confined_files::SourceFiles;
use source_scan::{scan_imports, ImportScanOptions, ImportUsage, SourceRole};

use crate::source_class::SourceClass;
use crate::unit_collection::Collection;

/// A unit lists at most this many imports.
pub const IMPORTS_PER_UNIT: usize = 8;

/// For each unit, by index, the paths of the other units its product code imports, in UTF-16
/// order. A scan that finds nothing, or that a census refused a read of, leaves every set empty.
pub fn unit_imports(
    source: &dyn SourceFiles,
    root_label: &str,
    collection: &Collection,
    ignore: &[String],
) -> Vec<BTreeSet<String>> {
    let mut edges: Vec<BTreeSet<String>> = vec![BTreeSet::new(); collection.units.len()];
    let scan = scan_imports(
        source,
        root_label,
        &ImportScanOptions {
            ignore: ignore.to_vec(),
            ..ImportScanOptions::default()
        },
    );
    if source.refused_a_read() {
        return edges;
    }
    let unit_of_directory = |directory: &str| -> Option<usize> {
        let in_directory = collection.files.iter().find(|file| {
            file.class == SourceClass::Product
                && file.path.rsplit_once('/').map_or(".", |(folder, _)| folder) == directory
        });
        match in_directory {
            Some(file) => collection.unit_of_file.get(&file.path).copied(),
            None => collection
                .units
                .iter()
                .position(|unit| unit.path == directory),
        }
    };
    let mut add = |from: &str, target: Option<usize>| {
        let (Some(from_unit), Some(target)) = (collection.unit_of_file.get(from), target) else {
            return;
        };
        if *from_unit == target {
            return;
        }
        if let (Some(row), Some(unit)) = (edges.get_mut(*from_unit), collection.units.get(target)) {
            row.insert(unit.path.clone());
        }
    };
    for edge in &scan.edges {
        if edge.source_role != SourceRole::Production || edge.import_usage == ImportUsage::TypeOnly
        {
            continue;
        }
        add(&edge.from, collection.unit_of_file.get(&edge.to).copied());
    }
    if let Some(evidence) = &scan.package_import_evidence {
        for row in &evidence.package_imports {
            if row.source_role == SourceRole::Production {
                add(&row.from_file, unit_of_directory(&row.to_package));
            }
        }
    }
    let mut unit_of_member: HashMap<&str, usize> = HashMap::new();
    for member in &collection.members {
        let Some(name) = member.name.as_deref().filter(|name| !name.is_empty()) else {
            continue;
        };
        let mut inside: Vec<usize> = collection
            .units
            .iter()
            .enumerate()
            .filter(|(_, unit)| {
                unit.path == member.path
                    || unit
                        .path
                        .strip_prefix(&member.path)
                        .is_some_and(|rest| rest.starts_with('/'))
            })
            .map(|(index, _)| index)
            .collect();
        inside.sort_by(|left, right| {
            let lines = |index: &usize| collection.units.get(*index).map_or(0, |unit| unit.lines);
            lines(right).cmp(&lines(left))
        });
        if let Some(biggest) = inside.first() {
            unit_of_member.insert(name, *biggest);
        }
    }
    for external in &scan.external_imports {
        for (name, unit) in &unit_of_member {
            let reached = external.spec == *name
                || external
                    .spec
                    .strip_prefix(name)
                    .is_some_and(|rest| rest.starts_with('/'));
            if reached {
                add(&external.from, Some(*unit));
            }
        }
    }
    edges
}
