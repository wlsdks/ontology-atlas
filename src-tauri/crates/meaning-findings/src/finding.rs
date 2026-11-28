//! One thing a vault's node claims that the rest of the vault or its source does not back.

/// A finding about a node: a code an agent branches on, the node and the frontmatter key it is
/// about, what it names, and the sentence that says what to do. Every finding is advisory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub code: &'static str,
    pub slug: String,
    pub key: String,
    pub refs: Vec<String>,
    pub count: usize,
    pub message: String,
}
