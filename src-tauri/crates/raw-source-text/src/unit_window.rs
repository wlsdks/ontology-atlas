//! The part of a source's units one call returns: from a unit, at most a count, and at most a
//! number of characters. Every unit is counted, only the window is kept, so a source of a hundred
//! megabytes costs a pass over it and not a list of its lines.

use answer_format::utf16;

use crate::citable_unit::Unit;

pub const DEFAULT_UNIT_LIMIT: usize = 200;
pub const MAX_UNIT_LIMIT: usize = 1000;
/// Characters (UTF-16 units, as every limit an agent reads) of text one call returns at most,
/// whatever the unit count.
pub const MAX_WINDOW_CHARS: usize = 60_000;

/// What a call asked for. `from` is the first unit, counting from 1.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UnitWindow {
    pub from: usize,
    pub limit: usize,
    /// An XLSX sheet by its number in the workbook; every sheet when `None`.
    pub sheet: Option<usize>,
}

impl Default for UnitWindow {
    fn default() -> Self {
        Self {
            from: 1,
            limit: DEFAULT_UNIT_LIMIT,
            sheet: None,
        }
    }
}

/// Counts every unit offered and keeps the ones in the window, within the character budget.
pub(crate) struct WindowCollector {
    first: usize,
    after: usize,
    offered: usize,
    kept: Vec<Unit>,
    characters: usize,
    over_budget: bool,
}

impl WindowCollector {
    pub(crate) fn new(window: &UnitWindow) -> Self {
        let first = window.from.max(1);
        Self {
            first,
            after: first.saturating_add(window.limit.clamp(1, MAX_UNIT_LIMIT)),
            offered: 0,
            kept: Vec::new(),
            characters: 0,
            over_budget: false,
        }
    }

    /// Counts one unit. `make` runs only when the unit is in the window, so a unit nobody reads
    /// is never built.
    pub(crate) fn offer(&mut self, make: impl FnOnce() -> Unit) {
        self.offered += 1;
        if self.offered < self.first || self.offered >= self.after || self.over_budget {
            return;
        }
        let unit = make();
        self.characters += utf16::len(&unit.text);
        if self.characters > MAX_WINDOW_CHARS && !self.kept.is_empty() {
            self.over_budget = true;
            return;
        }
        self.kept.push(unit);
    }

    pub(crate) fn finish(self) -> CollectedUnits {
        CollectedUnits {
            unit_count: self.offered,
            first: self.first,
            units: self.kept,
        }
    }
}

pub(crate) struct CollectedUnits {
    pub(crate) unit_count: usize,
    pub(crate) first: usize,
    pub(crate) units: Vec<Unit>,
}
