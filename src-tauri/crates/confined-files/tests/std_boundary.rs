//! No family crate touches the disk or spawns a process on its own. Files go through
//! `confined-files` and `git` through `hardened-git`, so one place decides what may be opened,
//! read, listed, written and run. This scans `src-tauri/crates/*/src` and fails on `std::fs`,
//! `std::process` (beyond leaving the program), and the crates that wrap them.

use std::fs;
use std::path::{Path, PathBuf};

/// Crates that may name them: the two this rule protects, and the app's own index crate, which
/// is not a family crate and carries its own confinement (`vault-index/src/confine.rs`).
const OWNERS: [&str; 3] = ["confined-files", "hardened-git", "vault-index"];

/// `std::process` items that spawn nothing: leaving the program and naming it.
const HARMLESS_PROCESS_ITEMS: [&str; 5] = ["exit", "id", "abort", "ExitCode", "Termination"];

/// Crates that wrap the disk or the system, and so are as forbidden as `std::fs`.
const FORBIDDEN_CRATES: [&str; 4] = ["walkdir", "tempfile", "fs_err", "libc"];

/// A file that names `std::fs` for a reason this rule cannot see: its own feature gate. The
/// `test-hooks` module is compiled only into the test build, never the released program.
const EXEMPT_FILES: [(&str, &str); 1] = [(
    "mcp-server/src/tools/test_hooks.rs",
    "compiled only with the `test-hooks` feature, which the release build never enables",
)];

/// The source with comments, string literals and character literals blanked, so a mention in
/// prose or in a message is not a use.
fn blank_comments_and_strings(source: &str) -> String {
    let characters: Vec<char> = source.chars().collect();
    let mut out = String::with_capacity(source.len());
    let mut index = 0;
    let blank = |character: char| if character == '\n' { '\n' } else { ' ' };
    while let Some(&current) = characters.get(index) {
        let next = characters.get(index + 1).copied();
        match (current, next) {
            ('/', Some('/')) => {
                while let Some(&character) = characters.get(index) {
                    if character == '\n' {
                        break;
                    }
                    out.push(' ');
                    index += 1;
                }
            }
            ('/', Some('*')) => {
                let mut depth = 0;
                while let Some(&character) = characters.get(index) {
                    let after = characters.get(index + 1).copied();
                    if character == '/' && after == Some('*') {
                        depth += 1;
                        out.push_str("  ");
                        index += 2;
                    } else if character == '*' && after == Some('/') {
                        depth -= 1;
                        out.push_str("  ");
                        index += 2;
                        if depth == 0 {
                            break;
                        }
                    } else {
                        out.push(blank(character));
                        index += 1;
                    }
                }
            }
            ('r', Some('"' | '#')) if raw_string_start(&characters, index).is_some() => {
                let hashes = raw_string_start(&characters, index).unwrap_or(0);
                let opening = index + 1 + hashes + 1;
                for _ in index..opening {
                    out.push(' ');
                }
                index = opening;
                while let Some(&character) = characters.get(index) {
                    let closes = character == '"'
                        && (1..=hashes).all(|offset| characters.get(index + offset) == Some(&'#'));
                    if closes {
                        for _ in 0..=hashes {
                            out.push(' ');
                        }
                        index += hashes + 1;
                        break;
                    }
                    out.push(blank(character));
                    index += 1;
                }
            }
            ('"', _) => {
                out.push(' ');
                index += 1;
                while let Some(&character) = characters.get(index) {
                    if character == '\\' {
                        out.push(' ');
                        out.push(blank(characters.get(index + 1).copied().unwrap_or(' ')));
                        index += 2;
                        continue;
                    }
                    out.push(blank(character));
                    index += 1;
                    if character == '"' {
                        break;
                    }
                }
            }
            ('\'', _) => {
                // A character literal is `'x'` or `'\..'`; anything else is a lifetime.
                let literal_end = match (next, characters.get(index + 2).copied()) {
                    (Some('\\'), _) => (index + 2..characters.len().min(index + 12))
                        .find(|position| characters.get(*position) == Some(&'\'')),
                    (Some(_), Some('\'')) => Some(index + 2),
                    _ => None,
                };
                match literal_end {
                    Some(end) => {
                        for _ in index..=end {
                            out.push(' ');
                        }
                        index = end + 1;
                    }
                    None => {
                        out.push('\'');
                        index += 1;
                    }
                }
            }
            (character, _) => {
                out.push(character);
                index += 1;
            }
        }
    }
    out
}

/// The number of `#` of a raw string starting at `index` (`r"`, `r#"`), or `None`.
fn raw_string_start(characters: &[char], index: usize) -> Option<usize> {
    let previous_is_identifier = index
        .checked_sub(1)
        .and_then(|before| characters.get(before))
        .is_some_and(|character| character.is_alphanumeric() || *character == '_');
    if previous_is_identifier {
        return None;
    }
    let hashes = characters
        .iter()
        .skip(index + 1)
        .take_while(|character| **character == '#')
        .count();
    (characters.get(index + 1 + hashes) == Some(&'"')).then_some(hashes)
}

fn take_identifier(text: &str) -> (&str, &str) {
    let end = text
        .char_indices()
        .find(|(_, character)| !(character.is_alphanumeric() || *character == '_'))
        .map_or(text.len(), |(position, _)| position);
    text.split_at(end)
}

/// The items of a `{ ... }` group at its top level, and what follows the group.
fn split_group(text: &str) -> Option<(Vec<&str>, &str)> {
    let inner_start = text.strip_prefix('{')?;
    let mut depth = 1;
    let mut items = Vec::new();
    let mut item_start = 0;
    for (position, character) in inner_start.char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    items.push(inner_start.get(item_start..position)?);
                    return Some((items, inner_start.get(position + 1..)?));
                }
            }
            ',' if depth == 1 => {
                items.push(inner_start.get(item_start..position)?);
                item_start = position + 1;
            }
            _ => {}
        }
    }
    None
}

