//! The functions a body calls that the repository declares, each with the file and line to read
//! next. A call is followed only where the file can reach it, in its own language:
//!
//! - `self.check(` / `this.check(` / a Go receiver's `r.check(` is the owner's own method, found in
//!   the owner, then in the classes it extends (local or imported), so an override wins over the
//!   base it replaces;
//! - `self.store.save(` is a method of a field, whose type the text does not name: never the
//!   owner's own `save`, only one declared in this file or a module it imports (a Go package it
//!   imports or shares), and when several types in one folder declare it (an interface's
//!   implementations live beside each other), each is listed as one implementation;
//! - a bare `check(` is declared in this file, imported into it by name, or (Go) declared in its
//!   package; `pkg.Check(` names an imported module or package;
//! - any other `x.check(` (`map.get(`, `items.includes(`) is a method of a value whose type the
//!   text does not name, and is not followed.
//!
//! An import is resolved to its module's files and the name looked up there, so a read costs the
//! imports and calls it examines after one indexing pass. Only an internal import naming no file
//! here is followed by name alone, capped and marked `by_name`. A name declared in more places than
//! these allow is left out: following it would be a guess. A line over [`LINE_CHARS`] characters is
//! generated or minified and is not scanned.

use std::collections::HashSet;
use std::rc::Rc;
use std::sync::LazyLock;

use answer_format::utf16;
use regex::Regex;
use repository_survey::js_regex;

use crate::declaration_span::{declaration_end, declares, enclosing_class, Ends};
use crate::declaration_survey::DeclarationSurvey;
use crate::file_outline::{OutlineDeclaration, OutlineKind};
use crate::import_bindings::{child_spec, language_of, Spec};
use crate::opened_file::{FileOpener, OpenedFile};
use crate::product_index::DeclarationRow;
use crate::source_row::Callee;

const MAX_CALLEES: usize = 12;
/// Implementations of one field method listed at most; more is a common name.
const MAX_IMPLEMENTATIONS: usize = 6;
/// Classes walked up from the owner to find an inherited method.
const MAX_BASES: usize = 4;
/// Characters of a call's qualifier (`this.git.options.`) examined.
const QUALIFIER_CHARS: usize = 120;
/// Declarations of a name followed by name alone; more is a common name, not one function.
const MAX_NAME_DECLARATIONS: usize = 64;
/// A line longer than this is generated or minified: its calls are not followed.
const LINE_CHARS: usize = 2000;

const NOT_A_CALLEE: [&str; 48] = [
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "return",
    "function",
    "func",
    "def",
    "class",
    "new",
    "typeof",
    "await",
    "yield",
    "super",
    "print",
    "len",
    "make",
    "append",
    "cap",
    "panic",
    "require",
    "import",
    "isinstance",
    "range",
    "str",
    "int",
    "float",
    "list",
    "dict",
    "set",
    "tuple",
    "bool",
    "with",
    "elif",
    "assert",
    "not",
    "and",
    "or",
    "in",
    "is",
    "lambda",
    "match",
    "case",
    "select",
    "go",
    "defer",
    "fn",
];

static IDENTIFIER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[A-Za-z_$][\w$]*"));
static GO_RECEIVER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^func\s*\(\s*([A-Za-z_]\w*)\s"));
static PYTHON_BASES: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^class\s+[A-Za-z_]\w*\s*\(([^)]{0,300})\)"));
static JS_EXTENDS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bextends\s+([A-Za-z_$][\w$.]*)"));
static PLAIN_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[A-Za-z_]\w*$"));

fn is_qualifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'$' | b'.' | b'?')
}

/// The dotted chain written before a call name, `this.git` for `this.git?.save(`; `Some("")` for a
/// bare call and `None` when an expression (`f().save(`) comes before it.
fn qualifier_of(text: &str, start: usize) -> Option<String> {
    let bytes = text.as_bytes();
    if start == 0 || bytes.get(start - 1) != Some(&b'.') {
        return Some(String::new());
    }
    let mut index = start - 1;
    let stop = start.saturating_sub(QUALIFIER_CHARS);
    while index > stop
        && bytes
            .get(index - 1)
            .is_some_and(|byte| is_qualifier_byte(*byte))
    {
        index -= 1;
    }
    let chain: String = text
        .get(index..start - 1)
        .unwrap_or("")
        .chars()
        .filter(|character| *character != '?')
        .collect();
    if chain.is_empty() || chain.starts_with('.') || chain.starts_with(|c: char| c.is_ascii_digit())
    {
        return None;
    }
    Some(chain)
}

