//! Flags that change behaviour, as abilities: the groups the code makes (a function per group, a
//! category, an argparse group), then flags that share a first word, then a boolean flag on its
//! own when it is not a generic switch. Read from Go (`flag`, `pflag`, urfave/cli), Python
//! (argparse, click, typer), scripts (commander and described option lists) and Rust (clap).

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use indexmap::IndexMap;
use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::enclosing_declarations::{enclosing_declarations, Enclosures};
use crate::js_pattern::js_regex;
use crate::name_key::words_of;
use crate::operator_language::OperatorLanguage;

const GENERIC_FLAGS: [&str; 20] = [
    "help",
    "version",
    "verbose",
    "quiet",
    "silent",
    "debug",
    "color",
    "no-color",
    "colour",
    "json",
    "yes",
    "h",
    "v",
    "log-level",
    "loglevel",
    "log",
    "config",
    "config-path",
    "config-file",
    "print-config",
];
const GENERIC_GROUPS: [&str; 17] = [
    "", "cli", "cmd", "command", "global", "common", "default", "root", "main", "app", "all",
    "base", "misc", "other", "parser", "new", "config",
];
/// Words that open many flag names without naming a group of them.
const SHARED_PREFIXES_THAT_GROUP_NOTHING: [&str; 10] = [
    "no", "max", "min", "use", "enable", "disable", "allow", "skip", "with", "without",
];

static FLAG_GROUP_FUNCTION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"^(?:add|register|define|build|get|new|make|setup|with|parse)?_?([A-Za-z0-9]+?(?:_[A-Za-z0-9]+?)*)_?(?:CLI|Cli|cli)?_?(?:Flags?|flags?|Options|options|Opts|opts|Args|args|Arguments|arguments|Params|params)$",
    )
});
static URFAVE_FLAG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"&cli\.(\w+?)Flag\{"));
static FLAG_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"\bName:\s*"([\w.-]+)""#));
static FLAG_CATEGORY: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"\bCategory:\s*"([^"]+)""#));
static GO_FLAG: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"\b(?:flag|pflag|\w+\.(?:Persistent)?Flags\(\))\.(Bool|String|Int|Int64|Uint|Duration|Float64|StringSlice|StringArray)(?:Var)?P?\(\s*(?:&[\w.\[\]]+\s*,\s*)?"([\w.-]+)""#,
    )
});
static ARGUMENT_GROUP: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"\b(\w+)[ \t]*=[ \t]*\w+\.add_argument_group\([ \t]*(?:title[ \t]*=[ \t]*)?["']([^"']+)["']"#,
    )
});
static ARGUMENT: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r#"\b(\w+)\.add_argument\([ \t]*(?:["']-\w["'][ \t]*,[ \t]*)?["']--([\w-]+)["']"#)
});
static STORE_TRUE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r#"action\s*=\s*["']store_(?:true|false)["']|BooleanOptionalAction"#)
});
static CLICK_OPTION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r#"@(?:click|\w+)\.option\(\s*(?:["']-\w["']\s*,\s*)?["']--([\w-]+)"#)
});
static TYPER_OPTION: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"typer\.Option\([^)]*["']--([\w-]+)["']"#));
static IS_FLAG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"is_flag\s*=\s*True"));
static COMMANDER_OPTION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r#"\.(?:requiredOption|option)\(\s*["'`](?:-\w\s*,\s*)?--([\w-]+)([^"'`]*)["'`]"#)
});
static DESCRIBED_ALONE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"^\s*(?:\{\s*)?name:[ \t]*['"]([\w-]+)['"][ \t]*(?:,[ \t]*)?$"#));
static DESCRIBED_WITH_TYPE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"\{[ \t]*name:[ \t]*['"]([\w-]+)['"][ \t]*,[ \t]*type:"#));
static DESCRIBED_TYPE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\btype:\s*(Boolean|String|Number)\b"));
static RUST_LONG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"#\[(?:arg|clap)\([^)]*\blong\b"));
static RUST_FIELD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*(?:pub\s+)?(\w+)\s*:\s*([\w<>]+)"));

#[derive(Debug, Clone)]
struct Flag {
    name: String,
    boolean: bool,
    group: Option<String>,
    /// 1-based.
    line: usize,
}

struct Found {
    name: String,
    boolean: bool,
    group: Option<String>,
}

fn group_one(found: Option<regex::Captures<'_>>) -> Option<String> {
    found?.get(1).map(|name| name.as_str().to_string())
}

/// `count` lines from `index`, joined.
fn within(lines: &[String], index: usize, count: usize) -> String {
    let end = lines.len().min(index + count);
    lines.get(index..end).unwrap_or_default().join("\n")
}

