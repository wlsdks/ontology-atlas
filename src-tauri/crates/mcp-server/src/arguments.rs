//! The arguments of a `tools/call`, kept as the JSON the agent sent.
//!
//! Each argument stays unread text until a handler asks for it as a type, so the server never builds
//! a tree of what an agent nested: a request nested a million deep costs the same to hold as a
//! shallow one. A handler reads the arguments it knows with [`Arguments::read`] or all of them into
//! one `#[derive(Deserialize)]` struct with [`Arguments::read_all`]; `serde_json` refuses nesting
//! deeper than 128 there, and the handler answers that as an invalid argument.

use answer_format::json::to_string;
use answer_format::OrderedMap;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::value::RawValue;

use crate::json_text::{string_value, Kind};

/// The members of the `arguments` object, in the order JavaScript would list them.
#[derive(Debug, Default, Serialize)]
pub struct Arguments(OrderedMap<Box<RawValue>>);

impl Arguments {
    pub fn from_fields(fields: OrderedMap<Box<RawValue>>) -> Self {
        Self(fields)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.0.keys()
    }

    pub fn get(&self, key: &str) -> Option<&RawValue> {
        self.0.get(key).map(|raw| &**raw)
    }

    /// The argument as text, when it is a string.
    pub fn string(&self, key: &str) -> Option<String> {
        let raw = self.get(key)?;
        (Kind::of(raw) == Kind::String)
            .then(|| string_value(raw))
            .flatten()
    }

    /// One argument as `T`; `None` when it was not sent.
    pub fn read<T: DeserializeOwned>(&self, key: &str) -> Option<Result<T, serde_json::Error>> {
        self.get(key).map(|raw| serde_json::from_str(raw.get()))
    }

    /// Every argument as one struct.
    pub fn read_all<T: DeserializeOwned>(&self) -> Result<T, serde_json::Error> {
        let text = to_string(&self.0)?;
        serde_json::from_str(&text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(text: &str) -> Arguments {
        Arguments::from_fields(serde_json::from_str(text).expect("reads"))
    }

    #[test]
    fn arguments_keep_what_was_sent_and_list_integer_keys_first() {
        let arguments = arguments(r#"{"b":{"deep":[1,2]},"2":"two","a":null}"#);
        assert_eq!(arguments.keys().collect::<Vec<_>>(), ["2", "b", "a"]);
        assert_eq!(arguments.string("2").as_deref(), Some("two"));
        assert_eq!(arguments.string("b"), None);
        assert_eq!(
            arguments.get("b").map(RawValue::get),
            Some(r#"{"deep":[1,2]}"#)
        );
        assert!(!arguments.is_empty());
    }

    #[test]
    fn a_handler_reads_one_argument_or_all_of_them_as_a_type() {
        #[derive(serde::Deserialize)]
        struct Wanted {
            limit: u32,
            domain: Option<String>,
        }
        let arguments = arguments(r#"{"limit":3,"domain":"pay"}"#);
        assert_eq!(
            arguments
                .read::<u32>("limit")
                .expect("sent")
                .expect("a number"),
            3
        );
        assert!(arguments.read::<u32>("offset").is_none());
        assert!(arguments.read::<u32>("domain").expect("sent").is_err());
        let wanted: Wanted = arguments.read_all().expect("reads");
        assert_eq!((wanted.limit, wanted.domain.as_deref()), (3, Some("pay")));
    }
}
