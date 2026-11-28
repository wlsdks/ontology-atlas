//! Static readers for `setup.py`, `pyproject.toml`, `package.json` and `Cargo.toml`. Pure text
//! analysis: the caller reads the bytes, these decide which declared facts are safe to quote as
//! evidence.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use answer_format::utf16;
use answer_format::whitespace::{collapse_whitespace, is_whitespace, trim};
use regex::Regex;
use repository_survey::js_regex;

use crate::scan_limits::{
    CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH, CARGO_MANIFEST_MAX_FEATURES,
    CARGO_MANIFEST_MAX_FEATURE_VALUES, CARGO_MANIFEST_MAX_TOKEN_LENGTH,
    NODE_PACKAGE_DEPENDENCY_LIMIT, NODE_PACKAGE_DESCRIPTION_MAX_LENGTH, NODE_PACKAGE_EXPORT_LIMIT,
    NODE_PACKAGE_SCRIPT_LIMIT, SEMANTIC_EVIDENCE_MAX_EXCERPT,
};
use crate::scan_tables::CARGO_PACKAGE_EVIDENCE_FIELDS;
use crate::toml_lines::{
    assignment, is_balanced_fragment, normalize_key, quoted_values, section_of, static_string,
    strip_comment, text_lines,
};

/// What a manifest declares about the package, as a document the semantic evidence quotes.
#[derive(Debug, Clone)]
pub struct PackageContract {
    pub package_name: String,
    pub title: String,
    pub headings: Vec<String>,
    pub excerpt: String,
    pub risk_text: String,
}

/// The contract, or the reason this manifest is not quoted.
pub type Extraction = Result<PackageContract, String>;

static SETUP_CALL: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^(?:setup|setuptools\.setup)\s*\(\s*$"));
static SETUP_FIELD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^(name|description|python_requires)\s*=\s*(['\x22])"));
static SAFE_EXPORT_KEY: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\.\/[A-Za-z0-9@._/-]+$"));
static SAFE_MANIFEST_KEY: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^[A-Za-z0-9@._:/-]{1,100}$"));
static DEPENDENCY_NAME: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
});

/// A value shortened to `max_length` UTF-16 units with an ellipsis, on one line.
pub fn truncate_value(value: &str, max_length: usize) -> String {
    let normalized = collapse_whitespace(value);
    if utf16::len(&normalized) <= max_length {
        return normalized;
    }
    format!(
        "{}…",
        utf16::prefix(&normalized, max_length.saturating_sub(1))
    )
}

fn strip_python_comment(line: &str) -> &str {
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for (index, character) in line.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            escaped = true;
            continue;
        }
        if character == '"' || character == '\'' {
            quote = match quote {
                Some(open) if open == character => None,
                Some(open) => Some(open),
                None => Some(character),
            };
            continue;
        }
        if character == '#' && quote.is_none() {
            return line.get(..index).unwrap_or(line);
        }
    }
    line
}

fn python_delimiter_delta(line: &str) -> i64 {
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut delta = 0;
    for character in line.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote.is_some() {
            escaped = true;
            continue;
        }
        if character == '"' || character == '\'' {
            quote = match quote {
                Some(open) if open == character => None,
                Some(open) => Some(open),
                None => Some(character),
            };
            continue;
        }
        if quote.is_some() {
            continue;
        }
        match character {
            '(' | '[' | '{' => delta += 1,
            ')' | ']' | '}' => delta -= 1,
            _ => {}
        }
    }
    delta
}

/// `name = "value",` with matching quotes: the field and its value.
fn setup_field(line: &str) -> Option<(String, String)> {
    let found = SETUP_FIELD.captures(line)?;
    let field = found.get(1)?.as_str().to_string();
    let quote = found.get(2)?.as_str().chars().next()?;
    let rest = line.get(found.get(0)?.end()..)?;
    let line_break = |character: char| matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}');
    // The value is the shortest run that the closing quote and an optional comma end the line.
    for (index, character) in rest.char_indices() {
        if line_break(character) {
            return None;
        }
        if character != quote {
            continue;
        }
        let tail = rest.get(index + 1..)?;
        let tail = tail.trim_start_matches(is_whitespace);
        if tail.is_empty() || tail == "," {
            return Some((field, rest.get(..index)?.to_string()));
        }
    }
    None
}

fn detail_lines(details: &[Option<String>]) -> String {
    details
        .iter()
        .flatten()
        .cloned()
        .collect::<Vec<_>>()
        .join(". ")
}

fn excerpt_of(details: &[Option<String>]) -> String {
    utf16::prefix(&detail_lines(details), SEMANTIC_EVIDENCE_MAX_EXCERPT).to_string()
}

