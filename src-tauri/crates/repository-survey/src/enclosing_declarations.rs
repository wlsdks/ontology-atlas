//! The declaration each line of a Go, Rust, Python or script file sits in, from one forward pass
//! that carries the open declarations: Go and Rust by the last function head (a Rust one under an
//! `impl` names its type and says whether a test attribute sits on it), Python by indentation,
//! scripts by brace depth, so a helper declared and closed above a line is not that line's
//! function. A text scan, as the survey's other readers: a brace inside a string can misjudge a
//! line.

use std::sync::LazyLock;

use regex::Regex;

use crate::js_pattern::{is_js_space, js_regex, js_trim_end};
use crate::operator_language::OperatorLanguage;

static GO_FUNC: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"^func\s+(?:\(\s*\w+\s+\*?([A-Za-z_]\w*)(?:\[[^\]()]*\])?\s*\)\s*)?([A-Za-z_]\w*)")
});
static PY_DEF: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)"));
static PY_CLASS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(\s*)class\s+([A-Za-z_]\w*)"));
static JS_FUNCTION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)")
});
static JS_ARROW: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>",
    )
});
static JS_METHOD_HEAD: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^\s+(?:(?:public|private|protected|static|async|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\(",
    )
});
static JS_CLASS: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)")
});
static RS_FN: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)"));
static RS_IMPL: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^impl(?:<[^>]*>)?\s+(?:[\w:]+\s+for\s+)?([A-Za-z_]\w*)"));
static RS_TOP_ITEM: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^(?:pub\s+)?(?:fn|struct|enum|mod|trait)\b"));
static RS_ATTRIBUTE_OR_COMMENT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:#\[|//)"));
static RUST_TEST_ATTRIBUTE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*#\[(?:(?:[\w:]+::)?test\b|cfg\(test\))"));

const SCRIPT_KEYWORDS: [&str; 8] = [
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "function",
    "return",
    "constructor",
];

/// One declaration a line sits in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Enclosing {
    /// The class, or the type an `impl` is for.
    pub owner: Option<String>,
    pub name: String,
    /// A Rust function with a test attribute on it.
    pub test: bool,
}

/// The declarations of a file and, per line, the one it sits in (an index into `declarations`).
#[derive(Debug, Default)]
pub struct Enclosures {
    declarations: Vec<Enclosing>,
    at_line: Vec<Option<usize>>,
}

impl Enclosures {
    /// The declaration line `index` (0-based) sits in, with the number that tells two apart.
    pub fn at(&self, index: usize) -> Option<(usize, &Enclosing)> {
        let id = (*self.at_line.get(index)?)?;
        Some((id, self.declarations.get(id)?))
    }

    fn declare(&mut self, owner: Option<String>, name: &str, test: bool) -> usize {
        self.declarations.push(Enclosing {
            owner,
            name: name.to_string(),
            test,
        });
        self.declarations.len() - 1
    }
}

/// `{` minus `}` on a line, as written (`parens`: `(` minus `)` as well).
pub fn brace_delta(line: &str, parens: bool) -> i64 {
    let mut delta = 0;
    for character in line.chars() {
        if character == '{' || (parens && character == '(') {
            delta += 1;
        } else if character == '}' || (parens && character == ')') {
            delta -= 1;
        }
    }
    delta
}

/// The spaces and tabs a line opens with.
pub fn indent_of(line: &str) -> usize {
    line.chars()
        .take_while(|character| *character == ' ' || *character == '\t')
        .count()
}

/// A method head (`  async save(input) {`): a name, a parameter list, a block opening at the
/// line's end, no statement end after the parameters, and no arrow, so `useEffect(() => {` is a
/// call, not a declaration.
fn script_method_name(line: &str) -> Option<String> {
    let head = JS_METHOD_HEAD.captures(line)?;
    if !js_trim_end(line).ends_with('{') || line.contains("=>") {
        return None;
    }
    let name = head.get(1)?.as_str();
    let tail = line.get(head.get(0)?.end()..)?;
    let close = tail.find(')')?;
    if tail.get(close + 1..)?.contains(';') {
        return None;
    }
    Some(name.to_string())
}

struct Block {
    depth: i64,
    declaration: Option<usize>,
    class: Option<String>,
}

fn go_declarations(lines: &[String]) -> Enclosures {
    let mut found = Enclosures::default();
    let mut current: Option<usize> = None;
    for line in lines {
        if let Some(head) = GO_FUNC.captures(line) {
            let owner = head.get(1).map(|owner| owner.as_str().to_string());
            let name = head.get(2).map_or("", |name| name.as_str());
            current = Some(found.declare(owner, name, false));
        }
        found.at_line.push(current);
    }
    found
}

fn rust_declarations(lines: &[String]) -> Enclosures {
    let mut found = Enclosures::default();
    let mut current: Option<usize> = None;
    let mut implementing: Option<String> = None;
    let mut test_attribute = false;
    for line in lines {
        if let Some(head) = RS_IMPL.captures(line) {
            implementing = head.get(1).map(|name| name.as_str().to_string());
        } else if RS_TOP_ITEM.is_match(line) {
            implementing = None;
        }
        if let Some(head) = RS_FN.captures(line) {
            let name = head.get(1).map_or("", |name| name.as_str());
            current = Some(found.declare(implementing.clone(), name, test_attribute));
        }
        found.at_line.push(current);
        test_attribute = if RS_ATTRIBUTE_OR_COMMENT.is_match(line) {
            test_attribute || RUST_TEST_ATTRIBUTE.is_match(line)
        } else {
            false
        };
    }
    found
}

