//! A source file reduced to what can change its behaviour, so two versions of a file can be asked
//! whether only comments, layout or the places modules are imported from changed between them.
//!
//! A language with a grammar is read from its syntax tree: the tree without its comments, every
//! literal byte for byte, and each import reduced to the names it brings in (sorted, with the
//! module it names left out). Any other file is compared by its lines without trailing space or
//! blank lines. Reading errs toward "changed": a file that does not parse compares by its lines.

use std::fmt::Write as _;

use tree_sitter::Node;

use crate::bounded_parse::{parse_bounded, ParseLimits, ParsedSource, ScopedVisitor, Visit};
use crate::source_language::{extension_of, SourceLanguage};

/// The largest file read as a tree; a larger one compares by its lines.
const MAX_COMPARED_BYTES: usize = 1024 * 1024;

fn is_comment(kind: &str) -> bool {
    matches!(
        kind,
        "comment" | "line_comment" | "block_comment" | "multiline_comment" | "doc_comment"
    ) || kind.ends_with("_comment")
}

fn is_import(language: SourceLanguage, kind: &str) -> bool {
    match language {
        SourceLanguage::TypeScript | SourceLanguage::Tsx | SourceLanguage::JavaScript => {
            matches!(kind, "import_statement" | "export_statement")
        }
        SourceLanguage::Python => matches!(
            kind,
            "import_statement" | "import_from_statement" | "future_import_statement"
        ),
        SourceLanguage::Go => kind == "import_declaration",
        SourceLanguage::Java => kind == "import_declaration",
        SourceLanguage::Kotlin => kind == "import",
        SourceLanguage::Rust => kind == "use_declaration",
    }
}

fn is_string_part(kind: &str) -> bool {
    kind.contains("string") && kind != "string_content_delimiter"
}

struct Flattener<'text> {
    parsed: &'text ParsedSource<'text>,
    out: String,
    imports: Vec<String>,
    /// Bindings of the import being read, once the walk is inside one.
    in_import: Option<Vec<String>>,
    import_depth: usize,
}

impl<'tree, 'text> ScopedVisitor<'tree> for Flattener<'text>
where
    'text: 'tree,
{
    fn enter(&mut self, node: Node<'tree>) -> Visit {
        let kind = node.kind();
        if is_comment(kind) {
            return Visit::Over;
        }
        if self.in_import.is_none() && is_import(self.parsed.language(), kind) {
            // `export const a = 1` is an export statement that holds code: only a re-export,
            // which names a source, reads as an import.
            let reexport =
                kind == "export_statement" && node.child_by_field_name("source").is_some();
            if kind != "export_statement" || reexport {
                self.in_import = Some(Vec::new());
                self.import_depth = 1;
                return Visit::Into;
            }
        }
        if let Some(bindings) = self.in_import.as_mut() {
            self.import_depth += 1;
            if node.child_count() == 0 && !is_string_part(kind) && node.is_named() {
                bindings.push(self.parsed.text_of(node).to_string());
            }
            if is_string_part(kind) {
                return Visit::Over;
            }
            return Visit::Into;
        }
        if node.child_count() == 0 {
            let _ = write!(self.out, "{kind}:{} ", self.parsed.text_of(node));
        } else {
            let _ = write!(self.out, "{kind}( ");
        }
        Visit::Into
    }

    fn leave(&mut self, node: Node<'tree>) {
        if is_comment(node.kind()) {
            return;
        }
        if self.in_import.is_some() {
            self.import_depth = self.import_depth.saturating_sub(1);
            if self.import_depth == 0 {
                if let Some(mut bindings) = self.in_import.take() {
                    bindings.sort();
                    self.imports.push(bindings.join(" "));
                }
            }
            return;
        }
        if node.child_count() > 0 {
            self.out.push_str(") ");
        }
    }
}

fn exact_lines(source: &str) -> String {
    source
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// `text` of the file named `file_name`, reduced as the module comment says.
pub fn comparable_code(text: &str, file_name: &str) -> String {
    let source = text.replace("\r\n", "\n").replace('\r', "\n");
    let language = extension_of(file_name)
        .map(str::to_ascii_lowercase)
        .and_then(|extension| SourceLanguage::of_extension(&extension));
    let Some(language) = language else {
        return exact_lines(&source);
    };
    let Ok(parsed) = parse_bounded(
        language,
        &source,
        ParseLimits::for_imports(MAX_COMPARED_BYTES),
    ) else {
        return exact_lines(&source);
    };
    let mut flattener = Flattener {
        parsed: &parsed,
        out: String::new(),
        imports: Vec::new(),
        in_import: None,
        import_depth: 0,
    };
    if parsed.walk_scoped(&mut flattener).is_err() {
        return exact_lines(&source);
    }
    let Flattener {
        out, mut imports, ..
    } = flattener;
    if imports.is_empty() {
        return out;
    }
    imports.sort();
    format!("{out}\n\0imports\n{}", imports.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_comment_or_the_layout_does_not_change_a_script_but_a_literal_does() {
        let before = "// header\nexport function a(x) {\n  return x + 1; /* inc */\n}\n";
        let after = "export function a( x ) { return x +\n 1; }\n";
        assert_eq!(
            comparable_code(before, "a.ts"),
            comparable_code(after, "a.ts")
        );
        let changed = "export function a(x) { return x + 2; }\n";
        assert_ne!(
            comparable_code(before, "a.ts"),
            comparable_code(changed, "a.ts")
        );
        let string_before = "const s = 'a  b';\n";
        let string_after = "const s = 'a b';\n";
        assert_ne!(
            comparable_code(string_before, "a.ts"),
            comparable_code(string_after, "a.ts")
        );
    }

    #[test]
    fn moving_the_module_an_import_names_is_not_a_change_but_a_new_name_is() {
        let before = "import { a, b } from './old/place';\nexport const c = a;\n";
        let moved = "import { b, a } from './new/place';\nexport const c = a;\n";
        let renamed = "import { a, z } from './old/place';\nexport const c = a;\n";
        assert_eq!(
            comparable_code(before, "x.ts"),
            comparable_code(moved, "x.ts")
        );
        assert_ne!(
            comparable_code(before, "x.ts"),
            comparable_code(renamed, "x.ts")
        );
    }

    #[test]
    fn a_file_without_a_grammar_is_compared_by_its_lines() {
        assert_eq!(
            comparable_code("a  \n\n b\r\n", "notes.txt"),
            comparable_code("a\n b\n", "notes.txt")
        );
        assert_ne!(
            comparable_code("a\n", "notes.txt"),
            comparable_code("a\n# c\n", "notes.txt")
        );
    }
}
