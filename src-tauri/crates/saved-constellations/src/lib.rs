//! The constellations a person saved in a vault's collection file, read safely and judged as the
//! script server did. See `README.md`.

mod collections_file;
mod collections_validation;
mod constellation_context;
mod constellation_list;

pub use collections_file::{
    read_saved_collections, CollectionsSource, SavedCollections, Status, COLLECTIONS_PATH,
};
pub use collections_validation::{Collections, Folder, Item, Target};
pub use constellation_context::{
    constellation_context, select_constellation, ConstellationContext, ContextFault,
    ContextRequest, Selection,
};
pub use constellation_list::{list_constellations, Constellation, Purpose};
