//! The business-first meaning gate: capability candidates from semantic evidence, the sentence that
//! witnesses each, what the vault already holds versus what is only proposed, and the extraction
//! contract its competency questions form. Everything here is a proposal; a person approves.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::LazyLock;

use answer_format::collation::compare_text;
use answer_format::utf16;
use answer_format::whitespace::{collapse_whitespace, is_whitespace, trim};
use icu_normalizer::ComposingNormalizerBorrowed;
use regex::Regex;
use repository_survey::js_regex;
use serde::Serialize;

use crate::candidate_nodes::{
    CapabilityCandidate, ElementCandidate, SourceEvidence, SuggestedRelation,
};
use crate::candidate_text::{
    match_domain_slug, path_semantic_tokens, semantic_tokens, tail_slug, unique_strings,
};
use crate::project_detection::{
    DomainCandidate, DomainEvidence, ExistingOntologyNode, ProjectCandidate,
};
use crate::scan_limits::{
    GENERIC_BUSINESS_CAPABILITY_CANDIDATE_LIMIT, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT,
};
use crate::scan_tables::{
    BUSINESS_CAPABILITY_CLUES, GENERIC_NARRATIVE_CAPABILITY_CLUES,
    IMPLEMENTATION_SHAPED_CAPABILITY_TOKENS, STARTER_ONTOLOGY_SLUGS,
};
use crate::semantic_evidence::SemanticEvidence;

const TRUSTED: &str = "candidate-evidence";
const POLICY_RISKS: [&str; 3] = ["future-state-claim", "negated-claim", "deprecated-state"];

/// Where a semantic capability candidate was found: the narrative that says it and the
/// implementation that carries it.
#[derive(Debug, Clone, Serialize)]
pub struct CandidateEvidence {
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub implementation: Option<String>,
}

/// A capability the semantic evidence proposes, or a structural one carried as a candidate.
#[derive(Debug, Clone)]
pub struct MeaningCandidate {
    pub slug: String,
    pub title: String,
    pub domain: Option<String>,
    pub reason: Option<String>,
    pub evidence: CandidateEvidence,
    pub semantic_sources: Vec<String>,
    pub implementation_evidence: Vec<String>,
}

