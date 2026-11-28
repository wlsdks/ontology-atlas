//! Where the product starts or is reached: the commands and libraries its manifests declare, the
//! executables its source contains, the routes and plugins it registers. Static reads: nothing
//! runs.

use std::collections::HashSet;
use std::sync::LazyLock;

use indexmap::IndexMap;
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;

use crate::ability_row::AbilityKind;
use crate::entry_signals::{stem_of, ROUTE_LIMIT};
use crate::js_pattern::js_regex;
use crate::source_class::SourceClass;
use crate::survey_files::SurveyFiles;
use crate::unit_collection::Collection;

/// A survey lists at most this many entry points.
pub const ENTRY_POINT_LIMIT: usize = 40;
const MANIFEST_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryPoint {
    pub kind: AbilityKind,
    pub path: String,
    pub symbol: String,
    /// What the manifest calls it, when it names the entry apart from its symbol.
    pub name: Option<String>,
}

#[derive(Debug, Default)]
pub struct EntryPoints {
    pub rows: Vec<EntryPoint>,
    pub omitted: usize,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum BinField {
    Text(String),
    Table(IndexMap<String, Value>),
    Other(serde::de::IgnoredAny),
}

#[derive(Deserialize)]
struct Manifest {
    name: Option<Value>,
    bin: Option<BinField>,
    main: Option<Value>,
    source: Option<Value>,
}

/// `String(value ?? '')` as JavaScript writes it, for the values a manifest may hold.
fn js_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number
            .as_f64()
            .map_or_else(|| number.to_string(), answer_format::number::text),
        Value::Array(items) => items.iter().map(js_string).collect::<Vec<_>>().join(","),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

fn base_name(folder: &str) -> &str {
    folder.rsplit('/').next().unwrap_or(folder)
}

/// A manifest path inside `folder`, as a repository-relative file that exists inside the root, or
/// `None`: the path as written first, then its source twin (`dist/cli.js` is `src/cli.ts`).
fn resolve_script_path(files: &SurveyFiles<'_>, folder: &str, raw: &str) -> Option<String> {
    static BUILT_FOLDER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(?:dist|lib|build|out)/"));
    static BUILT_FILE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\.(?:c|m)?js$"));
    let path = SurveyFiles::relative_path(raw)?;
    let at = |inner: &str| {
        if folder == "." {
            inner.to_string()
        } else {
            format!("{folder}/{inner}")
        }
    };
    let moved = BUILT_FOLDER.replace(&path, "src/");
    let source = BUILT_FILE.replace(&moved, ".ts");
    files.file(&at(&path)).or_else(|| files.file(&at(&source)))
}

fn package_entry_points(files: &SurveyFiles<'_>, collection: &Collection) -> Vec<EntryPoint> {
    let mut rows = Vec::new();
    let folders = std::iter::once(".".to_string())
        .chain(collection.members.iter().map(|member| member.path.clone()));
    for folder in folders {
        let manifest_path = if folder == "." {
            "package.json".to_string()
        } else {
            format!("{folder}/package.json")
        };
        let text = files.text(&manifest_path, MANIFEST_BYTES);
        let Ok(manifest) = serde_json::from_str::<Manifest>(&text) else {
            continue;
        };
        let symbol = manifest
            .name
            .as_ref()
            .map_or_else(|| base_name(&folder).to_string(), js_string);
        let mut push = |raw: &str, symbol: String, kind: AbilityKind| {
            if let Some(path) = resolve_script_path(files, &folder, raw) {
                rows.push(EntryPoint {
                    kind,
                    path,
                    symbol,
                    name: None,
                });
            }
        };
        match &manifest.bin {
            Some(BinField::Text(path)) => push(path, symbol.clone(), AbilityKind::Command),
            Some(BinField::Table(table)) => {
                for (name, path) in answer_format::key_order::in_object_order(table.iter()) {
                    push(&js_string(path), name.clone(), AbilityKind::Command);
                }
            }
            Some(BinField::Other(_)) | None => {}
        }
        let is_plugin = folder.split('/').next() == Some("plugins");
        let main = match &manifest.source {
            Some(Value::String(source)) => Some(source.clone()),
            _ => match &manifest.main {
                Some(Value::String(main)) => Some(main.clone()),
                _ => None,
            },
        };
        if let (Some(main), false) = (main, is_plugin) {
            push(&main, symbol.clone(), AbilityKind::Library);
        }
    }
    rows
}

static SCRIPT_LINE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"^\s*["']?([\w.-]+)["']?\s*=\s*["']([\w.]+)(?::([\w.]+))?["']"#));

/// The lines of the TOML table whose header is exactly `header`, up to the next table.
fn toml_section<'text>(text: &'text str, header: &str) -> Vec<&'text str> {
    let lines: Vec<&str> = text
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect();
    let Some(start) = lines.iter().position(|line| line.trim() == header) else {
        return Vec::new();
    };
    lines
        .into_iter()
        .skip(start + 1)
        .take_while(|line| !line.trim_start().starts_with('['))
        .collect()
}

fn python_module_path(files: &SurveyFiles<'_>, module: &str) -> Option<String> {
    let joined = module.split('.').collect::<Vec<_>>().join("/");
    for base in ["src", "."] {
        for candidate in [format!("{joined}.py"), format!("{joined}/__init__.py")] {
            let path = if base == "." {
                candidate
            } else {
                format!("{base}/{candidate}")
            };
            if let Some(found) = files.file(&path) {
                return Some(found);
            }
        }
    }
    None
}

