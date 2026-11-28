//! The arguments of a call as a plan states them: each with the value the operation will use, in
//! a fixed order, so the same call is always described in the same words.

use serde::ser::{Serialize, SerializeMap, Serializer};

#[derive(Debug, Clone, PartialEq)]
pub enum ArgumentValue {
    Absent,
    Text(String),
    Count(usize),
    Flag(bool),
    Names(Vec<String>),
}

impl Serialize for ArgumentValue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Absent => serializer.serialize_none(),
            Self::Text(text) => serializer.serialize_str(text),
            Self::Count(count) => serializer.serialize_u64(*count as u64),
            Self::Flag(flag) => serializer.serialize_bool(*flag),
            Self::Names(names) => names.serialize(serializer),
        }
    }
}

impl ArgumentValue {
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text(text.into())
    }

    pub fn names(names: &[&str]) -> Self {
        Self::Names(names.iter().map(|name| (*name).to_string()).collect())
    }

    pub fn of_count(count: Option<usize>) -> Self {
        count.map_or(Self::Absent, Self::Count)
    }

    pub fn of_flag(flag: Option<bool>) -> Self {
        flag.map_or(Self::Absent, Self::Flag)
    }

    pub fn of_text(text: Option<&str>) -> Self {
        text.map_or(Self::Absent, Self::text)
    }

    fn is_absent(&self) -> bool {
        matches!(self, Self::Absent)
    }
}

/// Named values in the order they were first put.
#[derive(Debug, Clone, Default)]
pub struct PlannedArguments(Vec<(&'static str, ArgumentValue)>);

impl PlannedArguments {
    /// Sets `name`, keeping its place if it was put before.
    pub fn put(&mut self, name: &'static str, value: ArgumentValue) {
        match self.0.iter_mut().find(|(known, _)| *known == name) {
            Some(entry) => entry.1 = value,
            None => self.0.push((name, value)),
        }
    }

    pub fn get(&self, name: &str) -> Option<&ArgumentValue> {
        self.0
            .iter()
            .find(|(known, _)| *known == name)
            .map(|(_, value)| value)
    }

    pub fn count(&self, name: &str) -> Option<usize> {
        match self.get(name) {
            Some(ArgumentValue::Count(count)) => Some(*count),
            _ => None,
        }
    }

    pub fn has_names(&self, name: &str) -> bool {
        matches!(self.get(name), Some(ArgumentValue::Names(names)) if !names.is_empty())
    }
}

impl Serialize for PlannedArguments {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (name, value) in &self.0 {
            map.serialize_entry(name, value)?;
        }
        map.end()
    }
}

/// The arguments a suggested call may carry, in the order it writes them. `types` closes the list.
const SUGGESTED_ORDER: [&str; 17] = [
    "slug",
    "from",
    "to",
    "project",
    "direction",
    "depth",
    "maxHops",
    "limit",
    "kind",
    "domain",
    "hasIncoming",
    "hasOutgoing",
    "sort",
    "includeExternal",
    "includeUnresolved",
    "pattern",
    "types",
];

/// A call an agent can send as it is: the operation and the arguments that were set.
#[derive(Debug, Clone)]
pub struct SuggestedCall {
    operation: &'static str,
    arguments: PlannedArguments,
}

impl SuggestedCall {
    /// The call of `operation` with every argument of `planned` that is set and that a call may
    /// carry; an empty `types` is left out.
    pub fn of(operation: &'static str, planned: &PlannedArguments) -> Self {
        let mut arguments = PlannedArguments::default();
        for name in SUGGESTED_ORDER {
            match planned.get(name) {
                None => {}
                Some(value) if value.is_absent() => {}
                Some(ArgumentValue::Names(names)) if names.is_empty() => {}
                Some(value) => arguments.put(name, value.clone()),
            }
        }
        Self {
            operation,
            arguments,
        }
    }

    pub fn arguments(&self) -> &PlannedArguments {
        &self.arguments
    }

    pub fn operation(&self) -> &'static str {
        self.operation
    }
}

impl Serialize for SuggestedCall {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.arguments.0.len() + 1))?;
        map.serialize_entry("operation", self.operation)?;
        for (name, value) in &self.arguments.0 {
            map.serialize_entry(name, value)?;
        }
        map.end()
    }
}