impl MeaningCandidate {
    fn structural(capability: &CapabilityCandidate) -> Self {
        Self {
            slug: capability.slug.clone(),
            title: capability.title.clone(),
            domain: capability.domain.clone(),
            reason: None,
            evidence: CandidateEvidence {
                source: capability.evidence.source.clone(),
                implementation: None,
            },
            semantic_sources: Vec::new(),
            implementation_evidence: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DependencyRelation {
    pub from: String,
    pub to: String,
    pub product_value_count: Option<usize>,
}

/// A part of the meaning gate's input that depends on the whole scan.
pub struct GateInput<'a> {
    pub domains: &'a [DomainCandidate],
    pub capabilities: &'a [CapabilityCandidate],
    pub semantic_capability_candidates: &'a [MeaningCandidate],
    pub elements: &'a [ElementCandidate],
    pub existing_ontology: &'a [ExistingOntologyNode],
    pub observed_dependencies: &'a [DependencyRelation],
    pub non_product_go_package_slugs: &'a BTreeSet<String>,
    pub semantic_evidence: &'a [SemanticEvidence],
}

fn is_business_narrative(row: &SemanticEvidence) -> bool {
    ["mission", "product-contract", "product-capabilities"].contains(&row.role.as_str())
}

fn is_trusted_with_excerpt(row: &SemanticEvidence) -> bool {
    row.trust == TRUSTED && !row.excerpt.is_empty()
}

struct ImplementationRow {
    path: String,
    slug: String,
}

pub fn derive_business_capability_candidates(
    domains: &[DomainCandidate],
    capabilities: &[CapabilityCandidate],
    elements: &[ElementCandidate],
    semantic_evidence: &[SemanticEvidence],
) -> Vec<MeaningCandidate> {
    let trusted: Vec<&SemanticEvidence> = semantic_evidence
        .iter()
        .filter(|row| is_trusted_with_excerpt(row))
        .collect();
    let narrative: Vec<&SemanticEvidence> = trusted
        .iter()
        .copied()
        .filter(|row| is_business_narrative(row))
        .collect();
    if trusted.is_empty() {
        return Vec::new();
    }
    let domain_slugs: Vec<&str> = domains.iter().map(|row| row.slug.as_str()).collect();
    let implementation_rows: Vec<ImplementationRow> = capabilities
        .iter()
        .map(|row| ImplementationRow {
            path: row.evidence.source.clone(),
            slug: row.slug.clone(),
        })
        .chain(elements.iter().map(|row| ImplementationRow {
            path: row.path.clone(),
            slug: row.slug.clone(),
        }))
        .filter(|row| !row.path.is_empty())
        .collect();

    let mut candidates: Vec<MeaningCandidate> = Vec::new();
    for clue in BUSINESS_CAPABILITY_CLUES.iter() {
        let matched_evidence: Vec<&&SemanticEvidence> = narrative
            .iter()
            .filter(|row| {
                let text = format!("{}\n{}", row.headings.join("\n"), row.excerpt);
                clue.prose.iter().any(|pattern| pattern.is_match(&text))
            })
            .collect();
        if matched_evidence.is_empty() {
            continue;
        }
        let matched_implementations: Vec<&ImplementationRow> = implementation_rows
            .iter()
            .filter(|row| {
                let text = format!("{}\n{}", row.path, row.slug);
                clue.implementation
                    .iter()
                    .any(|pattern| pattern.is_match(&text))
            })
            .collect();
        let Some(first_implementation) = matched_implementations.first() else {
            continue;
        };
        let structural = capabilities.iter().find(|row| {
            matched_implementations
                .iter()
                .any(|implementation| implementation.slug == row.slug)
        });
        let source = structural.map_or_else(
            || first_implementation.path.clone(),
            |row| row.evidence.source.clone(),
        );
        let semantic_source = matched_evidence
            .first()
            .map(|row| row.source.clone())
            .unwrap_or_default();
        let domain = match clue.domain {
            Some(declared) if domain_slugs.contains(&declared) => Some(declared.to_string()),
            _ => match_domain_slug(clue.title, &domain_slugs),
        };
        candidates.push(MeaningCandidate {
            slug: clue.slug.to_string(),
            title: clue.title.to_string(),
            domain,
            reason: Some(
                "bounded business outcome prose cross-checked against implementation evidence"
                    .to_string(),
            ),
            evidence: CandidateEvidence {
                source: semantic_source,
                implementation: Some(source),
            },
            semantic_sources: matched_evidence.iter().map(|row| row.source.clone()).collect(),
            implementation_evidence: matched_implementations
                .iter()
                .map(|row| row.path.clone())
                .collect(),
        });
    }

    let mut emitted: BTreeSet<String> = candidates.iter().map(|row| row.slug.clone()).collect();
    let mut generic_evidence: Vec<&SemanticEvidence> = trusted
        .iter()
        .copied()
        .filter(|row| {
            [
                "mission",
                "product-contract",
                "product-capabilities",
                "package-contract",
            ]
            .contains(&row.role.as_str())
        })
        .collect();
    generic_evidence.sort_by(|left, right| compare_text(&left.source, &right.source));
    let mut generic_implementations: Vec<ImplementationRow> = elements
        .iter()
        .map(|row| ImplementationRow {
            path: row.path.clone(),
            slug: row.slug.clone(),
        })
        .filter(|row| !row.path.is_empty())
        .collect();
    generic_implementations.sort_by(|left, right| {
        compare_text(&left.path, &right.path).then_with(|| compare_text(&left.slug, &right.slug))
    });
    let mut sorted_capabilities: Vec<&CapabilityCandidate> = capabilities.iter().collect();
    sorted_capabilities.sort_by(|left, right| compare_text(&left.slug, &right.slug));
    let mut generic_candidates: Vec<MeaningCandidate> = Vec::new();
    for capability in sorted_capabilities {
        if emitted.contains(&capability.slug) {
            continue;
        }
        let tokens = semantic_tokens(tail_slug(&capability.slug));
        if tokens.is_empty()
            || tokens
                .iter()
                .any(|token| IMPLEMENTATION_SHAPED_CAPABILITY_TOKENS.contains(&token.as_str()))
        {
            continue;
        }
        let matched_evidence: Vec<&SemanticEvidence> = generic_evidence
            .iter()
            .copied()
            .filter(|row| {
                let evidence_tokens = semantic_tokens(&row.excerpt);
                tokens.iter().all(|token| evidence_tokens.contains(token))
            })
            .take(GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT)
            .collect();
        if matched_evidence.is_empty() {
            continue;
        }
        let matched_implementations: Vec<&ImplementationRow> = generic_implementations
            .iter()
            .filter(|row| {
                let implementation_tokens =
                    path_semantic_tokens(&format!("{} {}", row.path, row.slug));
                tokens
                    .iter()
                    .all(|token| implementation_tokens.contains(token))
            })
            .take(GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT)
            .collect();
        let Some(first_implementation) = matched_implementations.first() else {
            continue;
        };
        let domain = capability
            .domain
            .clone()
            .or_else(|| match_domain_slug(tail_slug(&capability.slug), &domain_slugs));
        generic_candidates.push(MeaningCandidate {
            slug: capability.slug.clone(),
            title: capability.title.clone(),
            domain,
            reason: Some("proposal-only: bounded narrative terms cross-checked against an implemented element path; human approval required".to_string()),
            evidence: CandidateEvidence {
                source: matched_evidence
                    .first()
                    .map(|row| row.source.clone())
                    .unwrap_or_default(),
                implementation: Some(first_implementation.path.clone()),
            },
            semantic_sources: matched_evidence.iter().map(|row| row.source.clone()).collect(),
            implementation_evidence: matched_implementations
                .iter()
                .map(|row| row.path.clone())
                .collect(),
        });
    }
    for candidate in generic_candidates
        .into_iter()
        .take(GENERIC_BUSINESS_CAPABILITY_CANDIDATE_LIMIT)
    {
        emitted.insert(candidate.slug.clone());
        candidates.push(candidate);
    }

    let mut narrative_implementations: Vec<ImplementationRow> = elements
        .iter()
        .map(|row| ImplementationRow {
            path: row.path.clone(),
            slug: row.slug.clone(),
        })
        .filter(|row| !row.path.is_empty())
        .collect();
    narrative_implementations.sort_by(|left, right| {
        compare_text(&left.path, &right.path).then_with(|| compare_text(&left.slug, &right.slug))
    });
    for clue in GENERIC_NARRATIVE_CAPABILITY_CLUES.iter() {
        if emitted.contains(clue.slug) {
            continue;
        }
        let matched_evidence: Vec<&SemanticEvidence> = generic_evidence
            .iter()
            .copied()
            .filter(|row| {
                row.excerpt.contains(['.', '!', '?'])
                    && clue.prose.iter().any(|pattern| pattern.is_match(&row.excerpt))
            })
            .collect();
        if matched_evidence.is_empty() {
            continue;
        }
        let matched_implementations: Vec<&ImplementationRow> = narrative_implementations
            .iter()
            .filter(|row| {
                let text = format!("{}\n{}", row.path, row.slug);
                clue.implementation
                    .iter()
                    .any(|pattern| pattern.is_match(&text))
            })
            .take(GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT)
            .collect();
        let Some(first_implementation) = matched_implementations.first() else {
            continue;
        };
        let domain = match_domain_slug(clue.title, &domain_slugs);
        candidates.push(MeaningCandidate {
            slug: clue.slug.to_string(),
            title: clue.title.to_string(),
            domain,
            reason: Some("proposal-only: bounded outcome prose cross-checked against implementation evidence; human approval required".to_string()),
            evidence: CandidateEvidence {
                source: matched_evidence
                    .first()
                    .map(|row| row.source.clone())
                    .unwrap_or_default(),
                implementation: Some(first_implementation.path.clone()),
            },
            semantic_sources: matched_evidence.iter().map(|row| row.source.clone()).collect(),
            implementation_evidence: matched_implementations
                .iter()
                .map(|row| row.path.clone())
                .collect(),
        });
        emitted.insert(clue.slug.to_string());
    }
    candidates
}

/// The project, with the purpose its trusted narrative states and what is unknown about it.
#[derive(Debug, Clone, Serialize)]
pub struct EnrichedProject {
    pub slug: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence: Option<Vec<String>>,
    pub definition: String,
    pub includes: Vec<&'static str>,
    pub excludes: Vec<String>,
    pub confidence: f64,
    pub uncertainty: String,
}

fn shared_limitations() -> [&'static str; 2] {
    [
        "shared business ownership is not established by repository evidence",
        "runtime, test, and external-system behavior remain outside this bounded scan",
    ]
}

pub fn enrich_project(
    project: &ProjectCandidate,
    semantic_evidence: &[SemanticEvidence],
) -> EnrichedProject {
    let trusted: Vec<&SemanticEvidence> = semantic_evidence
        .iter()
        .filter(|row| is_business_narrative(row) && is_trusted_with_excerpt(row))
        .collect();
    let purpose = trusted.iter().find_map(|row| {
        let sentence = explicit_purpose_sentence(&row.excerpt, &project.title);
        (!sentence.is_empty()).then_some((*row, sentence))
    });
    let lead: Option<&SemanticEvidence> = purpose
        .as_ref()
        .map(|(row, _)| *row)
        .or_else(|| trusted.first().copied());
    let sentence = match &purpose {
        Some((_, sentence)) => sentence.clone(),
        None => lead
            .map(|row| bounded_evidence_sentence(&row.excerpt))
            .unwrap_or_default(),
    };
    let corroborators: Vec<&SemanticEvidence> = if sentence.is_empty() {
        Vec::new()
    } else {
        let others: Vec<&SemanticEvidence> = trusted
            .iter()
            .copied()
            .filter(|row| {
                Some(row.source.as_str()) != lead.map(|lead| lead.source.as_str())
                    && has_claim_specific_overlap(&sentence, &row.excerpt)
            })
            .collect();
        independent_rows(&others, lead.into_iter().collect())
    };
    let mut names: Vec<&str> = project
        .evidence
        .iter()
        .flatten()
        .map(String::as_str)
        .collect();
    names.extend(lead.map(|row| row.source.as_str()));
    names.extend(corroborators.iter().map(|row| row.source.as_str()));
    let sources: Vec<String> = unique_strings(names).into_iter().take(3).collect();
    let definition = match (&sentence, lead) {
        (sentence, Some(lead)) if !sentence.is_empty() => {
            format!("Proposed repository purpose from {}: {sentence}", lead.source)
        }
        _ => "Repository purpose is not established by the bounded semantic evidence scan."
            .to_string(),
    };
    let confidence = if sources.is_empty() { 0.2 } else { 0.5 };
    EnrichedProject {
        slug: project.slug.clone(),
        title: project.title.clone(),
        evidence: if sources.is_empty() { None } else { Some(sources) },
        definition,
        includes: vec!["repository-contained implementation evidence"],
        excludes: Vec::new(),
        confidence,
        uncertainty: format!(
            "proposal-only: source prose is a bounded purpose witness, not a shared business assertion. Unknowns: {}.",
            shared_limitations().join("; ")
        ),
    }
}

/// A domain proposed from a README heading, with the witness that corroborates it if any.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedDomain {
    pub slug: String,
    pub reason: &'static str,
    pub evidence: DomainEvidence,
    pub title: String,
    pub definition: String,
    pub excludes: Vec<String>,
    pub confidence: f64,
    pub uncertainty: String,
    pub evidence_sources: Vec<String>,
}

/// A capability proposed from semantic evidence or, in a vault that already has meaning, from the
/// structural scan.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedCapability {
    pub slug: String,
    pub reason: String,
    pub evidence: CandidateEvidence,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    pub definition: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub includes: Vec<String>,
    pub excludes: Vec<String>,
    pub confidence: f64,
    pub uncertainty: String,
    pub evidence_sources: Vec<String>,
}

