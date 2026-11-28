//! The plan for absorbing a rules document into typed vault nodes. See `README.md`.

mod absorption_plan;
mod injection_scan;
mod section_class;
mod sections;
mod slim_pointer;
mod slug_choice;

pub use absorption_plan::{plan_absorption, AbsorptionPlan, Action, PlanSummary, PlannedSection};
pub use injection_scan::{scan_for_injection, InjectionScan};
pub use section_class::{classify_section, Category, SectionClass};
pub use sections::{split_document, DocumentSections, RawSection};
pub use slim_pointer::slim_pointer;
pub use slug_choice::slugify;

/// The characters JavaScript's `\s` matches, as the body of a regex class.
pub(crate) const JS_SPACE: &str =
    r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";
