//! What a plan says a call would cost: how it would search, how much it would look at, and how many
//! rows it could write. One shape for each way an operation reads the graph.

use serde::Serialize;

use super::cost_class::CostClass;
use super::traversal_estimate::FrontierLevel;

#[derive(Serialize)]
#[serde(untagged)]
pub enum CostEstimate {
    AdjacencyLookup {
        strategy: &'static str,
        #[serde(rename = "edgeScans")]
        edge_scans: usize,
        #[serde(rename = "resultUpperBound")]
        result_upper_bound: usize,
        #[serde(rename = "costClass")]
        cost_class: CostClass,
    },
    PathSearch {
        strategy: &'static str,
        #[serde(rename = "edgeScans")]
        edge_scans: usize,
        #[serde(rename = "reachableWithinDepth")]
        reachable_within_depth: usize,
        #[serde(rename = "frontierByDepth")]
        frontier_by_depth: Vec<FrontierLevel>,
        #[serde(rename = "potentialPathUpperBound")]
        potential_path_upper_bound: f64,
        #[serde(rename = "resultUpperBound")]
        result_upper_bound: f64,
        #[serde(rename = "costClass")]
        cost_class: CostClass,
    },
    GraphExpansion {
        strategy: &'static str,
        #[serde(rename = "edgeScans")]
        edge_scans: usize,
        #[serde(rename = "reachableWithinDepth")]
        reachable_within_depth: usize,
        #[serde(rename = "frontierByDepth")]
        frontier_by_depth: Vec<FrontierLevel>,
        #[serde(rename = "resultUpperBound")]
        result_upper_bound: usize,
        #[serde(rename = "costClass")]
        cost_class: CostClass,
    },
    NodeScan {
        strategy: &'static str,
        #[serde(rename = "nodeScans")]
        node_scans: usize,
        #[serde(rename = "totalMatches")]
        total_matches: usize,
        #[serde(rename = "resultUpperBound")]
        result_upper_bound: usize,
        #[serde(rename = "costClass")]
        cost_class: CostClass,
    },
    EdgeScan {
        strategy: &'static str,
        #[serde(rename = "edgeScans")]
        edge_scans: usize,
        #[serde(rename = "totalMatches")]
        total_matches: usize,
        #[serde(rename = "resultUpperBound")]
        result_upper_bound: usize,
        #[serde(rename = "costClass")]
        cost_class: CostClass,
    },
    Centrality {
        strategy: &'static str,
        #[serde(rename = "nodeScans")]
        node_scans: usize,
        #[serde(rename = "edgeScans")]
        edge_scans: usize,
        iterations: usize,
        #[serde(rename = "danglingNodes")]
        dangling_nodes: usize,
        #[serde(rename = "rankingWorkUnits")]
        ranking_work_units: usize,
        #[serde(rename = "resultUpperBound")]
        result_upper_bound: usize,
        #[serde(rename = "costClass")]
        cost_class: CostClass,
    },
    AggregateScan {
        strategy: &'static str,
        #[serde(rename = "nodeScans")]
        node_scans: usize,
        #[serde(rename = "edgeScans")]
        edge_scans: usize,
        #[serde(rename = "costClass")]
        cost_class: CostClass,
    },
}

impl CostEstimate {
    pub fn cost_class(&self) -> CostClass {
        match self {
            Self::AdjacencyLookup { cost_class, .. }
            | Self::PathSearch { cost_class, .. }
            | Self::GraphExpansion { cost_class, .. }
            | Self::NodeScan { cost_class, .. }
            | Self::EdgeScan { cost_class, .. }
            | Self::Centrality { cost_class, .. }
            | Self::AggregateScan { cost_class, .. } => *cost_class,
        }
    }
}
