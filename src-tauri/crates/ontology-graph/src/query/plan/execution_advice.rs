//! What a plan tells the agent to do next: run the call, narrow it, or read the warnings first, and
//! the call to send. A call that is costly or warned about comes with a safer one.

use serde::Serialize;

use super::cost_class::CostClass;
use super::planned_arguments::{ArgumentValue, PlannedArguments, SuggestedCall};
use crate::query::operation::Operation;
use crate::query::walks::WalkOperation;

/// The relations a narrower call is limited to when it names none.
const SAFER_TYPES: [&str; 2] = ["depends_on", "relates"];
const SAFER_LIMIT: usize = 25;
const SAFER_HOPS_CEILING: usize = 3;
const SAFER_DEPTH_CEILING: usize = 2;

#[derive(Serialize)]
pub struct ExecutionAdvice {
    #[serde(rename = "shouldRun")]
    should_run: bool,
    #[serde(rename = "nextStep")]
    next_step: &'static str,
    recommendation: &'static str,
    #[serde(rename = "suggestedQuery")]
    suggested_query: SuggestedCall,
    #[serde(rename = "saferQuery", skip_serializing_if = "Option::is_none")]
    safer_query: Option<SuggestedCall>,
}

fn set_count(arguments: &mut PlannedArguments, name: &'static str, value: usize) {
    arguments.put(name, ArgumentValue::Count(value));
}

fn lowered(arguments: &PlannedArguments, name: &str, ceiling: usize, fallback: usize) -> usize {
    arguments
        .count(name)
        .filter(|sent| *sent > 0)
        .unwrap_or(fallback)
        .min(ceiling)
}

fn without_types_name_the_usual_two(arguments: &mut PlannedArguments) {
    if !arguments.has_names("types") {
        arguments.put("types", ArgumentValue::names(&SAFER_TYPES));
    }
}

/// The call narrowed the way its operation can be narrowed: fewer hops, fewer rows, the usual
/// relations only.
fn narrowed(target: Operation, suggested: &SuggestedCall) -> SuggestedCall {
    let mut narrower = suggested.arguments().clone();
    let arguments = &mut narrower;
    match target {
        Operation::Walk(WalkOperation::Path | WalkOperation::ExplainRelation) => {
            if let Some(hops) = arguments.count("maxHops") {
                let fewer = hops.saturating_sub(1).clamp(1, SAFER_HOPS_CEILING);
                set_count(arguments, "maxHops", fewer);
            }
            without_types_name_the_usual_two(arguments);
        }
        Operation::Walk(
            WalkOperation::Reachability
            | WalkOperation::Impact
            | WalkOperation::BlastRadius
            | WalkOperation::Subgraph,
        ) => {
            if let Some(depth) = arguments.count("depth") {
                let shallower = depth.saturating_sub(1).clamp(1, SAFER_DEPTH_CEILING);
                set_count(arguments, "depth", shallower);
            }
            without_types_name_the_usual_two(arguments);
            let limit = lowered(arguments, "limit", SAFER_LIMIT, SAFER_LIMIT);
            set_count(arguments, "limit", limit);
        }
        _ => {
            let limit = lowered(arguments, "limit", SAFER_LIMIT, SAFER_LIMIT);
            set_count(arguments, "limit", limit);
        }
    }
    SuggestedCall::of(suggested.operation(), &narrower)
}

impl ExecutionAdvice {
    pub fn of(
        target: Operation,
        cost: CostClass,
        warnings: &[String],
        suggested: SuggestedCall,
    ) -> Self {
        let costly = cost == CostClass::High;
        let warned = !warnings.is_empty();
        let should_run = !costly && !warned;
        let (next_step, recommendation) = if should_run {
            ("run", "Run suggestedQuery as planned.")
        } else if costly {
            (
                "narrow",
                "Narrow the query before running it; reduce depth/hops, add relation types, or lower limit.",
            )
        } else {
            ("review", "Review warnings before running suggestedQuery.")
        };
        let safer_query = (!should_run).then(|| narrowed(target, &suggested));
        Self {
            should_run,
            next_step,
            recommendation,
            suggested_query: suggested,
            safer_query,
        }
    }
}