fn enrich_capability(
    candidate: &MeaningCandidate,
    semantic_evidence: &[SemanticEvidence],
) -> ProposedCapability {
    let mut names: Vec<&str> = candidate
        .semantic_sources
        .iter()
        .map(String::as_str)
        .collect();
    names.push(candidate.evidence.source.as_str());
    if let Some(implementation) = &candidate.evidence.implementation {
        names.push(implementation.as_str());
    }
    let source_names = unique_strings(names);
    let lead: Option<&SemanticEvidence> = source_names
        .iter()
        .filter_map(|source| semantic_evidence.iter().find(|row| row.source == *source))
        .find(|row| is_trusted_with_excerpt(row));
    let sentence = lead
        .map(|row| bounded_evidence_sentence(&row.excerpt))
        .unwrap_or_default();
    let definition = match lead {
        Some(lead) if !sentence.is_empty() => {
            format!("Proposed ability from {}: {sentence}", lead.source)
        }
        _ => "Proposed ability named by bounded repository evidence; shared meaning remains unconfirmed."
            .to_string(),
    };
    let includes: Vec<String> = unique_strings(
        candidate
            .implementation_evidence
            .iter()
            .map(String::as_str),
    )
    .into_iter()
    .take(GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT)
    .collect();
    ProposedCapability {
        slug: candidate.slug.clone(),
        reason: candidate.reason.clone().unwrap_or_else(|| {
            "bounded semantic evidence is a proposal, not proof of shared business meaning"
                .to_string()
        }),
        evidence: candidate.evidence.clone(),
        title: candidate.title.clone(),
        domain: candidate.domain.clone(),
        definition,
        includes,
        excludes: Vec::new(),
        confidence: 0.5,
        uncertainty: format!(
            "proposal-only: bounded prose and path evidence require semantic qualification before admission. Unknowns: {}.",
            [
                "shared business ownership is not established by this repository scan",
                "runtime behavior outside the cited implementation evidence is not asserted",
            ]
            .join("; ")
        ),
        evidence_sources: source_names,
    }
}

