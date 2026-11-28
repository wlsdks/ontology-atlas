//! What a library exports: the names its entry file lists, resolved through the import that
//! re-exports each and through public subpackages. Five or more exports declared one per file in
//! one folder are one family row, three or more from one module are one API row.

use std::collections::HashSet;
use std::sync::LazyLock;

use indexmap::IndexMap;
use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::bounded_lines::bounded_lines;
use crate::declaration_index::{is_operation, DeclarationIndex};
use crate::js_pattern::js_regex;
use crate::source_class::SourceClass;
use crate::survey_files::SurveyFiles;
use crate::tooling_path::is_tooling;
use crate::unit_collection::Collection;

pub const FAMILY_SIZE: usize = 5;
const MODULE_API_SIZE: usize = 3;
const SCAN_UNITS: usize = 256 * 1024;
/// An import or export list open longer than this many lines, or holding more names, is not a list.
const LIST_LINES: usize = 200;
const LIST_NAMES: usize = 500;
const JS_EXTENSIONS: [&str; 8] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const MAX_FOLLOW_DEPTH: usize = 3;

static PY_FROM: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^from\s+(\.[\w.]*)\s+import\s+(.*)$"));
static PY_ALL: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^__all__\s*=\s*([\[(])(.*)$"));
static PY_STARTS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(?:from|import|__all__)\b"));
static JS_STARTS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(?:export|import)\b"));
static JS_NAMED: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^export\s+(?:type\s+)?\{(.*)$"));
static JS_DECLARED: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?)\s+([A-Za-z_$][\w$]*)",
    )
});
static JS_STAR: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"^export\s+\*\s+from\s+['"]([^'"]+)['"]"#));
static JS_FROM: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"^\s*from\s*['"]([^'"]+)['"]"#));
static ALL_CAPS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[A-Z0-9_]+$"));
static ERRORISH: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?:Error|Exception|Warning)$"));
static BUILT_JS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\.(?:c|m)?js$"));
static QUOTED_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"^['"]([A-Za-z_]\w*)['"]$"#));
static AS_SPLIT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\s+as\s+"));
static TYPE_PREFIX: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^type\s+"));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StatementKind {
    From,
    All,
    Named,
    Declared,
    Star,
}

#[derive(Debug)]
struct Statement {
    kind: StatementKind,
    spec: Option<String>,
    names: Vec<String>,
}

struct OpenList {
    kind: StatementKind,
    spec: Option<String>,
    closer: char,
    parts: Vec<String>,
    lines: usize,
    length: usize,
}

fn trim_end(line: &str) -> &str {
    line.trim_end_matches(answer_format::whitespace::is_whitespace)
}

fn list_names(list: &str) -> Vec<String> {
    list.split(',')
        .map(|name| answer_format::whitespace::trim(name).to_string())
        .filter(|name| !name.is_empty())
        .take(LIST_NAMES)
        .collect()
}

fn close_list(
    statements: &mut Vec<Statement>,
    kind: StatementKind,
    spec: Option<String>,
    list: &str,
    rest: &str,
) {
    let spec = if kind == StatementKind::Named {
        JS_FROM
            .captures(rest)
            .and_then(|found| found.get(1))
            .map(|found| found.as_str().to_string())
    } else {
        spec
    };
    statements.push(Statement {
        kind,
        spec,
        names: list_names(list),
    });
}

fn start_list(
    statements: &mut Vec<Statement>,
    open: &mut Option<OpenList>,
    kind: StatementKind,
    spec: Option<String>,
    rest: &str,
    closer: char,
) {
    if let Some(end) = rest.find(closer) {
        let after = rest.get(end + closer.len_utf8()..).unwrap_or("");
        close_list(statements, kind, spec, rest.get(..end).unwrap_or(""), after);
    } else {
        *open = Some(OpenList {
            kind,
            spec,
            closer,
            parts: vec![rest.to_string()],
            lines: 1,
            length: answer_format::utf16::len(rest),
        });
    }
}

/// The import and export statements of an entry file, read in one forward pass: a list that opens
/// on one line is carried to the line that closes it, and dropped past 200 lines or 500 names, or
/// when another statement starts first.
fn export_statements(text: &str, python: bool) -> Vec<Statement> {
    let mut statements = Vec::new();
    let mut open: Option<OpenList> = None;
    for raw in bounded_lines(text) {
        let line = trim_end(&raw);
        let starts = if python {
            PY_STARTS.is_match(line)
        } else {
            JS_STARTS.is_match(line)
        };
        if let (Some(list), false) = (open.as_mut(), starts) {
            if let Some(end) = line.find(list.closer) {
                let mut parts = std::mem::take(&mut list.parts);
                parts.push(line.get(..end).unwrap_or("").to_string());
                let rest = line.get(end + list.closer.len_utf8()..).unwrap_or("");
                let (kind, spec) = (list.kind, list.spec.take());
                close_list(&mut statements, kind, spec, &parts.join(","), rest);
                open = None;
            } else {
                list.parts.push(line.to_string());
                list.lines += 1;
                list.length += answer_format::utf16::len(line);
                if list.lines > LIST_LINES || list.length > LIST_NAMES * 80 {
                    open = None;
                }
            }
            continue;
        }
        open = None;
        if python {
            if let Some(found) = PY_FROM.captures(line) {
                let spec = found.get(1).map(|part| part.as_str().to_string());
                let imported = found.get(2).map_or("", |part| part.as_str());
                if let Some(inside) = imported.strip_prefix('(') {
                    start_list(
                        &mut statements,
                        &mut open,
                        StatementKind::From,
                        spec,
                        inside,
                        ')',
                    );
                } else {
                    statements.push(Statement {
                        kind: StatementKind::From,
                        spec,
                        names: list_names(imported),
                    });
                }
            }
            if let Some(found) = PY_ALL.captures(line) {
                let closer = if found.get(1).map(|part| part.as_str()) == Some("[") {
                    ']'
                } else {
                    ')'
                };
                let rest = found.get(2).map_or("", |part| part.as_str());
                start_list(
                    &mut statements,
                    &mut open,
                    StatementKind::All,
                    None,
                    rest,
                    closer,
                );
            }
            continue;
        }
        if let Some(found) = JS_NAMED.captures(line) {
            let rest = found.get(1).map_or("", |part| part.as_str());
            start_list(
                &mut statements,
                &mut open,
                StatementKind::Named,
                None,
                rest,
                '}',
            );
            continue;
        }
        if let Some(found) = JS_DECLARED.captures(line) {
            statements.push(Statement {
                kind: StatementKind::Declared,
                spec: None,
                names: found
                    .get(1)
                    .map(|name| vec![name.as_str().to_string()])
                    .unwrap_or_default(),
            });
            continue;
        }
        if let Some(found) = JS_STAR.captures(line) {
            statements.push(Statement {
                kind: StatementKind::Star,
                spec: found.get(1).map(|part| part.as_str().to_string()),
                names: Vec::new(),
            });
        }
    }
    statements
}

fn is_public_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('_')
        && !ALL_CAPS.is_match(name)
        && !ERRORISH.is_match(name)
}

