//! A vault's nodes and the edges between them, compiled once from its documents and then only
//! read. Nodes are listed in slug order and edges in edge order, and a node or an edge is named by
//! its place in that list, so a query walks numbers and writes names only when it answers.

use std::borrow::Cow;
use std::cmp::Ordering;

use answer_format::collation::compare_text;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use vault_document::frontmatter::Value;
use vault_document::LoadedDocument;

use crate::compile_issue::CompileIssue;

/// A node's place in [`CompiledGraph::nodes`]: the nodes are in slug order, so ids compare as slugs
/// do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct NodeId(u32);

/// An edge's place in [`CompiledGraph::edges`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct EdgeId(u32);

impl NodeId {
    pub(crate) fn from_index(index: usize) -> Self {
        Self(u32::try_from(index).unwrap_or(u32::MAX))
    }

    pub fn index(self) -> usize {
        self.0 as usize
    }
}

impl EdgeId {
    pub(crate) fn from_index(index: usize) -> Self {
        Self(u32::try_from(index).unwrap_or(u32::MAX))
    }

    pub fn index(self) -> usize {
        self.0 as usize
    }
}

/// One document with a `kind:`, as the graph holds it.
///
/// A node reads its fields from the document it was made of, which the document cache already
/// holds: fifty thousand nodes keep a handle each, not a second copy of every name.
#[derive(Debug, Clone)]
pub struct Node {
    document: LoadedDocument,
    merged_uids: Box<[String]>,
    pub mtime: f64,
    pub out_degree: u32,
    pub in_degree: u32,
}

impl Node {
    pub(crate) fn new(document: &LoadedDocument, merged_uids: Vec<String>, mtime: f64) -> Self {
        Self {
            document: document.clone(),
            merged_uids: merged_uids.into(),
            mtime,
            out_degree: 0,
            in_degree: 0,
        }
    }

    pub fn uid(&self) -> &str {
        match self.document.frontmatter().get("uid") {
            Some(Value::Text(text)) => text,
            _ => "",
        }
    }

    /// The uids this node absorbed, sorted by UTF-16 code unit.
    pub fn merged_uids(&self) -> &[String] {
        &self.merged_uids
    }

    pub fn slug(&self) -> &str {
        self.document.slug()
    }

    pub fn kind(&self) -> &str {
        self.document.frontmatter().text("kind").unwrap_or_default()
    }

    /// `title`, else `name`, else the slug, as the file holds the value.
    pub fn title(&self) -> Cow<'_, Value> {
        let frontmatter = self.document.frontmatter();
        match frontmatter
            .truthy("title")
            .or_else(|| frontmatter.truthy("name"))
        {
            Some(value) => Cow::Borrowed(value),
            None => Cow::Owned(Value::Text(self.slug().to_string())),
        }
    }

    pub fn domain(&self) -> Option<&Value> {
        self.document.frontmatter().get("domain")
    }

    pub fn path(&self) -> Option<&str> {
        self.document
            .frontmatter()
            .text("path")
            .filter(|path| !answer_format::whitespace::trim(path).is_empty())
    }

    pub fn degree(&self) -> u32 {
        self.out_degree + self.in_degree
    }

    /// The title as `String(title)` writes it.
    pub fn title_text(&self) -> String {
        self.title().display_text()
    }

    /// The domain when it is text with something in it: what a count by domain and a lookup of the
    /// domain node read.
    pub fn domain_name(&self) -> Option<&str> {
        match self.domain() {
            Some(Value::Text(text)) if !answer_format::whitespace::trim(text).is_empty() => {
                Some(text)
            }
            _ => None,
        }
    }
}

impl Serialize for Node {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("uid", self.uid())?;
        if !self.merged_uids.is_empty() {
            map.serialize_entry("merged_uids", &self.merged_uids)?;
        }
        map.serialize_entry("slug", self.slug())?;
        map.serialize_entry("kind", self.kind())?;
        map.serialize_entry("title", &self.title())?;
        if let Some(domain) = self.domain() {
            map.serialize_entry("domain", domain)?;
        }
        if let Some(path) = self.path() {
            map.serialize_entry("path", path)?;
        }
        map.serialize_entry("mtime", &self.mtime)?;
        map.serialize_entry("outDegree", &self.out_degree)?;
        map.serialize_entry("inDegree", &self.in_degree)?;
        map.end()
    }
}

/// Where an edge ends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    /// A node of the graph.
    Node(NodeId),
    /// A path-like name in `elements:` that no node has: code the vault points at.
    External,
    /// A name no node has.
    Unresolved,
}

