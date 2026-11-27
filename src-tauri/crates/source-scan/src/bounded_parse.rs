//! Parsing one file of a repository we did not write, with limits.
//!
//! A hostile or merely odd file must cost a bounded amount: bytes are capped before the parser
//! sees them, a file that is binary is not parsed, the parse stops at a time budget, and a tree
//! with more nodes than the budget is dropped. Reading the tree never recurses ([`walk`]), so
//! the depth of a file cannot overflow the stack, and tree-sitter's own parse and release keep
//! their own explicit stacks.

use std::ops::ControlFlow;
use std::time::{Duration, Instant};

use tree_sitter::{Node, Parser, Tree};

use crate::source_language::SourceLanguage;

/// Git's own binary test: a NUL byte among the first 8000.
const BINARY_PROBE_BYTES: usize = 8000;

/// What one file may cost.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParseLimits {
    pub max_bytes: usize,
    pub max_nodes: usize,
    pub time: Duration,
}

impl ParseLimits {
    /// The limits import scanning applies to a file of any language: the byte cap is the
    /// caller's because it differs by language.
    pub const fn for_imports(max_bytes: usize) -> Self {
        Self {
            max_bytes,
            max_nodes: 400_000,
            time: Duration::from_secs(2),
        }
    }
}

/// Why a file was not parsed, so a caller can say that nothing was read from it instead of
/// that nothing was found in it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParseRefusal {
    TooLarge,
    Binary,
    TookTooLong,
    TooManyNodes,
    NoTree,
}

/// A parsed file: its text and its syntax tree.
pub struct ParsedSource<'text> {
    text: &'text str,
    tree: Tree,
    language: SourceLanguage,
}

impl<'text> ParsedSource<'text> {
    pub fn language(&self) -> SourceLanguage {
        self.language
    }

    pub fn root(&self) -> Node<'_> {
        self.tree.root_node()
    }

    /// The source text of `node`.
    pub fn text_of(&self, node: Node<'_>) -> &'text str {
        self.text
            .get(node.start_byte()..node.end_byte())
            .unwrap_or("")
    }

    pub fn text(&self) -> &'text str {
        self.text
    }
}

/// Parses `text` as `language` within `limits`. A leading byte-order mark is not part of the
/// source.
pub fn parse_bounded<'text>(
    language: SourceLanguage,
    text: &'text str,
    limits: ParseLimits,
) -> Result<ParsedSource<'text>, ParseRefusal> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    if text.len() > limits.max_bytes {
        return Err(ParseRefusal::TooLarge);
    }
    if text.bytes().take(BINARY_PROBE_BYTES).any(|byte| byte == 0) {
        return Err(ParseRefusal::Binary);
    }
    let mut parser = Parser::new();
    parser
        .set_language(&language.grammar())
        .map_err(|_| ParseRefusal::NoTree)?;
    let deadline = Instant::now() + limits.time;
    let bytes = text.as_bytes();
    let mut out_of_time = |_: &tree_sitter::ParseState| {
        if Instant::now() >= deadline {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    };
    let options = tree_sitter::ParseOptions::new().progress_callback(&mut out_of_time);
    let tree = parser
        .parse_with_options(
            &mut |offset, _| bytes.get(offset..).unwrap_or(&[]),
            None,
            Some(options),
        )
        .ok_or_else(|| {
            if Instant::now() >= deadline {
                ParseRefusal::TookTooLong
            } else {
                ParseRefusal::NoTree
            }
        })?;
    let parsed = ParsedSource {
        text,
        tree,
        language,
    };
    let mut nodes = 0usize;
    walk(parsed.root(), |_| {
        nodes += 1;
        if nodes > limits.max_nodes {
            Visit::Stop
        } else {
            Visit::Into
        }
    });
    if nodes > limits.max_nodes {
        return Err(ParseRefusal::TooManyNodes);
    }
    Ok(parsed)
}

/// What a visitor says about the node it was shown.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Visit {
    /// Go on to its children.
    Into,
    /// Leave its children unvisited.
    Over,
    /// Stop the whole walk.
    Stop,
}

/// Visits `root` and everything below it, parents before children, in source order, with a
/// cursor instead of recursion: a file nested ten thousand brackets deep costs the same stack as
/// a flat one.
pub fn walk<'tree>(root: Node<'tree>, mut visit: impl FnMut(Node<'tree>) -> Visit) {
    let mut cursor = root.walk();
    'tree: loop {
        let node = cursor.node();
        match visit(node) {
            Visit::Stop => return,
            Visit::Into => {
                if cursor.goto_first_child() {
                    continue;
                }
            }
            Visit::Over => {}
        }
        loop {
            if cursor.node() == root {
                break 'tree;
            }
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                break 'tree;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIMITS: ParseLimits = ParseLimits::for_imports(2 * 1024 * 1024);

    fn node_kinds(parsed: &ParsedSource<'_>) -> usize {
        let mut count = 0;
        walk(parsed.root(), |_| {
            count += 1;
            Visit::Into
        });
        count
    }

    #[test]
    fn ten_thousand_nested_brackets_are_parsed_and_read_without_recursion() {
        let nested = format!("{}1{}", "[".repeat(10_000), "]".repeat(10_000));
        let source = format!("import x from './a';\nconst deep = {nested};\n");
        let parsed = parse_bounded(SourceLanguage::TypeScript, &source, LIMITS).expect("parsed");
        assert!(node_kinds(&parsed) > 10_000);
        drop(parsed);
    }

    #[test]
    fn a_five_megabyte_line_is_refused_before_the_parser_sees_it() {
        let line = format!("const s = '{}';", "x".repeat(5 * 1024 * 1024));
        assert!(matches!(
            parse_bounded(SourceLanguage::JavaScript, &line, LIMITS),
            Err(ParseRefusal::TooLarge)
        ));
    }

    #[test]
    fn bytes_posing_as_source_are_binary_not_syntax() {
        let bytes: Vec<u8> = (0..4096u32).map(|index| (index % 251) as u8).collect();
        let text = String::from_utf8_lossy(&bytes).into_owned();
        assert!(text.contains('\0'));
        assert!(matches!(
            parse_bounded(SourceLanguage::TypeScript, &text, LIMITS),
            Err(ParseRefusal::Binary)
        ));
    }

    #[test]
    fn a_tree_with_more_nodes_than_the_budget_is_dropped() {
        let source = "a;".repeat(5_000);
        let tight = ParseLimits {
            max_nodes: 1_000,
            ..LIMITS
        };
        assert!(matches!(
            parse_bounded(SourceLanguage::JavaScript, &source, tight),
            Err(ParseRefusal::TooManyNodes)
        ));
        assert!(parse_bounded(SourceLanguage::JavaScript, &source, LIMITS).is_ok());
    }

    #[test]
    fn a_parse_that_outruns_its_time_is_stopped() {
        let source = format!("const a = [{}];", "[1,2,3],".repeat(200_000));
        let none = ParseLimits {
            time: Duration::ZERO,
            max_bytes: usize::MAX,
            ..LIMITS
        };
        assert!(matches!(
            parse_bounded(SourceLanguage::JavaScript, &source, none),
            Err(ParseRefusal::TookTooLong)
        ));
    }

    #[test]
    fn a_leading_byte_order_mark_is_not_source() {
        let parsed = parse_bounded(
            SourceLanguage::JavaScript,
            "\u{feff}import a from 'b';",
            LIMITS,
        )
        .expect("parsed");
        assert!(!parsed.root().has_error());
    }
}