fn dirname(path: &str) -> &str {
    path.rsplit_once('/').map_or(".", |(folder, _)| folder)
}

fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// `a/b` joined with `c/../d` the way `path.posix.join` does, without leaving the root upward.
fn posix_join(base: &str, spec: &str) -> String {
    let mut parts: Vec<&str> = if base == "." || base.is_empty() {
        Vec::new()
    } else {
        base.split('/').collect()
    };
    for part in spec.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|last| *last != "..") {
                    parts.pop();
                } else {
                    parts.push("..");
                }
            }
            other => parts.push(other),
        }
    }
    if parts.is_empty() {
        ".".to_string()
    } else {
        parts.join("/")
    }
}

/// The repository file a relative import in `from` names, resolved through the survey's
/// confinement.
fn resolve_module(files: &SurveyFiles<'_>, from: &str, spec: &str, python: bool) -> Option<String> {
    if python {
        let dots = spec
            .chars()
            .take_while(|character| *character == '.')
            .count();
        if dots == 0 {
            return None;
        }
        let mut base = dirname(from).to_string();
        for _ in 1..dots {
            base = dirname(&base).to_string();
        }
        let rest = spec
            .get(dots..)
            .unwrap_or("")
            .split('.')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("/");
        let stem = if rest.is_empty() {
            base
        } else {
            posix_join(&base, &rest)
        };
        return files
            .file(&format!("{stem}.py"))
            .or_else(|| files.file(&format!("{stem}/__init__.py")));
    }
    if !spec.starts_with('.') {
        return None;
    }
    let joined = posix_join(dirname(from), spec);
    let stem = BUILT_JS.replace(&joined, "").into_owned();
    for extension in JS_EXTENSIONS {
        if let Some(hit) = files
            .file(&format!("{stem}{extension}"))
            .or_else(|| files.file(&format!("{stem}/index{extension}")))
        {
            return Some(hit);
        }
    }
    None
}

#[derive(Debug, Clone)]
struct ExportedName {
    name: String,
    from: Option<String>,
}

