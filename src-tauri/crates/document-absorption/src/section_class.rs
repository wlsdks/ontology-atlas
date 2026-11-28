//! Which kind of section a heading names: rules (written), architecture (suggested) or neither.

use std::sync::LazyLock;

use answer_format::utf16;
use regex::Regex;

use crate::sections::RawSection;

const POLICY_WORDS: &str = r"(?i-u:(?-u:\b)(rules?|polic(?:y|ies)|conventions?|guide(?:line)?s?|governance|principles?|practices?|workflows?|forbidden|do[-\s]?not|verification|test(?:s|ing)?|commit(?:s|ted|ting)?|contributing|security)(?-u:\b))";
const POLICY_WORDS_KO: &str = "(규칙|정책|가이드|원칙|규율|금지|워크플로우|절차|관례|컨벤션|커밋|테스트|검증|보안)";
const ARCHITECTURE_WORDS: &str = r"(?i-u:(?-u:\b)(architecture|components?|modules?|folder|structure|routes?|tech\s*stack|stack|layers?|schemas?|api)(?-u:\b))";
const ARCHITECTURE_WORDS_KO: &str = "(아키텍처|구조|폴더|모듈|컴포넌트|스택|라우트|레이어|스키마)";
const ELEMENT_WORDS: &str = r"(?i-u:(?-u:\b)(components?|modules?|schemas?|routes?)(?-u:\b))";
const ELEMENT_WORDS_KO: &str = "(컴포넌트|모듈|스키마|라우트)";

/// Words the sample counts to say how sure the class is: the body's first 200 units count too.
const SAMPLE_BODY_UNITS: usize = 200;

#[allow(clippy::expect_used, reason = "constant patterns, built by every test run")]
fn pattern(source: &str) -> Regex {
    Regex::new(source).expect("section class pattern")
}

static POLICY: LazyLock<[Regex; 2]> =
    LazyLock::new(|| [pattern(POLICY_WORDS), pattern(POLICY_WORDS_KO)]);
static ARCHITECTURE: LazyLock<[Regex; 2]> =
    LazyLock::new(|| [pattern(ARCHITECTURE_WORDS), pattern(ARCHITECTURE_WORDS_KO)]);
static ELEMENT: LazyLock<[Regex; 2]> =
    LazyLock::new(|| [pattern(ELEMENT_WORDS), pattern(ELEMENT_WORDS_KO)]);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Policy,
    Architecture,
    Unclassified,
}

impl Category {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Policy => "policy",
            Self::Architecture => "architecture",
            Self::Unclassified => "unclassified",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SectionClass {
    pub category: Category,
    /// The node kind a section of this class would become.
    pub kind: Option<&'static str>,
    pub role: Option<&'static str>,
    pub confidence: f64,
}

fn any_matches(patterns: &[Regex; 2], text: &str) -> bool {
    patterns.iter().any(|regex| regex.is_match(text))
}

fn count_matches(patterns: &[Regex; 2], text: &str) -> usize {
    patterns.iter().map(|regex| regex.find_iter(text).count()).sum()
}

fn confidence(base: f64, hits: usize, ceiling: f64) -> f64 {
    let raised = base + 0.1 * f64::from(u8::try_from(hits.min(3)).unwrap_or(3));
    raised.clamp(base, ceiling)
}

/// Rule headings become `document` nodes with `role: policy`; architecture headings are suggested
/// as an `element` or a `capability` and never written; anything else is left in the source.
pub fn classify_section(section: &RawSection) -> SectionClass {
    let sample = format!(
        "{} {}",
        section.heading,
        utf16::prefix(&section.body, SAMPLE_BODY_UNITS)
    );
    if any_matches(&POLICY, &section.heading) {
        return SectionClass {
            category: Category::Policy,
            kind: Some("document"),
            role: Some("policy"),
            confidence: confidence(0.6, count_matches(&POLICY, &sample), 0.95),
        };
    }
    if any_matches(&ARCHITECTURE, &section.heading) {
        let element = any_matches(&ELEMENT, &section.heading);
        return SectionClass {
            category: Category::Architecture,
            kind: Some(if element { "element" } else { "capability" }),
            role: None,
            confidence: confidence(0.55, count_matches(&ARCHITECTURE, &sample), 0.9),
        };
    }
    SectionClass {
        category: Category::Unclassified,
        kind: None,
        role: None,
        confidence: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn section(heading: &str, body: &str) -> RawSection {
        RawSection {
            heading: heading.to_string(),
            body: body.to_string(),
            raw: String::new(),
        }
    }

    #[test]
    fn a_rule_heading_is_a_policy_and_each_further_hit_in_the_sample_raises_the_confidence() {
        let class = classify_section(&section("Git rules", "Follow the commit rules."));
        assert_eq!(class.category, Category::Policy);
        assert_eq!(class.role, Some("policy"));
        assert!((class.confidence - 0.9).abs() < 1e-9, "{}", class.confidence);
    }

    #[test]
    fn word_boundaries_are_ascii_so_a_hangul_neighbour_does_not_hide_a_word() {
        assert_eq!(
            classify_section(&section("rules가", "")).category,
            Category::Policy
        );
        assert_eq!(
            classify_section(&section("Birthdays", "")).category,
            Category::Unclassified
        );
    }

    #[test]
    fn a_component_heading_is_suggested_as_an_element_and_a_layer_as_a_capability() {
        let element = classify_section(&section("Components", ""));
        assert_eq!((element.category, element.kind), (Category::Architecture, Some("element")));
        let layer = classify_section(&section("Layers", ""));
        assert_eq!(layer.kind, Some("capability"));
    }
}
