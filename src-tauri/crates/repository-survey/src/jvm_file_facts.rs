//! What one Java or Kotlin file says about its classes, read from masked source (see
//! `jvm_masking`): each class with its annotations, supertypes and members, the routes' literal
//! paths, a `main`, and each scheduling call with the class it sits in. Everything that needs the
//! text is read here, once, so the file's text is not kept; what needs other files (a supertype
//! declared elsewhere, a family) is decided by `jvm_rows` from these facts.
//!
//! A class is found by its keyword and name, a body by its braces, a member by its `;` or `{` at
//! the body's depth. Nothing is compiled, and a path written as a constant instead of a literal
//! cannot be decided and gives no route.

use std::collections::HashMap;
use std::sync::LazyLock;

use indexmap::IndexMap;
use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::js_pattern::{is_js_space, js_regex};
use crate::jvm_masking::mask_jvm_source;

/// Classes nested deeper than this are not read.
const NESTING_LIMIT: usize = 4;
/// A `main` signature is read this far on either side of its name.
const MAIN_HEAD_CHARS: usize = 256;
/// An annotation's opening parenthesis is looked for this far after its name.
const PAREN_LOOKAHEAD: usize = 64;

static CLASS_HEAD: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\b(class|interface|enum|record|object)[ \t\r\n]+(?:class[ \t\r\n]+)?([A-Za-z_$][\w$]*)",
    )
});
static ANNOTATION: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"@([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)"));
static JAVA_METHOD_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"([A-Za-z_$][\w$]*)\s*\("));
static KOTLIN_FUNCTION_NAME: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\bfun\s+(?:<[^>{}]{0,200}>\s*)?(?:[\w$]+(?:<[^>{}]{0,200}>)?\??\.)*([A-Za-z_$][\w$]*)\s*\(",
    )
});
static JAVA_MAIN_PARAMETERS: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^main\s*\(\s*(?:final\s+)?String\s*(?:(?:\[\s*\]|\.\.\.)\s*[\w$]+|\s[\w$]+\s*\[\s*\])\s*\)",
    )
});
static KOTLIN_MAIN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bfun\s+main\s*\("));
/// A line that starts another Kotlin declaration ends a class head written without a body.
static KOTLIN_NEXT_DECLARATION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\n[ \t]*(?:@|(?:public|private|internal|protected|abstract|open|sealed|data|enum|annotation|inline|value|class|interface|object|fun|val|var|typealias)\b)",
    )
});
static SCHEDULE_CALL: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\.\s*(?:scheduleAtFixedRate|scheduleWithFixedDelay)\s*\("));
static SCHEDULER_TYPE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\b(?:ScheduledExecutorService|TaskScheduler|Timer)\b"));
static PACKAGE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?m)^[ \t]*package[ \t]+([A-Za-z_$][\w$]*(?:[ \t]*\.[ \t]*[A-Za-z_$][\w$]*)*)")
});
static IMPORT: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?m)^[ \t]*import[ \t]+(static[ \t]+)?([A-Za-z_$][\w$]*(?:[ \t]*\.[ \t]*[A-Za-z_$][\w$]*)*)([ \t]*\.[ \t]*\*)?(?:[ \t]+as[ \t]+([A-Za-z_$][\w$]*))?",
    )
});
static NAMED_ATTRIBUTE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?:^|,)\s*([A-Za-z_]\w*)\s*="));
static REQUEST_METHOD_ATTRIBUTE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\bmethod\s*=\s*([^=]*?)(?:,\s*[A-Za-z_]\w*\s*=|$)"));
static REQUEST_METHOD_NAME: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\bRequestMethod\.([A-Z]+)\b"));
static EXTENDS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bextends\s+"));
static IMPLEMENTS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bimplements\s+"));
static EXTENDS_END: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\b(?:implements|permits)\b"));
static IMPLEMENTS_END: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bpermits\b"));
static BY_CLAUSE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bby\b[\s\S]*$"));
static WHERE_CLAUSE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bwhere\b[\s\S]*$"));
static EMPTY_PARENS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\(\s*\)"));
static TYPE_NAME: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$"));
static ABSTRACT_MODIFIER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\b(?:abstract|sealed)\b"));
static JVM_STATIC: LazyLock<Regex> = LazyLock::new(|| js_regex(r"@JvmStatic\b"));
static VOID_BEFORE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bvoid\s+$"));
static STATIC_BEFORE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bstatic\b"));
static DOT_OR_COLON_BEFORE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[.:]\s*$"));
static RECORD_OPENING: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*[(<]"));
static PAREN_OPENING: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*\("));

/// The annotations whose paths are read: JAX-RS `@Path` and the Spring mappings.
const ROUTE_ANNOTATIONS: [&str; 7] = [
    "Path",
    "GetMapping",
    "PostMapping",
    "PutMapping",
    "DeleteMapping",
    "PatchMapping",
    "RequestMapping",
];

#[derive(Debug, Clone)]
pub struct JvmAnnotation {
    pub name: String,
    pub start: usize,
    /// 1-based line of the `@`.
    pub line: usize,
    /// The literal paths of a route annotation, `[""]` when it names none, none when a path is
    /// not a literal and cannot be decided.
    pub paths: Option<Vec<String>>,
    /// A `RequestMapping`'s `RequestMethod`s, or `ANY`.
    pub request_methods: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct JvmMember {
    pub annotations: Vec<JvmAnnotation>,
    /// Method names in the member's head with their offsets, annotations blanked.
    pub names: Vec<(usize, String)>,
}

#[derive(Debug, Clone)]
pub struct JvmClass {
    pub name: String,
    pub keyword: String,
    pub qualified_name: String,
    pub annotations: Vec<JvmAnnotation>,
    pub is_abstract: bool,
    /// As written in the head, before they are resolved.
    pub supertypes: Vec<String>,
    pub has_body: bool,
    pub outer: Option<usize>,
    pub start: usize,
    pub line: usize,
    pub members: Vec<JvmMember>,
    /// An abstract class whose own body names a scheduler type.
    pub scheduler_in_body: bool,
}

#[derive(Debug, Clone)]
pub struct ScheduleCall {
    pub class: Option<usize>,
    pub method: Option<String>,
    pub line: usize,
}

#[derive(Debug, Clone, Default)]
pub struct JvmImports {
    pub package_name: Option<String>,
    /// The last segment of an explicit import, by that name: the first import of it.
    pub explicit: HashMap<String, String>,
    pub wildcards: Vec<String>,
    pub jax_rs: bool,
    pub spring: bool,
    pub spring_web: bool,
}

#[derive(Debug, Clone)]
pub struct JvmFileFacts {
    pub path: String,
    pub kotlin: bool,
    pub imports: JvmImports,
    pub classes: Vec<JvmClass>,
    /// A class name to the first class of that name in the file.
    pub by_name: HashMap<String, usize>,
    pub executables: Vec<AbilityRow>,
    pub schedule_calls: Vec<ScheduleCall>,
}

/// `text` from byte `at`, moved back to a character boundary.
fn boundary_floor(text: &str, at: usize) -> usize {
    let mut at = at.min(text.len());
    while at > 0 && !text.is_char_boundary(at) {
        at -= 1;
    }
    at
}

fn boundary_ceil(text: &str, at: usize) -> usize {
    let mut at = at.min(text.len());
    while at < text.len() && !text.is_char_boundary(at) {
        at += 1;
    }
    at
}

fn slice(text: &str, from: usize, to: usize) -> &str {
    let from = boundary_ceil(text, from);
    let to = boundary_floor(text, to);
    text.get(from..to).unwrap_or("")
}

fn line_starts(text: &str) -> Vec<usize> {
    let mut starts = vec![0];
    starts.extend(
        text.bytes()
            .enumerate()
            .filter(|(_, byte)| *byte == b'\n')
            .map(|(at, _)| at + 1),
    );
    starts
}

/// The 1-based line holding byte `offset`.
fn line_at(starts: &[usize], offset: usize) -> usize {
    starts.partition_point(|start| *start <= offset).max(1)
}

/// The offset of the `}` closing each `{`.
fn closing_braces(masked: &str) -> HashMap<usize, usize> {
    let mut close_of = HashMap::new();
    let mut open: Vec<usize> = Vec::new();
    for (index, byte) in masked.bytes().enumerate() {
        if byte == b'{' {
            open.push(index);
        } else if byte == b'}' {
            if let Some(opening) = open.pop() {
                close_of.insert(opening, index);
            }
        }
    }
    close_of
}

/// The offset just past the `)` closing the `(` at `start`, or `limit` when it does not close
/// before it.
fn closing_paren(masked: &str, start: usize, limit: usize) -> usize {
    let mut depth: i64 = 0;
    for (offset, byte) in masked
        .as_bytes()
        .get(start..limit.min(masked.len()))
        .unwrap_or_default()
        .iter()
        .enumerate()
    {
        if *byte == b'(' {
            depth += 1;
        } else if *byte == b')' {
            depth -= 1;
            if depth == 0 {
                return start + offset + 1;
            }
        }
    }
    limit
}

struct RawAnnotation {
    name: String,
    start: usize,
    /// Just past the annotation and its parenthesised arguments.
    end: usize,
    args: Option<(usize, usize)>,
}

/// Annotations in `masked` between `from` and `to`: name, offset, and the range inside their
/// parentheses.
fn annotations_in(masked: &str, from: usize, to: usize) -> Vec<RawAnnotation> {
    let mut found = Vec::new();
    let segment = slice(masked, from, to);
    let from = boundary_ceil(masked, from);
    let mut at = 0;
    while let Some(matched) = ANNOTATION.find_at(segment, at) {
        let start = from + matched.start();
        let name: String = matched
            .as_str()
            .chars()
            .skip(1)
            .filter(|character| !is_js_space(*character))
            .collect::<String>()
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_string();
        let mut end = start + matched.as_str().len();
        let mut args = None;
        let window = slice(masked, end, to.min(end + PAREN_LOOKAHEAD));
        if let Some(paren) = PAREN_OPENING.find(window) {
            let open = end + paren.end() - 1;
            let close = closing_paren(masked, open, to);
            args = Some((open + 1, (open + 1).max(close.saturating_sub(1))));
            end = close;
        }
        found.push(RawAnnotation {
            name,
            start,
            end,
            args,
        });
        at = end.saturating_sub(from);
        if at >= segment.len() {
            break;
        }
    }
    found
}

/// Where the declaration ending at `start` began: after the last `;`, `{` or `}` outside
/// parentheses, never before `floor`.
fn declaration_start(masked: &str, start: usize, floor: usize) -> usize {
    let bytes = masked.as_bytes();
    let mut parens: i64 = 0;
    let mut index = start;
    while index > floor {
        index -= 1;
        match bytes.get(index) {
            Some(b')') => parens += 1,
            Some(b'(') => parens -= 1,
            Some(b';' | b'{' | b'}') if parens <= 0 => return index + 1,
            _ => {}
        }
    }
    floor
}

/// The `{` opening a class body after its head and before `limit`, none when the class has none.
fn body_open_after(masked: &str, from: usize, limit: usize, kotlin: bool) -> Option<usize> {
    let mut parens: i64 = 0;
    let mut outside = String::new();
    let head = slice(masked, from, limit);
    let base = boundary_ceil(masked, from);
    for (offset, character) in head.char_indices() {
        if character == '(' {
            parens += 1;
        } else if character == ')' {
            parens -= 1;
        } else if parens == 0 && (character == ';' || character == '}') {
            return None;
        } else if parens == 0 && character == '{' {
            return if kotlin && KOTLIN_NEXT_DECLARATION.is_match(&outside) {
                None
            } else {
                Some(base + offset)
            };
        } else if parens == 0 {
            outside.push(character);
        }
    }
    None
}

/// The text with every `<...>` type argument list blanked, nested ones included, in one pass.
fn without_generics(text: &str) -> String {
    let mut depth: i64 = 0;
    let mut result = String::new();
    for character in text.chars() {
        if character == '<' {
            depth += 1;
        } else if character == '>' && depth > 0 {
            depth -= 1;
        } else if depth == 0 {
            result.push(character);
        }
    }
    result
}

fn type_names(list: &str) -> Vec<String> {
    list.split(',')
        .map(|item| {
            let item = BY_CLAUSE.replace(item, "");
            let item = EMPTY_PARENS.replace_all(&item, "");
            item.chars()
                .filter(|c| !is_js_space(*c))
                .collect::<String>()
        })
        .filter(|item| TYPE_NAME.is_match(item))
        .collect()
}

/// The text after `opening` up to the first `ending` (or the end).
fn until<'a>(text: &'a str, opening: &Regex, ending: &Regex) -> Option<&'a str> {
    let begin = opening.find(text)?.end();
    let rest = text.get(begin..)?;
    let stop = ending.find(rest).map_or(rest.len(), |found| found.start());
    rest.get(..stop)
}

/// The supertypes a class head names: Java `extends` and `implements`, Kotlin `: Base(), Face`.
fn supertypes_of(head: &str, kotlin: bool) -> Vec<String> {
    let plain = without_generics(head);
    if kotlin {
        let mut flat = String::new();
        let mut parens: i64 = 0;
        for character in plain.chars() {
            if character == '(' {
                parens += 1;
            }
            if parens == 0 {
                flat.push(character);
            }
            if character == ')' {
                parens -= 1;
            }
        }
        return match flat.find(':') {
            None => Vec::new(),
            Some(colon) => {
                let after = flat.get(colon + 1..).unwrap_or("");
                type_names(&WHERE_CLAUSE.replace(after, ""))
            }
        };
    }
    let extended = until(&plain, &EXTENDS, &EXTENDS_END).unwrap_or("");
    let implemented = until(&plain, &IMPLEMENTS, &IMPLEMENTS_END).unwrap_or("");
    let mut names = type_names(extended);
    names.extend(type_names(implemented));
    names
}

struct RawMember {
    head_start: usize,
    head_end: usize,
    body_close: usize,
}

/// The members of a class body: each declaration's head (annotations, modifiers, signature) and
/// its body when it has one, read at the body's own depth.
fn members_of(
    masked: &str,
    body_open: usize,
    body_close: usize,
    close_of: &HashMap<usize, usize>,
) -> Vec<RawMember> {
    let bytes = masked.as_bytes();
    let mut members = Vec::new();
    let mut head_start = body_open + 1;
    let mut parens: i64 = 0;
    let mut index = head_start;
    while index < body_close {
        match bytes.get(index) {
            Some(b'(') => parens += 1,
            Some(b')') => parens -= 1,
            Some(b';') if parens <= 0 => {
                members.push(RawMember {
                    head_start,
                    head_end: index,
                    body_close: index,
                });
                head_start = index + 1;
                parens = 0;
            }
            Some(b'{') if parens <= 0 => {
                let close = close_of.get(&index).copied().unwrap_or(body_close);
                members.push(RawMember {
                    head_start,
                    head_end: index,
                    body_close: close,
                });
                index = close;
                head_start = close + 1;
                parens = 0;
            }
            _ => {}
        }
        index += 1;
    }
    if head_start < body_close {
        members.push(RawMember {
            head_start,
            head_end: body_close,
            body_close,
        });
    }
    members
}

/// Method names in a member head with its annotations blanked, each with its offset.
fn method_names(
    masked: &str,
    member: &RawMember,
    annotations: &[RawAnnotation],
    kotlin: bool,
) -> Vec<(usize, String)> {
    let mut head = String::new();
    let mut copied = member.head_start;
    for annotation in annotations {
        head.push_str(slice(masked, copied, annotation.start));
        head.push_str(&" ".repeat(annotation.end.saturating_sub(annotation.start)));
        copied = annotation.end;
    }
    head.push_str(slice(masked, copied, member.head_end));
    let mut names = Vec::new();
    if kotlin {
        for found in KOTLIN_FUNCTION_NAME.captures_iter(&head) {
            if let (Some(whole), Some(name)) = (found.get(0), found.get(1)) {
                names.push((member.head_start + whole.start(), name.as_str().to_string()));
            }
        }
        return names;
    }
    let mut at = 0;
    while let Some(found) = JAVA_METHOD_NAME.captures_at(&head, at) {
        let (Some(whole), Some(name)) = (found.get(0), found.get(1)) else {
            break;
        };
        let preceded_by_word = head
            .get(..whole.start())
            .and_then(|before| before.chars().next_back())
            .is_some_and(|character| {
                character.is_ascii_alphanumeric() || character == '_' || character == '$'
            });
        if preceded_by_word {
            // The pattern does not start inside a name: try from the next character on.
            at = boundary_ceil(&head, whole.start() + 1);
            if at >= head.len() {
                break;
            }
            continue;
        }
        names.push((member.head_start + whole.start(), name.as_str().to_string()));
        at = whole.end();
        if at >= head.len() {
            break;
        }
    }
    names
}

struct Literal {
    value: String,
    end: usize,
}

fn string_literal(text: &[char], index: usize) -> Option<Literal> {
    if text.get(index) != Some(&'"') {
        return None;
    }
    let mut value = String::new();
    let mut cursor = index + 1;
    while cursor < text.len() {
        let character = *text.get(cursor)?;
        if character == '\\' {
            if let Some(next) = text.get(cursor + 1) {
                value.push(*next);
            }
            cursor += 1;
        } else if character == '"' {
            return Some(Literal {
                value,
                end: cursor + 1,
            });
        } else if character == '\n' {
            return None;
        } else {
            value.push(character);
        }
        cursor += 1;
    }
    None
}

fn skip_space(text: &[char], index: usize) -> usize {
    let mut cursor = index;
    while text.get(cursor).is_some_and(|c| is_js_space(*c)) {
        cursor += 1;
    }
    cursor
}

/// A literal or a bracketed list of literals at `index`, none when any item is not a literal.
fn literal_list(text: &[char], index: usize) -> Option<Vec<String>> {
    let mut cursor = skip_space(text, index);
    let array_of: Option<usize> = {
        let word: Vec<char> = "arrayOf".chars().collect();
        let matches_word = text.get(cursor..cursor + word.len()) == Some(word.as_slice());
        if matches_word {
            let after = skip_space(text, cursor + word.len());
            (text.get(after) == Some(&'(')).then_some(after + 1 - cursor)
        } else {
            None
        }
    };
    let close = if array_of.is_some() {
        Some(')')
    } else {
        match text.get(cursor) {
            Some('{') => Some('}'),
            Some('[') => Some(']'),
            _ => None,
        }
    };
    let ends_here = |at: usize| {
        let next = skip_space(text, at);
        next >= text.len() || matches!(text.get(next), Some(',' | ')'))
    };
    let Some(close) = close else {
        let literal = string_literal(text, cursor)?;
        return ends_here(literal.end).then(|| vec![literal.value]);
    };
    cursor += array_of.unwrap_or(1);
    let mut values = Vec::new();
    loop {
        cursor = skip_space(text, cursor);
        if text.get(cursor) == Some(&close) {
            return ends_here(cursor + 1).then_some(values);
        }
        let literal = string_literal(text, cursor)?;
        values.push(literal.value);
        cursor = skip_space(text, literal.end);
        if text.get(cursor) == Some(&',') {
            cursor += 1;
        } else if text.get(cursor) != Some(&close) {
            return None;
        }
    }
}

/// The paths an annotation names: its `value` or `path` attribute, else its positional argument;
/// `[""]` when it names none; none when a path is not a literal and so cannot be decided.
fn annotation_paths(masked: &str, text: &str, args: Option<(usize, usize)>) -> Option<Vec<String>> {
    let Some((start, end)) = args else {
        return Some(vec![String::new()]);
    };
    let masked_args = slice(masked, start, end);
    let original: Vec<char> = slice(text, start, end).chars().collect();
    if masked_args.trim_matches(is_js_space).is_empty() {
        return Some(vec![String::new()]);
    }
    let mut named = Vec::new();
    for found in NAMED_ATTRIBUTE.captures_iter(masked_args) {
        if let (Some(whole), Some(name)) = (found.get(0), found.get(1)) {
            // `==` is a comparison inside an argument, not an attribute.
            if masked_args
                .get(whole.end()..)
                .is_some_and(|rest| rest.starts_with('='))
            {
                continue;
            }
            named.push((whole.end(), name.as_str().to_string()));
        }
    }
    if named.is_empty() {
        return literal_list(&original, 0);
    }
    let Some((after, _)) = named
        .iter()
        .find(|(_, name)| name == "value" || name == "path")
    else {
        return Some(vec![String::new()]);
    };
    let chars_before = masked_args
        .get(..*after)
        .map_or(0, |before| before.chars().count());
    literal_list(&original, chars_before)
}

/// A `RequestMapping`'s methods: those its `method` attribute lists, else `ANY`.
fn request_methods(masked: &str, args: Option<(usize, usize)>) -> Vec<String> {
    let arguments = args.map_or("", |(start, end)| slice(masked, start, end));
    let named = REQUEST_METHOD_ATTRIBUTE
        .captures(arguments)
        .and_then(|found| found.get(1))
        .map_or("", |named| named.as_str());
    let listed: Vec<String> = REQUEST_METHOD_NAME
        .captures_iter(named)
        .filter_map(|found| found.get(1).map(|name| name.as_str().to_string()))
        .collect();
    if listed.is_empty() {
        vec!["ANY".to_string()]
    } else {
        listed
    }
}

struct RawClass {
    name: String,
    keyword: String,
    start: usize,
    annotations: Vec<RawAnnotation>,
    is_abstract: bool,
    supertypes: Vec<String>,
    body: Option<(usize, usize)>,
    outer: Option<usize>,
    qualified_name: String,
}

fn declared_annotation(
    masked: &str,
    text: &str,
    starts: &[usize],
    raw: &RawAnnotation,
) -> JvmAnnotation {
    let route = ROUTE_ANNOTATIONS.contains(&raw.name.as_str());
    JvmAnnotation {
        name: raw.name.clone(),
        start: raw.start,
        line: line_at(starts, raw.start),
        paths: if route {
            annotation_paths(masked, text, raw.args)
        } else {
            None
        },
        request_methods: if raw.name == "RequestMapping" {
            request_methods(masked, raw.args)
        } else {
            Vec::new()
        },
    }
}

/// The innermost class whose body holds `offset`: the last class opened before it, then outward.
fn class_at(classes: &[RawClass], offset: usize) -> Option<usize> {
    let found = classes
        .partition_point(|class| class.start < offset)
        .checked_sub(1)?;
    let mut current = Some(found);
    while let Some(index) = current {
        let class = classes.get(index)?;
        if let Some((open, close)) = class.body {
            if open < offset && offset < close {
                return Some(index);
            }
        }
        current = class.outer;
    }
    None
}

/// The member of a class whose head or body holds `offset`, by binary search over the members in
/// order.
fn member_at(members: &[RawMember], offset: usize) -> Option<usize> {
    let (mut low, mut high) = (0_i64, i64::try_from(members.len()).ok()? - 1);
    while low <= high {
        let middle = (low + high) / 2;
        let member = members.get(usize::try_from(middle).ok()?)?;
        if offset < member.head_start {
            high = middle - 1;
        } else if offset > member.body_close {
            low = middle + 1;
        } else {
            return usize::try_from(middle).ok();
        }
    }
    None
}

/// Whether the method named at `offset` is `static void main(String[] args)` (or `String...`).
fn is_java_main(masked: &str, head_start: usize, offset: usize) -> bool {
    let before = slice(
        masked,
        head_start.max(offset.saturating_sub(MAIN_HEAD_CHARS)),
        offset,
    );
    let after = slice(masked, offset, offset + MAIN_HEAD_CHARS);
    VOID_BEFORE.is_match(before)
        && STATIC_BEFORE.is_match(before)
        && JAVA_MAIN_PARAMETERS.is_match(after)
}

fn file_stem(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".kt").unwrap_or(name).to_string()
}

