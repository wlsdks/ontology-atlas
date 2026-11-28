//! The survey of a repository answered from a census the app supplied, so nothing is read from
//! the disk: not a file, not the repository's Git state. It is never kept between calls, because
//! the census is the repository as the app saw it and a later call may bring another.

use std::collections::{HashMap, HashSet};

use confined_files::SourceFiles;

use crate::breadth_map::{build_breadth_map, Survey, SurveyRequest};
use crate::survey_cache::SurveyAsked;
use crate::survey_files::SurveyFiles;

/// The survey `asked` names, read through `files`. `imports` is a second run over the same
/// census that only the import scan reads from. Files Git ignores are not known to a census and
/// so are not left out; the survey's own list of folders no one reads as code still is.
pub fn survey_of_census(
    files: &SurveyFiles<'_>,
    imports: &dyn SourceFiles,
    asked: &SurveyAsked,
) -> Survey {
    build_breadth_map(
        files,
        &SurveyRequest {
            root_path: &asked.label,
            ignore: &asked.ignore,
            vault_exclusion: asked.vault_exclusion.clone(),
            git_ignored: &HashSet::new(),
            kept_files: &HashMap::new(),
            import_files: Some(imports),
        },
    )
}
