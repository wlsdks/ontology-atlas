//! What a Java or Kotlin file says about itself, read from its syntax tree: its package, its
//! imports, the names it declares at top level, and the capitalised names its code uses without
//! importing them (a type of the same package needs no import).
//!
//! A Kotlin file's top-level functions and properties are also a class to Java: the file's
//! facade (`@file:JvmName`, else the file name capitalised with `Kt`). Nothing is compiled; a name
//! is a name, not a resolved symbol.

use std::collections::HashSet;

use tree_sitter::Node;

use crate::bounded_parse::{walk, ParsedSource, Visit};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JvmImport {
    /// Dotted, without the wildcard.
    pub spec: String,
    pub wildcard: bool,
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct JvmFile {
    pub package: Option<String>,
    pub imports: Vec<JvmImport>,
    /// Every top-level name: types, a Kotlin file's functions, properties and aliases, and its
    /// facade class.
    pub declarations: Vec<String>,
    /// The top-level names that are types.
    pub types: Vec<String>,
    /// Capitalised names the code uses that no declaration or type parameter of the file binds,
    /// in order of first use.
    pub type_references: Vec<String>,
}

/// The file's package, imports, declarations and type references. `file_name` is its last path
/// segment, to name the public type (Java) or the facade class (Kotlin).
pub fn read_jvm_source(parsed: &ParsedSource<'_>, file_name: &str, kotlin: bool) -> JvmFile {
    let mut file = JvmFile::default();
    let mut local_names: HashSet<String> = HashSet::new();
    let mut references: Vec<String> = Vec::new();
    let mut seen_references: HashSet<String> = HashSet::new();
    let mut top_level_members = 0usize;
    let mut facade_annotation: Option<String> = None;

    let root = parsed.root();
    let mut top_level: Vec<Node<'_>> = Vec::new();
    {
        let mut cursor = root.walk();
        top_level.extend(root.children(&mut cursor));
    }
    for node in &top_level {
        match node.kind() {
            "package_declaration" | "package_header" if file.package.is_none() => {
                file.package = qualified_name(parsed, *node).map(|(name, _)| name);
            }
            "import_declaration" | "import" => {
                if let Some(import) = import_of(parsed, *node) {
                    file.imports.push(import);
                }
            }
            "class_declaration"
            | "interface_declaration"
            | "enum_declaration"
            | "record_declaration"
            | "annotation_type_declaration"
            | "object_declaration" => {
                if let Some(name) = node.child_by_field_name("name") {
                    push_unique(&mut file.types, parsed.text_of(name));
                }
            }
            "function_declaration" if kotlin => {
                if let Some(name) = node.child_by_field_name("name") {
                    push_unique(&mut file.declarations, parsed.text_of(name));
                    top_level_members += 1;
                }
            }
            "property_declaration" if kotlin => {
                if let Some(name) = property_name(parsed, *node) {
                    push_unique(&mut file.declarations, name);
                    top_level_members += 1;
                }
            }
            "type_alias" if kotlin => {
                if let Some(name) = node.child_by_field_name("type") {
                    push_unique(&mut file.declarations, parsed.text_of(name));
                    top_level_members += 1;
                }
            }
            "file_annotation" if facade_annotation.is_none() => {
                facade_annotation = jvm_name_of(parsed, *node);
            }
            _ => {}
        }
    }

    walk(root, |node| {
        match node.kind() {
            "class_declaration"
            | "interface_declaration"
            | "enum_declaration"
            | "record_declaration"
            | "annotation_type_declaration"
            | "object_declaration"
            | "companion_object" => {
                if let Some(name) = node.child_by_field_name("name") {
                    local_names.insert(parsed.text_of(name).to_string());
                }
            }
            "type_parameter" | "enum_constant" | "enum_entry" => {
                let name = node.child_by_field_name("name").or_else(|| {
                    let mut cursor = node.walk();
                    let found = node
                        .named_children(&mut cursor)
                        .find(|child| matches!(child.kind(), "identifier" | "type_identifier"));
                    found
                });
                if let Some(name) = name {
                    local_names.insert(parsed.text_of(name).to_string());
                }
            }
            "identifier" | "type_identifier" => {
                if let Some(reference) = capitalised_reference(parsed, node) {
                    if seen_references.insert(reference.clone()) {
                        references.push(reference);
                    }
                }
            }
            _ => {}
        }
        Visit::Into
    });

    // Declarations start with the types, as the file lists them.
    let mut declarations = file.types.clone();
    for name in std::mem::take(&mut file.declarations) {
        push_unique(&mut declarations, &name);
    }
    let stem = file_name
        .strip_suffix(".java")
        .or_else(|| file_name.strip_suffix(".kt"))
        .unwrap_or(file_name);
    if kotlin {
        if top_level_members > 0 {
            if let Some(facade) = facade_name(facade_annotation, stem) {
                push_unique(&mut declarations, &facade);
                push_unique(&mut file.types, &facade);
            }
        }
    } else if !stem.is_empty() {
        push_unique(&mut declarations, stem);
        push_unique(&mut file.types, stem);
    }
    file.declarations = declarations;
    file.type_references = references
        .into_iter()
        .filter(|name| !local_names.contains(name))
        .collect();
    file
}

fn push_unique(names: &mut Vec<String>, name: &str) {
    if !names.iter().any(|known| known == name) {
        names.push(name.to_string());
    }
}

/// The dotted name below a package or import node, whitespace dropped, and whether the node
/// holds a `*` after it.
fn qualified_name(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<(String, bool)> {
    let mut cursor = node.walk();
    let mut name = None;
    let mut wildcard = false;
    for child in node.children(&mut cursor) {
        match child.kind() {
            "identifier" | "scoped_identifier" | "qualified_identifier" if name.is_none() => {
                name = Some(
                    parsed
                        .text_of(child)
                        .chars()
                        .filter(|character| !character.is_whitespace())
                        .collect::<String>(),
                );
            }
            "asterisk" | "*" => wildcard = true,
            _ => {}
        }
    }
    name.map(|name| (name, wildcard))
}

fn import_of(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<JvmImport> {
    let (spec, wildcard) = qualified_name(parsed, node)?;
    if spec.is_empty() {
        return None;
    }
    let mut cursor = node.walk();
    let mut after_as = false;
    let mut alias = None;
    for child in node.children(&mut cursor) {
        if after_as && child.kind() == "identifier" {
            alias = Some(parsed.text_of(child).to_string());
            break;
        }
        after_as = child.kind() == "as";
    }
    Some(JvmImport {
        spec,
        wildcard,
        alias,
    })
}

fn property_name<'text>(parsed: &ParsedSource<'text>, node: Node<'_>) -> Option<&'text str> {
    let mut cursor = node.walk();
    let declaration = node
        .named_children(&mut cursor)
        .find(|child| child.kind() == "variable_declaration")?;
    let mut inner = declaration.walk();
    let identifier = declaration
        .named_children(&mut inner)
        .find(|child| child.kind() == "identifier");
    identifier.map(|identifier| parsed.text_of(identifier))
}

/// The name `@file:JvmName("X")` gives, when it is a plain identifier.
fn jvm_name_of(parsed: &ParsedSource<'_>, annotation: Node<'_>) -> Option<String> {
    let text = parsed.text_of(annotation);
    let after = text.split_once("JvmName")?.1;
    let open = after.find('"')?;
    let rest = &after[open + 1..];
    let close = rest.find('"')?;
    let name = rest[..close].trim();
    is_identifier(name).then(|| name.to_string())
}

fn is_identifier(name: &str) -> bool {
    let mut characters = name.chars();
    characters
        .next()
        .is_some_and(|first| first.is_alphabetic() || first == '_' || first == '$')
        && characters.all(is_identifier_character)
}

/// A character a Java or Kotlin identifier may hold: letters and digits of any script, `_` and `$`.
fn is_identifier_character(character: char) -> bool {
    character.is_alphanumeric() || character == '_' || character == '$'
}

/// The class Java sees a Kotlin file's top-level functions in.
fn facade_name(annotation: Option<String>, stem: &str) -> Option<String> {
    if let Some(name) = annotation {
        return Some(name);
    }
    if stem.is_empty() {
        return None;
    }
    let identifier: String = stem
        .chars()
        .map(|character| {
            if is_identifier_character(character) {
                character
            } else {
                '_'
            }
        })
        .collect();
    let mut characters = identifier.chars();
    let first: String = characters.next()?.to_uppercase().collect();
    Some(format!("{first}{}Kt", characters.as_str()))
}

/// The capitalised name an identifier token is, when it stands alone: not after a dot, so a
/// member or a qualified part is not a type the code names directly.
fn capitalised_reference(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<String> {
    let text = parsed.text_of(node);
    let first = text.chars().next()?;
    if !first.is_uppercase() {
        return None;
    }
    let before = node
        .start_byte()
        .checked_sub(1)
        .and_then(|index| parsed.text().as_bytes().get(index));
    if before == Some(&b'.') {
        return None;
    }
    let name: String = text
        .chars()
        .take_while(|character| is_identifier_character(*character))
        .collect();
    Some(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_parse::{parse_bounded, ParseLimits};
    use crate::source_language::SourceLanguage;

    fn read(language: SourceLanguage, name: &str, source: &str) -> JvmFile {
        let parsed =
            parse_bounded(language, source, ParseLimits::for_imports(1 << 20)).expect("parses");
        read_jvm_source(&parsed, name, language == SourceLanguage::Kotlin)
    }

    #[test]
    fn a_java_file_gives_its_package_imports_types_and_the_names_it_uses_unimported() {
        let file = read(
            SourceLanguage::Java,
            "A.java",
            "package com.acme.core;\nimport com.acme.util.Helper;\nimport static com.acme.util.Maths.max;\nimport com.acme.util.*;\n\
             public class A<T> extends Base { enum Mode { ON } Helper h; void m() { Maths.max(1); foo.Bar.baz(); } }\n",
        );
        assert_eq!(file.package.as_deref(), Some("com.acme.core"));
        let imports: Vec<_> = file
            .imports
            .iter()
            .map(|i| (i.spec.as_str(), i.wildcard))
            .collect();
        assert_eq!(
            imports,
            [
                ("com.acme.util.Helper", false),
                ("com.acme.util.Maths.max", false),
                ("com.acme.util", true)
            ]
        );
        assert_eq!(file.types, ["A"]);
        assert_eq!(file.declarations, ["A"]);
        assert_eq!(
            file.type_references,
            ["Base", "Helper", "Maths"],
            "A, T, Mode and ON are the file's own; Bar follows a dot"
        );
    }

    #[test]
    fn a_kotlin_file_gives_its_alias_its_top_level_members_and_its_facade() {
        let file = read(
            SourceLanguage::Kotlin,
            "util.kt",
            "@file:JvmName(\"Tools\")\npackage com.acme\nimport com.acme.other.Thing as T\nimport com.acme.x.*\n\
             enum class Color { RED }\nfun <T> Foo.bar(x: T): Bar? = Baz.make()\nval top = 1\ntypealias Alias = Map<String, Int>\n",
        );
        assert_eq!(file.package.as_deref(), Some("com.acme"));
        assert_eq!(file.imports[0].alias.as_deref(), Some("T"));
        assert!(file.imports[1].wildcard);
        assert_eq!(file.types, ["Color", "Tools"]);
        assert_eq!(file.declarations, ["Color", "bar", "top", "Alias", "Tools"]);
        assert!(file.type_references.contains(&"Baz".to_string()));
        assert!(!file.type_references.contains(&"Color".to_string()));
    }

    #[test]
    fn a_name_in_any_script_is_read_whole_in_a_declaration_and_in_a_kotlin_template() {
        let java = read(
            SourceLanguage::Java,
            "Caf\u{e9}.java",
            "package p;\nclass Caf\u{e9} { Na\u{ef}ve n; }\n",
        );
        assert_eq!(java.types, ["Caf\u{e9}"]);
        assert_eq!(java.type_references, ["Na\u{ef}ve"]);
        let kotlin = read(
            SourceLanguage::Kotlin,
            "caf\u{e9}.kt",
            "package p\nfun f() = \"${Na\u{ef}ve()}\"\n",
        );
        assert_eq!(kotlin.types, ["Caf\u{e9}Kt"]);
        assert_eq!(kotlin.type_references, ["Na\u{ef}ve"]);
    }

    #[test]
    fn a_kotlin_facade_without_an_annotation_is_the_file_name_capitalised_with_kt() {
        let file = read(SourceLanguage::Kotlin, "string-tools.kt", "fun f() {}\n");
        assert_eq!(file.types, ["String_toolsKt"]);
    }
}
