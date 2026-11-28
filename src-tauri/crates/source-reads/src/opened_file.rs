//! A source file opened for a read: its bytes decoded, split into lines and outlined, under the
//! same path policy and stable-read checks whichever read asks for it.

use std::cell::{OnceCell, RefCell};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use confined_files::{sha256_hex, FileStamp, SourceRoot};

use crate::file_outline::{outline_file, FileOutline, OutlineDeclaration};
use crate::import_bindings::{read_imports, Imports};
use crate::path_policy::path_refusal;
use crate::refusal_reason::RefusalReason;
use crate::source_lines::{complete_lines, decode_source};

/// The largest source file a read opens.
pub const MAX_FILE_BYTES: u64 = 256 * 1024;

pub struct OpenedFile {
    pub path: String,
    pub bytes: usize,
    pub sha256: String,
    /// The stamp of the file these bytes were read from.
    pub stamp: FileStamp,
    pub lines: Vec<String>,
    pub outline: FileOutline,
    imports: OnceCell<Imports>,
}

impl OpenedFile {
    pub fn declarations(&self) -> &[OutlineDeclaration] {
        &self.outline.declarations
    }

    /// What the file imports, read on first use.
    pub fn imports(&self) -> &Imports {
        self.imports
            .get_or_init(|| read_imports(&self.path, &self.lines))
    }
}

/// Opens `path` under `root`, or says why it may not be read.
pub fn open_source_file(
    root: &SourceRoot,
    path: &str,
    ignore: &HashSet<String>,
) -> Result<OpenedFile, RefusalReason> {
    if let Some(reason) = path_refusal(path, ignore) {
        return Err(reason);
    }
    let parts: Vec<&str> = path.split('/').collect();
    let file = root
        .read_repository_file(&parts, MAX_FILE_BYTES)
        .map_err(RefusalReason::from)?;
    let bytes = file.bytes;
    if bytes.contains(&0) {
        return Err(RefusalReason::BinarySource);
    }
    let text = decode_source(&bytes).ok_or(RefusalReason::InvalidUtf8)?;
    Ok(OpenedFile {
        path: path.to_string(),
        bytes: bytes.len(),
        sha256: sha256_hex(&bytes),
        stamp: file.stamp,
        lines: complete_lines(text),
        outline: outline_file(text, path),
        imports: OnceCell::new(),
    })
}

/// The files one call opens, each read once: a selector and the context of another read see the
/// same bytes, and a refusal is remembered with its reason.
pub struct FileOpener<'a> {
    root: &'a SourceRoot,
    ignore: &'a HashSet<String>,
    held: RefCell<HashMap<String, Result<Rc<OpenedFile>, RefusalReason>>>,
}

impl<'a> FileOpener<'a> {
    pub fn new(root: &'a SourceRoot, ignore: &'a HashSet<String>) -> Self {
        Self {
            root,
            ignore,
            held: RefCell::new(HashMap::new()),
        }
    }

    pub fn open_or_refuse(&self, path: &str) -> Result<Rc<OpenedFile>, RefusalReason> {
        if let Some(held) = self.held.borrow().get(path) {
            return held.clone();
        }
        let opened = open_source_file(self.root, path, self.ignore).map(Rc::new);
        self.held
            .borrow_mut()
            .insert(path.to_string(), opened.clone());
        opened
    }

    pub fn open(&self, path: &str) -> Option<Rc<OpenedFile>> {
        self.open_or_refuse(path).ok()
    }
}
