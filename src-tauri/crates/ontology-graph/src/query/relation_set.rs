//! The relation names a call may filter by, and the one name each edge carries internally.

use crate::query::query_error::QueryError;

/// The names a call may use: `dependencies` and its alias `depends_on` are one relation.
pub const RELATION_TYPE_VALUES: [&str; 9] = [
    "domains",
    "domain",
    "capabilities",
    "elements",
    "dependencies",
    "depends_on",
    "relates",
    "contains",
    "describes",
];

/// The name an agent writes for the relation an edge carries.
pub fn public_relation_type(via: &'static str) -> &'static str {
    if via == "dependencies" {
        "depends_on"
    } else {
        via
    }
}

fn internal_name(name: &str) -> Option<&'static str> {
    match name {
        "domains" => Some("domains"),
        "domain" => Some("domain"),
        "capabilities" => Some("capabilities"),
        "elements" => Some("elements"),
        "dependencies" | "depends_on" => Some("dependencies"),
        "relates" => Some("relates"),
        "contains" => Some("contains"),
        "describes" => Some("describes"),
        _ => None,
    }
}

/// A set of relations, each once, by the name edges carry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelationSet(Vec<&'static str>);

impl RelationSet {
    /// The relations a call names. An absent list and an empty one both mean every relation. `name`
    /// is the argument, for the refusal.
    pub fn parse(types: Option<&[String]>, name: &str) -> Result<Option<Self>, QueryError> {
        let Some(types) = types else { return Ok(None) };
        if types.is_empty() {
            return Ok(None);
        }
        let mut names: Vec<&'static str> = Vec::new();
        for type_name in types {
            let Some(internal) = internal_name(type_name) else {
                return Err(QueryError::NotAnAllowedValue {
                    name: format!("{name} items"),
                    received: type_name.clone(),
                    allowed: RELATION_TYPE_VALUES.to_vec(),
                });
            };
            if !names.contains(&internal) {
                names.push(internal);
            }
        }
        Ok(Some(Self(names)))
    }

    /// The one relation `dependencies`, which cycle and order queries read by default.
    pub fn dependencies() -> Self {
        Self(vec!["dependencies"])
    }

    /// What `cycles` and `topological_order` read: the relations the call names, else
    /// `dependencies`.
    pub fn dependencies_unless_named(types: Option<&[String]>) -> Result<Option<Self>, QueryError> {
        match types {
            Some(_) => Self::parse(types, "types"),
            None => Ok(Some(Self::dependencies())),
        }
    }

    /// Whether an edge that carries `via` is in the set.
    pub fn allows(&self, via: &str) -> bool {
        self.0.contains(&via)
    }

    /// The names in code unit order, as the answers list them.
    pub fn sorted_names(&self) -> Vec<&'static str> {
        let mut names = self.0.clone();
        names.sort_unstable();
        names
    }
}

/// Whether `via` passes `set`, where no set allows everything.
pub fn allowed(set: Option<&RelationSet>, via: &str) -> bool {
    set.is_none_or(|set| set.allows(via))
}
