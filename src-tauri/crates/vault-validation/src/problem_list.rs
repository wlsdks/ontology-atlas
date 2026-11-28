//! The findings of a vault as the answer lists them: one row per file that has any, files with an
//! error first and then by slug, and a tally per code that counts files rather than findings.

use std::collections::HashMap;

use answer_format::collation::compare_text;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use vault_document::{Issue, Severity};

/// One file and what is wrong with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Problem {
    pub slug: String,
    pub issues: Vec<Issue>,
}

/// How many files carry a code, and which. The files are every one here and a sample once paged.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CodeTally {
    pub severity: Severity,
    pub count: usize,
    pub files: Vec<String>,
    #[serde(rename = "filesOmitted", skip_serializing_if = "Option::is_none")]
    pub files_omitted: Option<usize>,
}

/// Tallies in the order their codes were first met, written as an object keyed by code.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TalliesByCode(pub Vec<(&'static str, CodeTally)>);

impl Serialize for TalliesByCode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (code, tally) in &self.0 {
            map.serialize_entry(code, tally)?;
        }
        map.end()
    }
}

/// The answer's `summary`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProblemSummary {
    #[serde(rename = "problemFiles")]
    pub problem_files: usize,
    #[serde(rename = "errorFiles")]
    pub error_files: usize,
    #[serde(rename = "warningFiles")]
    pub warning_files: usize,
    #[serde(rename = "byCode")]
    pub by_code: TalliesByCode,
}

/// Every problem row and the summary over them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProblemList {
    pub problems: Vec<Problem>,
    pub summary: ProblemSummary,
}

/// The rows of the slugs of `files` that have findings in `issues`, ordered for the answer.
pub fn list_problems(files: &[String], mut issues: HashMap<String, Vec<Issue>>) -> ProblemList {
    let mut ordered: Vec<(&String, bool)> = files
        .iter()
        .filter(|slug| issues.get(*slug).is_some_and(|found| !found.is_empty()))
        .map(|slug| {
            let has_error = issues[slug]
                .iter()
                .any(|issue| issue.severity == Severity::Error);
            (slug, has_error)
        })
        .collect();
    ordered.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| compare_text(left.0, right.0))
    });
    let mut problems = Vec::with_capacity(ordered.len());
    let mut by_code: Vec<(&'static str, CodeTally)> = Vec::new();
    let (mut error_files, mut warning_files) = (0, 0);
    for (slug, has_error) in ordered {
        let found = issues.remove(slug).unwrap_or_default();
        let mut seen: Vec<&'static str> = Vec::new();
        for issue in &found {
            let at = match by_code.iter().position(|(code, _)| *code == issue.code) {
                Some(at) => at,
                None => {
                    by_code.push((
                        issue.code,
                        CodeTally {
                            severity: issue.severity,
                            count: 0,
                            files: Vec::new(),
                            files_omitted: None,
                        },
                    ));
                    by_code.len() - 1
                }
            };
            let tally = &mut by_code[at].1;
            if issue.severity == Severity::Error {
                tally.severity = Severity::Error;
            }
            if !seen.contains(&issue.code) {
                seen.push(issue.code);
                tally.count += 1;
                tally.files.push(slug.clone());
            }
        }
        if has_error {
            error_files += 1;
        } else {
            warning_files += 1;
        }
        problems.push(Problem {
            slug: slug.clone(),
            issues: found,
        });
    }
    ProblemList {
        summary: ProblemSummary {
            problem_files: problems.len(),
            error_files,
            warning_files,
            by_code: TalliesByCode(by_code),
        },
        problems,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_with_an_error_come_first_and_a_code_counts_each_file_once() {
        let files: Vec<String> = ["a", "b", "c"].iter().map(ToString::to_string).collect();
        let mut issues = HashMap::new();
        issues.insert(
            "a".to_string(),
            vec![Issue::warning("w", "x"), Issue::warning("w", "y")],
        );
        issues.insert("c".to_string(), vec![Issue::error("e", "z")]);
        let list = list_problems(&files, issues);
        let order: Vec<&str> = list.problems.iter().map(|row| row.slug.as_str()).collect();
        assert_eq!(order, ["c", "a"]);
        assert_eq!(list.summary.error_files, 1);
        assert_eq!(list.summary.warning_files, 1);
        let tally = &list.summary.by_code.0[1].1;
        assert_eq!((tally.count, tally.files.len()), (1, 1));
    }
}
