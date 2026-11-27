//! Text as agents read it from the JavaScript server, written once for every crate that answers
//! them: how long a string is and where it may be cut, what counts as whitespace, how a number is
//! written, in what order text is listed, and how a moment is written and read (`toISOString`,
//! `Date.parse`).
//!
//! The answers are compared with the JavaScript server's, so these rules keep JavaScript's meaning
//! where Rust's differs. One difference is chosen: a cut never falls inside a character
//! ([`utf16::prefix`]).

pub mod collation;
pub mod iso_time;
pub mod json;
pub mod number;
pub mod utf16;
pub mod whitespace;
