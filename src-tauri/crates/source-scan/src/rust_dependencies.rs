//! What a Rust file says about the files it depends on, read from its syntax tree: `use` paths,
//! file-backed `mod name;` declarations (with a literal `#[path = "..."]`), and `include!`
//! family macros given one literal.
//!
//! Only the file's own items count. An inline `mod name { ... }`, a `macro_rules!` body and the
//! arguments of another macro are not read, so a `use` written in a macro's token tree is not an
//! import of the file.

use std::collections::HashSet;

use tree_sitter::Node;

use crate::bounded_parse::{ParseRefusal, ParsedSource, ScopedVisitor, Visit};

/// A file holding more dependency statements than this is read up to this many.
pub const MAX_DEPENDENCIES_PER_FILE: usize = 256;

/// One dependency the file declares, in source order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RustDependency {
    /// `mod name;`, possibly with a `#[path = "literal"]` attribute as its only attribute.
    Module {
        name: String,
        path_attribute: Option<String>,
        /// The statement as written, for a reader who must find it.
        statement: String,
        /// Another attribute (`#[cfg(...)]`) decides whether the module exists: not followed.
        conditional: bool,
    },
    /// `include!("literal")`, `include_str!` and `include_bytes!`; `literal` is `None` for an
    /// argument that is not exactly one string literal.
    Include {
        literal: Option<String>,
        statement: String,
    },
    /// The paths a `use` names, each as segments, or the reason it cannot be read.
    Use {
        paths: Vec<UsePath>,
        statement: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum UsePath {
    Segments(Vec<String>),
    /// A form the reader does not follow (`use <T as Trait>::x`), with its text.
    Unsupported(String),
}

/// What a file declares, up to [`MAX_DEPENDENCIES_PER_FILE`] statements.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RustDependencies {
    pub found: Vec<RustDependency>,
    /// The file holds more statements than were read: the reader stopped at the limit.
    pub limit_reached: bool,
}

/// The dependencies of `parsed`, in source order. The reading stops at the limit instead of
/// collecting a file's every statement for the placement to drop; it is refused when the time
/// the parse had runs out first.
pub fn read_rust_dependencies(parsed: &ParsedSource<'_>) -> Result<RustDependencies, ParseRefusal> {
    let mut reader = DependencyReader {
        parsed,
        found: Vec::new(),
        limit_reached: false,
        open: Vec::new(),
        out_of_time: false,
    };
    parsed.walk_scoped(&mut reader)?;
    if reader.out_of_time {
        return Err(ParseRefusal::TookTooLong);
    }
    Ok(RustDependencies {
        found: reader.found,
        limit_reached: reader.limit_reached,
    })
}

/// A node entered and not yet left, as its children need to know it: what it is, and the
/// attributes written among them that no sibling has claimed yet. Asking the tree for the parent
/// or the previous sibling costs the depth or the sibling count each time.
struct Open<'tree> {
    kind: &'tree str,
    attributes: Vec<Node<'tree>>,
}

struct DependencyReader<'parsed, 'text, 'tree> {
    parsed: &'parsed ParsedSource<'text>,
    found: Vec<RustDependency>,
    limit_reached: bool,
    open: Vec<Open<'tree>>,
    out_of_time: bool,
}

