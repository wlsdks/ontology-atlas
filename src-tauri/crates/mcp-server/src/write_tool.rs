//! The tools that change the vault, as a closed set.
//!
//! A tool is a write tool because it is named here, not because someone remembered to guard it:
//! every match on [`WriteTool`] must say what to do for each, so a tool added to this list cannot
//! compile until the consent question ([`crate::consent`]) and its handler's registration
//! ([`crate::tools`]) name it. `tests/` and the unit test below hold the list equal to the surface:
//! a tool the generated registry calls a write tool and this list lacks fails the build's tests.

/// A tool that changes the vault, retired names included: a retired tool still answers and still
/// writes, so it passes the same checkpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum WriteTool {
    AddConcept,
    AddConcepts,
    AddRelation,
    AddRelations,
    RemoveRelation,
    PatchConcept,
    RenameConcept,
    MergeConcepts,
    DeleteConcept,
    AbsorbDocument,
    ConnectProjectSource,
    FinalizeProjectMeaning,
    /// Only a test build has it: a tool that writes one file, to exercise the checkpoint.
    #[cfg(feature = "test-hooks")]
    TestWrite,
}

const SHIPPED: [WriteTool; 12] = [
    WriteTool::AddConcept,
    WriteTool::AddConcepts,
    WriteTool::AddRelation,
    WriteTool::AddRelations,
    WriteTool::RemoveRelation,
    WriteTool::PatchConcept,
    WriteTool::RenameConcept,
    WriteTool::MergeConcepts,
    WriteTool::DeleteConcept,
    WriteTool::AbsorbDocument,
    WriteTool::ConnectProjectSource,
    WriteTool::FinalizeProjectMeaning,
];

impl WriteTool {
    /// The tools the registry advertises or still answers to that write.
    pub const fn shipped() -> &'static [WriteTool] {
        &SHIPPED
    }

    /// The name an agent calls it by.
    pub const fn name(self) -> &'static str {
        match self {
            Self::AddConcept => "add_concept",
            Self::AddConcepts => "add_concepts",
            Self::AddRelation => "add_relation",
            Self::AddRelations => "add_relations",
            Self::RemoveRelation => "remove_relation",
            Self::PatchConcept => "patch_concept",
            Self::RenameConcept => "rename_concept",
            Self::MergeConcepts => "merge_concepts",
            Self::DeleteConcept => "delete_concept",
            Self::AbsorbDocument => "absorb_document",
            Self::ConnectProjectSource => "connect_project_source",
            Self::FinalizeProjectMeaning => "finalize_project_meaning",
            #[cfg(feature = "test-hooks")]
            Self::TestWrite => "__test_write",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        #[cfg(feature = "test-hooks")]
        if name == Self::TestWrite.name() {
            return Some(Self::TestWrite);
        }
        SHIPPED.iter().copied().find(|tool| tool.name() == name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surface::Surface;

    #[test]
    fn the_write_tools_are_exactly_the_tools_the_registry_does_not_call_read_tools() {
        let surface = Surface::embedded();
        let mut named: Vec<&str> = WriteTool::shipped()
            .iter()
            .map(|tool| tool.name())
            .collect();
        let mut advertised = surface.write_tool_names();
        named.sort_unstable();
        advertised.sort_unstable();
        assert_eq!(named, advertised);
    }
}
