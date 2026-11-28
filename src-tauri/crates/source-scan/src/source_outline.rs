//! The declarations of a file with their line numbers, read from its syntax tree: a table of
//! contents for the next bounded read, never a claim about behaviour.
//!
//! Only what a reader navigates by is listed: names declared at the top of a file, in a module,
//! and as members of a class, interface, enum, trait or impl. A function declared inside another
//! function is a local helper of it and is left out, and so is anything a string or a comment
//! says. The tree is walked with an explicit stack, so a file that nests classes ten thousand
//! deep costs the stack of a flat one.

use tree_sitter::Node;

use crate::bounded_parse::{parse_bounded, ParseLimits, ParseRefusal, ParsedSource};
use crate::source_language::SourceLanguage;

/// Declarations one outline lists at most; a longer file reports `truncated`.
pub const OUTLINE_DECLARATION_LIMIT: usize = 400;
/// A signature is the declaration's own line, cut to this many characters.
const SIGNATURE_CHARS: usize = 160;
const OUTLINE_PARSE_LIMITS: ParseLimits = ParseLimits {
    max_bytes: 2 * 1024 * 1024,
    max_nodes: 400_000,
    time: std::time::Duration::from_secs(2),
};

/// What a declaration is, in the words an outline row uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DeclarationKind {
    Class,
    Interface,
    Enum,
    Type,
    Function,
    Method,
    Struct,
    Const,
    /// `export * from` and `export { } from`: the module the file forwards.
    Export,
}

impl DeclarationKind {
    pub fn word(self) -> &'static str {
        match self {
            Self::Class => "class",
            Self::Interface => "interface",
            Self::Enum => "enum",
            Self::Type => "type",
            Self::Function => "function",
            Self::Method => "method",
            Self::Struct => "struct",
            Self::Const => "const",
            Self::Export => "export",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Declaration {
    /// 1-based.
    pub line: usize,
    pub kind: DeclarationKind,
    pub name: String,
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Outline {
    pub declarations: Vec<Declaration>,
    /// The list stopped at [`OUTLINE_DECLARATION_LIMIT`].
    pub truncated: bool,
}

/// Where a node stands: at the top of a file or module, or among the members of a type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Place {
    Top,
    Members,
}

/// Parses `text` and lists its declarations; refused when the file cannot be parsed in budget.
pub fn outline_text(language: SourceLanguage, text: &str) -> Result<Outline, ParseRefusal> {
    let parsed = parse_bounded(language, text, OUTLINE_PARSE_LIMITS)?;
    Ok(outline_parsed(&parsed))
}

pub fn outline_parsed(parsed: &ParsedSource<'_>) -> Outline {
    let lines: Vec<&str> = parsed.text().split('\n').collect();
    let mut outline = Outline::default();
    let mut stack: Vec<(Node<'_>, Place)> = vec![(parsed.root(), Place::Top)];
    while let Some((node, place)) = stack.pop() {
        if parsed.out_of_time() {
            outline.truncated = true;
            break;
        }
        let mut next: Vec<(Node<'_>, Place)> = Vec::new();
        let mut found: Vec<(Node<'_>, DeclarationKind, String)> = Vec::new();
        read_node(parsed, node, place, &mut found, &mut next);
        for (at, kind, name) in found {
            if name.is_empty() {
                continue;
            }
            if outline.declarations.len() >= OUTLINE_DECLARATION_LIMIT {
                outline.truncated = true;
                return finish(outline);
            }
            let line = at.start_position().row;
            outline.declarations.push(Declaration {
                line: line + 1,
                kind,
                name,
                signature: signature_of(lines.get(line).copied().unwrap_or("")),
            });
        }
        // Reversed, so the first child is read first and declarations come out in file order.
        stack.extend(next.into_iter().rev());
    }
    finish(outline)
}

fn finish(mut outline: Outline) -> Outline {
    outline
        .declarations
        .sort_by_key(|declaration| declaration.line);
    outline
}

fn signature_of(line: &str) -> String {
    line.trim().chars().take(SIGNATURE_CHARS).collect()
}

fn children<'tree>(node: Node<'tree>) -> Vec<Node<'tree>> {
    let mut cursor = node.walk();
    node.children(&mut cursor).collect()
}

fn field_text(parsed: &ParsedSource<'_>, node: Node<'_>, field: &str) -> String {
    node.child_by_field_name(field)
        .map(|name| parsed.text_of(name).to_string())
        .unwrap_or_default()
}

type Found<'tree> = Vec<(Node<'tree>, DeclarationKind, String)>;
type Next<'tree> = Vec<(Node<'tree>, Place)>;

fn read_node<'tree>(
    parsed: &ParsedSource<'_>,
    node: Node<'tree>,
    place: Place,
    found: &mut Found<'tree>,
    next: &mut Next<'tree>,
) {
    match parsed.language() {
        SourceLanguage::TypeScript | SourceLanguage::Tsx | SourceLanguage::JavaScript => {
            script(parsed, node, place, found, next);
        }
        SourceLanguage::Python => python(parsed, node, place, found, next),
        SourceLanguage::Go => go(parsed, node, found, next),
        SourceLanguage::Rust => rust(parsed, node, place, found, next),
        SourceLanguage::Java => java(parsed, node, place, found, next),
        SourceLanguage::Kotlin => kotlin(parsed, node, place, found, next),
    }
}

