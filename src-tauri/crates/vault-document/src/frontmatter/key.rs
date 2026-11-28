//! The name of a frontmatter key. Every node of a vault repeats the same dozen names (`uid`,
//! `kind`, `title`, ...), so a name the vault format defines is the program's own text and costs a
//! document nothing; only a name a person invented is stored with the document.

use std::borrow::Cow;
use std::fmt;
use std::ops::Deref;

use serde::{Serialize, Serializer};

/// The names the vault format and its writers use, sorted for a binary search.
const KNOWN_NAMES: [&str; 46] = [
    "aliases",
    "canvasPosition",
    "capabilities",
    "cite",
    "contains",
    "created_at",
    "created_by",
    "dependencies",
    "dependency_usages",
    "depends_on",
    "describes",
    "description",
    "display_en",
    "display_ja",
    "display_ko",
    "display_zh",
    "domain",
    "domains",
    "elements",
    "evidence",
    "evidence_checked",
    "exclude_paths",
    "kind",
    "merged_uids",
    "name",
    "path",
    "patterns",
    "profile_slug",
    "profile_uid",
    "project_uid",
    "relates",
    "relation_notes",
    "review_note",
    "review_state",
    "reviewed_at",
    "reviewed_by",
    "reviewed_digest",
    "scope_paths",
    "slug",
    "source",
    "sources",
    "status",
    "summary",
    "symbol",
    "title",
    "uid",
];

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct Key(Cow<'static, str>);

impl Key {
    pub fn new(name: &str) -> Self {
        match KNOWN_NAMES.binary_search(&name) {
            Ok(at) => Self(Cow::Borrowed(
                KNOWN_NAMES.get(at).copied().unwrap_or_default(),
            )),
            Err(_) => Self(Cow::Owned(name.to_string())),
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Deref for Key {
    type Target = str;

    fn deref(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for Key {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl PartialEq<str> for Key {
    fn eq(&self, other: &str) -> bool {
        *self.0 == *other
    }
}

impl PartialEq<&str> for Key {
    fn eq(&self, other: &&str) -> bool {
        *self.0 == **other
    }
}

impl fmt::Display for Key {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl fmt::Debug for Key {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&*self.0, formatter)
    }
}

impl Serialize for Key {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_known_names_are_sorted_so_each_is_found() {
        assert!(KNOWN_NAMES.windows(2).all(|pair| pair[0] < pair[1]));
        for name in KNOWN_NAMES {
            assert!(matches!(Key::new(name).0, Cow::Borrowed(_)), "{name}");
        }
        assert!(matches!(Key::new("my_own_key").0, Cow::Owned(_)));
    }
}