fn contract(
    package_name: String,
    details: &[Option<String>],
    risk_text: String,
) -> PackageContract {
    PackageContract {
        title: format!("{package_name} package contract"),
        package_name,
        headings: vec!["Package contract".to_string()],
        excerpt: excerpt_of(details),
        risk_text,
    }
}

fn labelled(label: &str, value: Option<&String>, max: usize) -> Option<String> {
    value
        .filter(|value| !value.is_empty())
        .map(|value| format!("{label}: {}", truncate_value(value, max)))
}

pub fn extract_python_setup_contract(text: &str) -> Extraction {
    let mut fields: BTreeMap<String, String> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut inside = false;
    let mut nesting: i64 = 0;
    for raw in text_lines(text) {
        let line = trim(strip_python_comment(raw));
        if !inside {
            if !SETUP_CALL.is_match(line) {
                continue;
            }
            inside = true;
            nesting = 1;
            continue;
        }
        if let Some((field, value)) = setup_field(line) {
            if fields.insert(field.clone(), value).is_none() {
                order.push(field);
            }
        }
        nesting += python_delimiter_delta(line);
        if nesting <= 0 {
            break;
        }
    }
    let Some(package_name) = fields.get("name") else {
        return Err("package-contract-skip: setup.py has no static setup name".to_string());
    };
    let visible = truncate_value(package_name, CARGO_MANIFEST_MAX_TOKEN_LENGTH);
    let details = [
        Some(format!("Package: {visible}")),
        labelled(
            "Description",
            fields.get("description"),
            CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
        ),
        labelled(
            "Python",
            fields.get("python_requires"),
            CARGO_MANIFEST_MAX_TOKEN_LENGTH,
        ),
    ];
    let risk = order
        .iter()
        .filter_map(|key| fields.get(key).cloned())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(contract(visible, &details, risk))
}

pub fn extract_python_pyproject_contract(text: &str) -> Extraction {
    let mut fields: BTreeMap<String, String> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut section = String::new();
    for raw in text_lines(text) {
        let line = trim(strip_comment(raw));
        if line.is_empty() {
            continue;
        }
        if let Some(name) = section_of(line) {
            section = name.to_string();
            continue;
        }
        if section != "project" {
            continue;
        }
        let Some((raw_key, raw_value)) = assignment(line) else {
            continue;
        };
        let key = normalize_key(raw_key);
        if !["name", "description", "requires-python"].contains(&key.as_str()) {
            continue;
        }
        if let Some(value) = static_string(raw_value) {
            if fields.insert(key.clone(), value).is_none() {
                order.push(key);
            }
        }
    }
    let Some(package_name) = fields.get("name") else {
        return Err("package-contract-skip: pyproject.toml has no static project name".to_string());
    };
    let visible = truncate_value(package_name, CARGO_MANIFEST_MAX_TOKEN_LENGTH);
    let details = [
        Some(format!("Package: {visible}")),
        labelled(
            "Description",
            fields.get("description"),
            CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
        ),
        labelled(
            "Python",
            fields.get("requires-python"),
            CARGO_MANIFEST_MAX_TOKEN_LENGTH,
        ),
    ];
    let risk = order
        .iter()
        .filter_map(|key| fields.get(key).cloned())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(contract(visible, &details, risk))
}

fn collect_export_targets(value: &serde_json::Value, targets: &mut Vec<String>) {
    match value {
        serde_json::Value::String(text) => targets.push(text.clone()),
        serde_json::Value::Object(map) => {
            for nested in map.values() {
                collect_export_targets(nested, targets);
            }
        }
        _ => {}
    }
}

fn is_safe_export_target(value: &str) -> bool {
    if !value.starts_with("./") || value.contains('\\') {
        return false;
    }
    !value
        .split('/')
        .any(|segment| segment == ".." || (segment.is_empty() && value != "./"))
}

fn public_export_keys(exports: Option<&serde_json::Value>) -> Vec<String> {
    match exports {
        Some(serde_json::Value::String(target)) => {
            if is_safe_export_target(target) {
                vec![".".to_string()]
            } else {
                Vec::new()
            }
        }
        Some(serde_json::Value::Object(map)) => {
            let mut subpaths: Vec<&String> = map
                .keys()
                .filter(|key| key.as_str() == "." || SAFE_EXPORT_KEY.is_match(key))
                .collect();
            utf16::sort(&mut subpaths);
            let has_safe_target = |value: &serde_json::Value| {
                let mut targets = Vec::new();
                collect_export_targets(value, &mut targets);
                targets.iter().any(|target| is_safe_export_target(target))
            };
            if subpaths.is_empty() {
                let whole = serde_json::Value::Object(map.clone());
                return if has_safe_target(&whole) {
                    vec![".".to_string()]
                } else {
                    Vec::new()
                };
            }
            subpaths
                .into_iter()
                .filter(|key| map.get(*key).is_some_and(has_safe_target))
                .take(NODE_PACKAGE_EXPORT_LIMIT)
                .cloned()
                .collect()
        }
        _ => Vec::new(),
    }
}

