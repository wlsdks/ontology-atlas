//! What an import scan finds, as the agent reads it: file edges, the packages and specifiers that
//! lead outside the repository, the ones that could not be placed, and the counts that summarize
//! a group of edges.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportKind {
    Static,
    Dynamic,
    Require,
    Reexport,
    Side,
}

impl ImportKind {
    pub fn word(self) -> &'static str {
        match self {
            Self::Static => "static",
            Self::Dynamic => "dynamic",
            Self::Require => "require",
            Self::Reexport => "reexport",
            Self::Side => "side",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceRole {
    Production,
    Test,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportUsage {
    Value,
    TypeOnly,
    Unknown,
}

impl ImportUsage {
    pub fn word(self) -> &'static str {
        match self {
            Self::Value => "value",
            Self::TypeOnly => "type_only",
            Self::Unknown => "unknown",
        }
    }
}

/// One file importing another, both as `/`-separated paths below the scanned root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEdge {
    pub from: String,
    pub to: String,
    pub kind: ImportKind,
    pub source_role: SourceRole,
    pub import_usage: ImportUsage,
}

/// A specifier that names something outside the repository: a package, a crate, a library.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExternalImport {
    pub from: String,
    pub spec: String,
}

/// Why a specifier could not be placed. Each is a word an agent branches on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum UnresolvedReason {
    #[serde(rename = "empty")]
    Empty,
    #[serde(rename = "relative-not-found")]
    RelativeNotFound,
    #[serde(rename = "alias-not-found")]
    AliasNotFound,
    #[serde(rename = "unsupported-static-form")]
    UnsupportedStaticForm,
    #[serde(rename = "file-too-large")]
    FileTooLarge,
    /// The file was not parsed: binary content, or beyond the parse time or node budget. Nothing
    /// was read from it, which is not the same as nothing being found in it.
    #[serde(rename = "source-not-parsed")]
    SourceNotParsed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UnresolvedImport {
    pub from: String,
    pub spec: String,
    pub reason: UnresolvedReason,
}

/// Everything the files of one scan said, in the order the files were read.
#[derive(Debug, Default)]
pub struct Findings {
    pub edges: Vec<ImportEdge>,
    pub external: Vec<ExternalImport>,
    pub unresolved: Vec<UnresolvedImport>,
}

impl Findings {
    pub fn edge(&mut self, from: &str, to: &str, kind: ImportKind, usage: ImportUsage) {
        self.edges.push(ImportEdge {
            from: from.to_string(),
            to: to.to_string(),
            kind,
            source_role: source_role_of(from),
            import_usage: usage,
        });
    }

    pub fn leads_outside(&mut self, from: &str, spec: &str) {
        self.external.push(ExternalImport {
            from: from.to_string(),
            spec: spec.to_string(),
        });
    }

    pub fn could_not_place(&mut self, from: &str, spec: &str, reason: UnresolvedReason) {
        self.unresolved.push(UnresolvedImport {
            from: from.to_string(),
            spec: spec.to_string(),
            reason,
        });
    }
}

/// The roles a group of edges came from, every role named even at zero.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct RoleCounts {
    pub production: usize,
    pub test: usize,
    pub unknown: usize,
}

impl RoleCounts {
    pub fn add(&mut self, role: SourceRole) {
        match role {
            SourceRole::Production => self.production += 1,
            SourceRole::Test => self.test += 1,
            SourceRole::Unknown => self.unknown += 1,
        }
    }
}

/// The usages a group of edges made, every usage named even at zero.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct UsageCounts {
    pub value: usize,
    pub type_only: usize,
    pub unknown: usize,
}

impl UsageCounts {
    pub fn add(&mut self, usage: ImportUsage) {
        match usage {
            ImportUsage::Value => self.value += 1,
            ImportUsage::TypeOnly => self.type_only += 1,
            ImportUsage::Unknown => self.unknown += 1,
        }
    }
}

/// Whether a file is a test, by where it lives and what it is called, over its `/`- or
/// `\`-separated path below the root.
pub fn source_role_of(path: &str) -> SourceRole {
    let lowered = path.replace('\\', "/").to_lowercase();
    let segments: Vec<&str> = lowered.split('/').collect();
    if segments
        .iter()
        .any(|segment| matches!(*segment, "test" | "tests" | "__tests__"))
    {
        return SourceRole::Test;
    }
    let file_name = segments.last().copied().unwrap_or("");
    let stem = strip_code_extension(file_name);
    let is_test_name = stem.ends_with(".test")
        || stem.ends_with(".spec")
        || (stem.starts_with("test_") && stem.len() > "test_".len())
        || (stem.ends_with("_test") && stem.len() > "_test".len());
    if is_test_name {
        SourceRole::Test
    } else {
        SourceRole::Production
    }
}

/// The name without `.js`, `.jsx`, `.ts`, `.tsx`, their `c` and `m` forms, `.py` or `.rs`.
fn strip_code_extension(name: &str) -> &str {
    const EXTENSIONS: [&str; 12] = [
        ".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs", ".cts", ".mts", ".cjsx", ".mjsx", ".py",
        ".rs",
    ];
    for extension in EXTENSIONS {
        if let Some(stem) = name.strip_suffix(extension) {
            return stem;
        }
    }
    name
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_test_is_known_by_its_folder_or_by_its_name() {
        for path in [
            "src/tests/a.ts",
            "test/a.py",
            "src/__tests__/a.ts",
            "src/a.test.ts",
            "src/a.spec.tsx",
            "pkg/test_a.py",
            "src/Tests/A.ts",
        ] {
            assert_eq!(source_role_of(path), SourceRole::Test, "{path}");
        }
        for path in [
            "src/a.ts",
            "src/testing/a.ts",
            "src/test.ts.bak",
            "src/contest.rs",
        ] {
            assert_eq!(source_role_of(path), SourceRole::Production, "{path}");
        }
    }

    #[test]
    fn counts_name_every_word_even_at_zero() {
        let text = serde_json::to_string(&(RoleCounts::default(), UsageCounts::default()))
            .expect("serializes");
        assert_eq!(
            text,
            r#"[{"production":0,"test":0,"unknown":0},{"value":0,"type_only":0,"unknown":0}]"#
        );
    }
}