fn imports_of(masked: &str, kotlin: bool) -> JvmImports {
    let _ = kotlin;
    let package_name = PACKAGE
        .captures(masked)
        .and_then(|found| found.get(1))
        .map(|name| {
            name.as_str()
                .chars()
                .filter(|c| !is_js_space(*c))
                .collect::<String>()
        });
    let mut imports = JvmImports {
        package_name,
        ..JvmImports::default()
    };
    let mut specs: Vec<String> = Vec::new();
    for found in IMPORT.captures_iter(masked) {
        let Some(spec) = found.get(2) else { continue };
        let spec: String = spec.as_str().chars().filter(|c| !is_js_space(*c)).collect();
        if found.get(3).is_some() {
            imports.wildcards.push(spec.clone());
        } else {
            let last = spec.rsplit('.').next().unwrap_or("").to_string();
            imports.explicit.entry(last).or_insert_with(|| spec.clone());
        }
        specs.push(spec);
    }
    imports.jax_rs = specs
        .iter()
        .any(|spec| is_package(spec, &["jakarta.ws.rs", "javax.ws.rs"]));
    imports.spring = specs
        .iter()
        .any(|spec| spec.starts_with("org.springframework."));
    imports.spring_web = specs
        .iter()
        .any(|spec| is_package(spec, &["org.springframework.web.bind.annotation"]));
    imports
}

