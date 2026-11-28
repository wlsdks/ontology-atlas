//! Subcommands a command-line parser registers: cobra, urfave/cli, argparse, click, typer, tyro,
//! commander, yargs and clap. One row per registration, with the line it is registered at.

use std::sync::LazyLock;

use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::js_pattern::js_regex;
use crate::name_key::words_of;
use crate::operator_language::OperatorLanguage;

static SUBCOMMAND_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[\w][\w:-]*$"));
static SCRIPT_CLI_LIBRARY: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"(?:\bfrom[ \t]+|\brequire\([ \t]*)['"](?:commander|yargs|cac|sade|clipanion|@oclif/core|meow|citty)['"]"#,
    )
});
static DATACLASS_CLI: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?m)^[ \t]*(?:import|from)[ \t]+tyro\b|simple_parsing"));
static COBRA_COMMAND: LazyLock<Regex> = LazyLock::new(|| js_regex(r"&cobra\.Command\{"));
static COBRA_USE: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"\bUse:\s*"([\w:-]+)"#));
static URFAVE_COMMAND: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"&cli\.Command\{|\bcli\.Command\{"));
static URFAVE_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"\bName:\s*"([\w:-]+)""#));
static NOT_TOP_LEVEL: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\S"));
static RUN_METHOD: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s+def run\("));
static DATACLASS_DECORATOR: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^@dataclass\b"));
static DATACLASS_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^class\s+([A-Z]\w*)"));
static ADD_PARSER: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"\.add_parser\(\s*["']([\w:-]+)["']"#));
static COMMAND_DECORATOR: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"^\s*@\w+\.command\(\s*(?:(?:name\s*=\s*)?["']([\w:-]+)["'])?"#));
static CLICK_COMMAND: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*@click\.command\b"));
static DEF_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:async\s+)?def\s+(\w+)"));
static SCRIPT_COMMAND: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"\.command\(\s*["'`]([\w:-]+)"#));
static RUST_VARIANT: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s{4}([A-Z]\w*)\s*(?:[{(,]|$)"));
static RUST_ENUM_END: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\}"));
static RUST_SUBCOMMAND_DERIVE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"#\[derive\([^)]*\bSubcommand\b"));
static RUST_ENUM: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\benum\s+\w+"));

/// Names every parser has already: not an ability of the product.
const BUILT_IN: [&str; 3] = ["help", "version", "completion"];

#[derive(PartialEq)]
enum RustEnum {
    None,
    Waiting,
    Inside,
}

/// The first capture of `pattern` on a line from `index` to five lines below it.
fn name_within(lines: &[String], index: usize, pattern: &Regex) -> Option<String> {
    let end = lines.len().min(index + 6);
    lines
        .get(index..end)?
        .iter()
        .find_map(|line| pattern.captures(line))
        .and_then(|found| found.get(1))
        .map(|name| name.as_str().to_string())
}