/// Names a library entry file exports, each with the module the file imports it from when it
/// says: `__all__` and `from .x import A`, or `export { A } from`, `export class` and
/// `export * from` (followed up to three files deep).
fn exported_names(
    files: &SurveyFiles<'_>,
    path: &str,
    depth: usize,
    seen: &mut HashSet<String>,
) -> Vec<ExportedName> {
    if !seen.insert(path.to_string()) {
        return Vec::new();
    }
    let python = path.ends_with(".py");
    let statements = export_statements(&files.text(path, SCAN_UNITS), python);
    let mut rows: IndexMap<String, Option<String>> = IndexMap::new();
    let push = |name: &str, from: Option<String>, rows: &mut IndexMap<String, Option<String>>| {
        if !is_public_name(name) {
            return;
        }
        match rows.get_mut(name) {
            Some(held) => {
                if held.is_none() {
                    *held = from;
                }
            }
            None => {
                rows.insert(name.to_string(), from);
            }
        }
    };
    let forward =
        |spec: &str, rows: &mut IndexMap<String, Option<String>>, seen: &mut HashSet<String>| {
            let Some(from) = resolve_module(files, path, spec, python) else {
                return;
            };
            if depth < MAX_FOLLOW_DEPTH {
                for row in exported_names(files, &from, depth + 1, seen) {
                    push(&row.name, row.from.or_else(|| Some(from.clone())), rows);
                }
            }
        };
    if python {
        let mut sources: IndexMap<String, Option<String>> = IndexMap::new();
        for statement in statements
            .iter()
            .filter(|row| row.kind == StatementKind::From)
        {
            let spec = statement.spec.as_deref().unwrap_or("");
            let imported: Vec<String> = statement
                .names
                .iter()
                .map(|name| {
                    AS_SPLIT
                        .split(name)
                        .last()
                        .unwrap_or(name.as_str())
                        .to_string()
                })
                .collect();
            if imported.iter().any(|name| name == "*") {
                forward(spec, &mut rows, seen);
                continue;
            }
            let from = resolve_module(files, path, spec, true);
            for name in imported {
                sources.insert(name, from.clone());
            }
        }
        if let Some(all) = statements.iter().find(|row| row.kind == StatementKind::All) {
            for entry in &all.names {
                let Some(name) = QUOTED_NAME
                    .captures(entry)
                    .and_then(|found| found.get(1))
                    .map(|found| found.as_str().to_string())
                else {
                    continue;
                };
                let from = sources.get(&name).cloned().flatten();
                push(&name, from, &mut rows);
            }
        } else {
            for (name, from) in &sources {
                push(name, from.clone(), &mut rows);
            }
        }
        return rows
            .into_iter()
            .map(|(name, from)| ExportedName { name, from })
            .collect();
    }
    for statement in statements
        .iter()
        .filter(|row| row.kind == StatementKind::Named)
    {
        let from = statement
            .spec
            .as_deref()
            .and_then(|spec| resolve_module(files, path, spec, false));
        for name in &statement.names {
            let bare = TYPE_PREFIX.replace(name, "");
            let exported = AS_SPLIT.split(&bare).last().unwrap_or(&bare).to_string();
            push(&exported, from.clone(), &mut rows);
        }
    }
    for statement in statements
        .iter()
        .filter(|row| row.kind == StatementKind::Declared)
    {
        if let Some(name) = statement.names.first() {
            push(name, Some(path.to_string()), &mut rows);
        }
    }
    for statement in statements
        .iter()
        .filter(|row| row.kind == StatementKind::Star)
    {
        if let Some(spec) = &statement.spec {
            forward(spec, &mut rows, seen);
        }
    }
    rows.into_iter()
        .map(|(name, from)| ExportedName { name, from })
        .collect()
}

/// The `__init__.py` of each public subpackage under a Python library's top package.
fn subpackage_entries(collection: &Collection, entry_path: &str) -> Vec<String> {
    if basename(entry_path) != "__init__.py" {
        return Vec::new();
    }
    let top = dirname(entry_path);
    let prefix = format!("{top}/");
    let mut found: Vec<String> = collection
        .files
        .iter()
        .filter(|file| file.class == SourceClass::Product)
        .filter(|file| basename(&file.path) == "__init__.py" && file.path != entry_path)
        .filter_map(|file| {
            let inside = file.path.strip_prefix(&prefix)?;
            let mut folders: Vec<&str> = inside.split('/').collect();
            folders.pop();
            (!folders.iter().any(|part| part.starts_with('_'))).then(|| file.path.clone())
        })
        .collect();
    answer_format::utf16::sort(&mut found);
    found
}

struct Member {
    name: String,
    path: String,
    line: usize,
}