/// Each identifier in `line` written as a call (`name(` or `name (`), with where it starts.
pub fn calls_on_line(line: &str) -> Vec<(String, usize)> {
    if utf16::len(line) > LINE_CHARS {
        return Vec::new();
    }
    let bytes = line.as_bytes();
    IDENTIFIER
        .find_iter(line)
        .filter(|found| {
            let mut next = found.end();
            while matches!(bytes.get(next), Some(b' ' | b'\t')) {
                next += 1;
            }
            bytes.get(next) == Some(&b'(')
        })
        .map(|found| (found.as_str().to_string(), found.start()))
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Via {
    Own,
    Field,
    Name,
    Qualified,
}

struct Call {
    name: String,
    via: Via,
    chain: String,
}

fn calls_in(text: &str, self_names: &HashSet<String>) -> Vec<Call> {
    let mut calls = Vec::new();
    let mut seen = HashSet::new();
    for line in text.split('\n') {
        for (name, index) in calls_on_line(line) {
            if NOT_A_CALLEE.contains(&name.as_str()) {
                continue;
            }
            let Some(chain) = qualifier_of(line, index) else {
                continue;
            };
            let segments: Vec<&str> = chain.split('.').filter(|part| !part.is_empty()).collect();
            let via = match segments.first() {
                None => Via::Name,
                Some(first) if self_names.contains(*first) => {
                    if segments.len() == 1 {
                        Via::Own
                    } else {
                        Via::Field
                    }
                }
                Some(_) => Via::Qualified,
            };
            let key = format!(
                "{via:?}\0{}\0{name}",
                if via == Via::Qualified {
                    chain.as_str()
                } else {
                    ""
                }
            );
            if seen.insert(key) {
                calls.push(Call { name, via, chain });
            }
        }
    }
    calls
}

fn folder_of(path: &str) -> &str {
    path.rfind('/')
        .map_or("", |slash| path.get(..slash).unwrap_or(""))
}

fn member_of<'a>(
    file: &'a OpenedFile,
    owner: &OutlineDeclaration,
    name: &str,
) -> Option<&'a OutlineDeclaration> {
    let end = declaration_end(&file.lines, file.declarations(), owner, Ends::AtCode);
    file.declarations().iter().find(|candidate| {
        candidate.kind.is_code()
            && candidate.name == name
            && candidate.line > owner.line
            && candidate.line <= end
            && candidate.kind != OutlineKind::Class
    })
}

/// The names a class line says it extends: `class A(B, mod.C):` or `class A extends B`.
fn bases_of(file: &OpenedFile, owner: &OutlineDeclaration) -> Vec<String> {
    let raw = owner
        .line
        .checked_sub(1)
        .and_then(|index| file.lines.get(index))
        .map_or("", String::as_str);
    if utf16::len(raw) > LINE_CHARS {
        return Vec::new();
    }
    let line = raw.trim_matches(repository_survey::is_js_space);
    if let Some(python) = PYTHON_BASES.captures(line).and_then(|found| found.get(1)) {
        return python
            .as_str()
            .split(',')
            .map(|part| {
                let trimmed = part.trim_matches(repository_survey::is_js_space);
                let head = trimmed.split('[').next().unwrap_or("");
                head.rsplit('.').next().unwrap_or("").to_string()
            })
            .filter(|name| PLAIN_NAME.is_match(name) && name != "object")
            .collect();
    }
    JS_EXTENDS
        .captures(line)
        .and_then(|found| found.get(1))
        .map(|found| vec![found.as_str().rsplit('.').next().unwrap_or("").to_string()])
        .unwrap_or_default()
}

/// What a body's calls are resolved against: the repository's declarations and the files a call
/// opens.
pub struct CalleeContext<'a> {
    pub survey: &'a DeclarationSurvey,
    pub opener: &'a FileOpener<'a>,
}

