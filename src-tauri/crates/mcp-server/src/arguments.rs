//! The arguments of a `tools/call`, kept as the JSON the agent sent.
//!
//! Each argument stays unread text until a handler asks for it as a type, so the server never builds
//! a tree of what an agent nested: a request nested a million deep costs the same to hold as a
//! shallow one. A handler reads the arguments it knows with [`Arguments::read`] or all of them into
//! one `#[derive(Deserialize)]` struct with [`Arguments::read_all`]. `serde_json` reads nesting no
//! deeper than 128 levels, and a deeper argument is refused there as an invalid argument that names
//! it, like any other value of the wrong shape.

use indexmap::map::Iter;
use indexmap::IndexMap;
use serde::de::value::{Error as ValueError, MapAccessDeserializer};
use serde::de::{DeserializeOwned, DeserializeSeed, Error as _, IntoDeserializer, MapAccess};
use serde::{Serialize, Serializer};
use serde_json::value::RawValue;

use crate::error::ToolError;
use crate::raw_json::{elements, string_value, Kind};

/// The members of the `arguments` object, in the order the agent sent them.
#[derive(Debug, Default)]
pub struct Arguments {
    fields: IndexMap<String, Box<RawValue>>,
    /// The arguments that held half of a surrogate pair, which the server refuses before any
    /// handler runs ([`Arguments::first_malformed`]).
    malformed: Vec<String>,
}

impl Arguments {
    pub fn from_fields(fields: IndexMap<String, Box<RawValue>>) -> Self {
        Self {
            fields,
            malformed: Vec::new(),
        }
    }

    #[must_use]
    pub fn with_malformed(mut self, names: Vec<String>) -> Self {
        self.malformed = names;
        self
    }

    /// Takes `key` out of the arguments, as if it had not been sent.
    pub fn remove(&mut self, key: &str) {
        self.fields.shift_remove(key);
    }

    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.fields.keys().map(String::as_str)
    }

    pub fn get(&self, key: &str) -> Option<&RawValue> {
        self.fields.get(key).map(|raw| &**raw)
    }

    /// The first argument, in the order sent, that held half of a surrogate pair.
    pub fn first_malformed(&self) -> Option<&str> {
        self.keys()
            .find(|key| self.malformed.iter().any(|name| name == key))
    }

    /// The argument as text, when it is a string.
    pub fn string(&self, key: &str) -> Option<String> {
        let raw = self.get(key)?;
        (Kind::of(raw) == Kind::String)
            .then(|| string_value(raw))
            .flatten()
    }

    /// The elements of the argument when it is an array, each left as text.
    pub fn elements(&self, key: &str) -> Option<Vec<&RawValue>> {
        elements(self.get(key)?)
    }

    /// Whether the call asks for no change: `dryRun` or `dry_run` is the boolean `true`. Any other
    /// value, `"true"` or `1`, is not a dry run, as a write tool reads it.
    pub fn is_dry_run(&self) -> bool {
        ["dryRun", "dry_run"]
            .iter()
            .any(|key| self.get(key).is_some_and(|raw| raw.get() == "true"))
    }

    /// One argument as `T`: `None` when it was not sent, and an invalid-argument failure naming it
    /// when it is not a `T`.
    pub fn read<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, ToolError> {
        let Some(raw) = self.get(key) else {
            return Ok(None);
        };
        serde_json::from_str(raw.get()).map(Some).map_err(|error| {
            ToolError::invalid(format!(
                "Argument \"{key}\" is not valid: {}.",
                without_position(&error)
            ))
        })
    }

    /// Every argument as one struct; an invalid-argument failure names the argument that is not
    /// the type its field expects, or the field that is missing.
    pub fn read_all<T: DeserializeOwned>(&self) -> Result<T, ToolError> {
        let members = Members {
            entries: self.fields.iter(),
            current: None,
        };
        T::deserialize(MapAccessDeserializer::new(members))
            .map_err(|error| ToolError::invalid(format!("Invalid arguments: {error}.")))
    }
}

impl Serialize for Arguments {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.fields.serialize(serializer)
    }
}

