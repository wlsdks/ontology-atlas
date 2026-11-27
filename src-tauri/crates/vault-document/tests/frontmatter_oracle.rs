//! Where our frontmatter reader and a YAML 1.2 reader both accept a block, they agree on what it
//! says. `saphyr` is the oracle: it is the one a person would check a surprising file against. The
//! generator writes only the shapes the vault format has (plain, quoted, inline list, block list,
//! literal block), so every disagreement is a defect in one of the two, not a difference of
//! dialect.

use proptest::prelude::*;
use saphyr::{LoadableYamlNode, ScalarOwned, YamlOwned};
use vault_document::frontmatter::Value;
use vault_document::Document;

/// A word that YAML 1.2 reads as text, not as null, a boolean or a number.
fn plain_word() -> impl Strategy<Value = String> {
    "[a-z][a-z ]{0,8}[a-z]".prop_filter("a word YAML reads as something else", |word| {
        !matches!(
            word.as_str(),
            "true" | "false" | "null" | "yes" | "no" | "on" | "off"
        )
    })
}

/// Text that needs quotes: punctuation YAML gives a meaning, edge spaces, other scripts.
fn awkward_text() -> impl Strategy<Value = String> {
    proptest::collection::vec(
        prop_oneof![
            Just("a".to_string()),
            Just(" ".to_string()),
            Just(": ".to_string()),
            Just(" #x".to_string()),
            Just("'".to_string()),
            Just("\"".to_string()),
            Just("\\".to_string()),
            Just(", ".to_string()),
            Just("[x]".to_string()),
            Just("한글".to_string()),
            Just("é".to_string()),
            Just("\u{1f600}".to_string()),
            Just("\t".to_string()),
        ],
        1..6,
    )
    .prop_map(|parts| parts.concat())
}

#[derive(Debug, Clone)]
enum Item {
    Plain(String),
    Double(String),
    Single(String),
}

impl Item {
    fn written(&self) -> String {
        match self {
            Self::Plain(text) => text.clone(),
            Self::Double(text) => {
                format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
            }
            Self::Single(text) => format!("'{text}'"),
        }
    }

    fn text(&self) -> &str {
        match self {
            Self::Plain(text) | Self::Double(text) | Self::Single(text) => text,
        }
    }
}

fn item() -> impl Strategy<Value = Item> {
    prop_oneof![
        plain_word().prop_map(Item::Plain),
        awkward_text().prop_map(Item::Double),
        // Inside single quotes the vault's dialect reads a backslash as an escape and `''` as two
        // quotes; YAML reads neither. `the_vault_dialect_differs_from_yaml_in_three_places` names it.
        awkward_text()
            .prop_filter("a single-quoted text with no quote or backslash", |text| {
                !text.contains('\'') && !text.contains('\\')
            })
            .prop_map(Item::Single),
    ]
}

#[derive(Debug, Clone)]
enum Shape {
    Scalar(Item),
    InlineList(Vec<Item>),
    BlockList { indent: usize, items: Vec<Item> },
    Literal(Vec<String>),
}

fn shape() -> impl Strategy<Value = Shape> {
    prop_oneof![
        item().prop_map(Shape::Scalar),
        proptest::collection::vec(item(), 1..5).prop_map(Shape::InlineList),
        (0usize..3, proptest::collection::vec(item(), 1..5))
            .prop_map(|(indent, items)| Shape::BlockList { indent, items }),
        proptest::collection::vec(plain_word(), 1..4).prop_map(Shape::Literal),
    ]
}

fn written(key: &str, shape: &Shape) -> String {
    match shape {
        Shape::Scalar(item) => format!("{key}: {}\n", item.written()),
        Shape::InlineList(items) => {
            let inner: Vec<String> = items.iter().map(Item::written).collect();
            format!("{key}: [{}]\n", inner.join(", "))
        }
        Shape::BlockList { indent, items } => {
            let pad = " ".repeat(*indent);
            let lines: String = items
                .iter()
                .map(|item| format!("{pad}- {}\n", item.written()))
                .collect();
            format!("{key}:\n{lines}")
        }
        Shape::Literal(lines) => {
            let body: String = lines.iter().map(|line| format!("  {line}\n")).collect();
            format!("{key}: |\n{body}")
        }
    }
}