fn go_flag(lines: &[String], index: usize, line: &str) -> Option<Found> {
    let mut found = None;
    if let Some(urfave) = URFAVE_FLAG.captures(line) {
        let block = within(lines, index, 8);
        if let Some(name) = group_one(FLAG_NAME.captures(&block)) {
            found = Some(Found {
                name,
                boolean: urfave.get(1).is_some_and(|kind| kind.as_str() == "Bool"),
                group: group_one(FLAG_CATEGORY.captures(&block)),
            });
        }
    }
    if let Some(standard) = GO_FLAG.captures(line) {
        if let (Some(kind), Some(name)) = (standard.get(1), standard.get(2)) {
            found = Some(Found {
                name: name.as_str().to_string(),
                boolean: kind.as_str() == "Bool",
                group: None,
            });
        }
    }
    found
}

fn python_flag(
    lines: &[String],
    index: usize,
    line: &str,
    groups: &mut HashMap<String, String>,
) -> Option<Found> {
    let mut found = None;
    if line.contains("add_argument_group(") {
        if let Some(group) = ARGUMENT_GROUP.captures(line) {
            if let (Some(variable), Some(title)) = (group.get(1), group.get(2)) {
                groups.insert(variable.as_str().to_string(), title.as_str().to_string());
            }
        }
    }
    if line.contains(".add_argument(") {
        if let Some(argument) = ARGUMENT.captures(line) {
            if let (Some(variable), Some(name)) = (argument.get(1), argument.get(2)) {
                let block = within(lines, index, 4);
                found = Some(Found {
                    name: name.as_str().to_string(),
                    boolean: STORE_TRUE.is_match(&block),
                    group: groups.get(variable.as_str()).cloned(),
                });
            }
        }
    }
    let option = CLICK_OPTION
        .captures(line)
        .or_else(|| TYPER_OPTION.captures(line));
    if let Some(name) = option.and_then(|option| option.get(1)) {
        found = Some(Found {
            name: name.as_str().split('/').next().unwrap_or("").to_string(),
            boolean: IS_FLAG.is_match(&within(lines, index, 4)),
            group: None,
        });
    }
    found
}

fn script_flag(lines: &[String], index: usize, line: &str) -> Option<Found> {
    if let Some(commander) = COMMANDER_OPTION.captures(line) {
        if let Some(name) = commander.get(1) {
            let tail = commander.get(2).map_or("", |tail| tail.as_str());
            return Some(Found {
                name: name.as_str().to_string(),
                boolean: !tail.contains(['<', '[']),
                group: None,
            });
        }
    }
    let described = DESCRIBED_ALONE
        .captures(line)
        .or_else(|| DESCRIBED_WITH_TYPE.captures(line))?;
    let name = described.get(1)?.as_str().to_string();
    let block = within(lines, index, 4);
    let kind = DESCRIBED_TYPE.captures(&block)?;
    Some(Found {
        name,
        boolean: kind.get(1).is_some_and(|kind| kind.as_str() == "Boolean"),
        group: None,
    })
}

fn rust_flag(lines: &[String], index: usize, line: &str) -> Option<Found> {
    if !RUST_LONG.is_match(line) {
        return None;
    }
    let field = lines
        .get(index + 1..(index + 4).min(lines.len()))
        .unwrap_or_default()
        .iter()
        .find_map(|next| RUST_FIELD.captures(next))?;
    Some(Found {
        name: field.get(1)?.as_str().replace('_', "-"),
        boolean: field.get(2).is_some_and(|kind| kind.as_str() == "bool"),
        group: None,
    })
}

/// Each flag a parser defines, the group from its parser call when the code names one, else from
/// the function that defines it (`add_signed_stream_flags` is the group `signed_stream`).
fn flags_in(lines: &[String], language: OperatorLanguage) -> Vec<Flag> {
    let mut flags = Vec::new();
    let mut around: Option<Enclosures> = None;
    let mut group_of: HashMap<usize, Option<String>> = HashMap::new();
    let mut argument_groups: HashMap<String, String> = HashMap::new();
    for (index, line) in lines.iter().enumerate() {
        let found = match language {
            OperatorLanguage::Go => go_flag(lines, index, line),
            OperatorLanguage::Python => python_flag(lines, index, line, &mut argument_groups),
            OperatorLanguage::Script => script_flag(lines, index, line),
            OperatorLanguage::Rust => rust_flag(lines, index, line),
        };
        let Some(mut found) = found else { continue };
        if found.group.is_none() {
            let enclosures = around.get_or_insert_with(|| enclosing_declarations(lines, language));
            if let Some((id, owner)) = enclosures.at(index) {
                let group = group_of.entry(id).or_insert_with(|| {
                    FLAG_GROUP_FUNCTION
                        .captures(&owner.name)
                        .and_then(|grouped| grouped.get(1))
                        .map(|word| word.as_str().to_string())
                        .filter(|word| !GENERIC_GROUPS.contains(&word.to_lowercase().as_str()))
                });
                if let Some(group) = group {
                    found.group = Some(group.clone());
                }
            }
        }
        flags.push(Flag {
            name: found.name,
            boolean: found.boolean,
            group: found.group,
            line: index + 1,
        });
    }
    flags
}

