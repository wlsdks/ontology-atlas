//! The module specifiers a TypeScript or JavaScript file names, read from its syntax tree: static
//! imports, `import x = require()`, re-exports, `import()` and `require()` with a literal. What a
//! comment, a string or a template says is not an import, whatever it looks like.

use tree_sitter::Node;

use crate::bounded_parse::{walk, ParsedSource, Visit};
use crate::import_edges::{ImportKind, ImportUsage};

/// One specifier and how the file names it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScriptImport {
    pub specifier: String,
    pub kind: ImportKind,
    pub usage: ImportUsage,
}

/// Every import of `parsed`, in source order.
pub fn read_script_imports(parsed: &ParsedSource<'_>) -> Vec<ScriptImport> {
    let mut found = Vec::new();
    walk(parsed.root(), |node| {
        let read = match node.kind() {
            "import_statement" => import_statement(parsed, node),
            "export_statement" => export_statement(parsed, node),
            "call_expression" => call_expression(parsed, node),
            _ => None,
        };
        found.extend(read);
        Visit::Into
    });
    found
}

fn import_statement(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<ScriptImport> {
    let mut clause = None;
    let mut require = None;
    for child in children(node) {
        match child.kind() {
            "import_clause" => clause = Some(child),
            "import_require_clause" => require = Some(child),
            _ => {}
        }
    }
    if let Some(require) = require {
        let source = require.child_by_field_name("source")?;
        return Some(ScriptImport {
            specifier: string_content(parsed, source)?,
            kind: ImportKind::Require,
            usage: ImportUsage::Value,
        });
    }
    let source = node.child_by_field_name("source")?;
    let specifier = string_content(parsed, source)?;
    let Some(clause) = clause else {
        return Some(ScriptImport {
            specifier,
            kind: ImportKind::Side,
            usage: ImportUsage::Value,
        });
    };
    let type_keyword = has_type_keyword(node);
    let only_named = children(clause).filter(|child| child.is_named()).count() == 1;
    let named = children(clause).find(|child| child.kind() == "named_imports");
    let all_specifiers_are_types = only_named
        && named.is_some_and(|named| specifiers_are_all_types(named, "import_specifier"));
    Some(ScriptImport {
        specifier,
        kind: ImportKind::Static,
        usage: if type_keyword || all_specifiers_are_types {
            ImportUsage::TypeOnly
        } else {
            ImportUsage::Value
        },
    })
}

fn export_statement(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<ScriptImport> {
    let source = node.child_by_field_name("source")?;
    let specifier = string_content(parsed, source)?;
    let clause = children(node).find(|child| child.kind() == "export_clause");
    let all_specifiers_are_types =
        clause.is_some_and(|clause| specifiers_are_all_types(clause, "export_specifier"));
    Some(ScriptImport {
        specifier,
        kind: ImportKind::Reexport,
        usage: if has_type_keyword(node) || all_specifiers_are_types {
            ImportUsage::TypeOnly
        } else {
            ImportUsage::Value
        },
    })
}

/// `import("x")` and `require("x")`; the first argument must be a plain string, since a computed
/// one names nothing a static reading can resolve. An `import()` inside a type is type-only.
fn call_expression(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<ScriptImport> {
    let function = node.child_by_field_name("function")?;
    let kind = match (function.kind(), parsed.text_of(function)) {
        ("import", _) => ImportKind::Dynamic,
        ("identifier", "require") => ImportKind::Require,
        _ => return None,
    };
    let arguments = node.child_by_field_name("arguments")?;
    let first = arguments.named_child(0)?;
    let specifier = string_content(parsed, first)?;
    let usage = if kind == ImportKind::Dynamic && inside_a_type(node) {
        ImportUsage::TypeOnly
    } else {
        ImportUsage::Value
    };
    Some(ScriptImport {
        specifier,
        kind,
        usage,
    })
}

fn children(node: Node<'_>) -> impl Iterator<Item = Node<'_>> {
    (0..node.child_count()).filter_map(move |index| node.child(index as u32))
}

/// `import type ...` and `export type ...`: the keyword is a token of the statement itself.
fn has_type_keyword(statement: Node<'_>) -> bool {
    children(statement).any(|child| !child.is_named() && child.kind() == "type")
}

/// A list of specifiers that has some, each marked `type`.
fn specifiers_are_all_types(list: Node<'_>, specifier_kind: &str) -> bool {
    let mut count = 0;
    for specifier in children(list).filter(|child| child.kind() == specifier_kind) {
        count += 1;
        if !has_type_keyword(specifier) {
            return false;
        }
    }
    count > 0
}

fn inside_a_type(node: Node<'_>) -> bool {
    let mut current = node.parent();
    while let Some(parent) = current {
        if matches!(
            parent.kind(),
            "type_annotation"
                | "type_alias_declaration"
                | "type_arguments"
                | "interface_declaration"
                | "extends_type_clause"
                | "opting_type_annotation"
                | "omitting_type_annotation"
                | "asserts_annotation"
                | "type_predicate_annotation"
        ) {
            return true;
        }
        if matches!(
            parent.kind(),
            "statement_block" | "arrow_function" | "function_expression" | "class_body"
        ) {
            return false;
        }
        current = parent.parent();
    }
    false
}

/// The characters between the quotes of a plain string literal, as written; `None` for any other
/// node, including a template. An empty literal is the empty text.
fn string_content(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<String> {
    if node.kind() != "string" {
        return None;
    }
    let text = parsed.text_of(node);
    let inner = text.get(1..text.len().checked_sub(1)?)?;
    Some(inner.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_parse::{parse_bounded, ParseLimits};
    use crate::source_language::SourceLanguage;

    fn read(language: SourceLanguage, source: &str) -> Vec<(String, ImportKind, ImportUsage)> {
        let parsed =
            parse_bounded(language, source, ParseLimits::for_imports(1 << 20)).expect("parses");
        read_script_imports(&parsed)
            .into_iter()
            .map(|found| (found.specifier, found.kind, found.usage))
            .collect()
    }

    fn typed(source: &str) -> Vec<(String, ImportKind, ImportUsage)> {
        read(SourceLanguage::TypeScript, source)
    }

    #[test]
    fn every_form_of_import_is_read_with_its_kind_and_usage() {
        use ImportKind::*;
        use ImportUsage::*;
        let found = typed(
            "import def, { a as b, type C } from \"x\";\n\
             import type { T } from './t';\n\
             import { type A, type B } from './ab';\n\
             import * as ns from 'y';\n\
             import 'side';\n\
             import fs = require('fs');\n\
             export * from './re';\n\
             export * as q from './q';\n\
             export type { Y } from './y';\n\
             export { type P } from './p';\n\
             const lazy = import('./lazy');\n\
             const r = require('./r');\n",
        );
        let expected: Vec<(&str, ImportKind, ImportUsage)> = vec![
            ("x", Static, Value),
            ("./t", Static, TypeOnly),
            ("./ab", Static, TypeOnly),
            ("y", Static, Value),
            ("side", Side, Value),
            ("fs", Require, Value),
            ("./re", Reexport, Value),
            ("./q", Reexport, Value),
            ("./y", Reexport, TypeOnly),
            ("./p", Reexport, TypeOnly),
            ("./lazy", Dynamic, Value),
            ("./r", Require, Value),
        ];
        let found: Vec<(&str, ImportKind, ImportUsage)> = found
            .iter()
            .map(|(specifier, kind, usage)| (specifier.as_str(), *kind, *usage))
            .collect();
        assert_eq!(found, expected);
    }

    #[test]
    fn what_a_comment_a_string_or_a_template_says_is_not_an_import() {
        let found = typed(
            "// import nope from 'comment';\n\
             /* require('block') */\n\
             const s = \"import str from 'string'\";\n\
             const t = `import tpl from 'template'`;\n\
             const u = `${require('./inside-a-template')}`;\n\
             const dynamic = import(name);\n\
             const joined = require('./a' + suffix);\n\
             obj.require('./method');\n",
        );
        assert_eq!(
            found.iter().map(|row| row.0.as_str()).collect::<Vec<_>>(),
            ["./inside-a-template"]
        );
    }

    #[test]
    fn an_import_call_inside_a_type_is_type_only() {
        let found = typed("type X = import('./shapes').Shape;\nlet y: import('./other').T;\nconst v = import('./value');");
        let usages: Vec<_> = found.iter().map(|row| row.2).collect();
        assert_eq!(
            usages,
            [ImportUsage::TypeOnly, ImportUsage::TypeOnly, ImportUsage::Value]
        );
    }

    #[test]
    fn a_tsx_and_a_jsx_file_are_read_with_their_markup() {
        let tsx = read(
            SourceLanguage::Tsx,
            "import { Box } from './box';\nexport const A = () => <Box<string> />;\n",
        );
        assert_eq!(tsx.len(), 1);
        let jsx = read(
            SourceLanguage::JavaScript,
            "import { Box } from './box';\nexport const A = () => <Box>import x from 'text'</Box>;\n",
        );
        assert_eq!(jsx.len(), 1, "text inside a tag is not an import");
    }

    #[test]
    fn an_empty_specifier_is_read_as_empty() {
        let found = typed("import x from '';");
        assert_eq!(found[0].0, "");
    }
}
