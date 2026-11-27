//! The modules a Python file imports, read from its syntax tree: `import a.b as c, d`,
//! `from .x import (y, z as w)` and `from m import *`, wherever the statement stands (a function
//! body counts: the file depends on it). An import under `if TYPE_CHECKING:` is type-only; its
//! `else` branch is not.

use tree_sitter::Node;

use crate::bounded_parse::{walk, ParsedSource, Visit};
use crate::import_edges::ImportUsage;

/// One imported module as written (`.x`, `..`, `a.b`) and the names taken from it; none for a
/// plain `import` and for `*`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PythonImport {
    pub module: String,
    pub names: Vec<String>,
    pub usage: ImportUsage,
}

pub fn read_python_imports(parsed: &ParsedSource<'_>) -> Vec<PythonImport> {
    let mut found = Vec::new();
    walk(parsed.root(), |node| {
        match node.kind() {
            "import_statement" => {
                let usage = usage_of(parsed, node);
                for name in named(node, "name") {
                    let dotted = if name.kind() == "aliased_import" {
                        name.child_by_field_name("name")
                    } else {
                        Some(name)
                    };
                    if let Some(dotted) = dotted {
                        found.push(PythonImport {
                            module: compact(parsed.text_of(dotted)),
                            names: Vec::new(),
                            usage,
                        });
                    }
                }
            }
            "import_from_statement" => {
                if let Some(module) = node.child_by_field_name("module_name") {
                    found.push(PythonImport {
                        module: compact(parsed.text_of(module)),
                        names: named(node, "name")
                            .into_iter()
                            .filter_map(|name| imported_name(parsed, name))
                            .collect(),
                        usage: usage_of(parsed, node),
                    });
                }
            }
            _ => {}
        }
        Visit::Into
    });
    found
}

fn named<'tree>(node: Node<'tree>, field: &str) -> Vec<Node<'tree>> {
    let mut cursor = node.walk();
    node.children_by_field_name(field, &mut cursor).collect()
}

/// The name an `import ... from` takes, before any `as`; only a plain identifier is a name.
fn imported_name(parsed: &ParsedSource<'_>, node: Node<'_>) -> Option<String> {
    let name = if node.kind() == "aliased_import" {
        node.child_by_field_name("name")?
    } else {
        node
    };
    let text = parsed.text_of(name);
    (name.kind() == "dotted_name" && !text.contains('.')).then(|| text.to_string())
}

fn compact(text: &str) -> String {
    text.chars()
        .filter(|character| !character.is_whitespace())
        .collect()
}

/// Type-only when the statement stands in the body of an `if TYPE_CHECKING:`.
fn usage_of(parsed: &ParsedSource<'_>, statement: Node<'_>) -> ImportUsage {
    let mut child = statement;
    while let Some(parent) = child.parent() {
        if parent.kind() == "if_statement"
            && parent
                .child_by_field_name("consequence")
                .is_some_and(|body| body.id() == child.id())
            && parent
                .child_by_field_name("condition")
                .is_some_and(|condition| is_type_checking(&compact(parsed.text_of(condition))))
        {
            return ImportUsage::TypeOnly;
        }
        child = parent;
    }
    ImportUsage::Value
}

fn is_type_checking(condition: &str) -> bool {
    let bare = condition.trim_start_matches('(').trim_end_matches(')');
    bare == "TYPE_CHECKING" || bare == "typing.TYPE_CHECKING"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_parse::{parse_bounded, ParseLimits};
    use crate::source_language::SourceLanguage;

    fn read(source: &str) -> Vec<(String, Vec<String>, ImportUsage)> {
        let parsed = parse_bounded(
            SourceLanguage::Python,
            source,
            ParseLimits::for_imports(1 << 20),
        )
        .expect("parses");
        read_python_imports(&parsed)
            .into_iter()
            .map(|found| (found.module, found.names, found.usage))
            .collect()
    }

    #[test]
    fn plain_from_relative_and_wildcard_forms_are_read_wherever_they_stand() {
        let found = read(
            "import os, a.b as c\n\
             from . import x\n\
             from .. import (y,\n    z as w)\n\
             from .mod import *\n\
             def f():\n    import inner\n\
             \"\"\"\nimport in_a_docstring\n\"\"\"\n",
        );
        let modules: Vec<_> = found.iter().map(|row| row.0.as_str()).collect();
        assert_eq!(modules, ["os", "a.b", ".", "..", ".mod", "inner"]);
        assert_eq!(found[2].1, ["x"]);
        assert_eq!(found[3].1, ["y", "z"]);
        assert!(found[4].1.is_empty());
    }

    #[test]
    fn only_the_body_of_if_type_checking_is_type_only() {
        let found = read(
            "from typing import TYPE_CHECKING\n\
             if TYPE_CHECKING:\n    from t import T\nelse:\n    from v import V\n\
             if (typing.TYPE_CHECKING):\n    import u\n",
        );
        let usages: Vec<_> = found.iter().map(|row| (row.0.as_str(), row.2)).collect();
        assert_eq!(
            usages,
            [
                ("typing", ImportUsage::Value),
                ("t", ImportUsage::TypeOnly),
                ("v", ImportUsage::Value),
                ("u", ImportUsage::TypeOnly),
            ]
        );
    }
}
