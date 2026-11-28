//! The code around a symbol that decides what its body does, returned with a `{path, symbol}` read
//! so depth does not depend on the reader following calls. Places that hold a rule the body alone
//! hides: the caller's guard (the `if` or early return around the call), the owner's constructor or
//! header (defaults, the resolver a field holds), a direct callee (an options builder, a
//! `_drain_if_full`), the implementations a field call may reach (a store that refuses a lookup), a
//! callee one call deeper (the route table a lazy accessor builds), and a named constant the served
//! code uses (a header name). Each candidate is ranked by its lines that decide: a condition, a
//! branch, a throw, or a literal default. A callee named in the body's own condition, or one that
//! refuses, ranks higher; one call deeper ranks lower. The best are returned within a byte cap, and
//! each part names its path and lines so a body can cite it exactly.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet, VecDeque};
use std::rc::Rc;
use std::sync::LazyLock;

use regex::Regex;
use repository_survey::js_regex;

use crate::call_sites::call_sites_of;
use crate::callees::{callees_of, CalleeContext};
use crate::declaration_span::{declaration_end, enclosing_class, Ends};
use crate::deciding_lines::{
    callee_bonus, called_in_conditions, constants_of, deciding_count, decides_line,
};
use crate::file_outline::{OutlineDeclaration, OutlineKind};
use crate::opened_file::OpenedFile;
use crate::read_environment::ReadEnvironment;
use crate::source_lines::indent_at;
use crate::source_row::{CallerSite, Callee, ContextPart, ContextRole, NextRead, OmittedPart};

/// 6 KiB holds the three to five deciding parts measured on the trial repositories (a guard window
/// is about 0.5 KiB, a constructor or options builder 0.5 to 2 KiB) beside an 8 KiB body, so a full
/// read stays under 14 KiB and two still fit the 32 KiB text budget of one call. A part longer than
/// 60 lines is cut there and its remainder named for the next read.
pub const CONTEXT_BYTES: i64 = 6 * 1024;
const PART_LINES: usize = 60;
const MAX_CALLERS: usize = 2;
const CALLER_SITES: usize = 8;
const GUARD_WINDOW: usize = 12;
const WHOLE_CALLER: usize = 40;
const OWNER_HEADER: usize = 30;
/// Direct callees whose own callees are ranked, and the parts that adds at most.
const DEEPER_SOURCES: usize = 6;
const DEEPER_CALLEES: usize = 24;
/// A callee this short (a getter, a lazy default) is no level of its own.
const ACCESSOR_LINES: usize = 8;
/// Decisive lines counted for one part one call deeper, so one long body cannot crowd out the rest.
const DEEPER_DECIDING: usize = 8;
const CONSTANT_LINES: usize = 8;
/// Lines of a callee examined for its calls, conditions and refusals: what one read serves.
const EXAMINED_LINES: usize = 200;

static IDENTIFIER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[A-Za-z_$][\w$]*"));

pub struct SymbolContext {
    pub parts: Vec<ContextPart>,
    pub bytes: usize,
    pub omitted: Vec<OmittedPart>,
    pub callers: Vec<CallerSite>,
    pub deciding: Option<String>,
    pub callees: Vec<Callee>,
}

#[derive(Debug, Clone)]
struct Candidate {
    role: ContextRole,
    path: String,
    symbol: String,
    start_line: usize,
    end_line: usize,
    more: Option<usize>,
    text: String,
    score: i64,
    via: Option<String>,
    by_name: bool,
}

#[derive(Default)]
struct Reached {
    weak: bool,
    parts: Vec<usize>,
    next: Vec<(usize, bool)>,
}

struct Taken {
    path: String,
    start_line: usize,
    end_line: usize,
}

struct ConstantRow {
    file: Rc<OpenedFile>,
    line: usize,
    name: String,
    bytes: usize,
}

fn slice(lines: &[String], start_line: usize, end_line: usize) -> String {
    lines
        .iter()
        .skip(start_line.saturating_sub(1))
        .take((end_line + 1).saturating_sub(start_line))
        .map(String::as_str)
        .collect()
}

fn lines_between(lines: &[String], start_line: usize, end_line: usize) -> &[String] {
    let start = start_line.saturating_sub(1).min(lines.len());
    let end = end_line.min(lines.len()).max(start);
    lines.get(start..end).unwrap_or(&[])
}

