//! Settings a configuration type turns on: a field that is another configuration section
//! (`Metrics metrics.Config`), and a boolean whose name says it switches something (`PublicMode`,
//! `enable_cache`, `onlyPublishWithReleaseLabel`). Read from Go and Rust structs, script
//! interfaces and object types, and Python classes.

use std::sync::LazyLock;

use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::enclosing_declarations::{brace_delta, indent_of};
use crate::js_pattern::{is_js_space, js_regex, js_trim_end};
use crate::operator_language::OperatorLanguage;

static SETTINGS_TYPE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?:Config|Configuration|Options|Settings|Opts|Rc)$"));
/// In a React hook or component file an `Options` type is the hook's parameters, so only a
/// configuration or settings type counts there.
static HOOK_SETTINGS_TYPE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?:Config|Configuration|Settings)$"));
static HOOK_FILE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?:^|/)use[A-Z-][^/]*$|\.[jt]sx$"));
static SECTION_TYPE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?:^|\.)\w*(?:Config|Configuration|Options|Settings)$"));
static TOGGLE_CAMEL: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^(?:enable|disable|allow|use|skip|no|only|force|strict|public)[A-Z_]|^(?:Enable|Disable|Allow|Use|Skip|No|Only|Force|Strict|Public)[A-Z]|(?:Enabled|Disabled|Mode)$",
    )
});
static TOGGLE_SNAKE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^(?:enable|disable|allow|use|skip|no|only|force|strict|public)_|_(?:enabled|disabled|mode)$",
    )
});
static BOOLEAN_TYPE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^(?:bool|boolean|Optional\[bool\]|bool \| None|Option<bool>)$"));
static GO_HEADER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^type\s+([A-Z]\w*)\s+struct\s*\{"));
static SCRIPT_HEADER: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^\s*(?:export\s+)?(?:declare\s+)?(?:interface\s+([A-Za-z]\w*)\b[^{=]*\{|type\s+([A-Za-z]\w*)\s*=\s*\{)",
    )
});
static RUST_HEADER: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*(?:pub\s+)?struct\s+([A-Z]\w*)\s*\{"));
static GO_FIELD: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s+([A-Z]\w*)\s+(\*?[\w.]+)"));
/// In scripts the whole type is one name: `Options['x']`, a union or a callback is not a section.
static SCRIPT_FIELD: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"^\s+(?:readonly\s+)?([A-Za-z_]\w*)\??[ \t]*:[ \t]*([\w.]+)[ \t]*[;,]?$")
});
static RUST_FIELD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s+(?:pub\s+)?([a-z]\w*)\s*:\s*([\w:<>]+)"));
static PYTHON_FIELD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s+([a-z]\w*)[ \t]*:[ \t]*([\w.\[\]|][\w.\[\]| ]*)?(?:=|$)"));
static PYTHON_CLASS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(\s*)class\s+([A-Za-z_]\w*)"));
static PYTHON_DEF: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)"));

/// A configuration type's fields are read this far below its header.
const TYPE_LINES: usize = 400;

/// `enabled` and `disabled`, in any case of ASCII letters: a field that says only that.
fn is_bare_toggle(field: &str) -> bool {
    matches!(
        field.to_ascii_lowercase().as_str(),
        "enable" | "enabled" | "disable" | "disabled"
    )
}

fn base_name_of_folder(path: &str) -> String {
    let folder = path.rsplit_once('/').map_or(".", |(folder, _)| folder);
    folder.rsplit('/').next().unwrap_or(folder).to_string()
}

fn setting_name(structure: &str, field: &str, path: &str) -> String {
    if !is_bare_toggle(field) {
        return field.to_string();
    }
    let stripped = SETTINGS_TYPE.replace(structure, "");
    let mut characters = stripped.chars();
    let prefix = match (characters.next(), characters.next()) {
        (Some('I'), Some(next)) if next.is_ascii_uppercase() => {
            stripped.get(1..).unwrap_or("").to_string()
        }
        _ => stripped.to_string(),
    };
    if prefix.is_empty() {
        base_name_of_folder(path)
    } else {
        prefix
    }
}

struct Recorder<'a> {
    path: &'a str,
    rows: Vec<AbilityRow>,
}

impl Recorder<'_> {
    fn record(&mut self, structure: &str, field: Option<regex::Captures<'_>>, index: usize) {
        let Some(field) = field else { return };
        let Some(name) = field.get(1).map(|name| name.as_str()) else {
            return;
        };
        if name.starts_with('_') {
            return;
        }
        let type_text = field.get(2).map_or("", |kind| kind.as_str());
        let boolean = BOOLEAN_TYPE.is_match(type_text.trim_matches(is_js_space));
        let toggle = boolean
            && (TOGGLE_CAMEL.is_match(name) || TOGGLE_SNAKE.is_match(name) || is_bare_toggle(name));
        let section =
            !boolean && SECTION_TYPE.is_match(type_text.strip_prefix('*').unwrap_or(type_text));
        if toggle || section {
            self.rows.push(
                AbilityRow::at(
                    AbilityKind::Setting,
                    &setting_name(structure, name, self.path),
                    self.path,
                    index + 1,
                )
                .with_symbol(&format!("{structure}.{name}")),
            );
        }
    }
}

