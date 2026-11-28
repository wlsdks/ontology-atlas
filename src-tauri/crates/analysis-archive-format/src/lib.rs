//! Where the analysis records of a vault are kept, how large one may be and what a record file is
//! called: the facts the app that writes them and the server that reads them must share. See
//! `README.md`.

mod archive_place;
mod record_file_name;

pub use archive_place::{ARCHIVE_DIRECTORY, ARCHIVE_FOLDER, MAX_RECORD_BYTES};
pub use record_file_name::{is_record_file_name, is_record_of, is_uuid_v4, record_file_name};