/// The innermost function-like declaration whose extent holds `line`.
fn enclosing<'a>(
    lines: &[String],
    declarations: &'a [OutlineDeclaration],
    line: usize,
) -> Option<&'a OutlineDeclaration> {
    let mut best: Option<&OutlineDeclaration> = None;
    for declaration in declarations {
        if !declaration.kind.is_code() || declaration.line > line {
            continue;
        }
        if !matches!(
            declaration.kind,
            OutlineKind::Function | OutlineKind::Method | OutlineKind::Class | OutlineKind::Struct
        ) {
            continue;
        }
        if declaration_end(lines, declarations, declaration, Ends::AtCode) < line {
            continue;
        }
        if best.is_none_or(|held| declaration.line > held.line) {
            best = Some(declaration);
        }
    }
    best
}

fn is_owner_kind(kind: OutlineKind) -> bool {
    matches!(
        kind,
        OutlineKind::Class | OutlineKind::Struct | OutlineKind::Interface | OutlineKind::Type
    )
}

struct Owner {
    name: String,
    declaration: Option<OutlineDeclaration>,
}

/// The class or type a member belongs to: the name prefix (Go) or the declaration around it.
fn owner_of(
    lines: &[String],
    declarations: &[OutlineDeclaration],
    declaration: &OutlineDeclaration,
) -> Option<Owner> {
    if let Some((name, _)) = declaration.name.split_once('.') {
        return Some(Owner {
            name: name.to_string(),
            declaration: declarations
                .iter()
                .find(|candidate| candidate.name == name && is_owner_kind(candidate.kind))
                .cloned(),
        });
    }
    let indent = indent_at(lines, declaration.line);
    if indent == 0 {
        return None;
    }
    let mut best: Option<&OutlineDeclaration> = None;
    for candidate in declarations {
        if candidate.line >= declaration.line
            || !is_owner_kind(candidate.kind)
            || indent_at(lines, candidate.line) >= indent
        {
            continue;
        }
        if declaration_end(lines, declarations, candidate, Ends::AtCode) < declaration.line {
            continue;
        }
        if best.is_none_or(|held| candidate.line > held.line) {
            best = Some(candidate);
        }
    }
    best.map(|owner| Owner {
        name: owner.name.clone(),
        declaration: Some(owner.clone()),
    })
}

/// Runs of a sorted set of line numbers, joined across gaps of up to three lines.
fn runs(numbers: &[usize]) -> Vec<(usize, usize)> {
    let mut out: Vec<(usize, usize)> = Vec::new();
    for &number in numbers {
        match out.last_mut() {
            Some(last) if number <= last.1 + 4 => last.1 = last.1.max(number),
            _ => out.push((number, number)),
        }
    }
    out
}

/// A member named as a read selector names it: `Image.load` for `load` inside `class Image`, so the
/// part can be read by symbol and grouped by its class.
fn qualified(file: &OpenedFile, symbol: &str, line: usize) -> String {
    if symbol.contains('.') {
        return symbol.to_string();
    }
    let declaration = file
        .declarations()
        .iter()
        .find(|candidate| candidate.line == line && candidate.name == symbol);
    match declaration.and_then(|declaration| {
        enclosing_class(&file.lines, file.declarations(), declaration)
    }) {
        Some(owner) => format!("{}.{symbol}", owner.name),
        None => symbol.to_string(),
    }
}

struct Builder<'a> {
    environment: &'a ReadEnvironment<'a>,
    own_path: &'a str,
    own: Rc<OpenedFile>,
    candidates: Vec<Candidate>,
    constants: RefCell<HashMap<String, Rc<HashMap<String, usize>>>>,
}

struct AddOptions {
    via: Option<String>,
    cap: usize,
    by_name: bool,
}

impl Default for AddOptions {
    fn default() -> Self {
        Self {
            via: None,
            cap: usize::MAX,
            by_name: false,
        }
    }
}

