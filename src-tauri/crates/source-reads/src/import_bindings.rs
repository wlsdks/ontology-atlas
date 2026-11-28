//! What a source file brings into scope, read from its import lines, so a call is followed only to
//! a declaration the file can reach. A name alone says nothing: `map.get(` and `new Error(` match a
//! `get` or an `Error` declared anywhere, in any language, and following them reads code no caller
//! runs.
//!
//! Each statement is read from lines of at most [`LINE_CHARS`] characters and at most
//! [`STATEMENT_LINES`] lines, so a hostile file costs one pass. A statement or name cut at a cap
//! marks the file's bindings `incomplete`.

use std::collections::HashMap;
use std::sync::LazyLock;

use answer_format::utf16;
use regex::Regex;
use repository_survey::{is_js_space, js_regex};

use crate::posix_path::{basename, dirname, extname, join, normalize};

const LINE_CHARS: usize = 2000;
const STATEMENT_LINES: usize = 40;
const SPEC_CHARS: usize = 300;
/// Modules and names one file brings in that are kept; a file importing more is generated.
const SPECS: usize = 256;
const NAMES: usize = 1024;
/// Modules one name may come from (a name imported twice, or once per build tag).
const BINDINGS_PER_NAME: usize = 4;

const JS_EXTENSIONS: [&str; 8] = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"];

/// The language a path is written in, by extension: `.ts` and `.mjs` are both `js`; another
/// extension is its own language.
pub fn language_of(path: &str) -> String {
    let extension = extname(path).to_lowercase();
    if JS_EXTENSIONS.contains(&extension.as_str()) {
        return "js".to_string();
    }
    match extension.as_str() {
        ".py" | ".pyi" => "py".to_string(),
        ".go" => "go".to_string(),
        ".rs" => "rs".to_string(),
        _ => extension,
    }
}

fn is_known_family(extension: &str) -> bool {
    let lower = extension.to_lowercase();
    JS_EXTENSIONS.contains(&lower.as_str()) || matches!(lower.as_str(), ".py" | ".pyi" | ".go" | ".rs")
}

fn strip_extension(path: &str) -> String {
    let extension = extname(path);
    if is_known_family(extension) {
        path.get(..path.len() - extension.len()).unwrap_or(path).to_string()
    } else {
        path.to_string()
    }
}

/// The module paths a file answers to: `a/b.ts`, and `a` for `a/index.ts` or `a/__init__.py`.
pub fn stems_of(path: &str) -> Vec<String> {
    let stem = strip_extension(path);
    let mut stems = vec![stem.clone()];
    if matches!(basename(&stem), "index" | "__init__" | "mod") {
        stems.push(dirname(&stem));
    }
    let held = stems.clone();
    for stem in held {
        if let Some(without) = stem.strip_suffix("/src") {
            stems.push(without.to_string());
        }
    }
    stems
}

/// Every suffix of `path` that starts at a segment: `a/b/c`, `b/c`, `c`.
pub fn segment_suffixes(path: &str) -> Vec<String> {
    let mut suffixes = vec![path.to_string()];
    for (at, _) in path.match_indices('/') {
        suffixes.push(path.get(at + 1..).unwrap_or("").to_string());
    }
    suffixes
}

/// A module an import names, by one of four ways of being written.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Spec {
    pub go: Option<String>,
    pub exact: Option<String>,
    pub tail: Option<String>,
    pub internal: bool,
    /// The specifier as written, for a JavaScript one: a bare one names a package.
    pub raw: Option<String>,
}

impl Spec {
    fn go(path: &str) -> Self {
        Self {
            go: Some(path.to_string()),
            ..Self::default()
        }
    }

    pub fn exact_path(&self) -> Option<&str> {
        self.exact.as_deref().filter(|value| !value.is_empty())
    }

    pub fn tail_path(&self) -> Option<&str> {
        self.tail.as_deref().filter(|value| !value.is_empty())
    }

    pub fn go_path(&self) -> Option<&str> {
        self.go.as_deref().filter(|value| !value.is_empty())
    }