fn function_kind(place: Place) -> DeclarationKind {
    match place {
        Place::Top => DeclarationKind::Function,
        Place::Members => DeclarationKind::Method,
    }
}

fn script<'tree>(
    parsed: &ParsedSource<'_>,
    node: Node<'tree>,
    place: Place,
    found: &mut Found<'tree>,
    next: &mut Next<'tree>,
) {
    match node.kind() {
        "program" | "ambient_declaration" => {
            next.extend(children(node).into_iter().map(|child| (child, place)));
        }
        "export_statement" => {
            let exported = node.child_by_field_name("declaration");
            match exported {
                Some(declaration) => next.push((declaration, place)),
                None => {
                    let line = parsed.text_of(node).lines().next().unwrap_or("");
                    let name = node
                        .child_by_field_name("source")
                        .map(|source| {
                            parsed
                                .text_of(source)
                                .trim_matches(|c| c == '"' || c == '\'')
                                .to_string()
                        })
                        .unwrap_or_else(|| line.chars().take(40).collect());
                    found.push((node, DeclarationKind::Export, name));
                }
            }
        }
        "class_declaration" | "abstract_class_declaration" | "class" => {
            found.push((
                node,
                DeclarationKind::Class,
                field_text(parsed, node, "name"),
            ));
            if let Some(body) = node.child_by_field_name("body") {
                next.push((body, Place::Members));
            }
        }
        "class_body" => {
            next.extend(
                children(node)
                    .into_iter()
                    .map(|child| (child, Place::Members)),
            );
        }
        "interface_declaration" => {
            found.push((
                node,
                DeclarationKind::Interface,
                field_text(parsed, node, "name"),
            ));
        }
        "enum_declaration" => {
            found.push((
                node,
                DeclarationKind::Enum,
                field_text(parsed, node, "name"),
            ));
        }
        "type_alias_declaration" => {
            found.push((
                node,
                DeclarationKind::Type,
                field_text(parsed, node, "name"),
            ));
        }
        "function_declaration" | "generator_function_declaration" | "function_signature"
            if place == Place::Top =>
        {
            found.push((
                node,
                DeclarationKind::Function,
                field_text(parsed, node, "name"),
            ));
        }
        "method_definition" | "method_signature" | "abstract_method_signature"
            if place == Place::Members =>
        {
            found.push((
                node,
                DeclarationKind::Method,
                field_text(parsed, node, "name"),
            ));
        }
        "lexical_declaration" | "variable_declaration" if place == Place::Top => {
            for declarator in children(node)
                .into_iter()
                .filter(|child| child.kind() == "variable_declarator")
            {
                let Some(name) = declarator.child_by_field_name("name") else {
                    continue;
                };
                if name.kind() != "identifier" {
                    continue;
                }
                let is_function = declarator
                    .child_by_field_name("value")
                    .is_some_and(|value| {
                        matches!(
                            value.kind(),
                            "arrow_function"
                                | "function_expression"
                                | "function"
                                | "generator_function"
                        )
                    });
                let kind = if is_function {
                    DeclarationKind::Function
                } else {
                    DeclarationKind::Const
                };
                found.push((node, kind, parsed.text_of(name).to_string()));
            }
        }
        _ => {}
    }
}

fn python<'tree>(
    parsed: &ParsedSource<'_>,
    node: Node<'tree>,
    place: Place,
    found: &mut Found<'tree>,
    next: &mut Next<'tree>,
) {
    match node.kind() {
        "module" => next.extend(children(node).into_iter().map(|child| (child, place))),
        "block" if place == Place::Members => {
            next.extend(children(node).into_iter().map(|child| (child, place)));
        }
        "decorated_definition" => {
            if let Some(definition) = node.child_by_field_name("definition") {
                next.push((definition, place));
            }
        }
        "class_definition" => {
            found.push((
                node,
                DeclarationKind::Class,
                field_text(parsed, node, "name"),
            ));
            if let Some(body) = node.child_by_field_name("body") {
                next.push((body, Place::Members));
            }
        }
        "function_definition" => {
            found.push((node, function_kind(place), field_text(parsed, node, "name")));
        }
        _ => {}
    }
}