/// Whether `spec` is one of `packages` or below one.
fn is_package(spec: &str, packages: &[&str]) -> bool {
    packages.iter().any(|package| {
        spec == *package
            || spec
                .strip_prefix(package)
                .is_some_and(|rest| rest.starts_with('.'))
    })
}

/// Every class a file declares, read once.
pub fn read_jvm_file(path: &str, text: &str) -> JvmFileFacts {
    let kotlin = path.ends_with(".kt");
    let masked = mask_jvm_source(text, kotlin);
    let imports = imports_of(&masked, kotlin);
    let close_of = closing_braces(&masked);
    let starts = line_starts(text);
    let heads: Vec<regex::Captures<'_>> = CLASS_HEAD
        .captures_iter(&masked)
        .filter(|found| {
            let (Some(whole), Some(keyword)) = (found.get(0), found.get(1)) else {
                return false;
            };
            if keyword.as_str() == "object" && !kotlin {
                return false;
            }
            let before = slice(&masked, whole.start().saturating_sub(3), whole.start());
            if DOT_OR_COLON_BEFORE.is_match(before) {
                return false;
            }
            keyword.as_str() != "record"
                || RECORD_OPENING.is_match(slice(&masked, whole.end(), whole.end() + 8))
        })
        .collect();
    let mut classes: Vec<RawClass> = Vec::new();
    let mut open: Vec<usize> = Vec::new();
    for (index, found) in heads.iter().enumerate() {
        let (Some(whole), Some(keyword), Some(name)) = (found.get(0), found.get(1), found.get(2))
        else {
            continue;
        };
        while open
            .last()
            .and_then(|held| classes.get(*held))
            .and_then(|class| class.body)
            .is_some_and(|(_, close)| close < whole.start())
        {
            open.pop();
        }
        if open.len() >= NESTING_LIMIT {
            continue;
        }
        let name_end = whole.end();
        let floor = index
            .checked_sub(1)
            .and_then(|previous| heads.get(previous))
            .and_then(|previous| previous.get(0))
            .map_or(0, |previous| previous.end());
        let limit = heads
            .get(index + 1)
            .and_then(|next| next.get(0))
            .map_or(masked.len(), |next| next.start());
        let body_open = body_open_after(&masked, name_end, limit, kotlin);
        let prefix_start = declaration_start(&masked, whole.start(), floor);
        let annotations = annotations_in(&masked, prefix_start, whole.start());
        let modifiers = slice(&masked, prefix_start, whole.start());
        let head_end = body_open.unwrap_or(limit);
        let outer = open.last().copied();
        let qualified_name = match outer.and_then(|held| classes.get(held)) {
            Some(parent) => format!("{}.{}", parent.qualified_name, name.as_str()),
            None => [imports.package_name.as_deref().unwrap_or(""), name.as_str()]
                .iter()
                .filter(|part| !part.is_empty())
                .copied()
                .collect::<Vec<_>>()
                .join("."),
        };
        classes.push(RawClass {
            name: name.as_str().to_string(),
            keyword: keyword.as_str().to_string(),
            start: whole.start(),
            annotations,
            is_abstract: keyword.as_str() == "interface" || ABSTRACT_MODIFIER.is_match(modifiers),
            supertypes: supertypes_of(slice(&masked, name_end, head_end), kotlin),
            body: body_open.map(|opening| {
                (
                    opening,
                    close_of.get(&opening).copied().unwrap_or(masked.len()),
                )
            }),
            outer,
            qualified_name,
        });
        if body_open.is_some() {
            open.push(classes.len() - 1);
        }
    }
    let mut by_name: HashMap<String, usize> = HashMap::new();
    for (index, class) in classes.iter().enumerate() {
        by_name.entry(class.name.clone()).or_insert(index);
    }
    let mut members_of_class: Vec<Vec<RawMember>> = Vec::new();
    let mut declared: Vec<JvmClass> = Vec::new();
    for class in &classes {
        let raw_members = class
            .body
            .map(|(opening, close)| members_of(&masked, opening, close, &close_of))
            .unwrap_or_default();
        let members: Vec<JvmMember> = raw_members
            .iter()
            .map(|member| {
                let annotations = annotations_in(&masked, member.head_start, member.head_end);
                JvmMember {
                    names: method_names(&masked, member, &annotations, kotlin),
                    annotations: annotations
                        .iter()
                        .map(|raw| declared_annotation(&masked, text, &starts, raw))
                        .collect(),
                }
            })
            .collect();
        let scheduler_in_body = class.is_abstract
            && class.body.is_some_and(|(opening, close)| {
                SCHEDULER_TYPE.is_match(slice(&masked, opening, close))
            });
        declared.push(JvmClass {
            name: class.name.clone(),
            keyword: class.keyword.clone(),
            qualified_name: class.qualified_name.clone(),
            annotations: class
                .annotations
                .iter()
                .map(|raw| declared_annotation(&masked, text, &starts, raw))
                .collect(),
            is_abstract: class.is_abstract,
            supertypes: class.supertypes.clone(),
            has_body: class.body.is_some(),
            outer: class.outer,
            start: class.start,
            line: line_at(&starts, class.start),
            members,
            scheduler_in_body,
        });
        members_of_class.push(raw_members);
    }
    let executables = executables_of(
        path,
        kotlin,
        &masked,
        &starts,
        &classes,
        &members_of_class,
        &declared,
    );
    let schedule_calls = SCHEDULE_CALL
        .find_iter(&masked)
        .map(|found| {
            let class = class_at(&classes, found.start());
            let method = class.and_then(|held| {
                let member = member_at(members_of_class.get(held)?, found.start())?;
                declared
                    .get(held)?
                    .members
                    .get(member)?
                    .names
                    .first()
                    .map(|(_, name)| name.clone())
            });
            ScheduleCall {
                class,
                method,
                line: line_at(&starts, found.start()),
            }
        })
        .collect();
    JvmFileFacts {
        path: path.to_string(),
        kotlin,
        imports,
        classes: declared,
        by_name,
        executables,
        schedule_calls,
    }
}