    /// One string per module a spec names; a package-internal tail (`@/x`, `crate::x`) is its own key.
    pub fn key(&self) -> String {
        if let Some(go) = self.go_path() {
            format!("g\0{go}")
        } else if let Some(exact) = self.exact_path() {
            format!("e\0{exact}")
        } else {
            format!(
                "t\0{}\0{}",
                self.tail.as_deref().unwrap_or("undefined"),
                u8::from(self.internal)
            )
        }
    }
}

/// The module one level below `spec`: `from a import b` may bring in the module `a/b`.
pub fn child_spec(spec: &Spec, name: &str) -> Option<Spec> {
    if spec.go_path().is_some() {
        return None;
    }
    if let Some(exact) = spec.exact_path() {
        return Some(Spec {
            exact: Some(join(&[exact, name])),
            ..Spec::default()
        });
    }
    Some(Spec {
        tail: Some(match spec.tail_path() {
            Some(tail) => format!("{tail}/{name}"),
            None => name.to_string(),
        }),
        internal: spec.internal,
        raw: spec.raw.as_ref().map(|raw| format!("{raw}/{name}")),
        ..Spec::default()
    })
}

fn js_spec(file_path: &str, raw: &str) -> Option<Spec> {
    let spec = js_trim(raw);
    if spec.is_empty() || utf16::len(spec) > SPEC_CHARS {
        return None;
    }
    if spec.starts_with('.') {
        let resolved = strip_extension(&normalize(&join(&[&dirname(file_path), spec])));
        let exact = resolved.strip_suffix("/index").unwrap_or(&resolved).to_string();
        return Some(Spec {
            exact: Some(exact),
            ..Spec::default()
        });
    }
    let mut parts: Vec<&str> = spec.split('/').filter(|part| !part.is_empty()).collect();
    // `@/x`, `~/x` and `#x` are the project's own path aliases; `@scope/pkg` drops its scope.
    let alias = parts.first().is_some_and(|first| {
        first.starts_with(['@', '~', '#']) && (first.chars().count() == 1 || parts.len() > 1)
    });
    if alias {
        parts.remove(0);
    }
    if parts.is_empty() {
        return None;
    }
    Some(Spec {
        tail: Some(strip_extension(&parts.join("/"))),
        raw: Some(spec.to_string()),
        internal: alias && spec.chars().nth(1) == Some('/'),
        ..Spec::default()
    })
}

fn py_spec(file_path: &str, dots: usize, dotted: &str) -> Option<Spec> {
    if dots + utf16::len(dotted) > SPEC_CHARS {
        return None;
    }
    let parts: Vec<&str> = dotted.split('.').filter(|part| !part.is_empty()).collect();
    if dots == 0 {
        return (!parts.is_empty()).then(|| Spec {
            tail: Some(parts.join("/")),
            ..Spec::default()
        });
    }
    let mut base = dirname(file_path);
    for _ in 1..dots {
        base = dirname(&base);
    }
    let mut joined = vec![base.as_str()];
    joined.extend(parts);
    Some(Spec {
        exact: Some(normalize(&join(&joined))),
        ..Spec::default()
    })
}

fn rs_spec(segments: &[&str]) -> Option<Spec> {
    let parts: Vec<&str> = segments
        .iter()
        .copied()
        .filter(|part| !part.is_empty() && !matches!(*part, "crate" | "self" | "super"))
        .collect();
    if parts.is_empty() {
        return None;
    }
    Some(Spec {
        tail: Some(parts.join("/")),
        internal: matches!(segments.first(), Some(&("crate" | "self" | "super"))),
        ..Spec::default()
    })
}

fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_space)
}

static WHITESPACE_RUN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\s+"));