/// A category label such as "SIGNED STREAMS:" as the words a person says.
fn group_name(group: &str) -> String {
    words_of(group).join(" ")
}

fn flag_abilities(path: &str, flags: &[Flag]) -> Vec<AbilityRow> {
    let mut rows: Vec<AbilityRow> = Vec::new();
    let mut by_group: IndexMap<String, Vec<Flag>> = IndexMap::new();
    let mut loose: Vec<Flag> = Vec::new();
    let mut unique: IndexMap<&str, &Flag> = IndexMap::new();
    for flag in flags {
        unique.entry(flag.name.as_str()).or_insert(flag);
    }
    for flag in unique.values() {
        match &flag.group {
            Some(group) if !group.is_empty() => by_group
                .entry(group_name(group))
                .or_default()
                .push((*flag).clone()),
            _ => loose.push((*flag).clone()),
        }
    }
    let mut by_prefix: IndexMap<String, Vec<Flag>> = IndexMap::new();
    for flag in loose {
        let prefix = flag
            .name
            .split(['-', '_', '.'])
            .next()
            .unwrap_or("")
            .to_lowercase();
        by_prefix.entry(prefix).or_default().push(flag);
    }
    let generic: HashSet<&str> = GENERIC_FLAGS.into_iter().collect();
    for (prefix, members) in by_prefix {
        if members.len() >= 2
            && prefix.chars().count() >= 3
            && !SHARED_PREFIXES_THAT_GROUP_NOTHING.contains(&prefix.as_str())
        {
            by_group
                .entry(format!("--{prefix}-*"))
                .or_default()
                .extend(members);
        } else {
            for flag in members {
                if flag.boolean && !generic.contains(flag.name.to_lowercase().as_str()) {
                    rows.push(AbilityRow::at(
                        AbilityKind::Flag,
                        &format!("--{}", flag.name),
                        path,
                        flag.line,
                    ));
                }
            }
        }
    }
    for (name, members) in by_group {
        if name.is_empty() || GENERIC_GROUPS.contains(&name.as_str()) {
            continue;
        }
        let line = members.first().map_or(1, |flag| flag.line);
        rows.push(
            AbilityRow::at(AbilityKind::Flags, &name, path, line).with_members(
                members
                    .iter()
                    .map(|flag| format!("--{}", flag.name))
                    .collect(),
            ),
        );
    }
    rows.sort_by_key(|row| row.line);
    rows
}

/// The flag rows of one file's lines.
pub fn flag_rows(path: &str, lines: &[String], language: OperatorLanguage) -> Vec<AbilityRow> {
    let defined = flags_in(lines, language);
    if defined.is_empty() {
        return Vec::new();
    }
    flag_abilities(path, &defined)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_lines::bounded_lines;

    fn rows(text: &str, language: OperatorLanguage) -> Vec<(String, usize, Option<Vec<String>>)> {
        flag_rows("x", &bounded_lines(text), language)
            .into_iter()
            .map(|row| (row.name, row.line, row.members))
            .collect()
    }

    #[test]
    fn flags_a_function_defines_are_one_group_and_a_lone_boolean_is_a_flag_unless_generic() {
        let found = rows(
            "def add_signed_stream_flags(parser):\n    parser.add_argument('--sign', action='store_true')\n    parser.add_argument('--stream-key')\n\ndef main(parser):\n    parser.add_argument('--dry-run', action='store_true')\n    parser.add_argument('--verbose', action='store_true')\n",
            OperatorLanguage::Python,
        );
        assert_eq!(
            found,
            [
                (
                    "signed stream".to_string(),
                    2,
                    Some(vec!["--sign".to_string(), "--stream-key".to_string()])
                ),
                ("--dry-run".to_string(), 6, None),
            ]
        );
    }

    #[test]
    fn flags_that_share_a_first_word_are_one_group_named_for_it() {
        let found = rows(
            "flag.Bool(\"cache-dir\", false, \"\")\nflag.String(\"cache-ttl\", \"\", \"\")\n",
            OperatorLanguage::Go,
        );
        assert_eq!(
            found,
            [(
                "--cache-*".to_string(),
                1,
                Some(vec!["--cache-dir".to_string(), "--cache-ttl".to_string()])
            )]
        );
    }
}