impl Builder<'_> {
    fn open(&self, path: &str) -> Option<Rc<OpenedFile>> {
        if path == self.own_path {
            Some(self.own.clone())
        } else {
            self.environment.opener.open(path)
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn add(
        &mut self,
        role: ContextRole,
        file: &OpenedFile,
        symbol: &str,
        start_line: usize,
        end_line: usize,
        bonus: i64,
        options: AddOptions,
    ) -> Option<usize> {
        let cut = end_line.min(start_line + PART_LINES - 1);
        let text = slice(&file.lines, start_line, cut);
        let deciding = options
            .cap
            .min(deciding_count(lines_between(&file.lines, start_line, cut)));
        // An implementation is shown for what it decides, never for its name alone.
        if role == ContextRole::Implementation && deciding == 0 {
            return None;
        }
        let score = i64::try_from(deciding).unwrap_or(i64::MAX) * 2 + bonus;
        if score <= 0 || text.is_empty() {
            return None;
        }
        self.candidates.push(Candidate {
            role,
            path: file.path.clone(),
            symbol: qualified(file, symbol, start_line),
            start_line,
            end_line: cut,
            more: (cut < end_line).then_some(end_line),
            text,
            score,
            via: options.via,
            by_name: options.by_name,
        });
        Some(self.candidates.len() - 1)
    }

    fn constants_in(&self, file: &OpenedFile) -> Rc<HashMap<String, usize>> {
        if let Some(held) = self.constants.borrow().get(&file.path) {
            return held.clone();
        }
        let found = Rc::new(constants_of(&file.lines));
        self.constants
            .borrow_mut()
            .insert(file.path.clone(), found.clone());
        found
    }

    /// The named constants `texts` use, each in the file that uses it, first used first, at most
    /// [`CONSTANT_LINES`]; lines `taken` already holds are skipped.
    fn constants_used(
        &self,
        texts: &[(Option<Rc<OpenedFile>>, &str)],
        taken: &[Taken],
    ) -> Vec<ConstantRow> {
        let mut rows: Vec<ConstantRow> = Vec::new();
        for (file, text) in texts {
            let Some(file) = file else { continue };
            let constants = self.constants_in(file);
            if constants.is_empty() {
                continue;
            }
            for found in IDENTIFIER.find_iter(text) {
                let Some(&line) = constants.get(found.as_str()) else {
                    continue;
                };
                if rows.iter().any(|row| row.file.path == file.path && row.line == line) {
                    continue;
                }
                if taken.iter().any(|range| {
                    range.path == file.path && range.start_line <= line && line <= range.end_line
                }) {
                    continue;
                }
                let bytes = file
                    .lines
                    .get(line - 1)
                    .map_or(0, String::len);
                rows.push(ConstantRow {
                    file: file.clone(),
                    line,
                    name: found.as_str().to_string(),
                    bytes,
                });
                if rows.len() >= CONSTANT_LINES {
                    return rows;
                }
            }
        }
        rows
    }
}

fn strengthen(nodes: &mut [Reached], candidates: &mut [Candidate], node: usize) {
    let Some(held) = nodes.get_mut(node) else { return };
    if !held.weak {
        return;
    }
    held.weak = false;
    let parts = held.parts.clone();
    let next = held.next.clone();
    for part in parts {
        if let Some(candidate) = candidates.get_mut(part) {
            candidate.by_name = false;
        }
    }
    for (edge, by_name) in next {
        if !by_name {
            strengthen(nodes, candidates, edge);
        }
    }
}

struct Queued {
    row: Callee,
    via: String,
    conditions: HashSet<String>,
    through: bool,
    parent: usize,
}

/// The candidates around one symbol read, ranked, then the parts that fit.
#[allow(clippy::too_many_arguments)]
pub fn symbol_context(
    environment: &ReadEnvironment<'_>,
    own: &Rc<OpenedFile>,
    declaration: &OutlineDeclaration,
    body_end: usize,
    body_text: &str,
    budget: i64,
) -> SymbolContext {
    let path = own.path.as_str();
    let lines = &own.lines;
    let declarations = own.declarations();
    let survey = environment.survey();
    let callee_context = CalleeContext {
        survey,
        opener: &environment.opener,
    };
    let callees = callees_of(&callee_context, body_text, own, declaration);
    let mut builder = Builder {
        environment,
        own_path: path,
        own: own.clone(),
        candidates: Vec::new(),
        constants: RefCell::new(HashMap::new()),
    };
    let body_decides =
        deciding_count(lines_between(lines, declaration.line, body_end)) > 0;
    let own_name = declaration.name.rsplit('.').next().unwrap_or("").to_string();

    // The owner: its header (a class docstring, fields with defaults) and its constructors.
    let owner = owner_of(lines, declarations, declaration);
    if let Some(owner_declaration) = owner
        .as_ref()
        .and_then(|owner| owner.declaration.as_ref())
        .filter(|owner_declaration| owner_declaration.line < declaration.line)
    {
        let owner_indent = indent_at(lines, owner_declaration.line);
        let first_member = declarations.iter().find(|candidate| {
            candidate.line > owner_declaration.line
                && candidate.kind.is_code()
                && indent_at(lines, candidate.line) > owner_indent
        });
        let header_end = (first_member.map_or(owner_declaration.line + 1, |member| member.line) - 1)
            .min(owner_declaration.line + OWNER_HEADER - 1);
        if header_end > owner_declaration.line
            && !matches!(owner_declaration.kind, OutlineKind::Struct | OutlineKind::Type)
        {
            let name = owner.as_ref().map_or("", |owner| owner.name.as_str());
            builder.add(
                ContextRole::Owner,
                own,
                name,
                owner_declaration.line,
                header_end,
                2,
                AddOptions::default(),
            );
        }
    }
    if let Some(owner) = &owner {
        let escaped = regex::escape(&owner.name);
        let returns_owner = js_regex(&format!(r"\)\s*\(?\*?{escaped}\b"));
        let owner_end = owner
            .declaration
            .as_ref()
            .map(|owner| declaration_end(lines, declarations, owner, Ends::AtCode));
        let constructors: Vec<&OutlineDeclaration> = declarations
            .iter()
            .filter(|candidate| {
                candidate.kind.is_code()
                    && candidate.line != declaration.line
                    && (candidate.name == format!("{}.__init__", owner.name)
                        || candidate.name == format!("{}.constructor", owner.name)
                        || ((candidate.name == "__init__" || candidate.name == "constructor")
                            && owner.declaration.as_ref().is_some_and(|owner_declaration| {
                                candidate.line > owner_declaration.line
                                    && owner_end.is_some_and(|end| candidate.line <= end)
                            }))
                        || (candidate.kind == OutlineKind::Function
                            && returns_owner.is_match(&candidate.signature)))
            })
            .collect();
        for constructor in constructors {
            builder.add(
                ContextRole::Constructor,
                own,
                &constructor.name,
                constructor.line,
                declaration_end(lines, declarations, constructor, Ends::AtCode),
                3,
                AddOptions::default(),
            );
        }
    }

    // The callers: the guard around each call, or the whole caller when it is short.
    let found_sites = call_sites_of(environment.products(), &own_name, CALLER_SITES);
    struct CallerRow {
        key: String,
        file: Rc<OpenedFile>,
        caller: OutlineDeclaration,
        sites: Vec<usize>,
    }
    let mut caller_rows: Vec<CallerRow> = Vec::new();
    for (site_path, site_line) in &found_sites.sites {
        if site_path == path && *site_line >= declaration.line && *site_line <= body_end {
            continue;
        }
        let Some(file) = builder.open(site_path) else {
            continue;
        };
        let Some(caller) = enclosing(&file.lines, file.declarations(), *site_line) else {
            continue;
        };
        if site_path == path && caller.line == declaration.line {
            continue;
        }
        let key = format!("{site_path}\0{}", caller.line);
        if let Some(row) = caller_rows.iter_mut().find(|row| row.key == key) {
            row.sites.push(*site_line);
        } else {
            caller_rows.push(CallerRow {
                key,
                caller: caller.clone(),
                file: file.clone(),
                sites: vec![*site_line],
            });
        }
    }
    let callers: Vec<CallerSite> = caller_rows
        .iter()
        .map(|row| CallerSite {
            name: row.caller.name.clone(),
            path: row.file.path.clone(),
            line: row.sites.first().copied().unwrap_or(0),
        })
        .collect();
    if !caller_rows.is_empty() && caller_rows.len() <= MAX_CALLERS && found_sites.total <= CALLER_SITES {
        for row in &caller_rows {
            let start = row.caller.line;
            let end = declaration_end(&row.file.lines, row.file.declarations(), &row.caller, Ends::AtCode);
            let bonus = if body_decides { 3 } else { 7 };
            let symbol = qualified(&row.file, &row.caller.name, row.caller.line);
            if end + 1 - start <= WHOLE_CALLER {
                builder.add(ContextRole::Caller, &row.file, &symbol, start, end, bonus, AddOptions::default());
                continue;
            }
            let mut numbers: std::collections::BTreeSet<usize> = std::collections::BTreeSet::new();
            numbers.insert(start);
            for &site in &row.sites {
                for line in start.max(site.saturating_sub(GUARD_WINDOW))..=end.min(site + 2) {
                    numbers.insert(line);
                }
                let site_indent = indent_at(&row.file.lines, site);
                for line in (start + 1)..site.saturating_sub(GUARD_WINDOW) {
                    if indent_at(&row.file.lines, line) < site_indent
                        && decides_line(row.file.lines.get(line - 1).map_or("", String::as_str))
                    {
                        numbers.insert(line);
                    }
                }
            }
            let sorted: Vec<usize> = numbers.into_iter().collect();
            for (run_start, run_end) in runs(&sorted) {
                builder.add(
                    ContextRole::Caller,
                    &row.file,
                    &symbol,
                    run_start,
                    run_end,
                    bonus,
                    AddOptions::default(),
                );
            }
        }
    }

    // The direct callees in this repository, whole when they decide something.
    let condition_names = called_in_conditions(lines_between(lines, declaration.line, body_end));
    let mut seen: HashSet<String> = HashSet::new();
    seen.insert(format!("{path}\0{}", declaration.line));
    for callee in &callees {
        seen.insert(format!("{}\0{}", callee.path, callee.line));
    }
    struct Expandable {
        file: Rc<OpenedFile>,
        target: OutlineDeclaration,
        end: usize,
        node: usize,
    }
    let mut expandable: Vec<Expandable> = Vec::new();
    // A part is by name only when every path that reaches it has a by-name link: an exact arrival
    // found later clears the mark on it and on what it passes through to.
    let mut nodes: Vec<Reached> = Vec::new();
    let mut reached: HashMap<String, usize> = HashMap::new();
    fn reach(
        nodes: &mut Vec<Reached>,
        reached: &mut HashMap<String, usize>,
        key: String,
        weak: bool,
        candidate: Option<usize>,
    ) -> usize {
        nodes.push(Reached {
            weak,
            parts: candidate.into_iter().collect(),
            next: Vec::new(),
        });
        reached.insert(key, nodes.len() - 1);
        nodes.len() - 1
    }
    for callee in &callees {
        let Some(file) = builder.open(&callee.path) else {
            continue;
        };
        let Some(target) = file
            .declarations()
            .iter()
            .find(|candidate| candidate.line == callee.line)
            .cloned()
        else {
            continue;
        };
        let end = declaration_end(&file.lines, file.declarations(), &target, Ends::AtCode);
        let bonus = callee_bonus(
            &callee.name,
            lines_between(&file.lines, target.line, end.min(target.line + EXAMINED_LINES - 1)),
            &condition_names,
        );
        let key = format!("{}\0{}", callee.path, callee.line);
        if callee.implementation {
            let added = builder.add(
                ContextRole::Implementation,
                &file,
                &target.name,
                target.line,
                end,
                bonus,
                AddOptions {
                    by_name: callee.by_name,
                    ..AddOptions::default()
                },
            );
            reach(&mut nodes, &mut reached, key, callee.by_name, added);
            continue;
        }
        let added = builder.add(
            ContextRole::Callee,
            &file,
            &target.name,
            target.line,
            end,
            bonus,
            AddOptions {
                by_name: callee.by_name,
                ..AddOptions::default()
            },
        );
        let node = reach(&mut nodes, &mut reached, key, callee.by_name, added);
        expandable.push(Expandable {
            file,
            target,
            end,
            node,
        });
    }

    // One call deeper: what each direct callee calls, through an accessor too short to be a level.
    let mut deeper = 0;
    // A body is examined as far as a read would serve it.
    let head = |target: &OutlineDeclaration, end: usize| end.min(target.line + EXAMINED_LINES - 1);
    let resolve = |builder: &Builder<'_>, file: &Rc<OpenedFile>, target: &OutlineDeclaration, end: usize| {
        let text = slice(&file.lines, target.line, head(target, end));
        let context = CalleeContext {
            survey,
            opener: &builder.environment.opener,
        };
        callees_of(&context, &text, file, target)
    };
    for Expandable {
        file,
        target,
        end,
        node: source,
    } in expandable.iter().take(DEEPER_SOURCES)
    {
        let conditions =
            called_in_conditions(lines_between(&file.lines, target.line, head(target, *end)));
        let via = qualified(file, &target.name, target.line);
        let mut queue: VecDeque<Queued> = resolve(&builder, file, target, *end)
            .into_iter()
            .map(|row| Queued {
                row,
                via: via.clone(),
                conditions: conditions.clone(),
                through: false,
                parent: *source,
            })
            .collect();
        while deeper < DEEPER_CALLEES {
            let Some(Queued {
                row,
                via,
                conditions: branched_on,
                through,
                parent,
            }) = queue.pop_front()
            else {
                break;
            };
            // A part reached through a by-name match is as weak as the weakest link above it.
            let parent_weak = nodes.get(parent).is_some_and(|node| node.weak);
            let by_name = parent_weak || row.by_name;
            let key = format!("{}\0{}", row.path, row.line);
            if let Some(&earlier) = reached.get(&key) {
                if let Some(node) = nodes.get_mut(parent) {
                    node.next.push((earlier, row.by_name));
                }
                if !by_name {
                    strengthen(&mut nodes, &mut builder.candidates, earlier);
                }
            }
            if !seen.insert(key.clone()) {
                continue;
            }
            let Some(inner) = builder.open(&row.path) else {
                continue;
            };
            let Some(found) = inner
                .declarations()
                .iter()
                .find(|candidate| candidate.line == row.line)
                .cloned()
            else {
                continue;
            };
            deeper += 1;
            let node = reach(&mut nodes, &mut reached, key, by_name, None);
            if let Some(held) = nodes.get_mut(parent) {
                held.next.push((node, row.by_name));
            }
            let inner_end = declaration_end(&inner.lines, inner.declarations(), &found, Ends::AtCode);
            let inner_lines = lines_between(&inner.lines, found.line, head(&found, inner_end));
            if !through && !row.implementation && inner_end + 1 - found.line <= ACCESSOR_LINES {
                let inner_conditions = called_in_conditions(inner_lines);
                let inner_via = qualified(&inner, &found.name, found.line);
                for next in resolve(&builder, &inner, &found, inner_end) {
                    queue.push_back(Queued {
                        row: next,
                        via: inner_via.clone(),
                        conditions: inner_conditions.clone(),
                        through: true,
                        parent: node,
                    });
                }
            }
            let part = builder.add(
                if row.implementation {
                    ContextRole::Implementation
                } else {
                    ContextRole::Callee
                },
                &inner,
                &found.name,
                found.line,
                inner_end,
                callee_bonus(&row.name, inner_lines, &branched_on) - 3,
                AddOptions {
                    via: Some(via),
                    cap: DEEPER_DECIDING,
                    by_name,
                },
            );
            if let (Some(part), Some(held)) = (part, nodes.get_mut(node)) {
                held.parts.push(part);
            }
        }
    }

    let mut candidates = std::mem::take(&mut builder.candidates);
    candidates.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then(a.role.rank().cmp(&b.role.rank()))
            .then(a.start_line.cmp(&b.start_line))
    });
    let mut taken = vec![Taken {
        path: path.to_string(),
        start_line: declaration.line,
        end_line: body_end,
    }];
    let overlaps = |taken: &[Taken], candidate: &Candidate| {
        taken.iter().any(|range| {
            range.path == candidate.path
                && candidate.start_line <= range.end_line
                && candidate.end_line >= range.start_line
        })
    };
    let mut parts: Vec<ContextPart> = Vec::new();
    let mut omitted: Vec<OmittedPart> = Vec::new();
    let mut bytes: i64 = 0;
    // A constant line is tens of bytes; what the body and the candidates could use is held back
    // for it.
    let body_slice = slice(lines, declaration.line, body_end);
    let mut texts: Vec<(Option<Rc<OpenedFile>>, &str)> = vec![(Some(own.clone()), body_slice.as_str())];
    for candidate in &candidates {
        texts.push((builder.open(&candidate.path), candidate.text.as_str()));
    }
    let reserve: i64 = (budget >> 3).min(
        builder
            .constants_used(&texts, &taken)
            .iter()
            .map(|row| i64::try_from(row.bytes).unwrap_or(0))
            .sum(),
    );
    for candidate in &candidates {
        if overlaps(&taken, candidate) {
            continue;
        }
        let size = i64::try_from(candidate.text.len()).unwrap_or(i64::MAX);
        if bytes + size > budget - reserve {
            omitted.push(OmittedPart {
                role: candidate.role,
                path: candidate.path.clone(),
                symbol: candidate.symbol.clone(),
                line: candidate.start_line,
            });
            continue;
        }
        bytes += size;
        taken.push(Taken {
            path: candidate.path.clone(),
            start_line: candidate.start_line,
            end_line: candidate.end_line,
        });
        parts.push(ContextPart {
            role: candidate.role,
            path: candidate.path.clone(),
            symbol: candidate.symbol.clone(),
            start_line: candidate.start_line,
            end_line: candidate.end_line,
            cite: format!("{}:L{}-L{}", candidate.path, candidate.start_line, candidate.end_line),
            text: candidate.text.clone(),
            via: candidate.via.clone(),
            by_name: candidate.by_name,
            next: candidate.more.map(|more| NextRead {
                path: candidate.path.clone(),
                start_line: candidate.end_line + 1,
                max_lines: 200.min(more - candidate.end_line),
                expected_sha256: None,
            }),
        });
    }

    // The named constants the body and the served parts use, in the file that uses them.
    let mut texts: Vec<(Option<Rc<OpenedFile>>, &str)> = vec![(Some(own.clone()), body_slice.as_str())];
    for part in &parts {
        texts.push((builder.open(&part.path), part.text.as_str()));
    }
    let constants = builder.constants_used(&texts, &taken);
    for row in constants {
        let text = row.file.lines.get(row.line - 1).cloned().unwrap_or_default();
        let row_bytes = i64::try_from(row.bytes).unwrap_or(0);
        if text.is_empty() || bytes + row_bytes > budget {
            continue;
        }
        bytes += row_bytes;
        taken.push(Taken {
            path: row.file.path.clone(),
            start_line: row.line,
            end_line: row.line,
        });
        parts.push(ContextPart {
            role: ContextRole::Constant,
            path: row.file.path.clone(),
            symbol: row.name,
            start_line: row.line,
            end_line: row.line,
            cite: format!("{}:L{}-L{}", row.file.path, row.line, row.line),
            text,
            via: None,
            by_name: false,
            next: None,
        });
    }
    parts.sort_by(|a, b| {
        a.role
            .rank()
            .cmp(&b.role.rank())
            .then_with(|| answer_format::collation::compare_text(&a.path, &b.path))
            .then(a.start_line.cmp(&b.start_line))
    });

    let mut deciding = None;
    let caller_shown = parts.iter().any(|part| part.role == ContextRole::Caller);
    if !caller_shown
        && !callers.is_empty()
        && (!body_decides || callers.len() > MAX_CALLERS)
    {
        let named: Vec<String> = callers
            .iter()
            .take(4)
            .map(|row| format!("{} ({}:L{})", row.name, row.path, row.line))
            .collect();
        let first = callers.first();
        let more = if found_sites.total > callers.len() {
            format!(" and {} more call sites", found_sites.total - callers.len())
        } else {
            String::new()
        };
        deciding = first.map(|first| {
            format!(
                "{} is in its caller{} {}{more}. Read it: {{\"path\":\"{}\",\"symbol\":\"{}\"}}.",
                if body_decides {
                    "This body decides part of it; when it runs at all"
                } else {
                    "This body holds no condition; the deciding condition"
                },
                if callers.len() > 1 { "s" } else { "" },
                named.join(", "),
                first.path,
                first.name
            )
        });
    }
    omitted.truncate(6);
    let total_callers = callers;
    SymbolContext {
        parts,
        bytes: usize::try_from(bytes).unwrap_or(0),
        omitted,
        callers: total_callers.into_iter().take(6).collect(),
        deciding,
        callees,
    }
}