impl CalleeContext<'_> {
    fn same_language(from: &str) -> impl Fn(&DeclarationRow) -> bool {
        let language = language_of(from);
        move |row| language_of(&row.path) == language
    }

    /// A Go file's package: the other files of its folder.
    fn package_rows(&self, from: &OpenedFile, key: &str) -> Vec<DeclarationRow> {
        if language_of(&from.path) != "go" {
            return Vec::new();
        }
        let same = Self::same_language(&from.path);
        self.survey
            .rows_among(&self.survey.folder(&from.path), key)
            .into_iter()
            .filter(|row| row.path != from.path && same(row))
            .collect()
    }

    /// The declarations a bare `name` reaches through `from`'s imports: in the module each binding
    /// names. Only when no binding's module names a file of this project is the name looked up
    /// everywhere, capped, and marked by name.
    fn imported_rows(&self, from: &OpenedFile, name: &str) -> (Vec<DeclarationRow>, bool) {
        let bindings = from
            .imports()
            .names
            .get(name)
            .map_or(&[][..], Vec::as_slice);
        let same = Self::same_language(&from.path);
        let rows: Vec<DeclarationRow> = bindings
            .iter()
            .flat_map(|binding| self.survey.rows_in(&binding.spec, &binding.imported))
            .filter(|row| same(row))
            .collect();
        let names_no_file = bindings.iter().any(|binding| {
            (binding.spec.exact_path().is_some() || binding.spec.internal)
                && self.survey.module_paths(&binding.spec).is_empty()
        });
        if !rows.is_empty() || !names_no_file {
            return (rows, false);
        }
        let Some(first) = bindings.first() else {
            return (rows, false);
        };
        let everywhere = self.survey.everywhere(&first.imported);
        if everywhere.len() > MAX_NAME_DECLARATIONS {
            (Vec::new(), true)
        } else {
            (
                everywhere.into_iter().filter(|row| same(row)).collect(),
                true,
            )
        }
    }

    fn classes(&self, from: &OpenedFile, base: &str) -> Vec<DeclarationRow> {
        let mut found = self.imported_rows(from, base).0;
        found.extend(self.package_rows(from, base));
        found.retain(|row| row.kind == OutlineKind::Class);
        found
    }

    /// The owner's own method `name`, or the nearest class it extends that declares it. A class name
    /// declared in more than two places is not followed.
    fn inherited_member(
        &self,
        file: &Rc<OpenedFile>,
        owner: &OutlineDeclaration,
        name: &str,
    ) -> Option<(String, usize)> {
        let mut current_file = file.clone();
        let mut current_owner = owner.clone();
        let mut visited = HashSet::new();
        for _ in 0..=MAX_BASES {
            let key = (current_file.path.clone(), current_owner.line);
            if !visited.insert(key) {
                return None;
            }
            if let Some(member) = member_of(&current_file, &current_owner, name) {
                return Some((current_file.path.clone(), member.line));
            }
            let base = bases_of(&current_file, &current_owner).into_iter().next()?;
            let local = current_file
                .declarations()
                .iter()
                .find(|candidate| candidate.kind == OutlineKind::Class && candidate.name == base)
                .cloned();
            if let Some(local) = local {
                current_owner = local;
                continue;
            }
            let rows = self.classes(&current_file, &base);
            let [row] = rows.as_slice() else { return None };
            let base_file = self.opener.open(&row.path)?;
            let base_owner = base_file
                .declarations()
                .iter()
                .find(|candidate| candidate.line == row.line)
                .cloned()?;
            current_file = base_file;
            current_owner = base_owner;
        }
        None
    }
}

fn unique(rows: Vec<DeclarationRow>) -> Vec<DeclarationRow> {
    let mut seen = HashSet::new();
    rows.into_iter()
        .filter(|row| seen.insert((row.path.clone(), row.line)))
        .collect()
}