/// One reference a node's frontmatter makes.
#[derive(Debug, Clone)]
pub struct Edge {
    pub from: NodeId,
    pub target: Target,
    /// The frontmatter key it came under, `dependencies` for `depends_on:`.
    pub via: &'static str,
    /// The reference as written, trimmed.
    pub reference: String,
    pub rationale: Option<String>,
}

impl Edge {
    pub fn to(&self) -> Option<NodeId> {
        match self.target {
            Target::Node(node) => Some(node),
            Target::External | Target::Unresolved => None,
        }
    }

    pub fn is_resolved(&self) -> bool {
        matches!(self.target, Target::Node(_))
    }

    pub fn is_external(&self) -> bool {
        matches!(self.target, Target::External)
    }

    pub fn is_dangling(&self) -> bool {
        matches!(self.target, Target::Unresolved)
    }
}

/// An edge with the names around it, written as an agent reads edges: `id`, `from` and `to` are
/// slugs, and `to` is the reference as written when no node has it.
pub struct EdgeView<'a> {
    graph: &'a CompiledGraph,
    edge: &'a Edge,
}

impl EdgeView<'_> {
    pub fn from_slug(&self) -> &str {
        self.graph.node(self.edge.from).slug()
    }

    pub fn to_name(&self) -> &str {
        match self.edge.target {
            Target::Node(node) => self.graph.node(node).slug(),
            Target::External | Target::Unresolved => &self.edge.reference,
        }
    }

    /// `from->to:via:ref`.
    pub fn id(&self) -> String {
        format!(
            "{}->{}:{}:{}",
            self.from_slug(),
            self.to_name(),
            self.edge.via,
            self.edge.reference
        )
    }
}

impl Serialize for EdgeView<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("id", &self.id())?;
        map.serialize_entry("from", self.from_slug())?;
        map.serialize_entry("to", self.to_name())?;
        map.serialize_entry("via", self.edge.via)?;
        map.serialize_entry("ref", &self.edge.reference)?;
        map.serialize_entry("resolved", &self.edge.is_resolved())?;
        map.serialize_entry("external", &self.edge.is_external())?;
        if let Some(rationale) = &self.edge.rationale {
            map.serialize_entry("rationale", rationale)?;
        }
        map.end()
    }
}

/// A name that reaches one node, kept in collation order beside its node.
#[derive(Debug, Clone)]
pub(crate) struct AliasEntry {
    alias: Box<str>,
    node: NodeId,
}

impl AliasEntry {
    pub(crate) fn new(alias: &str, node: NodeId) -> Self {
        Self {
            alias: alias.into(),
            node,
        }
    }
}

/// An alias and the slug it reaches, as the indexes and the hash write them.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Alias<'a> {
    pub alias: &'a str,
    pub slug: &'a str,
}

/// The aliases of a graph, in collation order, each read from the node it reaches.
#[derive(Clone, Copy)]
pub struct Aliases<'a> {
    graph: &'a CompiledGraph,
}

impl<'a> Aliases<'a> {
    pub fn len(&self) -> usize {
        self.graph.aliases.len()
    }

    pub fn is_empty(&self) -> bool {
        self.graph.aliases.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = Alias<'a>> + 'a {
        let graph = self.graph;
        graph.aliases.iter().map(move |entry| Alias {
            alias: &entry.alias,
            slug: graph.node(entry.node).slug(),
        })
    }
}

impl Serialize for Aliases<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_seq(self.iter())
    }
}

/// Where in `items` the key is exactly `name`, when `items` are in collation order of their keys.
/// Strings that collate alike but differ sit side by side, so that run is searched.
fn find_exact<T>(items: &[T], name: &str, key: impl Fn(&T) -> &str) -> Option<usize> {
    let start = items.partition_point(|item| compare_text(key(item), name) == Ordering::Less);
    let run = items
        .get(start..)?
        .iter()
        .take_while(|item| compare_text(key(item), name) == Ordering::Equal);
    run.enumerate()
        .find(|(_, item)| key(item) == name)
        .map(|(offset, _)| start + offset)
}

#[derive(Debug, Clone, Serialize)]
pub struct AmbiguousAlias {
    pub alias: String,
    pub slugs: Vec<String>,
}

/// The arrays of one node a write would make canonical (trimmed, once each, in order).
#[derive(Debug, Clone)]
pub struct CanonicalizationAction {
    pub slug: String,
    pub keys: Vec<&'static str>,
    pub frontmatter: Vec<(&'static str, Vec<String>)>,
    pub expected_mtime: f64,
}

impl Serialize for CanonicalizationAction {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(4))?;
        map.serialize_entry("slug", &self.slug)?;
        map.serialize_entry("keys", &self.keys)?;
        map.serialize_entry("frontmatter", &KeyedLists(&self.frontmatter))?;
        map.serialize_entry("expected_mtime", &self.expected_mtime)?;
        map.end()
    }
}