fn python_entry_points(files: &SurveyFiles<'_>) -> Vec<EntryPoint> {
    let text = files.text("pyproject.toml", MANIFEST_BYTES);
    if text.is_empty() {
        return Vec::new();
    }
    let mut sections: Vec<(String, AbilityKind)> = [
        "[project.scripts]",
        "[tool.poetry.scripts]",
        "[project.gui-scripts]",
    ]
    .into_iter()
    .map(|header| (header.to_string(), AbilityKind::Command))
    .collect();
    for line in text.split('\n') {
        let header = line.trim();
        if header.starts_with("[project.entry-points.") {
            sections.push((header.to_string(), AbilityKind::Plugin));
        }
    }
    let mut rows = Vec::new();
    for (header, kind) in sections {
        for line in toml_section(&text, &header) {
            let Some(found) = SCRIPT_LINE.captures(line) else {
                continue;
            };
            let (Some(name), Some(module)) = (found.get(1), found.get(2)) else {
                continue;
            };
            if let Some(path) = python_module_path(files, module.as_str()) {
                rows.push(EntryPoint {
                    kind,
                    path,
                    symbol: found.get(3).map_or_else(
                        || name.as_str().to_string(),
                        |symbol| symbol.as_str().to_string(),
                    ),
                    name: Some(name.as_str().to_string()),
                });
            }
        }
    }
    rows
}

fn python_package_entry_points(collection: &Collection) -> Vec<EntryPoint> {
    collection
        .product_files_listed()
        .filter(|file| file.path.rsplit('/').next() == Some("__init__.py"))
        .filter_map(|file| {
            let parts: Vec<&str> = file.path.split('/').collect();
            let is_top_package =
                parts.len() == 2 || (parts.len() == 3 && parts.first() == Some(&"src"));
            let package = parts.len().checked_sub(2).and_then(|at| parts.get(at))?;
            is_top_package.then(|| EntryPoint {
                kind: AbilityKind::Library,
                path: file.path.clone(),
                symbol: (*package).to_string(),
                name: None,
            })
        })
        .collect()
}

fn code_entry_points(collection: &Collection) -> Vec<EntryPoint> {
    let mut rows = Vec::new();
    let mut routes: Vec<EntryPoint> = Vec::new();
    for file in collection
        .files
        .iter()
        .filter(|file| file.class == SourceClass::Product)
    {
        let Some(reading) = &file.reading else {
            continue;
        };
        let signals = &reading.signals;
        if let Some(symbol) = &signals.executable {
            rows.push(EntryPoint {
                kind: AbilityKind::Executable,
                path: file.path.clone(),
                symbol: symbol.clone(),
                name: None,
            });
        }
        for plugin in &signals.plugins {
            rows.push(EntryPoint {
                kind: AbilityKind::Plugin,
                path: file.path.clone(),
                symbol: plugin.clone(),
                name: None,
            });
        }
        if routes.len() < ROUTE_LIMIT {
            for route in &signals.routes {
                if routes.len() < ROUTE_LIMIT && !routes.iter().any(|row| row.symbol == *route) {
                    routes.push(EntryPoint {
                        kind: AbilityKind::Route,
                        path: file.path.clone(),
                        symbol: route.clone(),
                        name: None,
                    });
                }
            }
        }
    }
    rows.extend(routes);
    rows
}

/// The entry points of the repository: manifests first, then source, each once.
pub fn entry_points_of(files: &SurveyFiles<'_>, collection: &Collection) -> EntryPoints {
    let mut seen: HashSet<(AbilityKind, String, String)> = HashSet::new();
    let mut rows: Vec<EntryPoint> = Vec::new();
    for row in package_entry_points(files, collection)
        .into_iter()
        .chain(python_entry_points(files))
        .chain(python_package_entry_points(collection))
        .chain(code_entry_points(collection))
    {
        if seen.insert((row.kind, row.path.clone(), row.symbol.clone())) {
            rows.push(row);
        }
    }
    let omitted = rows.len().saturating_sub(ENTRY_POINT_LIMIT);
    rows.truncate(ENTRY_POINT_LIMIT);
    EntryPoints { rows, omitted }
}

/// The name an executable row is listed under: its folder, unless the folder says nothing.
pub fn executable_name(path: &str) -> String {
    let folder = path.rsplit_once('/').map_or(".", |(folder, _)| {
        folder.rsplit('/').next().unwrap_or(folder)
    });
    if matches!(folder, "src" | "bin" | "cmd" | "." | "") {
        stem_of(path).to_string()
    } else {
        folder.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_executable_is_named_for_its_folder_unless_the_folder_says_nothing() {
        assert_eq!(executable_name("cmd/atlas/main.go"), "atlas");
        assert_eq!(executable_name("src/main.rs"), "main");
        assert_eq!(executable_name("main.go"), "main");
    }

    #[test]
    fn a_toml_section_is_the_lines_up_to_the_next_table() {
        let text = "[project]\nname = \"a\"\n[project.scripts]\natlas = \"pkg.cli:main\"\n\n[other]\nx = 1\n";
        assert_eq!(
            toml_section(text, "[project.scripts]"),
            ["atlas = \"pkg.cli:main\"", ""]
        );
        assert!(toml_section(text, "[missing]").is_empty());
    }
}
