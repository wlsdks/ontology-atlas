//! A document is its file: the parts it names join back to the bytes it was read from, and a write
//! to one key changes the lines of that key and nothing else. Held over the repository's own
//! ontology, over files planted with the shapes editors and operating systems produce (CRLF, a
//! byte-order mark, tabs, comments, duplicate keys, fences with trailing spaces), and over
//! arbitrary text.

use std::path::Path;

use confined_files::VaultRoot;
use proptest::prelude::*;
use vault_document::{Document, RawShape};

/// What the format promises of any file, however odd.
fn assert_round_trip(bytes: &[u8]) {
    let document = Document::from_bytes(bytes);
    if document.is_exact() {
        assert_eq!(
            document.parts().concat().as_bytes(),
            bytes,
            "the parts are the file"
        );
    }
    let raw = document.raw();
    for key in document.frontmatter().keys() {
        let Some(range) = document.entry_range(key) else {
            continue;
        };
        let original = raw
            .get(range.clone())
            .expect("an entry range is inside the file");
        // Writing a key's own lines back changes nothing.
        assert_eq!(
            document
                .with_range_replaced(range.clone(), original)
                .as_deref(),
            Some(raw)
        );
        // Writing other lines in its place changes those bytes and no others.
        let replaced = document
            .with_range_replaced(range.clone(), "replaced: 1\n")
            .expect("inside the file");
        assert_eq!(replaced.get(..range.start), raw.get(..range.start));
        assert_eq!(
            replaced.get(range.start + "replaced: 1\n".len()..),
            raw.get(range.end..)
        );
    }
}

#[test]
fn every_file_of_the_repository_ontology_round_trips() {
    let folder = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../docs/ontology");
    let vault = VaultRoot::open(&folder).expect("the ontology folder");
    let files = vault.markdown_files();
    assert!(
        files.len() > 50,
        "the repository ontology has files: {}",
        files.len()
    );
    for file in files {
        assert_round_trip(&file.read_bytes().expect("readable"));
    }
}

#[test]
fn planted_shapes_round_trip_and_read_as_a_person_would() {
    let planted: [(&str, &str); 12] = [
        ("crlf", "---\r\nuid: x\r\nkind: domain\r\ntitle: A\r\n---\r\nBody\r\n"),
        ("byte-order mark", "\u{feff}---\nkind: domain\n---\nBody\n"),
        ("trailing spaces after the fences", "---  \nkind: domain\n---\t\nBody\n"),
        ("tabs and comments", "---\n# a comment\nkind:\tdomain\n\ntitle: A # not a comment in a value? yes it is\n---\n"),
        ("duplicate keys", "---\ntitle: First\nkind: domain\ntitle: Second\n---\n"),
        ("a fence in the body", "---\nkind: domain\n---\ntext\n---\nmore: not frontmatter\n---\n"),
        ("unclosed", "---\nkind: domain\ntitle: never closed\n"),
        ("empty block", "---\n---\nBody only\n"),
        ("no frontmatter", "# Just Markdown\n\ntext\n"),
        ("empty file", ""),
        ("a list with comments between items", "---\nkind: domain\ncapabilities:\n  - a\n  # why\n  - b\n---\n"),
        ("a key with the proto name", "---\n__proto__: x\nkind: domain\n---\n"),
    ];
    for (name, text) in planted {
        assert_round_trip(text.as_bytes());
        let document = Document::from_text(text);
        let expected_shape = match name {
            "unclosed" => RawShape::Unclosed,
            "no frontmatter" => RawShape::Plain,
            "empty file" => RawShape::Empty,
            _ => RawShape::Framed,
        };
        assert_eq!(document.shape(), expected_shape, "{name}");
    }
    // CRLF is kept in the file and gone from what is read of it.
    let crlf = Document::from_text("---\r\nkind: domain\r\n---\r\nBody\r\n");
    assert_eq!(crlf.line_ending(), "\r\n");
    assert_eq!(crlf.body(), "Body\n");
    assert_eq!(crlf.frontmatter().text("kind"), Some("domain"));
}

#[test]
fn bytes_that_are_not_utf8_are_read_with_replacement_characters_and_say_so() {
    let document = Document::from_bytes(b"---\nkind: domain\ntitle: caf\xe9\n---\n");
    assert!(!document.is_exact());
    assert_eq!(document.frontmatter().text("title"), Some("caf\u{fffd}"));
}

proptest! {
    /// Any text at all: with or without fences, in any line ending, whatever sits between them.
    #[test]
    fn arbitrary_text_round_trips(
        lines in proptest::collection::vec("[ -~\t\u{a0}\u{e9}\u{d55c}]{0,24}", 0..14),
        fence in prop_oneof![Just("---"), Just("--- "), Just("---\t"), Just("----")],
        ending in prop_oneof![Just("\n"), Just("\r\n")],
        framed in any::<bool>(),
    ) {
        let mut text = String::new();
        if framed {
            text.push_str(fence);
            text.push_str(ending);
        }
        for line in &lines {
            text.push_str(line);
            text.push_str(ending);
        }
        if framed {
            text.push_str("---");
            text.push_str(ending);
        }
        assert_round_trip(text.as_bytes());
    }

    /// Any bytes at all, including ones that are not text.
    #[test]
    fn arbitrary_bytes_round_trip(bytes in proptest::collection::vec(any::<u8>(), 0..200)) {
        assert_round_trip(&bytes);
    }
}

/// A Windows editor saves CRLF and a byte-order mark; reading and writing such a file keeps both.
#[cfg(windows)]
#[test]
fn a_windows_file_keeps_its_line_endings_and_mark_through_a_write() {
    let text = "\u{feff}---\r\nkind: domain\r\ntitle: A\r\n---\r\nBody\r\n";
    let document = Document::from_text(text);
    let range = document.entry_range("title").expect("title is written");
    let replaced = document
        .with_range_replaced(range, "title: B\r\n")
        .expect("inside the file");
    assert_eq!(
        replaced,
        "\u{feff}---\r\nkind: domain\r\ntitle: B\r\n---\r\nBody\r\n"
    );
}
