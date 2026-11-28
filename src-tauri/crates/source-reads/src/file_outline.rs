//! A file's declarations with their line numbers, whatever its language: from the syntax tree for
//! the eight languages `source-scan` parses, from headings for Markdown, and from a line scan for
//! the two languages with no grammar here (Ruby and C#). A language with none of these gets no
//! declarations and says so by its language word, `unknown`: "not outlined", never "no
//! declarations".

use std::sync::LazyLock;

use regex::Regex;
use repository_survey::{is_js_space, js_regex};
use source_scan::{
    outline_signature, outline_text, DeclarationKind, SourceLanguage, OUTLINE_DECLARATION_LIMIT,
};

const LINE_CHARACTERS: usize = 1000;

/// What a declaration is, in the words an outline row uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutlineKind {
    Class,
    Interface,
    Enum,
    Type,
    Function,
    Method,
    Struct,
    Const,
    Export,
    Section,
}

impl OutlineKind {
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
            Self::Section => "section",
        }
    }

    /// A declaration of code: not a re-export and not a heading.
    pub fn is_code(self) -> bool {
        !matches!(self, Self::Export | Self::Section)
    }
}

impl From<DeclarationKind> for OutlineKind {
    fn from(kind: DeclarationKind) -> Self {
        match kind {
            DeclarationKind::Class => Self::Class,
            DeclarationKind::Interface => Self::Interface,
            DeclarationKind::Enum => Self::Enum,
            DeclarationKind::Type => Self::Type,
            DeclarationKind::Function => Self::Function,
            DeclarationKind::Method => Self::Method,
            DeclarationKind::Struct => Self::Struct,
            DeclarationKind::Const => Self::Const,
            DeclarationKind::Export => Self::Export,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutlineDeclaration {
    /// 1-based.
    pub line: usize,
    pub kind: OutlineKind,
    pub name: String,
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileOutline {
    /// The language word an outline row names: `typescript`, `python`, `markdown`, `unknown`.
    pub language: &'static str,
    pub declarations: Vec<OutlineDeclaration>,
    /// The list stopped at its declaration ceiling, or a line too long to scan was skipped.
    pub truncated: bool,
}

/// The extension of the last part with its dot, lower-cased.
fn extension_of(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    match name.rfind('.') {
        Some(dot) if dot > 0 => name.get(dot..).unwrap_or("").to_ascii_lowercase(),
        _ => String::new(),
    }
}

enum Scanner {
    Tree(SourceLanguage),
    Markdown,
    Ruby,
    CSharp,
}

fn language_of(path: &str) -> (&'static str, Option<Scanner>) {
    match extension_of(path).as_str() {
        ".ts" | ".mts" | ".cts" => (
            "typescript",
            Some(Scanner::Tree(SourceLanguage::TypeScript)),
        ),
        ".tsx" => ("typescript", Some(Scanner::Tree(SourceLanguage::Tsx))),
        ".js" | ".jsx" | ".mjs" | ".cjs" => (
            "javascript",
            Some(Scanner::Tree(SourceLanguage::JavaScript)),
        ),
        ".py" | ".pyi" => ("python", Some(Scanner::Tree(SourceLanguage::Python))),
        ".go" => ("go", Some(Scanner::Tree(SourceLanguage::Go))),
        ".java" => ("java", Some(Scanner::Tree(SourceLanguage::Java))),
        ".kt" | ".kts" => ("kotlin", Some(Scanner::Tree(SourceLanguage::Kotlin))),
        ".rs" => ("rust", Some(Scanner::Tree(SourceLanguage::Rust))),
        ".md" | ".markdown" => ("markdown", Some(Scanner::Markdown)),
        ".rb" => ("ruby", Some(Scanner::Ruby)),
        ".cs" => ("csharp", Some(Scanner::CSharp)),
        _ => ("unknown", None),
    }
}

/// Whether the declarations of `path` come from a line scanner and not from a syntax tree, so a
/// reader that has the survey's trees must still read the file for them.
pub fn is_line_scanned(path: &str) -> bool {
    matches!(language_of(path).1, Some(Scanner::Ruby | Scanner::CSharp))
}

fn indent_of(line: &str) -> usize {
    line.chars()
        .take_while(|character| matches!(character, ' ' | '\t'))
        .count()
}

/// The declarations of `text`, read as the language of `path`.
pub fn outline_file(text: &str, path: &str) -> FileOutline {
    let (language, scanner) = language_of(path);
    let Some(scanner) = scanner else {
        return FileOutline {
            language,
            declarations: Vec::new(),
            truncated: false,
        };
    };
    match scanner {
        Scanner::Tree(tree_language) => {
            match outline_text(tree_language, text) {
                Ok(outline) => FileOutline {
                    language,
                    declarations: outline
                        .declarations
                        .into_iter()
                        .map(|declaration| OutlineDeclaration {
                            line: declaration.line,
                            kind: declaration.kind.into(),
                            name: declaration.name,
                            signature: declaration.signature,
                        })
                        .collect(),
                    truncated: outline.truncated,
                },
                // A file the parser could not finish in budget has no outline, and the row says it
                // stopped early.
                Err(_) => FileOutline {
                    language,
                    declarations: Vec::new(),
                    truncated: true,
                },
            }
        }
        Scanner::Markdown => scan_lines(text, language, markdown_sections),
        Scanner::Ruby => scan_lines(text, language, ruby_declarations),
        Scanner::CSharp => scan_lines(text, language, curly_brace_declarations),
    }
}

/// Lines split at `\r\n`, `\n` or `\r`.
fn split_rows(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut characters = text.chars().peekable();
    while let Some(character) = characters.next() {
        match character {
            '\r' => {
                if characters.peek() == Some(&'\n') {
                    characters.next();
                }
                lines.push(std::mem::take(&mut current));
            }
            '\n' => lines.push(std::mem::take(&mut current)),
            other => current.push(other),
        }
    }
    lines.push(current);
    lines
}

/// Lines split at `\r\n`, `\n` or `\r`, a line over [`LINE_CHARACTERS`] blanked.
fn scan_lines(
    text: &str,
    language: &'static str,
    scan: fn(&[String], &mut Collector),
) -> FileOutline {
    let mut skipped = false;
    let mut lines = split_rows(text);
    for line in &mut lines {
        if answer_format::utf16::len(line) > LINE_CHARACTERS {
            skipped = true;
            line.clear();
        }
    }
    let mut collector = Collector::default();
    scan(&lines, &mut collector);
    FileOutline {
        language,
        declarations: collector.declarations,
        truncated: collector.truncated || skipped,
    }
}

#[derive(Default)]
struct Collector {
    declarations: Vec<OutlineDeclaration>,
    truncated: bool,
}

impl Collector {
    fn add(&mut self, index: usize, kind: OutlineKind, name: &str, line: &str) {
        if name.is_empty() {
            return;
        }
        if self.declarations.len() >= OUTLINE_DECLARATION_LIMIT {
            self.truncated = true;
            return;
        }
        self.declarations.push(OutlineDeclaration {
            line: index + 1,
            kind,
            name: name.to_string(),
            signature: outline_signature(line),
        });
    }
}

fn trim_js(text: &str) -> &str {
    text.trim_matches(is_js_space)
}

static MARKDOWN_HEADING: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(#{1,6})\s+(.*\S)\s*$"));

fn markdown_sections(lines: &[String], out: &mut Collector) {
    let mut fenced = false;
    for (index, line) in lines.iter().enumerate() {
        let trimmed = trim_js(line);
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fenced = !fenced;
            continue;
        }
        if fenced {
            continue;
        }
        if let Some(found) = MARKDOWN_HEADING.captures(trimmed) {
            if let Some(title) = found.get(2) {
                out.add(index, OutlineKind::Section, title.as_str(), line);
            }
        }
    }
}

static RUBY_DEF: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)"));
static RUBY_CLASS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^class\s+([A-Za-z_][\w:]*)"));
static RUBY_MODULE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^module\s+([A-Za-z_][\w:]*)"));

fn ruby_declarations(lines: &[String], out: &mut Collector) {
    for (index, line) in lines.iter().enumerate() {
        let trimmed = trim_js(line);
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = indent_of(line);
        let class = RUBY_CLASS
            .captures(trimmed)
            .or_else(|| RUBY_MODULE.captures(trimmed));
        if let Some(name) = class.and_then(|found| found.get(1)) {
            out.add(index, OutlineKind::Class, name.as_str(), line);
            continue;
        }
        if let Some(name) = RUBY_DEF.captures(trimmed).and_then(|found| found.get(1)) {
            let kind = if indent == 0 {
                OutlineKind::Function
            } else {
                OutlineKind::Method
            };
            out.add(index, kind, name.as_str(), line);
        }
    }
}

/// Call-shaped words (`name(`) that are not declarations; without them `if (ready) {` is a method.
const NOT_A_DECLARATION: [&str; 20] = [
    "case",
    "catch",
    "do",
    "else",
    "fixed",
    "for",
    "foreach",
    "function",
    "if",
    "lock",
    "new",
    "return",
    "switch",
    "synchronized",
    "try",
    "unsafe",
    "using",
    "when",
    "while",
    "with",
];

static JVM_TYPE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?:^|\s)(class|interface|enum\s+class|enum|object|struct|record)\s+([A-Za-z_]\w*)")
});
static KOTLIN_FUN: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^(?:(?:public|private|protected|internal|open|override|abstract|final|inline|suspend|operator|infix|tailrec|external|expect|actual|companion)\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(",
    )
});
static JVM_MEMBER_NAME: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\b([A-Za-z_]\w*)\s*(?:<[^<>]*>\s*)?\("));
static JVM_MEMBER_TAIL: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[\w\s,.<>\[\]:?]*$"));

fn jvm_member_name(trimmed: &str) -> Option<String> {
    let close = trimmed.rfind(')')?;
    if !trimmed.ends_with('{') {
        return None;
    }
    let tail = trimmed.get(close + 1..trimmed.len() - 1)?;
    if !JVM_MEMBER_TAIL.is_match(tail) {
        return None;
    }
    let from = trimmed
        .get(..close)
        .and_then(|before| before.rfind(';'))
        .map_or(0, |at| at + 1);
    JVM_MEMBER_NAME
        .captures(trimmed.get(from..close)?)
        .and_then(|found| found.get(1))
        .map(|name| name.as_str().to_string())
}

fn curly_brace_declarations(lines: &[String], out: &mut Collector) {
    for (index, line) in lines.iter().enumerate() {
        let trimmed = trim_js(line);
        if trimmed.is_empty()
            || trimmed.starts_with("//")
            || trimmed.starts_with("/*")
            || trimmed.starts_with('*')
        {
            continue;
        }
        let indent = indent_of(line);
        if let Some(found) = JVM_TYPE.captures(trimmed) {
            let word = found.get(1).map_or("", |word| word.as_str());
            let kind = match word
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .as_str()
            {
                "enum" | "enum class" => OutlineKind::Enum,
                "interface" => OutlineKind::Interface,
                "struct" => OutlineKind::Struct,
                _ => OutlineKind::Class,
            };
            if let Some(name) = found.get(2) {
                out.add(index, kind, name.as_str(), line);
            }
            continue;
        }
        if let Some(name) = KOTLIN_FUN.captures(trimmed).and_then(|found| found.get(1)) {
            let kind = if indent == 0 {
                OutlineKind::Function
            } else {
                OutlineKind::Method
            };
            out.add(index, kind, name.as_str(), line);
            continue;
        }
        if let Some(member) = jvm_member_name(trimmed) {
            if !NOT_A_DECLARATION.contains(&member.as_str()) {
                out.add(index, OutlineKind::Method, &member, line);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_language_is_read_the_way_its_extension_says_and_an_unknown_one_lists_nothing() {
        let python = outline_file("class A:\n    def run(self):\n        pass\n", "a.py");
        assert_eq!(python.language, "python");
        assert_eq!(
            python
                .declarations
                .iter()
                .map(|d| (d.line, d.kind.word(), d.name.as_str()))
                .collect::<Vec<_>>(),
            [(1, "class", "A"), (2, "method", "run")]
        );
        let markdown = outline_file("# Title\n```\n# not\n```\n## Next\n", "README.md");
        assert_eq!(
            markdown
                .declarations
                .iter()
                .map(|d| d.name.as_str())
                .collect::<Vec<_>>(),
            ["Title", "Next"]
        );
        let ruby = outline_file("class Box\n  def open\n  end\nend\n", "box.rb");
        assert_eq!(ruby.declarations.len(), 2);
        let csharp = outline_file(
            "public class Cart {\n  public void Add(int x) {\n  }\n}\n",
            "Cart.cs",
        );
        assert_eq!(csharp.declarations.len(), 2);
        let unknown = outline_file("int main() {}", "main.c");
        assert_eq!(
            (unknown.language, unknown.declarations.len()),
            ("unknown", 0)
        );
    }
}