fn stem_name(path: &str) -> &str {
    let name = basename(path);
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

/// A library's exported classes and functions: each name resolved to the file the entry imports
/// it from when that file declares it, else to its one declaration.
pub fn library_abilities(
    files: &SurveyFiles<'_>,
    collection: &Collection,
    entry_path: &str,
    index: &DeclarationIndex,
) -> Vec<AbilityRow> {
    let mut declared_in: IndexMap<String, (String, usize)> = IndexMap::new();
    let mut entries = vec![entry_path.to_string()];
    entries.extend(subpackage_entries(collection, entry_path));
    for path in entries {
        let mut seen = HashSet::new();
        for ExportedName { name, from } in exported_names(files, &path, 0, &mut seen) {
            if declared_in.contains_key(&name) {
                continue;
            }
            let rows: Vec<_> = index
                .get(&name)
                .map(|held| {
                    held.iter()
                        .filter(|row| is_operation(row.kind) && !is_tooling(&row.path))
                        .collect()
                })
                .unwrap_or_default();
            let declared = from
                .as_deref()
                .and_then(|from| rows.iter().find(|row| row.path == from))
                .or(if rows.len() == 1 { rows.first() } else { None });
            if let Some(declared) = declared {
                declared_in.insert(name, (declared.path.clone(), declared.line));
            }
        }
    }
    let mut by_folder: IndexMap<String, Vec<Member>> = IndexMap::new();
    for (name, (path, line)) in &declared_in {
        by_folder
            .entry(dirname(path).to_string())
            .or_default()
            .push(Member {
                name: name.clone(),
                path: path.clone(),
                line: *line,
            });
    }
    let mut rows = Vec::new();
    let mut loose: Vec<Member> = Vec::new();
    for (folder, members) in by_folder {
        let distinct: HashSet<&str> = members.iter().map(|member| member.path.as_str()).collect();
        if members.len() >= FAMILY_SIZE && distinct.len() * 4 >= members.len() * 3 {
            let Some(first) = members.first() else {
                continue;
            };
            let mut row = AbilityRow::at(AbilityKind::Family, &folder, &folder, first.line);
            row.evidence = format!("{}:L{}", first.path, first.line);
            rows.push(row.with_members(members.iter().map(|member| member.name.clone()).collect()));
        } else {
            loose.extend(members);
        }
    }
    let mut by_file: IndexMap<String, Vec<Member>> = IndexMap::new();
    for member in loose {
        by_file.entry(member.path.clone()).or_default().push(member);
    }
    for (path, members) in by_file {
        let Some(first) = members.first() else {
            continue;
        };
        if members.len() >= MODULE_API_SIZE {
            let stem = stem_name(&path);
            let folders: Vec<&str> = dirname(&path)
                .split('/')
                .filter(|part| !["src", "lib", "source", "."].contains(part))
                .collect();
            let name = if ["index", "__init__", "mod", "lib", "main"].contains(&stem) {
                folders.last().copied().unwrap_or(stem)
            } else {
                stem
            };
            rows.push(
                AbilityRow::at(AbilityKind::Api, name, &path, first.line)
                    .with_members(members.iter().map(|member| member.name.clone()).collect()),
            );
        } else {
            for member in &members {
                rows.push(
                    AbilityRow::at(AbilityKind::Export, &member.name, &path, member.line)
                        .with_symbol(&member.name),
                );
            }
        }
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_list_open_across_lines_is_carried_to_its_closer() {
        let text = "from .a import (\n    A,\n    B as C,\n)\n__all__ = ['A', 'C']\n";
        let statements = export_statements(text, true);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0].names, ["A", "B as C"]);
        assert_eq!(statements[1].names, ["'A'", "'C'"]);
    }

    #[test]
    fn a_js_named_export_takes_its_source_from_the_closing_line() {
        let statements = export_statements("export {\n  a,\n  type B\n} from './x';\n", false);
        assert_eq!(statements[0].spec.as_deref(), Some("./x"));
        assert_eq!(statements[0].names, ["a", "type B"]);
    }

    #[test]
    fn public_names_leave_out_constants_errors_and_underscored_names() {
        assert!(is_public_name("Order"));
        assert!(!is_public_name("MAX_SIZE"));
        assert!(!is_public_name("OrderError"));
        assert!(!is_public_name("_hidden"));
    }

    #[test]
    fn joins_resolve_dots_without_leaving_the_root() {
        assert_eq!(posix_join("a/b", "../c"), "a/c");
        assert_eq!(posix_join(".", "./x"), "x");
        assert_eq!(posix_join("a", "../../x"), "../x");
    }
}