fn static_manifest_keys(
    value: Option<&serde_json::Value>,
    limit: usize,
    allowed: &Regex,
) -> Vec<String> {
    let Some(serde_json::Value::Object(map)) = value else {
        return Vec::new();
    };
    let mut keys: Vec<&String> = map.keys().filter(|key| allowed.is_match(key)).collect();
    utf16::sort(&mut keys);
    keys.into_iter().take(limit).cloned().collect()
}

pub fn extract_node_package_contract(text: &str) -> Extraction {
    let parsed: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| format!("package-contract-skip: malformed package.json: {error}"))?;
    let package_name = parsed
        .get("name")
        .and_then(serde_json::Value::as_str)
        .map(|name| trim(name).to_string())
        .unwrap_or_default();
    let description = parsed
        .get("description")
        .and_then(serde_json::Value::as_str)
        .map(collapse_whitespace)
        .unwrap_or_default();
    if package_name.is_empty() || description.is_empty() {
        return Err(
            "package-contract-skip: workspace package.json requires static name and description"
                .to_string(),
        );
    }
    let visible_name = truncate_value(&package_name, CARGO_MANIFEST_MAX_TOKEN_LENGTH);
    let visible_description = truncate_value(&description, NODE_PACKAGE_DESCRIPTION_MAX_LENGTH);
    let exports = public_export_keys(parsed.get("exports"));
    let scripts = static_manifest_keys(
        parsed.get("scripts"),
        NODE_PACKAGE_SCRIPT_LIMIT,
        &SAFE_MANIFEST_KEY,
    );
    let dependencies = static_manifest_keys(
        parsed.get("dependencies"),
        NODE_PACKAGE_DEPENDENCY_LIMIT,
        &DEPENDENCY_NAME,
    );
    let listed = |label: &str, rows: &[String]| {
        (!rows.is_empty()).then(|| format!("{label}: {}", rows.join(", ")))
    };
    let details = [
        Some(format!("Package: {visible_name}")),
        Some(format!("Description: {visible_description}")),
        listed("Exports", &exports),
        listed("Scripts", &scripts),
        listed("Dependencies", &dependencies),
    ];
    Ok(contract(
        visible_name,
        &details,
        format!("{package_name}\n{description}"),
    ))
}

struct CargoFeature {
    name: String,
    values: Vec<String>,
}

/// The longest a feature list is joined over: an unclosed one never rescans the rest.
const TOML_ARRAY_LINES: usize = 200;

fn cargo_excerpt(details: &[Option<String>], candidates: &[(String, Vec<String>, usize)], total: usize) -> String {
    let mut visible = candidates.len();
    loop {
        let rows: Vec<String> = candidates
            .iter()
            .take(visible)
            .map(|(name, values, omitted)| {
                let joined = if values.is_empty() {
                    "(empty)".to_string()
                } else {
                    values.join(", ")
                };
                let suffix = if *omitted > 0 {
                    format!(" (+{omitted} values omitted)")
                } else {
                    String::new()
                };
                format!("{name} -> {joined}{suffix}")
            })
            .collect();
        let omitted_features = total.saturating_sub(visible);
        let mut parts: Vec<String> = details.iter().flatten().cloned().collect();
        if !rows.is_empty() {
            parts.push(format!("Features: {}", rows.join("; ")));
        }
        if omitted_features > 0 {
            parts.push(format!("Feature declarations omitted: {omitted_features}"));
        }
        let excerpt = parts.join(". ");
        if utf16::len(&excerpt) <= SEMANTIC_EVIDENCE_MAX_EXCERPT || visible == 0 {
            return utf16::prefix(&excerpt, SEMANTIC_EVIDENCE_MAX_EXCERPT).to_string();
        }
        visible -= 1;
    }
}