impl<'tree> DependencyReader<'_, '_, 'tree> {
    /// The attributes directly before `node` among its siblings, nearest last, comments between
    /// skipped; an attribute or a comment adds to them and anything else ends them.
    fn attributes_before(&mut self, node: Node<'tree>) -> Vec<Node<'tree>> {
        let Some(parent) = self.open.last_mut() else {
            return Vec::new();
        };
        match node.kind() {
            "attribute_item" => {
                parent.attributes.push(node);
                Vec::new()
            }
            "line_comment" | "block_comment" => Vec::new(),
            _ => std::mem::take(&mut parent.attributes),
        }
    }

    /// Whether another statement may be taken; a file past the limit stops the walk instead.
    fn has_room(&mut self) -> bool {
        self.limit_reached = self.found.len() >= MAX_DEPENDENCIES_PER_FILE;
        !self.limit_reached
    }
}

impl<'tree> ScopedVisitor<'tree> for DependencyReader<'_, '_, 'tree> {
    fn enter(&mut self, node: Node<'tree>) -> Visit {
        let parsed = self.parsed;
        let attributes = self.attributes_before(node);
        let parent_kind = self.open.last().map(|parent| parent.kind);
        self.open.push(Open {
            kind: node.kind(),
            attributes: Vec::new(),
        });
        match node.kind() {
            "mod_item" => {
                if node.child_by_field_name("body").is_some() {
                    return Visit::Over;
                }
                let Some(name) = node.child_by_field_name("name") else {
                    return Visit::Over;
                };
                if !self.has_room() {
                    return Visit::Stop;
                }
                let path_attribute = match attributes.as_slice() {
                    [only] => path_attribute_of(parsed.text_of(*only)),
                    _ => None,
                };
                let first = attributes.first().copied().unwrap_or(node);
                self.found.push(RustDependency::Module {
                    name: parsed.text_of(name).to_string(),
                    conditional: !attributes.is_empty() && path_attribute.is_none(),
                    path_attribute,
                    statement: statement_text(parsed, first, node),
                });
                Visit::Over
            }
            "macro_definition" | "token_tree" => Visit::Over,
            "macro_invocation" => {
                let Some(include) = include_of(parsed, node, parent_kind) else {
                    return Visit::Over;
                };
                if !self.has_room() {
                    return Visit::Stop;
                }
                self.found.push(include);
                Visit::Over
            }
            "use_declaration" => {
                if !self.has_room() {
                    return Visit::Stop;
                }
                let paths = match node.child_by_field_name("argument") {
                    Some(argument) => match use_paths(parsed, argument) {
                        Ok(paths) => paths,
                        Err(_) => {
                            self.out_of_time = true;
                            return Visit::Stop;
                        }
                    },
                    None => Vec::new(),
                };
                self.found.push(RustDependency::Use {
                    paths,
                    statement: statement_text(parsed, node, node),
                });
                Visit::Over
            }
            _ => Visit::Into,
        }
    }

    fn leave(&mut self, _node: Node<'tree>) {
        self.open.pop();
    }
}

/// The text from `first` to the end of `last`, without the closing `;`.
fn statement_text(parsed: &ParsedSource<'_>, first: Node<'_>, last: Node<'_>) -> String {
    parsed
        .text()
        .get(first.start_byte()..last.end_byte())
        .unwrap_or("")
        .trim()
        .trim_end_matches(';')
        .trim_end()
        .to_string()
}

/// `x` of `#[path = "x"]`, when the attribute is exactly that and `x` is a one-line string.
fn path_attribute_of(attribute: &str) -> Option<String> {
    let inner = attribute
        .trim()
        .strip_prefix('#')?
        .trim_start()
        .strip_prefix('[')?
        .strip_suffix(']')?
        .trim();
    let after_name = inner
        .strip_prefix("path")?
        .trim_start()
        .strip_prefix('=')?
        .trim();
    let literal = after_name.strip_prefix('"')?.strip_suffix('"')?;
    (!literal.is_empty() && !literal.contains(['"', '\r', '\n'])).then(|| literal.to_string())
}

fn include_of(
    parsed: &ParsedSource<'_>,
    node: Node<'_>,
    parent_kind: Option<&str>,
) -> Option<RustDependency> {
    let name = node.child_by_field_name("macro")?;
    if name.kind() != "identifier"
        || !matches!(
            parsed.text_of(name),
            "include" | "include_str" | "include_bytes"
        )
    {
        return None;
    }
    let statement_position = parent_kind.is_some_and(|parent| {
        matches!(
            parent,
            "source_file" | "declaration_list" | "expression_statement" | "block"
        )
    });
    if !statement_position {
        return None;
    }
    let tree = node.child_by_field_name("token_tree").or_else(|| {
        let mut cursor = node.walk();
        let found = node
            .children(&mut cursor)
            .find(|child| child.kind() == "token_tree");
        found
    })?;
    let body = parsed.text_of(tree);
    if !body.starts_with('(') {
        return None;
    }
    let argument = body.strip_prefix('(')?.strip_suffix(')')?;
    Some(RustDependency::Include {
        literal: exact_string_literal(argument),
        statement: statement_text(parsed, node, node),
    })
}