fn go<'tree>(
    parsed: &ParsedSource<'_>,
    node: Node<'tree>,
    found: &mut Found<'tree>,
    next: &mut Next<'tree>,
) {
    match node.kind() {
        "source_file" => next.extend(children(node).into_iter().map(|child| (child, Place::Top))),
        "function_declaration" => {
            found.push((
                node,
                DeclarationKind::Function,
                field_text(parsed, node, "name"),
            ));
        }
        "method_declaration" => {
            let receiver = go_receiver_type(parsed, node);
            let name = field_text(parsed, node, "name");
            found.push((node, DeclarationKind::Method, format!("{receiver}.{name}")));
        }
        "type_declaration" => {
            for spec in children(node)
                .into_iter()
                .filter(|child| matches!(child.kind(), "type_spec" | "type_alias"))
            {
                let kind = match spec.child_by_field_name("type").map(|node| node.kind()) {
                    Some("struct_type") => DeclarationKind::Struct,
                    Some("interface_type") => DeclarationKind::Interface,
                    _ => DeclarationKind::Type,
                };
                found.push((spec, kind, field_text(parsed, spec, "name")));
            }
        }
        "const_declaration" | "var_declaration" => {
            let specs: Vec<Node<'_>> = children(node)
                .into_iter()
                .filter(|child| matches!(child.kind(), "const_spec" | "var_spec"))
                .collect();
            let grouped = children(node).iter().any(|child| child.kind() == "(");
            if let (false, [spec]) = (grouped, specs.as_slice()) {
                if let Some(name) = spec.child_by_field_name("name") {
                    found.push((
                        node,
                        DeclarationKind::Const,
                        parsed.text_of(name).to_string(),
                    ));
                }
            }
        }
        _ => {}
    }
}

/// The type a method hangs on, without its pointer star or type parameters: `Command` for
/// `func (c *Command[T]) Run()`.
fn go_receiver_type(parsed: &ParsedSource<'_>, method: Node<'_>) -> String {
    let Some(receiver) = method.child_by_field_name("receiver") else {
        return String::new();
    };
    let text = parsed.text_of(receiver);
    let inner = text.trim_start_matches('(').trim_end_matches(')').trim();
    let type_part = inner.rsplit(char::is_whitespace).next().unwrap_or(inner);
    let bare = type_part.trim_start_matches('*');
    bare.split('[').next().unwrap_or(bare).to_string()
}

fn rust<'tree>(
    parsed: &ParsedSource<'_>,
    node: Node<'tree>,
    place: Place,
    found: &mut Found<'tree>,
    next: &mut Next<'tree>,
) {
    match node.kind() {
        "source_file" => next.extend(children(node).into_iter().map(|child| (child, Place::Top))),
        "mod_item" => {
            if let Some(body) = node.child_by_field_name("body") {
                next.extend(children(body).into_iter().map(|child| (child, Place::Top)));
            }
        }
        "function_item" => {
            found.push((node, function_kind(place), field_text(parsed, node, "name")));
        }
        "function_signature_item" if place == Place::Members => {
            found.push((
                node,
                DeclarationKind::Method,
                field_text(parsed, node, "name"),
            ));
        }
        "impl_item" => {
            found.push((node, DeclarationKind::Class, rust_impl_name(parsed, node)));
            if let Some(body) = node.child_by_field_name("body") {
                next.extend(
                    children(body)
                        .into_iter()
                        .map(|child| (child, Place::Members)),
                );
            }
        }
        "struct_item" => {
            found.push((
                node,
                DeclarationKind::Struct,
                field_text(parsed, node, "name"),
            ));
        }
        "enum_item" => {
            found.push((
                node,
                DeclarationKind::Enum,
                field_text(parsed, node, "name"),
            ));
        }
        "trait_item" => {
            found.push((
                node,
                DeclarationKind::Interface,
                field_text(parsed, node, "name"),
            ));
            if let Some(body) = node.child_by_field_name("body") {
                next.extend(
                    children(body)
                        .into_iter()
                        .map(|child| (child, Place::Members)),
                );
            }
        }
        "const_item" | "static_item" => {
            found.push((
                node,
                DeclarationKind::Const,
                field_text(parsed, node, "name"),
            ));
        }
        "type_item" => {
            found.push((
                node,
                DeclarationKind::Type,
                field_text(parsed, node, "name"),
            ));
        }
        _ => {}
    }
}

