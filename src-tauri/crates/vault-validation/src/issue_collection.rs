//! Every finding about a vault, by the file it is about: what each file says alone, what only the
//! whole vault can see, what a node claims that the repository does not back, and the raw sources
//! that claim to be nodes. The order of findings inside a file is the order they are found in.

use std::collections::HashMap;

use confined_files::SourceFiles;
use meaning_findings::{
    dependency_witness_findings, folder_only_evidence_finding, starter_example_findings,
    CitedPaths, Finding, ImportedNames,
};
use vault_document::{Issue, LoadedDocument, ReferenceIndex, VaultIssues};

use crate::node_revisions::contained_slugs;

/// The findings by slug, and every slug that can be listed: the documents, then the raw sources.
#[derive(Debug, Default)]
pub struct IssueCollection {
    pub by_slug: HashMap<String, Vec<Issue>>,
    pub files: Vec<String>,
}

fn advisory(finding: Finding) -> (String, Issue) {
    (
        finding.slug,
        Issue::warning(finding.code, finding.message),
    )
}

fn has_kind(document: &LoadedDocument) -> bool {
    document
        .frontmatter()
        .text("kind")
        .is_some_and(|kind| !answer_format::whitespace::trim(kind).is_empty())
}

/// The findings of `documents`. `source` is the repository the vault describes, or `None` when
/// none is known: a claim about code is never made against a repository that is not known.
pub fn collect_issues(
    documents: &[LoadedDocument],
    index: &ReferenceIndex<'_>,
    source: Option<&dyn SourceFiles>,
    raw_sources: Vec<(String, Issue)>,
) -> IssueCollection {
    let mut by_slug: HashMap<String, Vec<Issue>> = HashMap::new();
    for document in documents {
        by_slug.insert(document.slug().to_string(), document.issues().to_vec());
    }
    let mut add = |slug: String, issue: Issue| by_slug.entry(slug).or_default().push(issue);
    let mut whole_vault: Vec<(String, Vec<Issue>)> =
        VaultIssues::find(documents, index, true).into_by_slug().into_iter().collect();
    // A map has no order; the order within one file's findings is the order they were found in.
    whole_vault.sort_by(|left, right| left.0.cmp(&right.0));
    for (slug, issues) in whole_vault {
        for issue in issues {
            add(slug.clone(), issue);
        }
    }
    if let Some(source) = source {
        for document in documents.iter().filter(|document| has_kind(document)) {
            if let Some(finding) = folder_only_evidence_finding(document, source) {
                let (slug, issue) = advisory(finding);
                add(slug, issue);
            }
        }
        let cited = CitedPaths::of(documents);
        let mut imported = ImportedNames::default();
        for document in documents.iter().filter(|document| has_kind(document)) {
            for finding in dependency_witness_findings(document, source, &cited, &mut imported) {
                let (slug, issue) = advisory(finding);
                add(slug, issue);
            }
        }
    }
    for finding in starter_example_findings(documents) {
        let (slug, issue) = advisory(finding);
        add(slug, issue);
    }
    let mut collection = IssueCollection {
        by_slug,
        files: documents.iter().map(|document| document.slug().to_string()).collect(),
    };
    collection.drop_what_the_vault_answers(documents);
    for (slug, issue) in raw_sources {
        collection.by_slug.insert(slug.clone(), vec![issue]);
        collection.files.push(slug);
    }
    collection
}

impl IssueCollection {
    /// A single-file check cannot see a parent, so it tells a node it has no `domain:` when its
    /// project contains it; this pass holds the whole vault and takes that finding back. A wiki
    /// page carries no `kind:` by contract, so the absence is not a finding there.
    fn drop_what_the_vault_answers(&mut self, documents: &[LoadedDocument]) {
        let parented: std::collections::HashSet<String> = documents
            .iter()
            .flat_map(|document| contained_slugs(document.frontmatter()))
            .collect();
        for (slug, issues) in &mut self.by_slug {
            let is_parented = parented.contains(slug);
            let is_wiki_page = slug.starts_with("wiki/");
            issues.retain(|issue| {
                let parent_answers = is_parented
                    && issue.code == "missing-expected-field"
                    && issue
                        .message
                        .as_deref()
                        .is_some_and(|text| text.starts_with("`domain:`"));
                let wiki_answers = is_wiki_page && issue.code == "missing-kind";
                !(parent_answers || wiki_answers)
            });
        }
    }
}
