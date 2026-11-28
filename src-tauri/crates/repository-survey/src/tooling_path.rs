//! Benchmarks, examples, demos, samples, mocks and fixtures are tooling, not abilities.

use std::sync::LazyLock;

use regex::Regex;

use crate::js_pattern::js_regex;

/// A folder of benchmarks, examples, demos, samples, mocks or fixtures (a folder name, never a
/// file name).
static TOOLING: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)(?:^|/)(?:[\w-]*bench[\w-]*|examples?|demos?|samples?|fixtures?|testdata|mocks?|[\w-]*_mocks)/",
    )
});

pub fn is_tooling(path: &str) -> bool {
    TOOLING.is_match(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tooling_folder_marks_the_files_under_it_but_a_file_name_does_not() {
        assert!(is_tooling("src/Examples/run.ts"));
        assert!(is_tooling("benchmarks/a.go"));
        assert!(!is_tooling("src/example.ts"));
    }
}