/// `Display for Foo` for `impl<T> Display for Foo<T> {`: what the impl is for, as it is written.
fn rust_impl_name(parsed: &ParsedSource<'_>, node: Node<'_>) -> String {
    let header_end = node
        .child_by_field_name("body")
        .map_or(node.end_byte(), |body| body.start_byte());
    let header = parsed
        .text()
        .get(node.start_byte()..header_end)
        .unwrap_or("")
        .trim();
    let after_keyword = header
        .strip_prefix("unsafe")
        .map_or(header, str::trim_start)
        .strip_prefix("impl")
        .unwrap_or(header)
        .trim_start();
    let without_generics = if after_keyword.starts_with('<') {
        let mut depth = 0usize;
        let mut end = 0usize;
        for (index, character) in after_keyword.char_indices() {
            match character {
                '<' => depth += 1,
                '>' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        end = index + 1;
                        break;
                    }
                }
                _ => {}
            }
        }
        after_keyword.get(end..).unwrap_or("").trim_start()
    } else {
        after_keyword
    };
    without_generics
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn java<'tree>(
    parsed: &ParsedSource<'_>,
    node: Node<'tree>,
    place: Place,
    found: &mut Found<'tree>,
    next: &mut Next<'tree>,
) {
    match node.kind() {
        "program" => next.extend(children(node).into_iter().map(|child| (child, Place::Top))),
        "class_declaration"
        | "record_declaration"
        | "interface_declaration"
        | "enum_declaration"
        | "annotation_type_declaration" => {
            let kind = match node.kind() {
                "interface_declaration" | "annotation_type_declaration" => {
                    DeclarationKind::Interface
                }
                "enum_declaration" => DeclarationKind::Enum,
                _ => DeclarationKind::Class,
            };
            found.push((node, kind, field_text(parsed, node, "name")));
            if let Some(body) = node.child_by_field_name("body") {
                next.extend(
                    children(body)
                        .into_iter()
                        .map(|child| (child, Place::Members)),
                );
            }
        }
        "enum_body_declarations" => {
            next.extend(
                children(node)
                    .into_iter()
                    .map(|child| (child, Place::Members)),
            );
        }
        "method_declaration" | "constructor_declaration" if place == Place::Members => {
            found.push((
                node,
                DeclarationKind::Method,
                field_text(parsed, node, "name"),
            ));
        }
        _ => {}
    }
}