pub fn subcommand_rows(
    path: &str,
    text: &str,
    lines: &[String],
    language: OperatorLanguage,
) -> Vec<AbilityRow> {
    let mut rows = Vec::new();
    if language == OperatorLanguage::Script && !SCRIPT_CLI_LIBRARY.is_match(text) {
        return rows;
    }
    let dataclass_cli = language == OperatorLanguage::Python && DATACLASS_CLI.is_match(text);
    // A subcommand at 0-based line `index`; the dataclass reader passes the 1-based line it
    // noted, so its row sits one line below the class, as the script server's does.
    let mut push = |name: Option<String>, index: usize| {
        let Some(name) = name else { return };
        if SUBCOMMAND_NAME.is_match(&name) && !BUILT_IN.contains(&name.as_str()) {
            rows.push(AbilityRow::at(
                AbilityKind::Subcommand,
                &name,
                path,
                index + 1,
            ));
        }
    };
    // The dataclass whose body is being read, and whether a Rust `Subcommand` derive waits for
    // its enum or is inside it.
    let mut dataclass: Option<(String, usize)> = None;
    let mut subcommand_enum = RustEnum::None;
    for (index, line) in lines.iter().enumerate() {
        match language {
            OperatorLanguage::Go => {
                if COBRA_COMMAND.is_match(line) {
                    push(name_within(lines, index, &COBRA_USE), index);
                } else if URFAVE_COMMAND.is_match(line) {
                    push(name_within(lines, index, &URFAVE_NAME), index);
                }
            }
            OperatorLanguage::Python => {
                if dataclass
                    .as_ref()
                    .is_some_and(|(_, held)| index > *held && NOT_TOP_LEVEL.is_match(line))
                {
                    dataclass = None;
                }
                if dataclass.is_some() && RUN_METHOD.is_match(line) {
                    if let Some((name, held)) = dataclass.take() {
                        push(Some(words_of(&name).join("-")), held);
                    }
                }
                if dataclass_cli && DATACLASS_DECORATOR.is_match(line) {
                    let next = lines.get(index + 1).map_or("", String::as_str);
                    if let Some(class) = DATACLASS_NAME.captures(next) {
                        dataclass = class
                            .get(1)
                            .map(|name| (name.as_str().to_string(), index + 1));
                    }
                }
                if let Some(parser) = ADD_PARSER.captures(line) {
                    push(parser.get(1).map(|name| name.as_str().to_string()), index);
                }
                if let Some(decorated) = COMMAND_DECORATOR.captures(line) {
                    if !CLICK_COMMAND.is_match(line) {
                        let function = lines
                            .get(index + 1..(index + 6).min(lines.len()))
                            .unwrap_or_default()
                            .iter()
                            .find_map(|next| DEF_NAME.captures(next))
                            .and_then(|found| found.get(1))
                            .map(|name| name.as_str().replace('_', "-"));
                        let named = decorated.get(1).map(|name| name.as_str().to_string());
                        push(named.or(function), index);
                    }
                }
            }
            OperatorLanguage::Script => {
                if let Some(command) = SCRIPT_COMMAND.captures(line) {
                    push(command.get(1).map(|name| name.as_str().to_string()), index);
                }
            }
            OperatorLanguage::Rust => {
                if subcommand_enum == RustEnum::Inside {
                    if RUST_ENUM_END.is_match(line) {
                        subcommand_enum = RustEnum::None;
                    } else if let Some(variant) = RUST_VARIANT.captures(line) {
                        let name = variant.get(1).map(|name| words_of(name.as_str()).join("-"));
                        push(name, index);
                    }
                } else if RUST_SUBCOMMAND_DERIVE.is_match(line) {
                    subcommand_enum = RustEnum::Waiting;
                } else if subcommand_enum == RustEnum::Waiting && RUST_ENUM.is_match(line) {
                    subcommand_enum = RustEnum::Inside;
                }
            }
        }
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_lines::bounded_lines;

    fn rows(path: &str, text: &str, language: OperatorLanguage) -> Vec<(String, usize)> {
        let lines = bounded_lines(text);
        subcommand_rows(path, &lines.join("\n"), &lines, language)
            .into_iter()
            .map(|row| (row.name, row.line))
            .collect()
    }

    #[test]
    fn cobra_and_clap_register_a_subcommand_and_a_built_in_one_is_not_an_ability() {
        let go = rows(
            "cmd/root.go",
            "var serve = &cobra.Command{\n\tUse:   \"serve\",\n}\nvar h = &cobra.Command{\n\tUse: \"help\",\n}",
            OperatorLanguage::Go,
        );
        assert_eq!(go, [("serve".to_string(), 1)]);
        let rust = rows(
            "src/cli.rs",
            "#[derive(Subcommand)]\nenum Action {\n    SyncVault { force: bool },\n    Check,\n}\nenum Other {\n    Ignored,\n}",
            OperatorLanguage::Rust,
        );
        assert_eq!(
            rust,
            [("sync-vault".to_string(), 3), ("check".to_string(), 4)]
        );
    }

    #[test]
    fn a_script_file_reads_commands_only_when_it_imports_a_parser_library() {
        let with = rows(
            "bin/cli.ts",
            "import { Command } from 'commander';\nprogram.command('build');",
            OperatorLanguage::Script,
        );
        assert_eq!(with, [("build".to_string(), 2)]);
        let without = rows(
            "src/a.ts",
            "router.command('build');",
            OperatorLanguage::Script,
        );
        assert!(without.is_empty());
    }

    #[test]
    fn a_tyro_dataclass_with_a_run_method_is_a_subcommand_named_for_the_class() {
        let found = rows(
            "train.py",
            "import tyro\n@dataclass\nclass TrainModel:\n    def run(self):\n        pass\n",
            OperatorLanguage::Python,
        );
        assert_eq!(
            found,
            [("train-model".to_string(), 3)],
            "the row sits one line below the class, as the script server's does"
        );
    }
}