/// Whitespace runs as one space, first, so no later pattern scans a run once per position.
fn spaced(text: &str) -> String {
    js_trim(&WHITESPACE_RUN.replace_all(text, " ")).to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NameBinding {
    pub spec: Spec,
    pub imported: String,
}

/// The names and modules a file imports: `names` local name to the bindings it may come from,
/// `modules` local name to spec (a namespace, a Go package, a Python module), and every spec.
#[derive(Debug, Default)]
pub struct Imports {
    pub names: HashMap<String, Vec<NameBinding>>,
    pub modules: HashMap<String, Spec>,
    pub specs: Vec<Spec>,
    pub incomplete: bool,
    by_key: HashMap<String, usize>,
}

fn is_identifier(text: &str) -> bool {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[A-Za-z_$][\w$]*$"));
    PATTERN.is_match(text)
}

impl Imports {
    /// The one copy of `spec` this file holds, or `None` past the cap or for no spec.
    fn add_spec(&mut self, spec: Option<Spec>) -> Option<Spec> {
        let spec = spec?;
        let key = spec.key();
        if let Some(&held) = self.by_key.get(&key) {
            return self.specs.get(held).cloned();
        }
        if self.specs.len() >= SPECS {
            self.incomplete = true;
            return None;
        }
        self.by_key.insert(key, self.specs.len());
        self.specs.push(spec.clone());
        Some(spec)
    }

    fn add_module(&mut self, local: &str, spec: Option<Spec>) {
        let Some(spec) = spec else { return };
        if self.modules.contains_key(local) || self.modules.len() < NAMES {
            self.modules.insert(local.to_string(), spec);
        }
    }

    fn add_name(&mut self, local: &str, spec: Option<&Spec>, imported: &str) {
        let Some(spec) = spec else { return };
        if !is_identifier(local) {
            return;
        }
        let held = self.names.get(local);
        if held.is_some_and(|rows| rows.iter().any(|row| row.spec == *spec && row.imported == imported)) {
            return;
        }
        if (held.is_none() && self.names.len() >= NAMES)
            || held.is_some_and(|rows| rows.len() >= BINDINGS_PER_NAME)
        {
            self.incomplete = true;
            return;
        }
        self.names.entry(local.to_string()).or_default().push(NameBinding {
            spec: spec.clone(),
            imported: imported.to_string(),
        });
    }
}

struct Statement {
    text: String,
    last: usize,
    cut: bool,
}

/// The statement starting at `index`, joined over its continuation lines until `done` holds for one.
fn statement(
    lines: &[String],
    index: usize,
    done: impl Fn(&str, bool) -> bool,
    limit: usize,
) -> Statement {
    let mut text = String::new();
    let mut at = index;
    let mut ended = false;
    while at < lines.len() && at < index + limit {
        let line = lines.get(at).map_or("", String::as_str);
        if utf16::len(line) > LINE_CHARS {
            break;
        }
        text.push_str(line);
        text.push(' ');
        if done(line, at == index) {
            ended = true;
            break;
        }
        at += 1;
    }
    Statement {
        text,
        last: at.min(lines.len().saturating_sub(1)),
        cut: !ended && at < lines.len(),
    }
}

static JS_FROM: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"\bfrom\s*['"]([^'"\n]{1,300})['"]"#));
static RUST_USE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*(?:pub(?:\([\w\s:]*\))?\s+)?use\s+"));
static JS_REQUIRE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"^(?:const|let|var)\s+(\{[^}]{0,1000}\}|[A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"\n]{1,300})['"]\s*\)"#,
    )
});
static JS_IMPORT_START: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^(?:import\s|import\{|export\s*(?:type\s*)?[{*])"));
static JS_IMPORT_OR_EXPORT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\b(?:import|export)\b"));
static JS_LONG_START: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:import|export)\b"));
static JS_BARE_IMPORT: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"^import\s*['"]"#));
static SEMICOLON_END: LazyLock<Regex> = LazyLock::new(|| js_regex(r";\s*$"));
static NAMESPACE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\* ?as ([A-Za-z_$][\w$]*)"));
static DEFAULT_HEAD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^([A-Za-z_$][\w$]*)\s*(?:,|$)"));
static AS_OR_COLON: LazyLock<Regex> = LazyLock::new(|| js_regex(r" as |:"));
static AS_WORD: LazyLock<Regex> = LazyLock::new(|| js_regex(r" as "));
static PY_FROM: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^from\s+(\.*)(\w[\w.]*)?\s+import\s+(.*)$"));
static PY_PLAIN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^import\s+(.+)$"));
static PY_LONG_START: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:from|import)\b"));
static PY_PUNCTUATION: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[()\\]"));
static GO_IMPORT_LINE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"^(?:([A-Za-z_.]\w*)\s+)?"([^"\n]{1,300})""#));
static GO_BLOCK_START: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^import\s*\(\s*$"));
static GO_VERSION: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^v\d+$"));
static NOT_WORD: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[^\w]"));
static RUST_PATH_COLONS: LazyLock<Regex> = LazyLock::new(|| js_regex(r" ?:: ?"));
static TYPE_PREFIX: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^type "));

fn js_clause(imports: &mut Imports, spec: &Spec, clause: &str) {
    let spaced_clause = spaced(clause);
    let body = TYPE_PREFIX.replace(&spaced_clause, "").into_owned();
    if let Some(namespace) = NAMESPACE.captures(&body).and_then(|found| found.get(1)) {
        imports.add_module(namespace.as_str(), Some(spec.clone()));
    }
    let open = body.find('{');
    let close = open.and_then(|open| body.get(open..).and_then(|rest| rest.find('}')).map(|at| open + at));
    if let (Some(open), Some(close)) = (open, close) {
        if close > open {
            for item in body.get(open + 1..close).unwrap_or("").split(',') {
                let trimmed = js_trim(item);
                let stripped = TYPE_PREFIX.replace(trimmed, "");
                let mut pieces = AS_OR_COLON.split(&stripped).map(js_trim);
                let imported = pieces.next().unwrap_or("");
                let local = pieces.next().unwrap_or("");
                if !imported.is_empty() {
                    let name = if local.is_empty() { imported } else { local };
                    imports.add_name(name, Some(spec), imported);
                }
            }
        }
    }
    let head_text = js_trim(open.map_or(body.as_str(), |open| body.get(..open).unwrap_or("")));
    if let Some(head) = DEFAULT_HEAD.captures(head_text).and_then(|found| found.get(1)) {
        imports.add_name(head.as_str(), Some(spec), head.as_str());
        imports.add_module(head.as_str(), Some(spec.clone()));
    }
}

fn read_js(path: &str, lines: &[String], imports: &mut Imports) {
    let mut index = 0;
    while let Some(line) = lines.get(index) {
        if utf16::len(line) > LINE_CHARS {
            let head: String = line.chars().take(64).collect();
            if JS_LONG_START.is_match(&head) {
                imports.incomplete = true;
            }
            index += 1;
            continue;
        }
        let trimmed = line.trim_start_matches(is_js_space);
        if JS_IMPORT_START.is_match(trimmed) {
            let found = statement(
                lines,
                index,
                |held, first| {
                    JS_FROM.is_match(held)
                        || (first && JS_BARE_IMPORT.is_match(held.trim_start_matches(is_js_space)))
                        || SEMICOLON_END.is_match(held)
                },
                STATEMENT_LINES,
            );
            index = found.last;
            if found.cut {
                imports.incomplete = true;
            }
            if let Some(from) = JS_FROM.captures(&found.text) {
                let (Some(whole), Some(written)) = (from.get(0), from.get(1)) else {
                    index += 1;
                    continue;
                };
                if let Some(spec) = imports.add_spec(js_spec(path, written.as_str())) {
                    let begin = JS_IMPORT_OR_EXPORT
                        .find(&found.text)
                        .map_or(0, |at| at.start())
                        + 6;
                    let clause = found.text.get(begin..whole.start()).unwrap_or("");
                    js_clause(imports, &spec, clause);
                }
            }
            index += 1;
            continue;
        }
        if let Some(required) = JS_REQUIRE.captures(trimmed) {
            if let (Some(clause), Some(written)) = (required.get(1), required.get(2)) {
                if let Some(spec) = imports.add_spec(js_spec(path, written.as_str())) {
                    js_clause(imports, &spec, clause.as_str());
                }
            }
        }
        index += 1;
    }
}

fn read_python(path: &str, lines: &[String], imports: &mut Imports) {
    let mut index = 0;
    while let Some(line) = lines.get(index) {
        if utf16::len(line) > LINE_CHARS {
            let head: String = line.chars().take(64).collect();
            if PY_LONG_START.is_match(&head) {
                imports.incomplete = true;
            }
            index += 1;
            continue;
        }
        let trimmed = js_trim(line);
        if let Some(from) = PY_FROM.captures(trimmed) {
            let dots = from.get(1).map_or(0, |dots| dots.as_str().len());
            let module = from.get(2).map_or("", |module| module.as_str());
            let mut names = from.get(3).map_or("", |names| names.as_str()).to_string();
            if names.starts_with('(') && !names.contains(')') {
                let found = statement(lines, index + 1, |held, _| held.contains(')'), STATEMENT_LINES);
                index = found.last;
                if found.cut {
                    imports.incomplete = true;
                }
                names.push(' ');
                names.push_str(&found.text);
            }
            if let Some(spec) = imports.add_spec(py_spec(path, dots, module)) {
                let cleaned = PY_PUNCTUATION.replace_all(&names, " ");
                for item in spaced(&cleaned).split(',') {
                    let mut pieces = AS_WORD.split(js_trim(item)).map(js_trim);
                    let imported = pieces.next().unwrap_or("");
                    let local = pieces.next().unwrap_or("");
                    if imported.is_empty() || imported == "*" {
                        continue;
                    }
                    let name = if local.is_empty() { imported } else { local };
                    imports.add_name(name, Some(&spec), imported);
                    let child = imports.add_spec(child_spec(&spec, imported));
                    imports.add_module(name, child);
                }
            }
            index += 1;
            continue;
        }
        if let Some(plain) = PY_PLAIN.captures(trimmed).and_then(|found| found.get(1)) {
            for item in spaced(plain.as_str()).split(',') {
                let mut pieces = AS_WORD.split(js_trim(item)).map(js_trim);
                let dotted = pieces.next().unwrap_or("");
                let local = pieces.next().unwrap_or("");
                if let Some(spec) = imports.add_spec(py_spec(path, 0, dotted)) {
                    imports.add_module(if local.is_empty() { dotted } else { local }, Some(spec));
                }
            }
        }
        index += 1;
    }
}

fn read_go(lines: &[String], imports: &mut Imports) {
    let take = |imports: &mut Imports, text: &str| {
        let Some(found) = GO_IMPORT_LINE.captures(js_trim(text)) else {
            return;
        };
        let Some(path) = found.get(2).map(|path| path.as_str()) else {
            return;
        };
        let Some(spec) = imports.add_spec(Some(Spec::go(path))) else {
            return;
        };
        let segments: Vec<&str> = path.split('/').collect();
        let name = match found.get(1) {
            Some(alias) => alias.as_str(),
            None => match segments.as_slice() {
                [.., before, last] if GO_VERSION.is_match(last) => before,
                [.., last] => last,
                [] => "",
            },
        };
        if !name.is_empty() && name != "_" && name != "." {
            imports.add_module(&NOT_WORD.replace_all(name, "_"), Some(spec));
        }
    };
    let mut block = false;
    for line in lines {
        if utf16::len(line) > LINE_CHARS {
            continue;
        }
        let trimmed = js_trim(line);
        if block {
            if trimmed.starts_with(')') {
                block = false;
            } else {
                take(imports, trimmed);
            }
            continue;
        }
        if GO_BLOCK_START.is_match(trimmed) {
            block = true;
        } else if let Some(rest) = trimmed.strip_prefix("import ") {
            take(imports, rest);
        }
    }
}

fn read_rust(lines: &[String], imports: &mut Imports) {
    let mut index = 0;
    while let Some(line) = lines.get(index) {
        if utf16::len(line) > LINE_CHARS || !RUST_USE.is_match(line) {
            index += 1;
            continue;
        }
        let found = statement(lines, index, |held, _| held.contains(';'), STATEMENT_LINES);
        index = found.last + 1;
        if found.cut {
            imports.incomplete = true;
        }
        let without_use = RUST_USE.replace(&found.text, "").into_owned();
        let first = without_use.split(';').next().unwrap_or("");
        let path = RUST_PATH_COLONS
            .replace_all(&spaced(first), "::")
            .into_owned();
        let open = path.find('{');
        let head = open.map_or(path.as_str(), |open| path.get(..open).unwrap_or(""));
        // A module path longer than any import names is not one: the statement is skipped whole.
        if utf16::len(head) > SPEC_CHARS {
            continue;
        }
        let mut prefix: Vec<&str> = head.split("::").filter(|part| !part.is_empty()).collect();
        let items: Vec<&str> = match open {
            None => vec![prefix.pop().unwrap_or("")],
            Some(open) => {
                let end = path.rfind('}').unwrap_or_else(|| {
                    path.char_indices().next_back().map_or(0, |(at, _)| at)
                });
                path.get(open + 1..end.max(open + 1)).unwrap_or("").split(',').collect()
            }
        };
        for item in items {
            if item.contains('{') {
                continue;
            }
            let trimmed = js_trim(item);
            let mut pieces = AS_WORD.split(trimmed);
            let route = pieces.next().unwrap_or("");
            let local = pieces.next();
            if utf16::len(route) > SPEC_CHARS {
                continue;
            }
            let mut segments: Vec<&str> = route.split("::").filter(|part| !part.is_empty()).collect();
            let Some(name) = segments.pop() else { continue };
            if name == "*" || name == "self" {
                continue;
            }
            let mut spec_segments = prefix.clone();
            spec_segments.extend(segments);
            if let Some(spec) = imports.add_spec(rs_spec(&spec_segments)) {
                let local_name = local.filter(|local| !local.is_empty()).unwrap_or(name);
                imports.add_name(local_name, Some(&spec), name);
            }
        }
    }
}

/// The imports of a file's lines (each with its terminator), read for its language.
pub fn read_imports(path: &str, file_lines: &[String]) -> Imports {
    let lines: Vec<String> = file_lines
        .iter()
        .map(|line| {
            if utf16::len(line) > LINE_CHARS {
                line.clone()
            } else {
                line.strip_suffix("\r\n")
                    .or_else(|| line.strip_suffix('\n'))
                    .unwrap_or(line)
                    .to_string()
            }
        })
        .collect();
    let mut imports = Imports::default();
    match language_of(path).as_str() {
        "js" => read_js(path, &lines, &mut imports),
        "py" => read_python(path, &lines, &mut imports),
        "go" => read_go(&lines, &mut imports),
        "rs" => read_rust(&lines, &mut imports),
        _ => {}
    }
    imports
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source_lines::complete_lines;

    #[test]
    fn each_language_names_the_modules_and_names_a_file_imports() {
        let js = complete_lines(
            "import { charge as pay, refund } from '../payment/charge';\nimport * as lib from '@/lib/x';\nconst { a } = require('./a');\n",
        );
        let imports = read_imports("src/order/placement.ts", &js);
        let pay = imports.names.get("pay").expect("pay");
        assert_eq!(pay.first().map(|row| row.imported.as_str()), Some("charge"));
        assert_eq!(
            pay.first().and_then(|row| row.spec.exact.as_deref()),
            Some("src/payment/charge")
        );
        assert!(imports.modules.get("lib").is_some_and(|spec| spec.internal));
        assert!(imports.names.contains_key("a"));

        let python = complete_lines("from .util import (\n    one,\n    two as deux,\n)\nimport os.path as p\n");
        let imports = read_imports("pkg/mod.py", &python);
        assert!(imports.names.contains_key("one") && imports.names.contains_key("deux"));
        assert_eq!(imports.modules.get("p").and_then(|spec| spec.tail.as_deref()), Some("os/path"));

        let go = complete_lines("import (\n\tfoo \"example.com/x/foo\"\n\t\"example.com/x/bar/v2\"\n)\n");
        let imports = read_imports("a/b.go", &go);
        assert!(imports.modules.contains_key("foo") && imports.modules.contains_key("bar"));

        let rust = complete_lines("use crate::ledger::{balance, total as sum};\n");
        let imports = read_imports("src/lib.rs", &rust);
        assert!(imports.names.contains_key("balance") && imports.names.contains_key("sum"));
    }
}