fn enrich_domain(domain: &DomainCandidate, semantic_evidence: &[SemanticEvidence]) -> ProposedDomain {
    let name_source = domain.evidence.source.as_str();
    let witness = find_domain_responsibility_witness(domain, semantic_evidence);
    let evidence_sources = match &witness {
        Some((row, _)) => unique_strings([name_source, row.source.as_str()]),
        None => unique_strings([name_source]),
    };
    let definition = match &witness {
        Some((row, sentence)) => format!(
            "Proposed responsibility boundary from {}: {sentence}",
            row.source
        ),
        None => "Proposed responsibility boundary named by README heading; repository-contained responsibility remains unconfirmed.".to_string(),
    };
    let uncertainty = if witness.is_some() {
        "proposal-only: repository prose corroborates this boundary candidate; human approval is still required"
    } else {
        "proposal-only: README heading names a candidate, but no separate repository responsibility witness was found"
    };
    ProposedDomain {
        slug: domain.slug.clone(),
        reason: "README heading is a concept clue, not proof of a shared business boundary",
        evidence: domain.evidence.clone(),
        title: domain.title.clone(),
        definition,
        excludes: Vec::new(),
        confidence: 0.5,
        uncertainty: format!(
            "{uncertainty}. Unknowns: {}.",
            [
                "shared business ownership is not established by this repository scan",
                "runtime behavior outside the cited implementation evidence is not asserted",
            ]
            .join("; ")
        ),
        evidence_sources,
    }
}

fn normalize_semantic_text(value: &str) -> String {
    let lowered = value.to_lowercase();
    let mut out = String::new();
    let mut pending_gap = false;
    for character in lowered.chars() {
        let keep = character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || ('\u{AC00}'..='\u{D7A3}').contains(&character);
        if keep {
            if pending_gap && !out.is_empty() {
                out.push(' ');
            }
            pending_gap = false;
            out.push(character);
        } else {
            pending_gap = true;
        }
    }
    out
}

fn sentence_whitespace(units: &[u16], index: usize) -> bool {
    units
        .get(index)
        .and_then(|unit| char::from_u32(u32::from(*unit)))
        .is_some_and(is_whitespace)
}

fn units_text(units: &[u16]) -> String {
    String::from_utf16_lossy(units)
}

fn plain_text(value: &str) -> String {
    let without: String = value
        .chars()
        .filter(|character| !matches!(character, '*' | '_' | '`'))
        .collect();
    collapse_whitespace(&without)
}

/// The first sentence of the text that is between 24 and 360 units long, else its first 360.
fn bounded_evidence_sentence(value: &str) -> String {
    let text = plain_text(value);
    if text.is_empty() {
        return String::new();
    }
    let units: Vec<u16> = text.encode_utf16().collect();
    for end in 24..=360 {
        let Some(unit) = units.get(end) else {
            break;
        };
        if !matches!(*unit, 0x2E | 0x21 | 0x3F) {
            continue;
        }
        if end >= units.len() - 1 || sentence_whitespace(&units, end + 1) {
            // The sentence must hold no line break, which the one-line text cannot.
            return trim(&units_text(units.get(..=end).unwrap_or_default())).to_string();
        }
    }
    trim(utf16::prefix(&text, 360)).to_string()
}

/// The sentences of the text, each up to its closing mark; a mark inside a word does not end one.
fn sentences_of(value: &str) -> Vec<String> {
    let characters: Vec<char> = value.chars().collect();
    let is_mark = |character: char| matches!(character, '.' | '!' | '?');
    let mut sentences = Vec::new();
    let mut start = 0;
    while start < characters.len() {
        let mut end = start;
        while characters.get(end).is_some_and(|character| !is_mark(*character)) {
            end += 1;
        }
        if end == start {
            start += 1;
            continue;
        }
        let matched = match characters.get(end) {
            None => Some(end),
            Some(_) => {
                let after = characters.get(end + 1);
                (after.is_none() || after.is_some_and(|character| is_whitespace(*character)))
                    .then_some(end + 1)
            }
        };
        match matched {
            Some(stop) => {
                sentences.push(characters.get(start..stop).unwrap_or_default().iter().collect());
                start = stop;
            }
            None => start += 1,
        }
    }
    sentences
}