fn python_declarations(lines: &[String]) -> Enclosures {
    let mut found = Enclosures::default();
    // Each open block: its indent, the function it is or sits in, and the nearest class.
    let mut open: Vec<(usize, Option<usize>, Option<String>)> = Vec::new();
    for line in lines {
        if line.trim_matches(is_js_space).is_empty() {
            found
                .at_line
                .push(open.last().and_then(|(_, definition, _)| *definition));
            continue;
        }
        let indent = indent_of(line);
        while open.last().is_some_and(|(held, _, _)| *held >= indent) {
            open.pop();
        }
        let top_definition = open.last().and_then(|(_, definition, _)| *definition);
        let top_class = open.last().and_then(|(_, _, class)| class.clone());
        if let Some(definition) = PY_DEF.captures(line) {
            let name = definition.get(2).map_or("", |name| name.as_str());
            let id = found.declare(top_class.clone(), name, false);
            open.push((indent, Some(id), top_class));
            found.at_line.push(Some(id));
        } else {
            if let Some(class) = PY_CLASS.captures(line) {
                let name = class.get(2).map(|name| name.as_str().to_string());
                open.push((indent, top_definition, name));
            }
            found.at_line.push(top_definition);
        }
    }
    found
}

fn script_declarations(lines: &[String]) -> Enclosures {
    let mut found = Enclosures::default();
    let mut open: Vec<Block> = Vec::new();
    let mut depth: i64 = 0;
    for line in lines {
        while open.last().is_some_and(|block| block.depth >= depth) {
            open.pop();
        }
        let top_declaration = open.last().and_then(|block| block.declaration);
        let top_class = open.last().and_then(|block| block.class.clone());
        let class = JS_CLASS.captures(line);
        let plain = if class.is_some() {
            None
        } else {
            JS_FUNCTION
                .captures(line)
                .or_else(|| JS_ARROW.captures(line))
        };
        let method = if class.is_some() || plain.is_some() {
            None
        } else {
            script_method_name(line)
        };
        let block = if let Some(class) = &class {
            Some(Block {
                depth,
                declaration: top_declaration,
                class: class.get(1).map(|name| name.as_str().to_string()),
            })
        } else if let Some(plain) = &plain {
            let name = plain.get(1).map_or("", |name| name.as_str());
            Some(Block {
                depth,
                declaration: Some(found.declare(None, name, false)),
                class: top_class.clone(),
            })
        } else {
            method
                .filter(|name| !SCRIPT_KEYWORDS.contains(&name.as_str()))
                .map(|name| Block {
                    depth,
                    declaration: Some(found.declare(top_class.clone(), &name, false)),
                    class: top_class.clone(),
                })
        };
        found.at_line.push(
            block
                .as_ref()
                .map_or(top_declaration, |held| held.declaration),
        );
        if let Some(block) = block {
            open.push(block);
        }
        depth = (depth + brace_delta(line, false)).max(0);
    }
    found
}

pub fn enclosing_declarations(lines: &[String], language: OperatorLanguage) -> Enclosures {
    match language {
        OperatorLanguage::Go => go_declarations(lines),
        OperatorLanguage::Rust => rust_declarations(lines),
        OperatorLanguage::Python => python_declarations(lines),
        OperatorLanguage::Script => script_declarations(lines),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(text: &str) -> Vec<String> {
        text.split('\n').map(str::to_string).collect()
    }

    fn name_at(found: &Enclosures, index: usize) -> Option<String> {
        found.at(index).map(|(_, held)| match &held.owner {
            Some(owner) => format!("{owner}.{}", held.name),
            None => held.name.clone(),
        })
    }

    #[test]
    fn a_rust_line_sits_in_the_last_function_head_and_a_test_attribute_is_remembered() {
        let found = enclosing_declarations(
            &lines("impl Pump {\n    #[test]\n    fn drains() {\n        body();\n    }\n}\nfn free() {}"),
            OperatorLanguage::Rust,
        );
        assert_eq!(name_at(&found, 0), None);
        assert_eq!(name_at(&found, 3).as_deref(), Some("Pump.drains"));
        assert!(found.at(3).is_some_and(|(_, held)| held.test));
        assert_eq!(name_at(&found, 6).as_deref(), Some("free"));
        assert!(found.at(6).is_some_and(|(_, held)| !held.test));
    }

    #[test]
    fn a_python_line_sits_in_a_def_until_the_indent_comes_back_and_a_method_names_its_class() {
        let found = enclosing_declarations(
            &lines("class Job:\n    def run(self):\n        work()\n\nx = 1\n"),
            OperatorLanguage::Python,
        );
        assert_eq!(name_at(&found, 2).as_deref(), Some("Job.run"));
        assert_eq!(
            name_at(&found, 4),
            None,
            "a top-level line sits in no function"
        );
    }

    #[test]
    fn a_script_helper_closed_above_a_line_is_not_that_lines_function() {
        let found = enclosing_declarations(
            &lines("function helper() {\n  a();\n}\nsetInterval(tick, 5);\nclass Svc {\n  start() {\n    go();\n  }\n}"),
            OperatorLanguage::Script,
        );
        assert_eq!(name_at(&found, 1).as_deref(), Some("helper"));
        assert_eq!(name_at(&found, 3), None);
        assert_eq!(name_at(&found, 6).as_deref(), Some("Svc.start"));
    }

    #[test]
    fn a_go_method_names_its_receiver_type() {
        let found = enclosing_declarations(
            &lines("func (s *Server) Serve() {\n\tgo run()\n}"),
            OperatorLanguage::Go,
        );
        assert_eq!(name_at(&found, 1).as_deref(), Some("Server.Serve"));
    }
}