/// What a `serde_json` failure says, without the line and column of the text it was reading.
fn without_position(error: &serde_json::Error) -> String {
    let text = error.to_string();
    match text.rsplit_once(" at line ") {
        Some((message, _)) => message.to_string(),
        None => text,
    }
}

/// The arguments as the map a struct is read from, each value read on its own so a failure can say
/// which argument it was.
struct Members<'a> {
    entries: Iter<'a, String, Box<RawValue>>,
    current: Option<(&'a str, &'a RawValue)>,
}

impl<'a> MapAccess<'a> for Members<'a> {
    type Error = ValueError;

    fn next_key_seed<K: DeserializeSeed<'a>>(
        &mut self,
        seed: K,
    ) -> Result<Option<K::Value>, Self::Error> {
        let Some((key, raw)) = self.entries.next() else {
            return Ok(None);
        };
        self.current = Some((key.as_str(), &**raw));
        seed.deserialize(key.as_str().into_deserializer()).map(Some)
    }

    fn next_value_seed<V: DeserializeSeed<'a>>(
        &mut self,
        seed: V,
    ) -> Result<V::Value, Self::Error> {
        let (key, raw) = self
            .current
            .take()
            .ok_or_else(|| ValueError::custom("a value with no argument name"))?;
        seed.deserialize(&mut serde_json::Deserializer::from_str(raw.get()))
            .map_err(|error| {
                ValueError::custom(format!(
                    "argument \"{key}\" is not valid: {}",
                    without_position(&error)
                ))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(text: &str) -> Arguments {
        Arguments::from_fields(serde_json::from_str(text).expect("reads"))
    }

    #[test]
    fn a_handler_reads_one_argument_or_all_of_them_as_a_type() {
        #[derive(serde::Deserialize)]
        struct Wanted {
            limit: u32,
            domain: Option<String>,
        }
        let arguments = arguments(r#"{"limit":3,"domain":"pay"}"#);
        assert_eq!(arguments.read::<u32>("limit").expect("reads"), Some(3));
        assert_eq!(arguments.read::<u32>("offset").expect("reads"), None);
        let wanted: Wanted = arguments.read_all().expect("reads");
        assert_eq!((wanted.limit, wanted.domain.as_deref()), (3, Some("pay")));
    }

    #[test]
    fn an_argument_of_the_wrong_type_is_refused_by_name() {
        #[derive(Debug, serde::Deserialize)]
        struct Wanted {
            #[allow(dead_code, reason = "read only through its failure")]
            limit: u32,
        }
        let arguments = arguments(r#"{"limit":"3"}"#);
        let error = arguments.read::<u32>("limit").expect_err("refused");
        assert_eq!(error.code(), crate::error::ErrorCode::InvalidArguments);
        assert_eq!(
            error.message(),
            "Argument \"limit\" is not valid: invalid type: string \"3\", expected u32."
        );
        let error = arguments.read_all::<Wanted>().expect_err("refused");
        assert_eq!(error.code(), crate::error::ErrorCode::InvalidArguments);
        assert_eq!(
            error.message(),
            "Invalid arguments: argument \"limit\" is not valid: invalid type: string \"3\", expected u32."
        );
        let missing = self::arguments("{}")
            .read_all::<Wanted>()
            .expect_err("refused");
        assert_eq!(
            missing.message(),
            "Invalid arguments: missing field `limit`."
        );
    }

    #[test]
    fn an_argument_nested_past_the_depth_serde_reads_is_refused_by_name() {
        let depth = 200;
        let nested = format!("{}{}", "[".repeat(depth), "]".repeat(depth));
        let arguments = arguments(&format!(r#"{{"tree":{nested}}}"#));
        let error = arguments
            .read::<serde_json::Value>("tree")
            .expect_err("refused");
        assert_eq!(
            error.message(),
            "Argument \"tree\" is not valid: recursion limit exceeded."
        );
        #[derive(Debug, serde::Deserialize)]
        struct Tree {
            #[allow(dead_code, reason = "read only through its failure")]
            tree: serde_json::Value,
        }
        let error = arguments.read_all::<Tree>().expect_err("refused");
        assert!(
            error.message().contains("argument \"tree\""),
            "{}",
            error.message()
        );
        assert!(error.message().contains("recursion limit exceeded"));
    }
}