fn python_settings(recorder: &mut Recorder<'_>, lines: &[String], settings_type: &Regex) {
    // The open classes and functions by indent; a field counts for the configuration class it
    // sits directly in.
    let mut open: Vec<(usize, Option<String>)> = Vec::new();
    for (index, raw) in lines.iter().enumerate() {
        let line = js_trim_end(raw);
        if line.is_empty() {
            continue;
        }
        let indent = indent_of(line);
        while open.last().is_some_and(|(held, _)| *held >= indent) {
            open.pop();
        }
        if let Some(class) = PYTHON_CLASS.captures(line) {
            let name = class.get(2).map_or("", |name| name.as_str());
            open.push((
                indent,
                settings_type.is_match(name).then(|| name.to_string()),
            ));
            continue;
        }
        if PYTHON_DEF.is_match(line) {
            open.push((indent, None));
            continue;
        }
        if let Some(Some(structure)) = open.last().map(|(_, structure)| structure.clone()) {
            recorder.record(&structure, PYTHON_FIELD.captures(line), index);
        }
    }
}

struct OpenType {
    structure: String,
    line: usize,
    depth: i64,
}

fn braced_settings(
    recorder: &mut Recorder<'_>,
    lines: &[String],
    language: OperatorLanguage,
    settings_type: &Regex,
) {
    let (header, field) = match language {
        OperatorLanguage::Go => (&*GO_HEADER, &*GO_FIELD),
        OperatorLanguage::Script => (&*SCRIPT_HEADER, &*SCRIPT_FIELD),
        _ => (&*RUST_HEADER, &*RUST_FIELD),
    };
    // The configuration type being read: its name, the line it opened at, and the braces its
    // fields opened so far (a field of a nested object type is not its own).
    let mut open: Option<OpenType> = None;
    for (index, raw) in lines.iter().enumerate() {
        let line = js_trim_end(raw);
        if let Some(held) = open.as_mut() {
            let nested = held.depth > 0;
            held.depth += brace_delta(line, true);
            if held.depth < 0 || index - held.line >= TYPE_LINES {
                open = None;
            } else {
                if !nested {
                    recorder.record(&held.structure, field.captures(line), index);
                }
                continue;
            }
        }
        let Some(structure) = header.captures(line).and_then(|found| {
            found
                .iter()
                .skip(1)
                .flatten()
                .map(|name| name.as_str())
                .find(|name| !name.is_empty())
                .map(str::to_string)
        }) else {
            continue;
        };
        if !settings_type.is_match(&structure) {
            continue;
        }
        // A type written on one line (`type X = { a: boolean };`) has no field lines below it.
        if let (Some(last_close), Some(first_open)) = (line.rfind('}'), line.find('{')) {
            if last_close > first_open {
                continue;
            }
        }
        open = Some(OpenType {
            structure,
            line: index,
            depth: 0,
        });
    }
}

pub fn setting_rows(path: &str, lines: &[String], language: OperatorLanguage) -> Vec<AbilityRow> {
    let settings_type: &Regex = if language == OperatorLanguage::Script && HOOK_FILE.is_match(path)
    {
        &HOOK_SETTINGS_TYPE
    } else {
        &SETTINGS_TYPE
    };
    let mut recorder = Recorder {
        path,
        rows: Vec::new(),
    };
    if language == OperatorLanguage::Python {
        python_settings(&mut recorder, lines, settings_type);
    } else {
        braced_settings(&mut recorder, lines, language, settings_type);
    }
    recorder.rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_lines::bounded_lines;

    fn rows(path: &str, text: &str, language: OperatorLanguage) -> Vec<(String, usize, String)> {
        setting_rows(path, &bounded_lines(text), language)
            .into_iter()
            .map(|row| (row.name, row.line, row.symbol.unwrap_or_default()))
            .collect()
    }

    #[test]
    fn a_go_config_names_a_section_field_and_a_switch_and_leaves_plain_fields() {
        let found = rows(
            "server/config.go",
            "type ServerConfig struct {\n\tMetrics metrics.Config\n\tPublicMode bool\n\tName string\n\tPort int\n}\n",
            OperatorLanguage::Go,
        );
        assert_eq!(
            found,
            [
                ("Metrics".to_string(), 2, "ServerConfig.Metrics".to_string()),
                (
                    "PublicMode".to_string(),
                    3,
                    "ServerConfig.PublicMode".to_string()
                ),
            ]
        );
    }

    #[test]
    fn a_bare_enabled_field_takes_its_types_name_and_an_options_type_in_a_hook_file_is_ignored() {
        let python = rows(
            "cache/settings.py",
            "class CacheSettings:\n    enabled: bool = True\n    ttl: int = 5\n",
            OperatorLanguage::Python,
        );
        assert_eq!(
            python,
            [("Cache".to_string(), 2, "CacheSettings.enabled".to_string())]
        );
        let hook = rows(
            "src/useThing.ts",
            "export interface ThingOptions {\n  enableFoo: boolean;\n}\n",
            OperatorLanguage::Script,
        );
        assert!(hook.is_empty(), "{hook:?}");
    }
}
