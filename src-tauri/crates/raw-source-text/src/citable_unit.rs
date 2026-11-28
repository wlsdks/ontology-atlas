//! One citable unit of a raw source: the text a wiki citation anchor (`#h:scope`, `#s1r4`, `#l7`)
//! points at, and where it sits.

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

/// What a unit is a piece of.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnitKind {
    Heading,
    Paragraph,
    Row,
    Line,
}

impl UnitKind {
    fn name(self) -> &'static str {
        match self {
            Self::Heading => "heading",
            Self::Paragraph => "paragraph",
            Self::Row => "row",
            Self::Line => "line",
        }
    }
}

/// The section or sheet a unit sits in, for the formats that have one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UnitPlace {
    /// A line of text, a CSV record or an HTML line: nothing around it.
    Bare,
    /// A DOCX paragraph and the heading above it, none before the first heading.
    Section(Option<String>),
    /// An XLSX row and the name of its sheet.
    Sheet(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unit {
    pub anchor: String,
    pub place: UnitPlace,
    pub text: String,
    pub kind: UnitKind,
}

impl Serialize for Unit {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut unit = serializer.serialize_map(None)?;
        unit.serialize_entry("anchor", &self.anchor)?;
        match &self.place {
            UnitPlace::Bare => {}
            UnitPlace::Section(heading) => unit.serialize_entry("heading", heading)?,
            UnitPlace::Sheet(name) => unit.serialize_entry("sheet", name)?,
        }
        unit.serialize_entry("text", &self.text)?;
        unit.serialize_entry("kind", self.kind.name())?;
        unit.end()
    }
}