/// Functions `text` (the body of `declaration` in `file`) calls that the repository declares.
pub fn callees_of(
    context: &CalleeContext<'_>,
    text: &str,
    file: &Rc<OpenedFile>,
    declaration: &OutlineDeclaration,
) -> Vec<Callee> {
    let own = declaration
        .name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_string();
    let signature = if declaration.signature.is_empty() {
        file.lines
            .get(declaration.line.saturating_sub(1))
            .map_or("", String::as_str)
    } else {
        declaration.signature.as_str()
    };
    let go_receiver = GO_RECEIVER
        .captures(signature.trim_matches(repository_survey::is_js_space))
        .and_then(|found| found.get(1))
        .map(|found| found.as_str().to_string());
    let own_type = declaration
        .name
        .split_once('.')
        .map(|(head, _)| head.to_string());
    let self_names: HashSet<String> = match &go_receiver {
        Some(receiver) => HashSet::from([receiver.clone()]),
        None => ["this", "self", "cls"]
            .iter()
            .map(|name| (*name).to_string())
            .collect(),
    };
    let owner = if go_receiver.is_some() {
        None
    } else {
        enclosing_class(&file.lines, file.declarations(), declaration).cloned()
    };
    let imports = file.imports();
    let survey = context.survey;
    let own_declaration = |path: &str, line: usize| path == file.path && line == declaration.line;
    let in_owner = |path: &str, line: usize| {
        path == file.path
            && owner.as_ref().is_some_and(|owner| {
                line > owner.line
                    && line
                        <= declaration_end(&file.lines, file.declarations(), owner, Ends::AtCode)
            })
    };
    let mut callees: Vec<Callee> = Vec::new();
    let push = |callees: &mut Vec<Callee>, row: Callee| {
        if callees.len() < MAX_CALLEES
            && !callees
                .iter()
                .any(|held| held.path == row.path && held.line == row.line)
        {
            callees.push(row);
        }
    };
    let plain = |name: &str, path: &str, line: usize| Callee {
        name: name.to_string(),
        path: path.to_string(),
        line,
        implementation: false,
        by_name: false,
    };
    for Call { name, via, chain } in calls_in(text, &self_names) {
        if callees.len() >= MAX_CALLEES {
            break;
        }
        if via == Via::Own {
            if name == own {
                continue;
            }
            if let (Some(_), Some(own_type)) = (&go_receiver, &own_type) {
                let key = format!("{own_type}.{name}");
                let mut rows: Vec<(String, usize)> = file
                    .declarations()
                    .iter()
                    .filter(|candidate| candidate.name == key)
                    .map(|candidate| (file.path.clone(), candidate.line))
                    .collect();
                rows.extend(
                    context
                        .package_rows(file, &key)
                        .into_iter()
                        .map(|row| (row.path, row.line)),
                );
                if let [(path, line)] = rows.as_slice() {
                    push(&mut callees, plain(&name, path, *line));
                }
                continue;
            }
            if let Some(owner) = &owner {
                if let Some((path, line)) = context.inherited_member(file, owner, &name) {
                    push(&mut callees, plain(&name, &path, line));
                    continue;
                }
            }
        }
        if via == Via::Field {
            // A field's type is unnamed: its method is one declared in this file, its Go package,
            // or a module the file imports.
            let mut rows: Vec<DeclarationRow> = file
                .declarations()
                .iter()
                .filter(|candidate| candidate.kind.is_code() && declares(candidate, &name))
                .map(|candidate| DeclarationRow {
                    path: file.path.clone(),
                    line: candidate.line,
                    kind: candidate.kind,
                    name: candidate.name.clone(),
                })
                .collect();
            let imported = survey.imported_paths(&file.path, imports);
            let star = format!("*.{name}");
            let mut elsewhere = survey.rows_among(&imported, &name);
            elsewhere.extend(survey.rows_among(&imported, &star));
            elsewhere.extend(context.package_rows(file, &name));
            elsewhere.extend(context.package_rows(file, &star));
            rows.extend(elsewhere.into_iter().filter(|row| row.path != file.path));
            let rows: Vec<DeclarationRow> = unique(rows)
                .into_iter()
                .filter(|row| {
                    row.kind == OutlineKind::Method
                        && !own_declaration(&row.path, row.line)
                        && !in_owner(&row.path, row.line)
                        && own_type
                            .as_ref()
                            .is_none_or(|own_type| row.name != format!("{own_type}.{name}"))
                })
                .collect();
            if !rows.is_empty() && rows.len() <= 2 {
                for row in &rows {
                    push(&mut callees, plain(&name, &row.path, row.line));
                }
            } else if rows.len() > 2
                && rows.len() <= MAX_IMPLEMENTATIONS
                && rows
                    .iter()
                    .map(|row| folder_of(&row.path))
                    .collect::<HashSet<_>>()
                    .len()
                    == 1
            {
                for row in &rows {
                    push(
                        &mut callees,
                        Callee {
                            implementation: true,
                            ..plain(&name, &row.path, row.line)
                        },
                    );
                }
            }
            continue;
        }
        if via == Via::Qualified {
            // `pkg.Check(` or `ns.check(`: the module that name was imported as, and nothing else.
            if !imports.modules.contains_key(&chain) && !imports.names.contains_key(&chain) {
                continue;
            }
            let mut specs: Vec<Spec> = imports.modules.get(&chain).cloned().into_iter().collect();
            for binding in imports.names.get(&chain).map_or(&[][..], Vec::as_slice) {
                specs.push(binding.spec.clone());
                specs.extend(child_spec(&binding.spec, &binding.imported));
            }
            let paths = survey.paths_for(&file.path, &specs);
            let mut rows = survey.rows_among(&paths, &name);
            rows.extend(survey.rows_among(&paths, &format!("*.{name}")));
            let rows = unique(rows);
            if !rows.is_empty() && rows.len() <= 2 {
                for row in &rows {
                    push(&mut callees, plain(&name, &row.path, row.line));
                }
            }
            continue;
        }
        if name == own {
            continue;
        }
        let local: Vec<&OutlineDeclaration> = file
            .declarations()
            .iter()
            .filter(|candidate| {
                declares(candidate, &name)
                    && candidate.line != declaration.line
                    && candidate.kind.is_code()
            })
            .collect();
        if !local.is_empty() {
            if local.len() <= 2 {
                for candidate in local {
                    push(&mut callees, plain(&name, &file.path, candidate.line));
                }
            }
            continue;
        }
        let (found, by_name) = if imports.names.contains_key(&name) {
            context.imported_rows(file, &name)
        } else {
            (context.package_rows(file, &name), false)
        };
        let rows = unique(
            found
                .into_iter()
                .filter(|row| row.path != file.path)
                .collect(),
        );
        if !rows.is_empty() && rows.len() <= 2 {
            for row in &rows {
                push(
                    &mut callees,
                    Callee {
                        by_name,
                        ..plain(&name, &row.path, row.line)
                    },
                );
            }
        }
    }
    callees
}
