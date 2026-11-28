//! The concepts a write added, changed and removed, as the audit lines record them.

use crate::audit::ConceptEffect;

pub fn effect(added: &[&str], changed: &[&str], removed: &[&str]) -> ConceptEffect {
    let owned = |slugs: &[&str]| slugs.iter().map(|slug| (*slug).to_string()).collect();
    ConceptEffect::new(owned(added), owned(changed), owned(removed))
}