/// What a path below `std::` names that is forbidden, or `None`.
fn forbidden_below_std(path: &str) -> Option<String> {
    let path = path.trim_start();
    if let Some((items, _)) = split_group(path) {
        return items.into_iter().find_map(forbidden_below_std);
    }
    let (identifier, rest) = take_identifier(path);
    let rest = rest.trim_start();
    match identifier {
        "fs" => Some("std::fs".to_string()),
        "process" => {
            let below = rest.strip_prefix("::").map(str::trim_start).unwrap_or("");
            let harmless = |item: &str| {
                let (name, _) = take_identifier(item.trim_start());
                HARMLESS_PROCESS_ITEMS.contains(&name)
            };
            let spawns = match split_group(below) {
                Some((items, _)) => items.into_iter().any(|item| !harmless(item)),
                None => !harmless(below),
            };
            spawns.then(|| "std::process".to_string())
        }
        _ => rest.strip_prefix("::").and_then(forbidden_below_std),
    }
}

/// Every forbidden use in `source`, as the name used.
fn violations(source: &str) -> Vec<String> {
    let code = blank_comments_and_strings(source);
    let mut found = Vec::new();
    for (position, _) in code.match_indices("std") {
        let before = code
            .get(..position)
            .and_then(|head| head.chars().next_back());
        if before.is_some_and(|character| character.is_alphanumeric() || character == '_') {
            continue;
        }
        let Some(after) = code.get(position + 3..) else {
            continue;
        };
        if let Some(below) = after.trim_start().strip_prefix("::") {
            if let Some(name) = forbidden_below_std(below) {
                found.push(name);
            }
        }
    }
    for name in FORBIDDEN_CRATES {
        let pattern = format!("{name}::");
        for (position, _) in code.match_indices(&pattern) {
            let before = code
                .get(..position)
                .and_then(|head| head.chars().next_back());
            if before.is_some_and(|character| character.is_alphanumeric() || character == '_') {
                continue;
            }
            found.push(name.to_string());
        }
    }
    found
}

fn rust_files(folder: &Path, out: &mut Vec<PathBuf>) {
    let Ok(listing) = fs::read_dir(folder) else {
        return;
    };
    for entry in listing.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            out.push(path);
        }
    }
}

#[test]
fn no_family_crate_names_the_disk_or_a_process_outside_the_two_that_own_them() {
    let crates = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("the crates folder");
    let mut offences: Vec<String> = Vec::new();
    let mut scanned = 0;
    for entry in fs::read_dir(crates).expect("crates").filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if OWNERS.contains(&name.as_str()) {
            continue;
        }
        let mut files = Vec::new();
        rust_files(&entry.path().join("src"), &mut files);
        for file in files {
            let relative = format!(
                "{name}/{}",
                file.strip_prefix(entry.path())
                    .expect("below the crate")
                    .to_string_lossy()
                    .replace('\\', "/")
            );
            scanned += 1;
            if EXEMPT_FILES.iter().any(|(exempt, _)| relative == *exempt) {
                continue;
            }
            let source = fs::read_to_string(&file).expect("source");
            for used in violations(&source) {
                offences.push(format!("{relative} uses {used}"));
            }
        }
    }
    assert!(
        scanned > 0,
        "the scan found no family crate source to check"
    );
    assert!(
        offences.is_empty(),
        "family crates reach the disk or a process directly; go through confined-files or hardened-git:\n{}",
        offences.join("\n")
    );
}

/// The rule can fail: each planted use is named, and prose, strings and harmless items are not.
#[test]
fn the_scan_names_every_way_of_reaching_the_disk_or_spawning_and_nothing_else() {
    for planted in [
        "let text = std::fs::read_to_string(path);",
        "use std::fs;",
        "use std::fs::File;",
        "use std::{fs, io};",
        "use std::{io::Write, process::Command};",
        "use std::{io::{self, Read}, fs::OpenOptions};",
        "let child = std::process::Command::new(\"git\");",
        "use std::process::{exit, Stdio};",
        "use std::os::unix::fs::symlink;",
        "let _ = ::std::fs::remove_file(path);",
        "std :: fs :: write(a, b)",
        "use walkdir::WalkDir;",
        "let name = tempfile::tempdir();",
        "unsafe { libc::open(p, 0) };",
    ] {
        assert!(!violations(planted).is_empty(), "not caught: {planted}");
    }
    for allowed in [
        "std::process::exit(code);",
        "let id = std::process::id();",
        "use std::process::{exit, ExitCode};",
        "use std::path::{Path, PathBuf};",
        "use std::io::{Read, Write};",
        "use std::collections::HashMap;",
        "// std::fs::read(path) in a comment",
        "/* std::process::Command */ let a = 1;",
        "/* outer /* nested std::fs */ still comment std::fs */ let a = 1;",
        "let message = \"std::fs::read failed\";",
        "let escaped = \"a \\\" std::fs::read\";",
        "let raw = r#\"std::fs::read \"quoted\"\"#;",
        "let c = '\"'; let d = std::path::Path::new(\"x\");",
        "fn lifetimes<'a>(x: &'a str) -> &'a str { x }",
        "let own_std = my_std::fs::read(a);",
        "let name = notwalkdir::x();",
    ] {
        assert_eq!(
            violations(allowed),
            Vec::<String>::new(),
            "falsely caught: {allowed}"
        );
    }
}