/// The value of an argument that is exactly one string literal: a normal one with JSON escapes,
/// or a raw one. `None` for anything else.
fn exact_string_literal(argument: &str) -> Option<String> {
    let trimmed = argument.trim();
    if let Some(inner) = trimmed
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
    {
        return unescape_json_string(inner);
    }
    let rest = trimmed.strip_prefix('r')?;
    let hashes = rest
        .chars()
        .take_while(|character| *character == '#')
        .count();
    if hashes > 255 {
        return None;
    }
    let fence = "#".repeat(hashes);
    let inner = rest
        .get(hashes..)?
        .strip_prefix('"')?
        .strip_suffix(&format!("\"{fence}"))?;
    Some(inner.to_string())
}

fn unescape_json_string(inner: &str) -> Option<String> {
    let mut value = String::with_capacity(inner.len());
    let mut characters = inner.chars();
    while let Some(character) = characters.next() {
        match character {
            '"' => return None,
            c if (c as u32) < 0x20 => return None,
            '\\' => match characters.next()? {
                '"' => value.push('"'),
                '\\' => value.push('\\'),
                '/' => value.push('/'),
                'b' => value.push('\u{8}'),
                'f' => value.push('\u{c}'),
                'n' => value.push('\n'),
                'r' => value.push('\r'),
                't' => value.push('\t'),
                'u' => {
                    let digits: String = characters.by_ref().take(4).collect();
                    if digits.len() != 4 {
                        return None;
                    }
                    value.push(char::from_u32(u32::from_str_radix(&digits, 16).ok()?)?);
                }
                _ => return None,
            },
            other => value.push(other),
        }
    }
    Some(value)
}

