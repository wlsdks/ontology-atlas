//! A source file opened for a read: its bytes decoded, split into lines and outlined, under the
//! same path policy and stable-read checks whichever read asks for it.

use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use confined_files::{sha256_hex, SourceRoot};

use crate::file_outline::{outline_file, FileOutline, OutlineDeclaration};
use crate::path_policy::path_refusal;
use crate::refusal_reason::RefusalReason;
use crate::source_lines::{complete_lines, decode_source};

/// The largest source file a read opens.
pub const MAX_FILE_BYTES: u64 = 256 * 1024;

pub struct OpenedFile {
    pub path: String,
    pub bytes: usize,
    pub sha256: String,
    pub text: String,
    pub lines: Vec<String>,
    pub outline: FileOutline,
}

impl OpenedFile {
    pub fn declarations(&self) -> &[OutlineDeclaration] {
        &self.outline.declarations
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
    let bytes = root
        .read_repository_file(&parts, MAX_FILE_BYTES)
        .map_err(RefusalReason::from)?;
    if bytes.contains(&0) {
        return Err(RefusalReason::BinarySource);
    }
    let text = decode_source(&bytes).ok_or(RefusalReason::InvalidUtf8)?;
    Ok(OpenedFile {
        path: path.to_string(),
        bytes: bytes.len(),
        sha256: sha256_hex(&bytes),
        lines: complete_lines(text),
        outline: outline_file(text, path),
        text: text.to_string(),
    })
}

/// Other files a symbol read draws context from, each opened once per call; `None` where the
/// policy or the disk refuses it.
pub struct FileOpener<'a> {
    root: &'a SourceRoot,
    ignore: &'a HashSet<String>,
    held: std::cell::RefCell<HashMap<String, Option<Rc<OpenedFile>>>>,
}

impl<'a> FileOpener<'a> {
    pub fn new(root: &'a SourceRoot, ignore: &'a HashSet<String>) -> Self {
        Self {
            root,
            ignore,
            held: std::cell::RefCell::new(HashMap::new()),
        }
    }

    pub fn open(&self, path: &str) -> Option<Rc<OpenedFile>> {
        if let Some(held) = self.held.borrow().get(path) {
            return held.clone();
        }
        let opened = open_source_file(self.root, path, self.ignore)
            .ok()
            .map(Rc::new);
        self.held
            .borrow_mut()
            .insert(path.to_string(), opened.clone());
        opened
    }
}