static NUMBERED_SENTENCE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\d+(?:\.\d+)*\s"));
static RELEASE_SENTENCE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)^(?:release|version)\b"));
static RELEASED_SENTENCE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)\b(?:was|is|has been) released\b"));
static IDENTITY_KIND: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?i)\b(?:app|application|client|database|engine|framework|library|platform|runtime|server|service|tool|workbench)\b")
});
static IDENTITY_PURPOSE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)\b(?:built|created|designed|made)\s+for\b|\bfor\b|\bto\b"));
static PURPOSE_VERB: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?i)\b(?:provides|allows|lets|enables|helps|exists\s+to)\b")
});

fn explicit_purpose_sentence(value: &str, project_title: &str) -> String {
    let text = plain_text(value);
    if text.is_empty() {
        return String::new();
    }
    let candidates: Vec<String> = sentences_of(&text)
        .into_iter()
        .map(|sentence| trim(&sentence).to_string())
        .filter(|sentence| {
            let length = utf16::len(sentence);
            (24..=360).contains(&length)
                && !NUMBERED_SENTENCE.is_match(sentence)
                && !RELEASE_SENTENCE.is_match(sentence)
                && !RELEASED_SENTENCE.is_match(sentence)
        })
        .collect();
    let normalized_title = normalize_semantic_text(project_title);
    let identity = if normalized_title.is_empty() {
        None
    } else {
        candidates.iter().find(|sentence| {
            let normalized = normalize_semantic_text(sentence);
            (normalized.starts_with(&format!("{normalized_title} is "))
                || normalized.starts_with(&format!("{normalized_title} are ")))
                && IDENTITY_KIND.is_match(sentence)
                && IDENTITY_PURPOSE.is_match(sentence)
        })
    };
    if let Some(sentence) = identity {
        return sentence.clone();
    }
    candidates
        .into_iter()
        .find(|sentence| PURPOSE_VERB.is_match(sentence))
        .unwrap_or_default()
}

const GENERIC_CLAIM_TERMS: &[&str] = &[
    "a", "an", "and", "application", "applications", "codebase", "developer", "developers", "for",
    "from", "helps", "local", "of", "operations", "platform", "product", "project", "provides",
    "repository", "service", "services", "software", "system", "the", "this", "to", "tool",
    "tools", "user", "users", "with", "workflow", "workflows",
];

fn semantic_claim_terms(value: &str) -> BTreeSet<String> {
    let lowered = value.to_lowercase();
    let characters: Vec<char> = lowered.chars().collect();
    let is_ascii_word = |character: char| character.is_ascii_lowercase() || character.is_ascii_digit();
    let is_hangul = |character: char| ('\u{AC00}'..='\u{D7A3}').contains(&character);
    let mut terms = BTreeSet::new();
    let mut at = 0;
    while at < characters.len() {
        let Some(first) = characters.get(at).copied() else {
            break;
        };
        let kind: fn(char) -> bool = if is_ascii_word(first) {
            |character| character.is_ascii_lowercase() || character.is_ascii_digit()
        } else if is_hangul(first) {
            |character| ('\u{AC00}'..='\u{D7A3}').contains(&character)
        } else {
            at += 1;
            continue;
        };
        let mut end = at;
        while characters.get(end).is_some_and(|character| kind(*character)) {
            end += 1;
        }
        let token: String = characters.get(at..end).unwrap_or_default().iter().collect();
        let hangul = is_hangul(first);
        at = end;
        if hangul && token.chars().count() < 2 {
            continue;
        }
        if GENERIC_CLAIM_TERMS.contains(&token.as_str()) {
            continue;
        }
        if token.chars().count() >= 4 || hangul {
            terms.insert(token);
        }
    }
    terms
}

fn has_claim_specific_overlap(purpose_sentence: &str, candidate_prose: &str) -> bool {
    let purpose_terms = semantic_claim_terms(purpose_sentence);
    if purpose_terms.len() < 2 {
        return false;
    }
    let candidate_terms = semantic_claim_terms(candidate_prose);
    purpose_terms
        .iter()
        .filter(|term| candidate_terms.contains(*term))
        .count()
        >= 2
}

static RESPONSIBILITY_VERB: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)\b(?:owns|is responsible for|governs|handles|covers)\b|(?:소유(?:한다|함)?|책임(?:을)?\s*(?:진다|맡는다)|관할|담당(?:한다|함)?|다룬다|처리(?:한다|함)?|관리(?:한다|함)?|포괄(?:한다|함)?)",
    )
});

fn evidence_fingerprint(row: Option<&SemanticEvidence>) -> String {
    let Some(row) = row else {
        return String::new();
    };
    let normalized = ComposingNormalizerBorrowed::new_nfkc().normalize(&row.excerpt);
    trim(&collapse_whitespace(&normalized.to_lowercase())).to_string()
}

fn independent_rows<'a>(
    rows: &[&'a SemanticEvidence],
    initial: Vec<&SemanticEvidence>,
) -> Vec<&'a SemanticEvidence> {
    let mut seen: BTreeSet<String> = initial
        .into_iter()
        .map(|row| evidence_fingerprint(Some(row)))
        .filter(|fingerprint| !fingerprint.is_empty())
        .collect();
    rows.iter()
        .copied()
        .filter(|row| {
            let fingerprint = evidence_fingerprint(Some(row));
            !fingerprint.is_empty() && seen.insert(fingerprint)
        })
        .collect()
}