/// Every path a `use` argument names, a list expanded with its prefix, `self` and `*` dropped
/// from the end of a path, repeats removed. Found with a stack: a use list nested ten thousand
/// deep costs the same stack as a flat one, and the time the parse had bounds it as it does a walk.
fn use_paths(parsed: &ParsedSource<'_>, argument: Node<'_>) -> Result<Vec<UsePath>, ParseRefusal> {
    let mut paths: Vec<UsePath> = Vec::new();
    let mut known: HashSet<UsePath> = HashSet::new();
    let mut push = |path: UsePath| {
        if known.insert(path.clone()) {
            paths.push(path);
        }
    };
    let mut pending: Vec<(Node<'_>, Vec<String>)> = vec![(argument, Vec::new())];
    while let Some((node, prefix)) = pending.pop() {
        if parsed.out_of_time() {
            return Err(ParseRefusal::TookTooLong);
        }
        match node.kind() {
            "use_list" => {
                let mut cursor = node.walk();
                let items: Vec<Node<'_>> = node.named_children(&mut cursor).collect();
                for item in items.into_iter().rev() {
                    pending.push((item, prefix.clone()));
                }
            }
            "scoped_use_list" => {
                let mut next = prefix.clone();
                if let Some(path) = node.child_by_field_name("path") {
                    match segments_of(parsed, path) {
                        Some(segments) => next.extend(segments),
                        None => {
                            push(UsePath::Unsupported(parsed.text_of(node).to_string()));
                            continue;
                        }
                    }
                }
                if let Some(list) = node.child_by_field_name("list") {
                    pending.push((list, next));
                }
            }
            "use_as_clause" => {
                if let Some(path) = node.child_by_field_name("path") {
                    pending.push((path, prefix));
                }
            }
            "use_wildcard" => {
                let mut cursor = node.walk();
                let path = node.named_children(&mut cursor).next();
                match path.map(|path| segments_of(parsed, path)) {
                    Some(Some(segments)) => push(joined(prefix, segments)),
                    Some(None) => push(UsePath::Unsupported(parsed.text_of(node).to_string())),
                    None => push(joined(prefix, Vec::new())),
                }
            }
            "self" if !prefix.is_empty() => push(joined(prefix, Vec::new())),
            _ => match segments_of(parsed, node) {
                Some(segments) => push(joined(prefix, segments)),
                None => push(UsePath::Unsupported(parsed.text_of(node).to_string())),
            },
        }
    }
    paths.retain(|path| !matches!(path, UsePath::Segments(segments) if segments.is_empty()));
    Ok(paths)
}

fn joined(mut prefix: Vec<String>, segments: Vec<String>) -> UsePath {
    prefix.extend(segments);
    UsePath::Segments(prefix)
}

/// The names of a path (`a::b::c`) left to right; `None` when a part is not a plain name, `crate`,
/// `self` or `super`. A leading `::` is not a segment.
fn segments_of(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<Vec<String>> {
    let mut reversed: Vec<String> = Vec::new();
    let mut current = Some(node);
    while let Some(part) = current {
        match part.kind() {
            "identifier" | "crate" | "self" | "super" => {
                reversed.push(parsed.text_of(part).to_string());
                current = None;
            }
            "scoped_identifier" => {
                reversed.push(
                    parsed
                        .text_of(part.child_by_field_name("name")?)
                        .to_string(),
                );
                current = part.child_by_field_name("path");
            }
            _ => return None,
        }
    }
    reversed.reverse();
    Some(reversed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_parse::{parse_bounded, ParseLimits};
    use crate::source_language::SourceLanguage;

    fn read(source: &str) -> Vec<RustDependency> {
        let parsed = parse_bounded(
            SourceLanguage::Rust,
            source,
            ParseLimits::for_imports(256 * 1024),
        )
        .expect("parses");
        read_rust_dependencies(&parsed).expect("in time").found
    }

    fn paths(source: &str) -> Vec<String> {
        match read(source).remove(0) {
            RustDependency::Use { paths, .. } => paths
                .into_iter()
                .map(|path| match path {
                    UsePath::Segments(segments) => segments.join("::"),
                    UsePath::Unsupported(text) => format!("?{text}"),
                })
                .collect(),
            other => panic!("not a use: {other:?}"),
        }
    }

    #[test]
    fn a_use_tree_is_expanded_with_self_and_star_dropped_from_the_end() {
        assert_eq!(
            paths("pub use crate::a::{b, c::{self, d as e}, f::*};"),
            [
                "crate::a::b",
                "crate::a::c",
                "crate::a::c::d",
                "crate::a::f"
            ]
        );
        assert_eq!(paths("use ::std::fs;"), ["std::fs"]);
        assert_eq!(
            paths("use serde::{Serialize, Serialize};"),
            ["serde::Serialize"]
        );
    }

    #[test]
    fn only_the_files_own_items_count_not_inline_modules_or_macro_bodies() {
        let found = read(
            "mod a;\n#[path = \"x/y.rs\"] mod b;\n#[cfg(unix)] mod c;\nmod inline { use hidden::x; }\n\
             macro_rules! m { () => { use in_macro::y; } }\nfn f() { use in_fn::z; }\n\
             include!(\"gen.rs\");\ninclude_str!(r#\"raw.txt\"#);\n\
             #[cfg(a)] // between\n#[cfg(b)] mod d;\n#[cfg(e)] fn f() {}\nmod g;\n",
        );
        let kinds: Vec<String> = found
            .iter()
            .map(|dependency| match dependency {
                RustDependency::Module {
                    name,
                    path_attribute,
                    conditional,
                    ..
                } => {
                    format!("mod {name} {path_attribute:?} {conditional}")
                }
                RustDependency::Include { literal, .. } => format!("include {literal:?}"),
                RustDependency::Use { statement, .. } => format!("use {statement}"),
            })
            .collect();
        assert_eq!(
            kinds,
            [
                "mod a None false",
                "mod b Some(\"x/y.rs\") false",
                "mod c None true",
                "use use in_fn::z",
                "include Some(\"gen.rs\")",
                "include Some(\"raw.txt\")",
                "mod d None true",
                "mod g None false",
            ]
        );
    }

    #[test]
    fn a_file_with_more_statements_than_the_limit_is_read_up_to_it() {
        let source = "mod m;\n".repeat(MAX_DEPENDENCIES_PER_FILE + 40);
        let parsed = parse_bounded(
            SourceLanguage::Rust,
            &source,
            ParseLimits::for_imports(256 * 1024),
        )
        .expect("parses");
        let read = read_rust_dependencies(&parsed).expect("in time");
        assert_eq!(read.found.len(), MAX_DEPENDENCIES_PER_FILE);
        assert!(read.limit_reached);
        let exact = "mod m;\n".repeat(MAX_DEPENDENCIES_PER_FILE);
        let parsed = parse_bounded(
            SourceLanguage::Rust,
            &exact,
            ParseLimits::for_imports(256 * 1024),
        )
        .expect("parses");
        assert!(
            !read_rust_dependencies(&parsed)
                .expect("in time")
                .limit_reached
        );
    }

    #[test]
    fn an_include_with_anything_but_one_literal_has_no_literal() {
        let found = read("include!(concat!(\"a\", \"b\"));\ninclude!(\"bad\\x41\");");
        for dependency in found {
            assert!(matches!(
                dependency,
                RustDependency::Include { literal: None, .. }
            ));
        }
    }
}
