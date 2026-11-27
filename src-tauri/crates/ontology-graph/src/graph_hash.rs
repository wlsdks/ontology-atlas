//! The hash that says whether a graph is the one an agent last read: the SHA-256 of what makes the
//! graph, written as JSON and hashed as it is written, so a vault of fifty thousand nodes is never
//! held a second time as text.

use std::io;

use serde::ser::{SerializeMap, SerializeSeq};
use serde::{Serialize, Serializer};
use sha2::{Digest, Sha256};

use crate::compiled_graph::CompiledGraph;

/// Bumped when what the hash covers changes, so the hash of a changed definition never equals one
/// of the old.
pub const COMPILER_VERSION: u32 = 2;

struct HashWriter(Sha256);

impl io::Write for HashWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

struct Covered<'a>(&'a CompiledGraph);

struct CoveredNodes<'a>(&'a CompiledGraph);

struct CoveredNode<'a>(&'a crate::compiled_graph::Node);

struct CoveredEdges<'a>(&'a CompiledGraph);

impl Serialize for Covered<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(6))?;
        map.serialize_entry("version", &COMPILER_VERSION)?;
        map.serialize_entry("nodes", &CoveredNodes(self.0))?;
        map.serialize_entry("edges", &CoveredEdges(self.0))?;
        map.serialize_entry("aliases", self.0.aliases())?;
        map.serialize_entry("ambiguousAliases", self.0.ambiguous_aliases())?;
        map.serialize_entry("issues", self.0.issues())?;
        map.end()
    }
}

impl Serialize for CoveredNodes<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut seq = serializer.serialize_seq(Some(self.0.nodes().len()))?;
        for node in self.0.nodes() {
            seq.serialize_element(&CoveredNode(node))?;
        }
        seq.end()
    }
}

impl Serialize for CoveredNode<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let node = self.0;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("uid", &node.uid)?;
        if !node.merged_uids.is_empty() {
            map.serialize_entry("merged_uids", &node.merged_uids)?;
        }
        map.serialize_entry("slug", &node.slug)?;
        map.serialize_entry("kind", &node.kind)?;
        map.serialize_entry("title", &node.title)?;
        if let Some(domain) = &node.domain {
            map.serialize_entry("domain", domain)?;
        }
        map.serialize_entry("outDegree", &node.out_degree)?;
        map.serialize_entry("inDegree", &node.in_degree)?;
        map.end()
    }
}

impl Serialize for CoveredEdges<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut seq = serializer.serialize_seq(Some(self.0.edges().len()))?;
        for id in self.0.edge_ids() {
            seq.serialize_element(&self.0.edge_view(id))?;
        }
        seq.end()
    }
}

/// The hash of `graph`, in lowercase hex. The graph's own hash field is not part of it.
pub(crate) fn hash_graph(graph: &CompiledGraph) -> String {
    let mut writer = HashWriter(Sha256::new());
    // A graph made of text and numbers always writes.
    let _ = answer_format::json::to_writer(&mut writer, &Covered(graph));
    let digest = writer.0.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        hex.push(char::from_digit(u32::from(byte >> 4), 16).unwrap_or('0'));
        hex.push(char::from_digit(u32::from(byte & 15), 16).unwrap_or('0'));
    }
    hex
}
