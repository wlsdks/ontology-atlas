//! Every write `plan` and `prepare` make after their first: under the folder's writer lock, on a
//! connection opened for that write, and only into the same file the plan opened.

use super::{deletion_count, stored_model, Model, META_STORE_ID};
use crate::lifecycle::{configure, lock_writer, open_flags, read_meta, VECTORS_FILE};
use crate::Error;
use rusqlite::{Connection, Transaction, TransactionBehavior};
use std::io;
use std::path::PathBuf;

pub(super) enum WriteError {
    /// The store was deleted, emptied in place or replaced since the plan opened it.
    Deleted,
    Index(Error),
}

impl From<rusqlite::Error> for WriteError {
    fn from(error: rusqlite::Error) -> Self {
        WriteError::Index(Error::Sql(error))
    }
}

impl From<WriteError> for Error {
    fn from(error: WriteError) -> Self {
        match error {
            WriteError::Deleted => Error::Deleted,
            WriteError::Index(error) => error,
        }
    }
}

/// The store a plan opened: its folder, model, generation and the deletions seen then.
#[derive(Clone, Debug)]
pub(super) struct StoreWriter {
    pub(super) dir: PathBuf,
    pub(super) model: Model,
    pub(super) store_id: String,
    pub(super) deletions: i64,
}

impl StoreWriter {
    /// Runs `write` in one immediate transaction, or answers `Deleted` once a Delete ran here or
    /// the file on disk is no longer the plan's (another process deleted, emptied or replaced it).
    pub(super) fn locked<T>(
        &self,
        write: impl FnOnce(&Transaction) -> rusqlite::Result<T>,
    ) -> Result<T, WriteError> {
        let _lock = match lock_writer(&self.dir) {
            Ok(lock) => lock,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Err(WriteError::Deleted)
            }
            Err(error) => return Err(WriteError::Index(error.into())),
        };
        let path = self.dir.join(VECTORS_FILE);
        if deletion_count(&self.dir) != self.deletions || !path.is_file() {
            return Err(WriteError::Deleted);
        }
        let mut conn = Connection::open_with_flags(&path, open_flags())?;
        configure(&conn)?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let same_store = read_meta(&tx, META_STORE_ID)?.as_deref() == Some(self.store_id.as_str())
            && stored_model(&tx)?.as_ref() == Some(&self.model);
        if !same_store {
            return Err(WriteError::Deleted);
        }
        let written = write(&tx)?;
        tx.commit()?;
        Ok(written)
    }
}
