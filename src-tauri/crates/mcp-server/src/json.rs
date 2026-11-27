//! JSON the way JavaScript reads and writes it.
//!
//! An answer's bytes are compared with the JavaScript server's, so an object keeps the order
//! JavaScript gives its keys (integer-like keys first, ascending, then the rest in the order they
//! were added), and a number is written with the digits `Number.prototype.toString` produces.
//! `serde_json` is not used: its maps either sort keys or need the `preserve_order` feature,
//! which Cargo would switch on for the whole app.

mod parse;
mod value;
mod write;

pub use parse::{parse, ParseError, MAX_DEPTH};
pub use value::{Object, Value};
pub use write::{to_json, to_json_pretty, write_json, write_string};
