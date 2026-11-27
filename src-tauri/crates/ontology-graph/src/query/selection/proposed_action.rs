//! The write an answer proposes: a tool and the arguments an agent would send it. The answer only
//! proposes; an agent still asks a person before it writes.

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use vault_document::frontmatter::Value;

#[derive(Debug, Clone, Serialize)]
pub struct RelationRow {
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub relation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConceptRow {
    pub slug: String,
    pub kind: &'static str,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// The arrays of one node a patch makes canonical, each key with its list.
#[derive(Debug, Clone)]
pub struct FrontmatterPatch(pub Vec<(&'static str, Vec<String>)>);

impl Serialize for FrontmatterPatch {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, items) in &self.0 {
            map.serialize_entry(key, items)?;
        }
        map.end()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum ActionArguments {
    Relations {
        relations: Vec<RelationRow>,
    },
    Concepts {
        concepts: Vec<ConceptRow>,
    },
    Patch {
        slug: String,
        frontmatter: FrontmatterPatch,
        expected_mtime: f64,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct ProposedAction {
    pub tool: &'static str,
    pub args: ActionArguments,
}

impl ProposedAction {
    pub fn add_relation(from: &str, to: &str, relation: &str) -> Self {
        Self {
            tool: "add_relations",
            args: ActionArguments::Relations {
                relations: vec![RelationRow {
                    from: from.to_string(),
                    to: to.to_string(),
                    relation: relation.to_string(),
                }],
            },
        }
    }

    pub fn add_concept(concept: ConceptRow) -> Self {
        Self {
            tool: "add_concepts",
            args: ActionArguments::Concepts {
                concepts: vec![concept],
            },
        }
    }
}