/// A frontmatter patch written as the object it is: each key with its list.
struct KeyedLists<'a>(&'a [(&'static str, Vec<String>)]);

impl Serialize for KeyedLists<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, items) in self.0 {
            map.serialize_entry(key, items)?;
        }
        map.end()
    }
}

/// The counts a compiled graph reports of its edges.
#[derive(Debug, Clone, Copy, Default)]
pub struct EdgeCounts {
    pub resolved: usize,
    pub external: usize,
    pub unresolved: usize,
    /// Distinct references that no node has, counted once however often they are named.
    pub referenced_only: usize,
}

#[derive(Debug)]
pub struct CompiledGraph {
    pub(crate) nodes: Vec<Node>,
    pub(crate) edges: Vec<Edge>,
    pub(crate) aliases: Vec<AliasEntry>,
    pub(crate) ambiguous_aliases: Vec<AmbiguousAlias>,
    pub(crate) issues: Vec<CompileIssue>,
    pub(crate) canonicalization_actions: Vec<CanonicalizationAction>,
    pub(crate) graph_hash: String,
    pub(crate) max_mtime: f64,
    pub(crate) skipped_non_node_count: usize,
    pub(crate) edge_counts: EdgeCounts,
    pub(crate) outgoing: Vec<Vec<EdgeId>>,
    pub(crate) incoming: Vec<Vec<EdgeId>>,
}

impl CompiledGraph {
    pub fn nodes(&self) -> &[Node] {
        &self.nodes
    }

    pub fn edges(&self) -> &[Edge] {
        &self.edges
    }

    pub fn issues(&self) -> &[CompileIssue] {
        &self.issues
    }

    pub fn aliases(&self) -> Aliases<'_> {
        Aliases { graph: self }
    }

    pub fn ambiguous_aliases(&self) -> &[AmbiguousAlias] {
        &self.ambiguous_aliases
    }

    pub fn canonicalization_actions(&self) -> &[CanonicalizationAction] {
        &self.canonicalization_actions
    }

    pub fn graph_hash(&self) -> &str {
        &self.graph_hash
    }

    pub fn max_mtime(&self) -> f64 {
        self.max_mtime
    }

    pub fn skipped_non_node_count(&self) -> usize {
        self.skipped_non_node_count
    }

    pub fn node_ids(&self) -> impl Iterator<Item = NodeId> {
        (0..self.nodes.len()).map(NodeId::from_index)
    }

    pub fn edge_ids(&self) -> impl Iterator<Item = EdgeId> {
        (0..self.edges.len()).map(EdgeId::from_index)
    }

    /// The node `id` names. Ids come only from this graph, so one is always in range.
    #[allow(
        clippy::indexing_slicing,
        reason = "ids are made by this graph from its own lists"
    )]
    pub fn node(&self, id: NodeId) -> &Node {
        &self.nodes[id.index()]
    }

    #[allow(
        clippy::indexing_slicing,
        reason = "ids are made by this graph from its own lists"
    )]
    pub fn edge(&self, id: EdgeId) -> &Edge {
        &self.edges[id.index()]
    }

    pub fn edge_view(&self, id: EdgeId) -> EdgeView<'_> {
        EdgeView {
            graph: self,
            edge: self.edge(id),
        }
    }

    pub fn node_by_slug(&self, slug: &str) -> Option<NodeId> {
        find_exact(&self.nodes, slug, |node| node.slug()).map(NodeId::from_index)
    }

    /// The edges a node declares, in edge order.
    pub fn outgoing(&self, node: NodeId) -> &[EdgeId] {
        self.outgoing
            .get(node.index())
            .map(Vec::as_slice)
            .unwrap_or_default()
    }

    /// The edges that resolve to a node, in edge order.
    pub fn incoming(&self, node: NodeId) -> &[EdgeId] {
        self.incoming
            .get(node.index())
            .map(Vec::as_slice)
            .unwrap_or_default()
    }

    pub fn edge_counts(&self) -> EdgeCounts {
        self.edge_counts
    }

    /// The node a name reaches: its slug, else an alias that names one node only.
    pub fn resolve_name(&self, name: &str) -> Option<NodeId> {
        self.node_by_slug(name).or_else(|| {
            find_exact(&self.aliases, name, |entry| &entry.alias)
                .and_then(|at| self.aliases.get(at))
                .map(|entry| entry.node)
        })
    }
}
