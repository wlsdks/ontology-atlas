//! Families the export surface cannot show: a folder whose files each declare the operation the
//! file is named after (`order_cancel.py` declares `OrderCancel`). An application registers such
//! operations in a schema or router instead of re-exporting them from a package file. One pass
//! over the declaration index and one over the product files.

use std::collections::HashMap;

use indexmap::IndexMap;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::declaration_index::{is_operation, DeclarationIndex};
use crate::name_key::name_key;

/// Package and barrel files hold no operation of their own.
const PACKAGE_FILE_STEMS: [&str; 5] = ["__init__", "index", "mod", "lib", "main"];
/// A JVM file always declares the type it is named after, and a view file the component it is
/// named after, so the rule would turn every package and every component folder into a family.
const ONE_TYPE_PER_FILE_EXTENSIONS: [&str; 9] = [
    ".java", ".kt", ".kts", ".scala", ".cs", ".tsx", ".jsx", ".vue", ".svelte",
];

fn stem_of(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

fn extension_with_dot(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rfind('.')
        .and_then(|at| name.get(at..))
        .unwrap_or("")
        .to_string()
}

struct NamedAfterFile {
    name: String,
    line: usize,
}

/// A folder's product file count and the files in it that are named for what they declare.
type FolderFiles<'a> = (usize, Vec<(&'a str, &'a NamedAfterFile)>);

pub fn sibling_families(
    product_paths: &[&str],
    index: &DeclarationIndex,
    family_size: usize,
) -> Vec<AbilityRow> {
    let mut named_after_file: HashMap<&str, NamedAfterFile> = HashMap::new();
    for (name, declarations) in index {
        if name.contains('.') {
            continue;
        }
        for declared in declarations {
            if !is_operation(declared.kind) || named_after_file.contains_key(declared.path.as_str())
            {
                continue;
            }
            if name_key(name) == name_key(stem_of(&declared.path)) {
                named_after_file.insert(
                    declared.path.as_str(),
                    NamedAfterFile {
                        name: name.clone(),
                        line: declared.line,
                    },
                );
            }
        }
    }
    let mut by_folder: IndexMap<&str, FolderFiles<'_>> = IndexMap::new();
    for path in product_paths {
        if ONE_TYPE_PER_FILE_EXTENSIONS.contains(&extension_with_dot(path).as_str())
            || PACKAGE_FILE_STEMS.contains(&stem_of(path))
        {
            continue;
        }
        let folder = path.rsplit_once('/').map_or(".", |(folder, _)| folder);
        let held = by_folder.entry(folder).or_insert((0, Vec::new()));
        held.0 += 1;
        if let Some(member) = named_after_file.get(path) {
            held.1.push((path, member));
        }
    }
    let mut rows: Vec<(usize, AbilityRow)> = Vec::new();
    for (folder, (files, mut members)) in by_folder {
        // Most of the folder follows the convention; a helper file or two beside the operations
        // is normal.
        if members.len() < family_size || members.len() * 2 < files {
            continue;
        }
        members.sort_by(|left, right| answer_format::collation::compare_text(left.0, right.0));
        let Some((first_path, first)) = members.first() else {
            continue;
        };
        let mut row = AbilityRow::at(AbilityKind::Family, folder, folder, first.line);
        row.evidence = format!("{first_path}:L{}", first.line);
        let names = members
            .iter()
            .map(|(_, member)| member.name.clone())
            .collect();
        rows.push((members.len(), row.with_members(names)));
    }
    rows.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| answer_format::collation::compare_text(&left.1.path, &right.1.path))
    });
    rows.into_iter().map(|(_, row)| row).collect()
}
