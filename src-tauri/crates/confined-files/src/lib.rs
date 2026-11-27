//! Opening, reading and writing files under a vault or source root, and nothing outside it. The
//! credential-name filter, the slug-to-path rules, the scan and the snapshot limits join as the
//! tools that need them are ported.

pub mod confined_root;
