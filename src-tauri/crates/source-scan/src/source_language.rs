//! The languages whose imports Atlas reads from a syntax tree, and which file name is which.

use tree_sitter::Language;

/// A language with a grammar. JavaScript's grammar reads JSX; TypeScript has one grammar for
/// `.ts` and another for `.tsx`, which differ where a `<` opens a type argument or a tag.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SourceLanguage {
    TypeScript,
    Tsx,
    JavaScript,
    Python,
    Go,
    Java,
    Kotlin,
    Rust,
}

impl SourceLanguage {
    /// The language a file extension names, with its leading dot and in lower case.
    pub fn of_extension(extension: &str) -> Option<Self> {
        match extension {
            ".ts" | ".mts" | ".cts" => Some(Self::TypeScript),
            ".tsx" => Some(Self::Tsx),
            ".js" | ".jsx" | ".mjs" | ".cjs" => Some(Self::JavaScript),
            ".py" => Some(Self::Python),
            ".go" => Some(Self::Go),
            ".java" => Some(Self::Java),
            ".kt" => Some(Self::Kotlin),
            ".rs" => Some(Self::Rust),
            _ => None,
        }
    }

    pub(crate) fn grammar(self) -> Language {
        match self {
            Self::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            Self::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
            Self::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
            Self::Python => tree_sitter_python::LANGUAGE.into(),
            Self::Go => tree_sitter_go::LANGUAGE.into(),
            Self::Java => tree_sitter_java::LANGUAGE.into(),
            Self::Kotlin => tree_sitter_kotlin_ng::LANGUAGE.into(),
            Self::Rust => tree_sitter_rust::LANGUAGE.into(),
        }
    }
}

/// The extension of a file name with its dot (`.ts` for `a.test.ts`), or `None` for a name with no
/// dot or only a leading one. Compared as written, so `.TS` is not `.ts`, as the walker has
/// always compared them.
pub fn extension_of(name: &str) -> Option<&str> {
    let dot = name.rfind('.')?;
    (dot > 0).then(|| name.get(dot..)).flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_scanned_extension_has_its_language_and_a_grammar_that_loads() {
        let table = [
            (".ts", SourceLanguage::TypeScript),
            (".mts", SourceLanguage::TypeScript),
            (".cts", SourceLanguage::TypeScript),
            (".tsx", SourceLanguage::Tsx),
            (".js", SourceLanguage::JavaScript),
            (".jsx", SourceLanguage::JavaScript),
            (".mjs", SourceLanguage::JavaScript),
            (".cjs", SourceLanguage::JavaScript),
            (".py", SourceLanguage::Python),
            (".go", SourceLanguage::Go),
            (".java", SourceLanguage::Java),
            (".kt", SourceLanguage::Kotlin),
            (".rs", SourceLanguage::Rust),
        ];
        for (extension, language) in table {
            assert_eq!(SourceLanguage::of_extension(extension), Some(language));
            let mut parser = tree_sitter::Parser::new();
            parser
                .set_language(&language.grammar())
                .expect("the grammar matches the library's ABI");
        }
        assert_eq!(SourceLanguage::of_extension(".TS"), None);
        assert_eq!(SourceLanguage::of_extension(".kts"), None);
    }

    #[test]
    fn an_extension_needs_a_name_before_its_dot() {
        assert_eq!(extension_of("a.test.ts"), Some(".ts"));
        assert_eq!(extension_of(".ts"), None);
        assert_eq!(extension_of("Makefile"), None);
    }
}