/// The document and sentence that, apart from the README heading, say what the domain is
/// responsible for.
pub fn find_domain_responsibility_witness<'a>(
    domain: &DomainCandidate,
    semantic_evidence: &'a [SemanticEvidence],
) -> Option<(&'a SemanticEvidence, String)> {
    let name_source = domain.evidence.source.as_str();
    let normalized_domain = normalize_semantic_text(&domain.title);
    let name_fingerprint = evidence_fingerprint(
        semantic_evidence.iter().find(|row| row.source == name_source),
    );
    if normalized_domain.is_empty() {
        return None;
    }
    for row in semantic_evidence {
        if row.source == name_source
            || !["product-contract", "architecture"].contains(&row.role.as_str())
            || row.trust != TRUSTED
            || row.excerpt.is_empty()
            || evidence_fingerprint(Some(row)) == name_fingerprint
        {
            continue;
        }
        let sentence = sentences_of(&row.excerpt)
            .into_iter()
            .map(|sentence| collapse_whitespace(&sentence))
            .find(|sentence| {
                normalize_semantic_text(sentence).contains(&normalized_domain)
                    && RESPONSIBILITY_VERB.is_match(sentence)
            });
        if let Some(sentence) = sentence {
            return Some((row, sentence));
        }
    }
    None
}

fn risk_flags_of(row: &SemanticEvidence) -> Vec<String> {
    unique_strings(
        row.risk_flags
            .iter()
            .map(String::as_str)
            .chain(
                row.review_required_evidence
                    .iter()
                    .flat_map(|evidence| evidence.risk_flags.iter().map(String::as_str)),
            ),
    )
}

/// An ontology node a vault in the repository already holds.
#[derive(Debug, Clone, Serialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct OntologyEvidenceRow {
    pub slug: String,
    pub kind: String,
    pub source: String,
}

fn ontology_row(node: &ExistingOntologyNode) -> OntologyEvidenceRow {
    OntologyEvidenceRow {
        slug: node.slug.clone(),
        kind: node.kind.clone(),
        source: node.source.clone(),
    }
}

#[derive(Debug, Serialize)]
pub struct BusinessOntology {
    pub domains: Vec<String>,
    pub capabilities: Vec<String>,
    pub evidence: Vec<OntologyEvidenceRow>,
}

#[derive(Debug, Serialize)]
pub struct ProposedBusinessOntology {
    pub domains: Vec<ProposedDomain>,
    pub capabilities: Vec<ProposedCapability>,
}

