//! A minimal stand-in for the app's folder walk: every `.md` file outside hidden folders.

use std::path::Path;

pub fn markdown_files(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    visit(root, "", &mut out);
    out.sort();
    out
}

fn visit(dir: &Path, prefix: &str, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        match entry.file_type() {
            Ok(kind) if kind.is_dir() => visit(&entry.path(), &relative, out),
            Ok(kind) if kind.is_file() && name.ends_with(".md") => out.push(relative),
            _ => {}
        }
    }
}