/// Java: a class member `static void main(String[] args)`. Kotlin: a top-level `fun main`, named
/// for its file, or a `@JvmStatic fun main` in an object.
fn executables_of(
    path: &str,
    kotlin: bool,
    masked: &str,
    starts: &[usize],
    classes: &[RawClass],
    members: &[Vec<RawMember>],
    declared: &[JvmClass],
) -> Vec<AbilityRow> {
    let mut rows = Vec::new();
    if kotlin {
        let mut floor = 0;
        for found in KOTLIN_MAIN.find_iter(masked) {
            let line = line_at(starts, found.start());
            match class_at(classes, found.start()) {
                None => rows.push(
                    AbilityRow::at(AbilityKind::Executable, &file_stem(path), path, line)
                        .with_symbol("main"),
                ),
                Some(owner) => {
                    let before = slice(
                        masked,
                        declaration_start(masked, found.start(), floor),
                        found.start(),
                    );
                    if JVM_STATIC.is_match(before) {
                        let name = declared.get(owner).map_or("", |class| class.name.as_str());
                        rows.push(
                            AbilityRow::at(AbilityKind::Executable, name, path, line)
                                .with_symbol(&format!("{name}.main")),
                        );
                    }
                }
            }
            floor = found.end();
        }
        return rows;
    }
    for (index, class) in declared.iter().enumerate() {
        let raw_members = members.get(index).map(Vec::as_slice).unwrap_or_default();
        let main = class
            .members
            .iter()
            .zip(raw_members)
            .find_map(|(member, raw)| {
                member
                    .names
                    .iter()
                    .filter(|(_, name)| name == "main")
                    .find(|(offset, _)| is_java_main(masked, raw.head_start, *offset))
                    .map(|(offset, _)| *offset)
            });
        if let Some(offset) = main {
            rows.push(
                AbilityRow::at(
                    AbilityKind::Executable,
                    &class.name,
                    path,
                    line_at(starts, offset),
                )
                .with_symbol(&format!("{}.main", class.name)),
            );
        }
    }
    rows
}

