//! What the feature evidence needs of a `Cargo.toml`: the package name, the `[features]` table and
//! the literal members of `[workspace]`. Read with the small line reader of `toml_lines`; a manifest
//! it cannot balance, or that is too large, is not read at all.

use answer_format::collation::compare_text;

use crate::repository_files::RepositoryFiles;
use crate::scan_limits::CARGO_MANIFEST_MAX_BYTES;
use crate::toml_lines::{
    assignment, is_balanced_fragment, normalize_key, quoted_values, section_of, strip_comment,
    text_lines,
};
use answer_format::whitespace::trim;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeatureDeclaration {
    pub name: String,
    /// The quoted names the feature turns on, as written.
    pub values: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CargoManifest {
    pub package_name: Option<String>,
    /// In name order.
    pub features: Vec<FeatureDeclaration>,
    pub workspace_members: Vec<String>,
}

/// The manifest at `relative`, or `None` when it is outside the root, unreadable, over 256 KiB or
/// has an array that never closes.
pub fn read_cargo_manifest(files: &RepositoryFiles<'_>, relative: &str) -> Option<CargoManifest> {
    let text = files.text(relative).ok()?;
    if text.len() > CARGO_MANIFEST_MAX_BYTES {
        return None;
    }
    parse_cargo_manifest(&text)
}

pub fn parse_cargo_manifest(text: &str) -> Option<CargoManifest> {
    let lines = text_lines(text);
    let mut section = String::new();
    let mut package_name = None;
    let mut features = Vec::new();
    let mut workspace_members = Vec::new();
    let mut index = 0;
    while let Some(raw) = lines.get(index) {
        index += 1;
        let line = trim(strip_comment(raw));
        if line.is_empty() {
            continue;
        }
        if let Some(table) = section_of(line) {
            section = table.to_string();
            continue;
        }
        let Some((key, first_value)) = assignment(line) else {
            continue;
        };
        let key = normalize_key(key);
        let mut value = first_value.to_string();
        if value.trim_start().starts_with('[') {
            while !is_balanced_fragment(&value) {
                let Some(next) = lines.get(index) else { break };
                index += 1;
                value.push(' ');
                value.push_str(trim(strip_comment(next)));
            }
            if !is_balanced_fragment(&value) {
                return None;
            }
        }
        match (section.as_str(), key.as_str()) {
            ("package", "name") => package_name = Some(normalize_key(&value)),
            ("features", _) => features.push(FeatureDeclaration {
                name: key,
                values: quoted_values(&value),
            }),
            ("workspace", "members") => workspace_members.extend(quoted_values(&value)),
            _ => {}
        }
    }
    features.sort_by(|left, right| compare_text(&left.name, &right.name));
    Some(CargoManifest {
        package_name,
        features,
        workspace_members,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_package_the_features_and_the_members_are_read_and_an_open_array_is_refused() {
        let manifest = parse_cargo_manifest(
            "[package]\nname = \"shop\"\n\n[features]\nzeta = []\nalpha = [\"dep:x\", # why\n  \"zeta\"]\n\n[workspace]\nmembers = [\"crates/a\", 'crates/b']\n",
        )
        .expect("a well-formed manifest");
        assert_eq!(manifest.package_name.as_deref(), Some("shop"));
        let names: Vec<_> = manifest.features.iter().map(|row| row.name.as_str()).collect();
        assert_eq!(names, ["alpha", "zeta"]);
        assert_eq!(manifest.features[0].values, ["dep:x", "zeta"]);
        assert_eq!(manifest.workspace_members, ["crates/a", "crates/b"]);
        assert_eq!(parse_cargo_manifest("[features]\na = [\"b\"\n"), None);
    }
}
