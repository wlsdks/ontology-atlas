//! The JSON of a repository's own configuration (`package.json`, `tsconfig.json`) read with its
//! keys in the order written, which decides which entry point of a package is tried first.
//! `tsconfig.json` is JSON with comments and trailing commas, which its own tool accepts.

use indexmap::IndexMap;
use serde::Deserialize;

/// A JSON value. Numbers are kept as text-less markers because no configuration read here
/// depends on one.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Json {
    Null(()),
    Bool(bool),
    Number(f64),
    Text(String),
    List(Vec<Json>),
    Object(IndexMap<String, Json>),
}

impl Json {
    /// Reads `text`, which must be one JSON value. Nesting deeper than 128 levels is refused by
    /// the reader, so a hostile file cannot overflow the stack.
    pub fn parse(text: &str) -> Option<Self> {
        serde_json::from_str(text).ok()
    }

    /// Reads `text` as JSON with comments and trailing commas.
    pub fn parse_with_comments(text: &str) -> Option<Self> {
        Self::parse(&without_comments_and_trailing_commas(text))
    }

    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Self::Object(members) => members.get(key),
            _ => None,
        }
    }

    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text(text) => Some(text),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&IndexMap<String, Json>> {
        match self {
            Self::Object(members) => Some(members),
            _ => None,
        }
    }

    pub fn as_list(&self) -> Option<&[Json]> {
        match self {
            Self::List(items) => Some(items),
            _ => None,
        }
    }
}

/// `text` with `//` and `/* */` comments and the comma before a closing bracket removed, strings
/// left as written.
fn without_comments_and_trailing_commas(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut characters = text.chars().peekable();
    let mut comma_at: Option<usize> = None;
    while let Some(character) = characters.next() {
        match character {
            '"' => {
                comma_at = None;
                out.push('"');
                while let Some(inner) = characters.next() {
                    out.push(inner);
                    if inner == '\\' {
                        out.extend(characters.next());
                    } else if inner == '"' {
                        break;
                    }
                }
            }
            '/' if characters.peek() == Some(&'/') => {
                for skipped in characters.by_ref() {
                    if skipped == '\n' {
                        out.push('\n');
                        break;
                    }
                }
            }
            '/' if characters.peek() == Some(&'*') => {
                characters.next();
                let mut previous = ' ';
                for skipped in characters.by_ref() {
                    if previous == '*' && skipped == '/' {
                        break;
                    }
                    previous = skipped;
                }
                out.push(' ');
            }
            ',' => {
                comma_at = Some(out.len());
                out.push(',');
            }
            '}' | ']' => {
                if let Some(index) = comma_at.take() {
                    out.replace_range(index..=index, " ");
                }
                out.push(character);
            }
            other => {
                if !other.is_whitespace() {
                    comma_at = None;
                }
                out.push(other);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tsconfig_with_comments_and_trailing_commas_is_read() {
        let text = r#"{
  // the compiler
  "compilerOptions": {
    "baseUrl": ".", /* where paths start */
    "paths": { "@/*": ["src/*",], "url": ["https://x//y"], },
  },
}"#;
        let json = Json::parse_with_comments(text).expect("reads");
        let paths = json
            .get("compilerOptions")
            .and_then(|options| options.get("paths"))
            .and_then(Json::as_object)
            .expect("paths");
        assert_eq!(paths.keys().collect::<Vec<_>>(), ["@/*", "url"]);
        assert_eq!(
            paths.get("url").and_then(Json::as_list).map(<[Json]>::len),
            Some(1)
        );
    }

    #[test]
    fn object_members_keep_the_order_they_were_written_in() {
        let json = Json::parse(r#"{"b":"1","a":{"z":"x","c":"y"}}"#).expect("reads");
        assert_eq!(
            json.as_object().expect("object").keys().collect::<Vec<_>>(),
            ["b", "a"]
        );
    }

    #[test]
    fn nesting_beyond_the_readers_depth_is_refused_not_overflowed() {
        let deep = format!("{}1{}", "[".repeat(100_000), "]".repeat(100_000));
        assert_eq!(Json::parse(&deep), None);
    }
}
