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
    /// The parse's own budget, kept for the readers: reading a tree is bounded by it too.
    deadline: Instant,
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

    /// Visits every node below the root as [`walk`] does, and gives up with
    /// [`ParseRefusal::TookTooLong`] once the time the parse was allowed has passed: reading a
    /// tree is bounded by the budget the parse was.
    pub fn walk<'tree>(
        &'tree self,
        enter: impl FnMut(Node<'tree>) -> Visit,
    ) -> Result<(), ParseRefusal> {
        walk_nodes(self.root(), Some(self.deadline), &mut EnterOnly(enter))
    }

    /// [`Self::walk`] for a reader that also needs to be told when a node is left.
    pub fn walk_scoped<'tree>(
        &'tree self,
        visitor: &mut impl ScopedVisitor<'tree>,
    ) -> Result<(), ParseRefusal> {
        walk_nodes(self.root(), Some(self.deadline), visitor)
    }

    /// The same source with its time gone, so a test sees what a reader does at the deadline.
    #[cfg(test)]
    pub(crate) fn with_time_gone(mut self) -> Self {
        self.deadline = Instant::now();
        self
    }

    /// Whether the time the parse was allowed is gone, for a reader that loops without a walk.
    pub fn out_of_time(&self) -> bool {
        Instant::now() >= self.deadline
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
        deadline,
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
pub fn walk<'tree>(root: Node<'tree>, enter: impl FnMut(Node<'tree>) -> Visit) {
    let _ = walk_nodes(root, None, &mut EnterOnly(enter));
}

/// A reader that keeps what the ancestors of the node in front of it say. A node's ancestors are
/// the nodes entered and not yet left; asking the tree for a parent instead costs the depth of
/// the node each time, which makes a file of nested imports cubic.
pub trait ScopedVisitor<'tree> {
    fn enter(&mut self, node: Node<'tree>) -> Visit;

    /// Called after the last child of every node `enter` was shown (at once for one whose
    /// children were skipped), and for none when the walk stops.
    fn leave(&mut self, node: Node<'tree>);
}

struct EnterOnly<Enter>(Enter);

impl<'tree, Enter: FnMut(Node<'tree>) -> Visit> ScopedVisitor<'tree> for EnterOnly<Enter> {
    fn enter(&mut self, node: Node<'tree>) -> Visit {
        (self.0)(node)
    }

    fn leave(&mut self, _node: Node<'tree>) {}
}

/// How many nodes pass between two looks at the clock.
const NODES_PER_CLOCK_LOOK: u32 = 256;

fn walk_nodes<'tree>(
    root: Node<'tree>,
    deadline: Option<Instant>,
    visitor: &mut impl ScopedVisitor<'tree>,
) -> Result<(), ParseRefusal> {
    let mut cursor = root.walk();
    let mut until_clock_look = NODES_PER_CLOCK_LOOK;
    loop {
        until_clock_look -= 1;
        if until_clock_look == 0 {
            until_clock_look = NODES_PER_CLOCK_LOOK;
            if deadline.is_some_and(|deadline| Instant::now() >= deadline) {
                return Err(ParseRefusal::TookTooLong);
            }
        }
        match visitor.enter(cursor.node()) {
            Visit::Stop => return Ok(()),
            Visit::Into => {
                if cursor.goto_first_child() {
                    continue;
                }
            }
            Visit::Over => {}
        }
        loop {
            visitor.leave(cursor.node());
            if cursor.node() == root {
                return Ok(());
            }
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                return Ok(());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIMITS: ParseLimits = ParseLimits::for_imports(2 * 1024 * 1024);

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

    struct Ancestry<'tree> {
        open: Vec<Node<'tree>>,
        parents_agree: bool,
        left: usize,
        entered: usize,
    }

    impl<'tree> ScopedVisitor<'tree> for Ancestry<'tree> {
        fn enter(&mut self, node: Node<'tree>) -> Visit {
            self.entered += 1;
            self.parents_agree &= node.parent() == self.open.last().copied();
            self.open.push(node);
            if node.kind() == "array" && self.entered.is_multiple_of(2) {
                Visit::Over
            } else {
                Visit::Into
            }
        }

        fn leave(&mut self, node: Node<'tree>) {
            self.left += 1;
            self.parents_agree &= self.open.pop() == Some(node);
        }
    }

    #[test]
    fn the_nodes_entered_and_not_yet_left_are_the_ancestors_of_the_next_one() {
        let parsed = parse_bounded(
            SourceLanguage::JavaScript,
            "const a = [[1, [2]], {b: [3]}];\nf([4], [[5]]);",
            LIMITS,
        )
        .expect("parsed");
        let mut ancestry = Ancestry {
            open: Vec::new(),
            parents_agree: true,
            left: 0,
            entered: 0,
        };
        parsed.walk_scoped(&mut ancestry).expect("in time");
        assert!(ancestry.parents_agree);
        assert!(ancestry.open.is_empty());
        assert_eq!(ancestry.left, ancestry.entered);
        assert!(ancestry.entered > 20);
    }

    #[test]
    fn a_walk_that_outruns_the_time_the_parse_had_says_so() {
        let source = "a;".repeat(5_000);
        let parsed = parse_bounded(SourceLanguage::JavaScript, &source, LIMITS)
            .expect("parsed")
            .with_time_gone();
        assert_eq!(parsed.walk(|_| Visit::Into), Err(ParseRefusal::TookTooLong));
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
