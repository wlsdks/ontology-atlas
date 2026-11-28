//! What an agent's meaning proposal may do next. The proposal is checked against the repository
//! analysis, and the construction lifecycle says which phase blocks a write and why. Nothing here
//! writes: a person approves a plan before any tool does.

pub mod construction_lifecycle;
pub mod proposal_validation;