/// The routes' base of `annotations` grouped by the method each sits on: a Kotlin function with an
/// expression body has no braces, so one member head can hold several functions. Each group holds
/// the indexes of its annotations in the member.
pub fn annotations_by_method(member: &JvmMember) -> Vec<Vec<usize>> {
    let mut by_method: IndexMap<usize, Vec<usize>> = IndexMap::new();
    let mut next = 0;
    for (index, annotation) in member.annotations.iter().enumerate() {
        while member
            .names
            .get(next)
            .is_some_and(|(offset, _)| *offset <= annotation.start)
        {
            next += 1;
        }
        let Some((offset, _)) = member.names.get(next) else {
            continue;
        };
        by_method.entry(*offset).or_default().push(index);
    }
    by_method.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_controller_is_read_with_its_literal_paths_and_a_constant_path_is_undecided() {
        let facts = read_jvm_file(
            "api/OrderController.java",
            "package shop.api;\nimport org.springframework.web.bind.annotation.*;\n@RestController\n@RequestMapping(\"/orders\")\npublic class OrderController {\n  @GetMapping(\"/{id}\")\n  public Order get() { return null; }\n  @PostMapping(PATH)\n  public void make() {}\n}\n",
        );
        assert!(facts.imports.spring_web);
        let class = facts.classes.first().expect("one class");
        assert_eq!(class.qualified_name, "shop.api.OrderController");
        let mapping = class
            .annotations
            .iter()
            .find(|a| a.name == "RequestMapping")
            .expect("mapping");
        assert_eq!(mapping.paths.as_deref(), Some(&["/orders".to_string()][..]));
        assert_eq!(mapping.line, 4);
        let get = class
            .members
            .iter()
            .flat_map(|m| &m.annotations)
            .find(|a| a.name == "GetMapping")
            .expect("get");
        assert_eq!(get.paths.as_deref(), Some(&["/{id}".to_string()][..]));
        let post = class
            .members
            .iter()
            .flat_map(|m| &m.annotations)
            .find(|a| a.name == "PostMapping")
            .expect("post");
        assert_eq!(
            post.paths, None,
            "a path written as a constant cannot be decided"
        );
    }

    #[test]
    fn a_java_main_and_a_kotlin_top_level_main_are_executables() {
        let java = read_jvm_file(
            "app/Boot.java",
            "package app;\npublic class Boot {\n  public static void main(String[] args) {}\n}\n",
        );
        assert_eq!(java.executables.len(), 1);
        assert_eq!(
            java.executables.first().map(|r| r.symbol.clone()),
            Some(Some("Boot.main".to_string()))
        );
        let kotlin = read_jvm_file(
            "app/Launch.kt",
            "package app\nfun main(args: Array<String>) {}\n",
        );
        assert_eq!(
            kotlin.executables.first().map(|r| r.name.clone()),
            Some("Launch".to_string())
        );
    }

    #[test]
    fn a_scheduling_call_names_the_class_and_the_method_it_sits_in() {
        let facts = read_jvm_file(
            "jobs/Pulse.java",
            "package jobs;\npublic class Pulse {\n  void start() {\n    pool.scheduleAtFixedRate(task, 1, 1, SECONDS);\n  }\n}\n",
        );
        let call = facts.schedule_calls.first().expect("a call");
        assert_eq!(call.class, Some(0));
        assert_eq!(call.method.as_deref(), Some("start"));
        assert_eq!(call.line, 4);
    }
}
