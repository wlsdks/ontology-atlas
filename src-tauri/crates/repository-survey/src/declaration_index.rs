//! Where each declared name lives across the product files, so an ability row can say which file
//! a name is declared in. Built from the outlines the survey already took in its one read of each
//! file; the names keep the order the files were walked in.

use indexmap::IndexMap;
use source_scan::DeclarationKind;

use crate::source_class::SourceClass;
use crate::unit_collection::Collection;

#[derive(Debug, Clone)]
pub struct IndexedDeclaration {
    pub path: String,
    pub line: usize,
    pub kind: DeclarationKind,
}

pub type DeclarationIndex = IndexMap<String, Vec<IndexedDeclaration>>;

pub fn declaration_index(collection: &Collection) -> DeclarationIndex {
    let mut index: DeclarationIndex = IndexMap::new();
    for file in collection
        .files
        .iter()
        .filter(|file| file.class == SourceClass::Product)
    {
        let Some(reading) = &file.reading else {
            continue;
        };
        for declaration in &reading.declarations {
            index
                .entry(declaration.name.clone())
                .or_default()
                .push(IndexedDeclaration {
                    path: file.path.clone(),
                    line: declaration.line,
                    kind: declaration.kind,
                });
        }
    }
    index
}

/// Whether the kind is one an operation can be (a class, function or method).
pub fn is_operation(kind: DeclarationKind) -> bool {
    matches!(
        kind,
        DeclarationKind::Class | DeclarationKind::Function | DeclarationKind::Method
    )
}