fn kotlin<'tree>(
    parsed: &ParsedSource<'_>,
    node: Node<'tree>,
    place: Place,
    found: &mut Found<'tree>,
    next: &mut Next<'tree>,
) {
    match node.kind() {
        "source_file" => next.extend(children(node).into_iter().map(|child| (child, Place::Top))),
        "class_declaration" | "object_declaration" => {
            let is_interface = children(node)
                .iter()
                .any(|child| child.kind() == "interface");
            let is_enum = children(node).iter().any(|child| {
                child.kind() == "modifiers" && parsed.text_of(*child).contains("enum")
            });
            let kind = if is_interface {
                DeclarationKind::Interface
            } else if is_enum {
                DeclarationKind::Enum
            } else {
                DeclarationKind::Class
            };
            found.push((node, kind, field_text(parsed, node, "name")));
            for child in children(node)
                .into_iter()
                .filter(|child| matches!(child.kind(), "class_body" | "enum_class_body"))
            {
                next.extend(
                    children(child)
                        .into_iter()
                        .map(|member| (member, Place::Members)),
                );
            }
        }
        "function_declaration" => {
            found.push((node, function_kind(place), field_text(parsed, node, "name")));
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outline(language: SourceLanguage, text: &str) -> Vec<(usize, &'static str, String)> {
        outline_text(language, text)
            .expect("parsed")
            .declarations
            .into_iter()
            .map(|declaration| (declaration.line, declaration.kind.word(), declaration.name))
            .collect()
    }

    fn row(line: usize, kind: &'static str, name: &str) -> (usize, &'static str, String) {
        (line, kind, name.to_string())
    }

    #[test]
    fn typescript_lists_what_is_declared_at_the_top_and_in_classes_not_locals() {
        let source = "\
export class Invoice {
  total(): number {
    function local() { return 1; }
    return local();
  }
  #secret() {}
}
export interface Line { id: string }
export type Money = number;
export enum Kind { A }
export const issue = (id: string) => id;
export const RATE = 3;
export * from './tax';
function helper() {}
";
        assert_eq!(
            outline(SourceLanguage::TypeScript, source),
            vec![
                row(1, "class", "Invoice"),
                row(2, "method", "total"),
                row(6, "method", "#secret"),
                row(8, "interface", "Line"),
                row(9, "type", "Money"),
                row(10, "enum", "Kind"),
                row(11, "function", "issue"),
                row(12, "const", "RATE"),
                row(13, "export", "./tax"),
                row(14, "function", "helper"),
            ]
        );
    }

    #[test]
    fn python_lists_classes_and_their_methods_and_a_decorated_function_at_its_def() {
        let source = "\
class Ledger:
    def post(self):
        def inner():
            pass

@cache
def balance():
    pass
";
        assert_eq!(
            outline(SourceLanguage::Python, source),
            vec![
                row(1, "class", "Ledger"),
                row(2, "method", "post"),
                row(7, "function", "balance"),
            ]
        );
    }

    #[test]
    fn go_keeps_a_methods_receiver_in_its_name_and_tells_struct_from_interface() {
        let source = "\
package main

type Node struct{}
type Sink interface{ Put() }
type Id string

func (n *Node) Subscribe() {}
func Run() {}
const Limit = 3
const (
\tA = 1
\tB = 2
)
";
        assert_eq!(
            outline(SourceLanguage::Go, source),
            vec![
                row(3, "struct", "Node"),
                row(4, "interface", "Sink"),
                row(5, "type", "Id"),
                row(7, "method", "Node.Subscribe"),
                row(8, "function", "Run"),
                row(9, "const", "Limit"),
            ]
        );
    }

    #[test]
    fn rust_lists_items_and_names_an_impl_by_what_it_is_for() {
        let source = "\
pub struct Ledger;
pub enum Kind { A }
pub trait Post { fn post(&self); }
impl<T> Post for Ledger {
    fn post(&self) {}
}
pub mod inner {
    pub fn run() { fn local() {} }
}
const LIMIT: u32 = 3;
";
        assert_eq!(
            outline(SourceLanguage::Rust, source),
            vec![
                row(1, "struct", "Ledger"),
                row(2, "enum", "Kind"),
                row(3, "interface", "Post"),
                row(3, "method", "post"),
                row(4, "class", "Post for Ledger"),
                row(5, "method", "post"),
                row(8, "function", "run"),
                row(10, "const", "LIMIT"),
            ]
        );
    }

    #[test]
    fn java_and_kotlin_list_types_and_their_members() {
        assert_eq!(
            outline(
                SourceLanguage::Java,
                "public class Carrier {\n  public void ship() {}\n  Carrier() {}\n}\ninterface Port {}\n"
            ),
            vec![
                row(1, "class", "Carrier"),
                row(2, "method", "ship"),
                row(3, "method", "Carrier"),
                row(5, "interface", "Port"),
            ]
        );
        assert_eq!(
            outline(
                SourceLanguage::Kotlin,
                "class Cart {\n  fun add() {}\n}\nfun top() {}\nobject Registry\n"
            ),
            vec![
                row(1, "class", "Cart"),
                row(2, "method", "add"),
                row(4, "function", "top"),
                row(5, "class", "Registry"),
            ]
        );
    }

    #[test]
    fn a_name_in_a_comment_or_a_string_is_no_declaration() {
        let source = "// function ghost() {}\nconst text = \"class Ghost {}\";\n";
        assert_eq!(
            outline(SourceLanguage::JavaScript, source),
            vec![row(2, "const", "text")]
        );
    }

    #[test]
    fn classes_nested_ten_thousand_deep_are_listed_without_overflowing_the_stack() {
        let depth = 10_000;
        let source = format!("{}{}", "class A { ".repeat(depth), "}".repeat(depth));
        let outline = outline_text(SourceLanguage::JavaScript, &source);
        match outline {
            Ok(outline) => assert!(!outline.declarations.is_empty()),
            Err(refusal) => assert!(matches!(
                refusal,
                ParseRefusal::TooManyNodes | ParseRefusal::TookTooLong
            )),
        }
    }

    #[test]
    fn a_file_with_more_declarations_than_the_limit_says_it_was_cut() {
        let source = "function f() {}\n".repeat(OUTLINE_DECLARATION_LIMIT + 5);
        let outline = outline_text(SourceLanguage::JavaScript, &source).expect("parsed");
        assert_eq!(outline.declarations.len(), OUTLINE_DECLARATION_LIMIT);
        assert!(outline.truncated);
    }
}