/// What a block says, in the one form both readers can be asked for.
#[derive(Debug, PartialEq)]
enum Said {
    Text(String),
    List(Vec<String>),
}

fn expected(shape: &Shape) -> Said {
    match shape {
        Shape::Scalar(item) => Said::Text(item.text().to_string()),
        Shape::InlineList(items) | Shape::BlockList { items, .. } => {
            Said::List(items.iter().map(|item| item.text().to_string()).collect())
        }
        Shape::Literal(lines) => Said::Text(lines.join("\n")),
    }
}

fn ours(document: &Document, key: &str) -> Option<Said> {
    match document.frontmatter().get(key)? {
        Value::Text(text) => Some(Said::Text(text.clone())),
        Value::List(items) => Some(Said::List(items.clone())),
        _ => None,
    }
}

fn oracle(yaml: &YamlOwned, key: &str) -> Option<Said> {
    let node = yaml.as_mapping_get(key)?;
    match node {
        YamlOwned::Value(ScalarOwned::String(text)) => Some(Said::Text(text.clone())),
        YamlOwned::Sequence(items) => items
            .iter()
            .map(|item| match item {
                YamlOwned::Value(ScalarOwned::String(text)) => Some(text.clone()),
                _ => None,
            })
            .collect::<Option<Vec<String>>>()
            .map(Said::List),
        _ => None,
    }
}

/// Where the vault's reader is not YAML 1.2, on purpose: the app's reader and the JavaScript server
/// read a block these three ways, and files written by people and by the writers rely on it.
#[test]
fn the_vault_dialect_differs_from_yaml_in_three_places() {
    let block = "a: 'it''s'\nb: |\n  one\nc: >\n  one\n\n  two\n";
    let document = Document::from_text(&format!("---\n{block}---\n"));
    let yaml = YamlOwned::load_from_str(block).expect("valid YAML");
    let root = yaml.first().expect("one document");

    // `''` inside single quotes stays two characters; YAML makes it one.
    assert_eq!(ours(&document, "a"), Some(Said::Text("it''s".to_string())));
    assert_eq!(oracle(root, "a"), Some(Said::Text("it's".to_string())));
    // A literal block loses its final line break; YAML keeps it.
    assert_eq!(ours(&document, "b"), Some(Said::Text("one".to_string())));
    assert_eq!(oracle(root, "b"), Some(Said::Text("one\n".to_string())));
    // A blank line in a folded block stays a blank line; YAML folds it to one line break.
    assert_eq!(
        ours(&document, "c"),
        Some(Said::Text("one\n\ntwo".to_string()))
    );
    assert_eq!(
        oracle(root, "c"),
        Some(Said::Text("one\ntwo\n".to_string()))
    );
}

proptest! {
    /// Where both accept the block, our reading, the oracle's and what the generator wrote are one.
    #[test]
    fn our_reader_and_the_yaml_oracle_agree_where_both_accept(
        entries in proptest::collection::vec(("[a-z][a-z_]{0,6}", shape()), 1..6)
    ) {
        let mut seen = std::collections::HashSet::new();
        let entries: Vec<_> = entries.into_iter().filter(|(key, _)| seen.insert(key.clone())).collect();
        let yaml: String = entries.iter().map(|(key, shape)| written(key, shape)).collect();
        let document = Document::from_text(&format!("---\n{yaml}---\nbody\n"));
        let Ok(loaded) = YamlOwned::load_from_str(&yaml) else {
            // The oracle refuses the block: nothing to compare.
            return Ok(());
        };
        let Some(root) = loaded.first() else { return Ok(()); };
        for (key, shape) in &entries {
            let ours = ours(&document, key);
            let mut theirs = oracle(root, key);
            // The one dialect difference, which the app's reader and the JavaScript server share:
            // YAML keeps the final line break of a literal block, a vault value does not.
            if let (Shape::Literal(_), Some(Said::Text(text))) = (shape, &mut theirs) {
                if text.ends_with('\n') {
                    text.pop();
                }
            }
            prop_assert_eq!(&ours, &theirs, "key {} in\n{}", key, yaml);
            prop_assert_eq!(ours, Some(expected(shape)), "key {} in\n{}", key, yaml);
        }
    }
}
