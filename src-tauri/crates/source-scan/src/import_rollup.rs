//! What a group of import edges adds up to: how many, of which kinds, roles and usages, how many
//! are product code importing a value, and the few an agent should read first.

use std::cmp::Ordering;

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use answer_format::collation::compare_text;

use crate::import_edges::{ImportEdge, ImportKind, ImportUsage, RoleCounts, SourceRole, UsageCounts};

/// Evidence rows kept per group; `evidenceLimited` says when more edges stood behind the count.
pub const EVIDENCE_LIMIT: usize = 5;

/// A row of evidence an edge group keeps.
pub trait EvidenceRow: Clone {
    fn kind(&self) -> ImportKind;
    fn role(&self) -> SourceRole;
    fn usage(&self) -> ImportUsage;
    /// Product code importing a value first, then by the row's own identity.
    fn compare(&self, other: &Self) -> Ordering;
}

/// The priority an evidence row has: `0` for product code importing a value, else `1`.
pub fn evidence_priority(role: SourceRole, usage: ImportUsage) -> usize {
    usize::from(!(role == SourceRole::Production && usage == ImportUsage::Value))
}

impl EvidenceRow for ImportEdge {
    fn kind(&self) -> ImportKind {
        self.kind
    }
    fn role(&self) -> SourceRole {
        self.source_role
    }
    fn usage(&self) -> ImportUsage {
        self.import_usage
    }
    fn compare(&self, other: &Self) -> Ordering {
        evidence_priority(self.source_role, self.import_usage)
            .cmp(&evidence_priority(other.source_role, other.import_usage))
            .then_with(|| compare_text(&self.from, &other.from))
            .then_with(|| compare_text(&self.to, &other.to))
            .then_with(|| compare_text(self.kind.word(), other.kind.word()))
    }
}

/// The kinds a group used, only those that occur, written in the order of their names.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct KindCounts(Vec<(ImportKind, usize)>);

impl KindCounts {
    fn add(&mut self, kind: ImportKind) {
        match self.0.iter_mut().find(|(known, _)| *known == kind) {
            Some((_, count)) => *count += 1,
            None => self.0.push((kind, 1)),
        }
    }
}

impl Serialize for KindCounts {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut ordered: Vec<&(ImportKind, usize)> = self.0.iter().collect();
        ordered.sort_by(|left, right| compare_text(left.0.word(), right.0.word()));
        let mut map = serializer.serialize_map(Some(ordered.len()))?;
        for (kind, count) in ordered {
            map.serialize_entry(kind.word(), count)?;
        }
        map.end()
    }
}

/// The counts and kept evidence of one group, written in the order the agent reads them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeStats<Row: Serialize> {
    pub count: usize,
    pub kind_counts: KindCounts,
    pub source_role_counts: RoleCounts,
    pub import_usage_counts: UsageCounts,
    pub product_value_count: usize,
    pub evidence: Vec<Row>,
    pub evidence_limited: bool,
}

impl<Row: EvidenceRow + Serialize> Default for EdgeStats<Row> {
    fn default() -> Self {
        Self {
            count: 0,
            kind_counts: KindCounts::default(),
            source_role_counts: RoleCounts::default(),
            import_usage_counts: UsageCounts::default(),
            product_value_count: 0,
            evidence: Vec::new(),
            evidence_limited: false,
        }
    }
}

impl<Row: EvidenceRow + Serialize> EdgeStats<Row> {
    /// Counts one more edge, keeping the [`EVIDENCE_LIMIT`] rows an agent should read first.
    pub fn add(&mut self, row: Row) {
        self.count += 1;
        self.kind_counts.add(row.kind());
        self.source_role_counts.add(row.role());
        self.import_usage_counts.add(row.usage());
        if row.role() == SourceRole::Production && row.usage() == ImportUsage::Value {
            self.product_value_count += 1;
        }
        self.evidence.push(row);
        self.evidence.sort_by(|left, right| left.compare(right));
        self.evidence.truncate(EVIDENCE_LIMIT);
        self.evidence_limited = self.count > self.evidence.len();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn edge(from: &str, role: SourceRole, usage: ImportUsage, kind: ImportKind) -> ImportEdge {
        ImportEdge {
            from: from.to_string(),
            to: "b.ts".to_string(),
            kind,
            source_role: role,
            import_usage: usage,
        }
    }

    #[test]
    fn evidence_keeps_product_values_first_and_the_counts_name_every_edge() {
        let mut stats = EdgeStats::default();
        stats.add(edge("z.test.ts", SourceRole::Test, ImportUsage::Value, ImportKind::Static));
        for index in 0..6 {
            stats.add(edge(
                &format!("a{index}.ts"),
                SourceRole::Production,
                ImportUsage::Value,
                if index == 0 { ImportKind::Side } else { ImportKind::Static },
            ));
        }
        stats.add(edge("a.ts", SourceRole::Production, ImportUsage::TypeOnly, ImportKind::Static));
        assert_eq!(stats.count, 8);
        assert_eq!(stats.product_value_count, 6);
        assert_eq!(stats.evidence.len(), EVIDENCE_LIMIT);
        assert!(stats.evidence.iter().all(|row| row.source_role == SourceRole::Production));
        assert!(stats.evidence_limited);
        let text = serde_json::to_string(&stats.kind_counts).expect("serializes");
        assert_eq!(text, r#"{"side":1,"static":7}"#, "kinds are written in the order of their names");
    }
}