#[derive(Debug, Serialize)]
pub struct ReviewRequiredCapability {
    pub slug: String,
    pub reason: &'static str,
    pub evidence: SourceEvidence,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImplementationEvidence {
    pub elements: Vec<String>,
    pub review_required_capabilities: Vec<ReviewRequiredCapability>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeaningGate {
    pub policy: &'static str,
    pub source_structure_role: &'static str,
    pub business_ontology: BusinessOntology,
    pub proposed_business_ontology: ProposedBusinessOntology,
    pub implementation_evidence: ImplementationEvidence,
    pub review_questions: Vec<String>,
}

pub fn build_meaning_gate(input: &GateInput<'_>) -> MeaningGate {
    let existing_by_slug: BTreeMap<&str, &ExistingOntologyNode> = input
        .existing_ontology
        .iter()
        .map(|node| (node.slug.as_str(), node))
        .collect();
    let existing_domains: Vec<&ExistingOntologyNode> = input
        .existing_ontology
        .iter()
        .filter(|node| node.kind == "domain")
        .collect();
    let mut business_domains: Vec<String> = Vec::new();
    for node in &existing_domains {
        if !business_domains.contains(&node.slug) {
            business_domains.push(node.slug.clone());
        }
    }
    let mut existing_by_element: BTreeMap<&str, &ExistingOntologyNode> = BTreeMap::new();
    for node in input.existing_ontology.iter().filter(|node| node.kind == "capability") {
        for element in &node.elements {
            existing_by_element.entry(element.as_str()).or_insert(node);
        }
    }
    let mut business_capabilities: Vec<String> = Vec::new();
    let mut evidence_by_business_slug: BTreeMap<&str, &ExistingOntologyNode> = BTreeMap::new();
    let mut matched_candidate_slugs: BTreeSet<&str> = BTreeSet::new();
    for capability in input.capabilities {
        let found = existing_by_slug
            .get(capability.slug.as_str())
            .or_else(|| existing_by_element.get(capability.evidence.source.as_str()));
        if let Some(node) = found {
            matched_candidate_slugs.insert(capability.slug.as_str());
            evidence_by_business_slug.insert(node.slug.as_str(), node);
            business_capabilities.push(node.slug.clone());
        }
    }
    let mut business_capability_set: Vec<String> = Vec::new();
    for slug in &business_capabilities {
        if !business_capability_set.contains(slug) {
            business_capability_set.push(slug.clone());
        }
    }
    let has_shared_business_context = input.existing_ontology.iter().any(|node| {
        (node.kind == "domain" || node.kind == "capability")
            && !STARTER_ONTOLOGY_SLUGS.contains(&node.slug.as_str())
    });
    let business_candidates: Vec<MeaningCandidate> =
        if !input.semantic_capability_candidates.is_empty() {
            input.semantic_capability_candidates.to_vec()
        } else if has_shared_business_context {
            input
                .capabilities
                .iter()
                .map(MeaningCandidate::structural)
                .collect()
        } else {
            Vec::new()
        };
    let review_required_capabilities: Vec<ReviewRequiredCapability> = input
        .capabilities
        .iter()
        .filter(|capability| {
            !existing_by_slug.contains_key(capability.slug.as_str())
                && !matched_candidate_slugs.contains(capability.slug.as_str())
        })
        .map(|capability| ReviewRequiredCapability {
            slug: capability.slug.clone(),
            reason: "implementation-only: source folder is implementation evidence, not proof of a shared capability meaning; add business outcome and stable responsibility evidence before promoting this capability",
            evidence: capability.evidence.clone(),
        })
        .collect();
    let proposed_capabilities: Vec<ProposedCapability> = business_candidates
        .iter()
        .filter(|candidate| {
            !existing_by_slug.contains_key(candidate.slug.as_str())
                && !matched_candidate_slugs.contains(candidate.slug.as_str())
        })
        .map(|candidate| enrich_capability(candidate, input.semantic_evidence))
        .collect();
    let proposed_domains: Vec<ProposedDomain> = input
        .domains
        .iter()
        .filter(|domain| !existing_by_slug.contains_key(domain.slug.as_str()))
        .map(|domain| enrich_domain(domain, input.semantic_evidence))
        .collect();

    let mut business_evidence: Vec<OntologyEvidenceRow> = Vec::new();
    let push_evidence = |row: OntologyEvidenceRow, rows: &mut Vec<OntologyEvidenceRow>| {
        if !rows.contains(&row) {
            rows.push(row);
        }
    };
    for node in &existing_domains {
        push_evidence(ontology_row(node), &mut business_evidence);
    }
    for slug in &business_capabilities {
        let existing = existing_by_slug
            .get(slug.as_str())
            .or_else(|| evidence_by_business_slug.get(slug.as_str()));
        let row = match existing {
            Some(node) => ontology_row(node),
            None => OntologyEvidenceRow {
                slug: slug.clone(),
                kind: "capability".to_string(),
                source: business_candidates
                    .iter()
                    .find(|candidate| candidate.slug == *slug)
                    .map_or_else(|| slug.clone(), |candidate| candidate.evidence.source.clone()),
            },
        };
        push_evidence(row, &mut business_evidence);
    }

    let mut questions: Vec<String> = vec![
        "What business/product outcome, user workflow, ownership boundary, or decision does this node explain?".to_string(),
        "Which source path, README heading, import edge, or file-level element proves the implementation evidence?".to_string(),
        "Should this code structure stay evidence-only instead of becoming a domain or capability node?".to_string(),
        "[visible-gap · omitted-behavior] Record runtime, test, package, and unsupported-language behavior this scan did not inspect, plus the next repository-contained witness needed to assess it.".to_string(),
        "[visible-gap · scope-exclusion] Separate project exclusions explicitly stated by evidence from boundaries that remain unknown; record the source citation for each.".to_string(),
    ];
    let has_trusted_mission = input
        .semantic_evidence
        .iter()
        .any(|row| is_business_narrative(row) && is_trusted_with_excerpt(row));
    let has_persisted_domain = !existing_domains.is_empty();
    let has_readme_only_domain = !proposed_domains.is_empty();
    let has_unconfirmed = proposed_domains
        .iter()
        .any(|domain| domain.evidence_sources.len() < 2);
    let has_corroborated = proposed_domains
        .iter()
        .any(|domain| domain.evidence_sources.len() >= 2);
    if !has_trusted_mission {
        questions.push("[missing · scope] Add trusted mission or product evidence that states the user outcome and the repository responsibility boundary.".to_string());
    }
    if !has_persisted_domain && !has_readme_only_domain {
        questions.push("[weak · domain-boundary] Confirm the domain boundary with persisted business evidence; a README heading alone is only a candidate.".to_string());
    }
    if has_unconfirmed {
        questions.push("[weak · domain-boundary] Add a separate current product-contract or architecture responsibility witness; a README heading alone remains only a candidate.".to_string());
    }
    if has_corroborated {
        questions.push("[proposal · domain-boundary] Repository prose corroborates a proposed boundary, but human approval is still required before it becomes shared meaning.".to_string());
    }
    if !proposed_capabilities.is_empty() {
        questions.push("[weak · capability-outcome] Confirm the proposed capability with a concrete business outcome and the responsibility it owns.".to_string());
    }
    let implementation_slugs: BTreeSet<&str> = input
        .capabilities
        .iter()
        .map(|row| row.slug.as_str())
        .chain(input.elements.iter().map(|row| row.slug.as_str()))
        .collect();
    let typed_dependencies = input
        .observed_dependencies
        .iter()
        .filter(|relation| {
            implementation_slugs.contains(relation.from.as_str())
                && implementation_slugs.contains(relation.to.as_str())
                && relation.product_value_count.is_none_or(|count| count > 0)
        })
        .count();
    let impact_relevant = input
        .elements
        .iter()
        .filter(|element| !input.non_product_go_package_slugs.contains(&element.slug))
        .count();
    if impact_relevant >= 2 || typed_dependencies > 0 {
        if typed_dependencies > 0 {
            let noun = if typed_dependencies == 1 { "boundary" } else { "boundaries" };
            questions.push(format!(
                "[observed · impact] {typed_dependencies} typed production import {noun} link implementation candidates; review bounded infer_imports evidence before promoting a depends_on relation."
            ));
        } else {
            questions.push("[not-measured · impact] Identify the typed depends_on relation between implementation elements, or record why no dependency impact is currently measurable.".to_string());
        }
    }
    if input.semantic_evidence.iter().any(|row| {
        risk_flags_of(row)
            .iter()
            .any(|risk| POLICY_RISKS.contains(&risk.as_str()))
    }) {
        questions.push("[review · policy-evidence] Review future, negated, or deprecated evidence before treating it as current policy; the risk alone is not current policy.".to_string());
    }
    MeaningGate {
        policy: "business-first",
        source_structure_role: "implementation-evidence",
        business_ontology: BusinessOntology {
            domains: business_domains,
            capabilities: business_capability_set,
            evidence: business_evidence,
        },
        proposed_business_ontology: ProposedBusinessOntology {
            domains: proposed_domains,
            capabilities: proposed_capabilities,
        },
        implementation_evidence: ImplementationEvidence {
            elements: input.elements.iter().map(|row| row.slug.clone()).collect(),
            review_required_capabilities,
        },
        review_questions: questions,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssertionPolicy {
    pub source_facts: &'static str,
    pub readme_and_folder_meanings: &'static str,
    pub persisted_ontology_meanings: &'static str,
    pub automatic_business_assertions: usize,
    pub human_approval_required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetencyQuestion {
    pub id: &'static str,
    #[serde(rename = "type")]
    pub question_type: &'static str,
    pub question: &'static str,
    pub priority: &'static str,
    pub required_witnesses: &'static [&'static str],
}

pub const COMPETENCY_QUESTIONS: [CompetencyQuestion; 5] = [
    CompetencyQuestion {
        id: "scope",
        question_type: "scoping",
        question: "What product/system outcome and user problem define the ontology scope?",
        priority: "core",
        required_witnesses: &["concepts", "evidence"],
    },
    CompetencyQuestion {
        id: "domains",
        question_type: "scoping",
        question: "Which stable business responsibilities or decision boundaries form its domains?",
        priority: "core",
        required_witnesses: &["concepts", "relations", "evidence"],
    },
    CompetencyQuestion {
        id: "abilities",
        question_type: "validation",
        question: "Which observable abilities realize those outcomes inside each domain?",
        priority: "core",
        required_witnesses: &["concepts", "relations", "evidence"],
    },
    CompetencyQuestion {
        id: "evidence",
        question_type: "validation",
        question: "Which source artifacts provide implementation evidence for each ability?",
        priority: "core",
        required_witnesses: &["concepts", "evidence", "paths"],
    },
    CompetencyQuestion {
        id: "impact",
        question_type: "relationship",
        question: "Which typed dependencies explain change impact across the model?",
        priority: "core",
        required_witnesses: &["concepts", "relations", "evidence"],
    },
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityGates {
    pub scope_candidate_available: bool,
    pub shared_business_concepts_available: bool,
    pub proposed_business_concepts: usize,
    pub implementation_evidence_available: bool,
    pub semantic_evidence_available: bool,
    pub semantic_evidence_review_required: usize,
    pub typed_relations_proposed: usize,
    pub provenance_attached: bool,
    pub uncertainty_explicit: bool,
    pub approval_required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionContract {
    pub standard: &'static str,
    pub status: &'static str,
    pub assertion_policy: AssertionPolicy,
    pub competency_questions: &'static [CompetencyQuestion],
    pub quality_gates: QualityGates,
    pub limitations: [&'static str; 5],
    pub next_step: &'static str,
}

/// What the extraction contract reads from the scan.
pub struct ContractInput<'a> {
    pub has_project: bool,
    pub domains: &'a [DomainCandidate],
    pub capabilities: &'a [CapabilityCandidate],
    pub semantic_capability_candidates: &'a [MeaningCandidate],
    pub elements: &'a [ElementCandidate],
    pub existing_ontology: &'a [ExistingOntologyNode],
    pub suggested_relations: &'a [SuggestedRelation],
    pub semantic_evidence: &'a [SemanticEvidence],
}

pub fn build_extraction_contract(input: &ContractInput<'_>) -> ExtractionContract {
    let ContractInput {
        has_project,
        domains,
        capabilities,
        semantic_capability_candidates,
        elements,
        existing_ontology,
        suggested_relations,
        semantic_evidence,
    } = *input;
    let persisted = existing_ontology
        .iter()
        .filter(|node| node.kind == "domain" || node.kind == "capability")
        .count();
    let proposed = domains.len() + semantic_capability_candidates.len();
    let observed = elements.len();
    ExtractionContract {
        standard: "formal-explicit-shared-conceptualization",
        status: if persisted > 0 {
            "grounded-in-existing-ontology"
        } else if observed > 0 || proposed > 0 {
            "evidence-gathering"
        } else {
            "scope-discovery-required"
        },
        assertion_policy: AssertionPolicy {
            source_facts: "observed",
            readme_and_folder_meanings: "proposed",
            persisted_ontology_meanings: "shared",
            automatic_business_assertions: 0,
            human_approval_required: true,
        },
        competency_questions: &COMPETENCY_QUESTIONS,
        quality_gates: QualityGates {
            scope_candidate_available: has_project,
            shared_business_concepts_available: persisted > 0,
            proposed_business_concepts: proposed,
            implementation_evidence_available: observed > 0,
            semantic_evidence_available: !semantic_evidence.is_empty(),
            semantic_evidence_review_required: semantic_evidence
                .iter()
                .filter(|row| !risk_flags_of(row).is_empty())
                .count(),
            typed_relations_proposed: suggested_relations.len(),
            provenance_attached: !domains.iter().any(|row| row.evidence.source.is_empty())
                && !capabilities.iter().any(|row| row.evidence.source.is_empty())
                && !elements.iter().any(|row| row.evidence.source.is_empty()),
            uncertainty_explicit: true,
            approval_required: true,
        },
        limitations: [
            "Repository structure can prove implementation shape, but cannot by itself prove business meaning.",
            "README headings and source-folder names remain proposals until a human or persisted ontology establishes shared intent.",
            "Instructions, future-state claims, negations, and deprecated-state prose are review signals, not current business facts.",
            "Completeness is evaluated against competency questions, not against the number of discovered folders.",
            "A resolved witness proves that the cited graph fact or repository path exists; semantic role accuracy still depends on the bounded evidence packet and human approval.",
        ],
        next_step: "Use semanticEvidence to propose defined domains and capabilities; answer each competency question with answer/status/witnesses, keep unsupported claims as partial or visible-gap, and write only after every witness resolves.",
    }
}
