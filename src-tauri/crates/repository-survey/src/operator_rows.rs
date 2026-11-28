//! The subcommand, flag, setting and worker rows of one file: what an operator or a calling
//! program gets that no route or dispatcher shows. Every reader takes the file's lines once,
//! forward, carrying what it needs to know (the declaration a line sits in, a type being read, a
//! test module), so a survey costs time in proportion to the bytes it reads. Static text scans
//! only: nothing runs, and a name is never read for meaning.

use crate::ability_row::AbilityRow;
use crate::bounded_lines::bounded_lines;
use crate::flag_rows::flag_rows;
use crate::operator_language::OperatorLanguage;
use crate::setting_rows::setting_rows;
use crate::subcommand_rows::subcommand_rows;
use crate::worker_rows::worker_rows;

#[derive(Debug, Clone, Default)]
pub struct OperatorRows {
    pub subcommands: Vec<AbilityRow>,
    pub flags: Vec<AbilityRow>,
    pub settings: Vec<AbilityRow>,
    pub workers: Vec<AbilityRow>,
}

/// The rows of the file at `path`, none for a file that is not Go, Python, Rust or a script, or
/// is empty.
pub fn operator_rows(path: &str, text: &str) -> Option<OperatorRows> {
    let language = OperatorLanguage::of_path(path)?;
    if text.is_empty() {
        return None;
    }
    let lines = bounded_lines(text);
    let joined = lines.join("\n");
    Some(OperatorRows {
        subcommands: subcommand_rows(path, &joined, &lines, language),
        flags: flag_rows(path, &lines, language),
        settings: setting_rows(path, &lines, language),
        workers: worker_rows(path, &joined, &lines, language),
    })
}