pub fn extract_cargo_contract(text: &str) -> Extraction {
    let mut fields: BTreeMap<String, String> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut features: Vec<CargoFeature> = Vec::new();
    let mut section = String::new();
    let lines = text_lines(text);
    let mut index = 0;
    while index < lines.len() {
        let line = trim(strip_comment(lines.get(index).copied().unwrap_or_default()));
        index += 1;
        if line.is_empty() {
            continue;
        }
        if let Some(name) = section_of(line) {
            section = name.to_string();
            continue;
        }
        let Some((raw_key, first_value)) = assignment(line) else {
            continue;
        };
        let key = normalize_key(raw_key);
        let evidence_field =
            section == "package" && CARGO_PACKAGE_EVIDENCE_FIELDS.contains(&key.as_str());
        let mut value = first_value.to_string();
        if section == "features" && value.trim_start_matches(is_whitespace).starts_with('[') {
            let last_line = (lines.len() - 1).min(index - 1 + TOML_ARRAY_LINES);
            while !is_balanced_fragment(&value) && index - 1 < last_line {
                let next = lines.get(index).copied().unwrap_or_default();
                value.push(' ');
                value.push_str(trim(strip_comment(next)));
                index += 1;
            }
        }
        if evidence_field {
            let static_value = if is_balanced_fragment(&value) {
                static_string(&value)
            } else {
                None
            };
            if key == "name" && static_value.is_none() {
                return Err(
                    "package-contract-skip: root Cargo.toml has no static package name".to_string(),
                );
            }
            if let Some(found) = static_value {
                if fields.insert(key.clone(), found).is_none() {
                    order.push(key);
                }
            }
            continue;
        }
        if section == "features" && !is_balanced_fragment(&value) {
            return Err(
                "package-contract-skip: malformed Cargo.toml package/features contract".to_string(),
            );
        }
        if section == "features" {
            features.push(CargoFeature {
                name: key,
                values: quoted_values(&value),
            });
        }
    }
    let Some(package_name) = fields.get("name") else {
        return Err("package-contract-skip: root Cargo.toml has no [package] table".to_string());
    };
    let visible = truncate_value(package_name, CARGO_MANIFEST_MAX_TOKEN_LENGTH);
    let details = [
        Some(format!("Package: {visible}")),
        labelled(
            "Description",
            fields.get("description"),
            CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
        ),
        labelled("Version", fields.get("version"), CARGO_MANIFEST_MAX_TOKEN_LENGTH),
        labelled("Edition", fields.get("edition"), CARGO_MANIFEST_MAX_TOKEN_LENGTH),
        labelled(
            "Rust version",
            fields.get("rust-version"),
            CARGO_MANIFEST_MAX_TOKEN_LENGTH,
        ),
    ];
    let candidates: Vec<(String, Vec<String>, usize)> = features
        .iter()
        .take(CARGO_MANIFEST_MAX_FEATURES)
        .map(|feature| {
            (
                truncate_value(&feature.name, CARGO_MANIFEST_MAX_TOKEN_LENGTH),
                feature
                    .values
                    .iter()
                    .take(CARGO_MANIFEST_MAX_FEATURE_VALUES)
                    .map(|value| truncate_value(value, CARGO_MANIFEST_MAX_TOKEN_LENGTH))
                    .collect(),
                feature
                    .values
                    .len()
                    .saturating_sub(CARGO_MANIFEST_MAX_FEATURE_VALUES),
            )
        })
        .collect();
    let excerpt = cargo_excerpt(&details, &candidates, features.len());
    let mut risk_parts: Vec<String> = order
        .iter()
        .filter_map(|key| fields.get(key).cloned())
        .collect();
    for feature in &features {
        risk_parts.push(feature.name.clone());
        risk_parts.extend(feature.values.iter().cloned());
    }
    Ok(PackageContract {
        title: format!("{visible} package contract"),
        package_name: visible,
        headings: if features.is_empty() {
            vec!["Package contract".to_string()]
        } else {
            vec!["Package contract".to_string(), "Features".to_string()]
        },
        excerpt,
        risk_text: risk_parts.join("\n"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cargo_manifest_gives_its_package_and_features_as_one_excerpt() {
        let found = extract_cargo_contract(
            "[package]\nname = \"ledger\"\nversion = \"0.1.0\"\n\n[features]\nfast = [\"a\",\n \"b\"]\n",
        )
        .expect("a contract");
        assert_eq!(found.package_name, "ledger");
        assert_eq!(
            found.excerpt,
            "Package: ledger. Version: 0.1.0. Features: fast -> a, b"
        );
        assert_eq!(found.headings, ["Package contract", "Features"]);
    }

    #[test]
    fn a_manifest_without_a_static_name_is_skipped_with_its_reason() {
        assert_eq!(
            extract_python_setup_contract("setup(\n    name=NAME,\n)\n").unwrap_err(),
            "package-contract-skip: setup.py has no static setup name"
        );
        assert!(extract_node_package_contract("{\"name\":\"x\"}").is_err());
    }

    #[test]
    fn a_setup_call_gives_its_quoted_fields() {
        let found = extract_python_setup_contract(
            "setup(\n    name='tool',  # note\n    description=\"A tool\",\n)\n",
        )
        .expect("a contract");
        assert_eq!(found.excerpt, "Package: tool. Description: A tool");
    }
}
