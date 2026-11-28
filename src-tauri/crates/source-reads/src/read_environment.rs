//! What one call of `sourceReads` shares between its selectors: the root, the names a read
//! refuses, the files already opened, and the walk of the repository's product files that a
//! symbol read draws its callees and callers from, made once and only when one is asked for.

use std::cell::OnceCell;
use std::collections::HashSet;

use confined_files::SourceRoot;

use crate::opened_file::FileOpener;
use crate::product_index::ProductIndex;

pub struct ReadEnvironment<'a> {
    pub root: &'a SourceRoot,
    /// The folder names a read refuses: the scan's own list and the caller's `ignore`.
    pub ignore: &'a HashSet<String>,
    /// The caller's `ignore` alone, which the walk of product files adds to its own list.
    pub extra_ignore: &'a [String],
    pub opener: FileOpener<'a>,
    products: OnceCell<ProductIndex>,
}

impl<'a> ReadEnvironment<'a> {
    pub fn new(
        root: &'a SourceRoot,
        extra_ignore: &'a [String],
        ignore: &'a HashSet<String>,
    ) -> Self {
        Self {
            root,
            ignore,
            extra_ignore,
            opener: FileOpener::new(root, ignore),
            products: OnceCell::new(),
        }
    }

    /// The product files and their declarations, walked on the first call.
    pub fn products(&self) -> &ProductIndex {
        self.products
            .get_or_init(|| ProductIndex::walk(self.root, self.extra_ignore))
    }
}
