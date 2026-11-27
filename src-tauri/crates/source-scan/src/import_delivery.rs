//! How much of an import scan one reply carries. A scan can be large, so a call that does not ask
//! for the whole thing gets it only when it fits [`AUTOMATIC_LIMIT_BYTES`], and otherwise gets
//! one review packet and the arguments that would fetch the rest. This file decides that from the
//! call's arguments and the size of the whole reply, and refuses the combinations no mode
//! supports.

use serde::Serialize;

use crate::source_scan_error::SourceScanError;

/// The size above which a reply that was not asked for whole becomes a compact review.
pub const AUTOMATIC_LIMIT_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReviewMode {
    Full,
    Next,
    Focus,
}

impl ReviewMode {
    pub fn parse(word: &str) -> Option<Self> {
        match word {
            "full" => Some(Self::Full),
            "next" => Some(Self::Next),
            "focus" => Some(Self::Focus),
            _ => None,
        }
    }
}

/// The arguments of an import call that decide its mode, as the call sent them.
#[derive(Debug, Default)]
pub struct ModeArguments {
    pub review_mode: Option<ReviewMode>,
    pub reconcile: Option<bool>,
    pub allow_large_response: Option<bool>,
    pub has_after_review_id: bool,
    pub has_focus_path: bool,
    pub has_focus_options: bool,
}

/// The mode the arguments ask for: `reviewMode`, or focus when a `focusPath` is given. `None`
/// leaves the choice to the size of the reply.
pub fn resolve_import_review_mode(
    arguments: &ModeArguments,
) -> Result<Option<ReviewMode>, SourceScanError> {
    let requested = arguments
        .review_mode
        .or(arguments.has_focus_path.then_some(ReviewMode::Focus));
    if arguments.allow_large_response.is_some() && arguments.review_mode != Some(ReviewMode::Full) {
        return Err(SourceScanError::failed(
            "allowLargeResponse is only valid with reviewMode \"full\".",
        ));
    }
    if arguments.has_after_review_id && arguments.review_mode != Some(ReviewMode::Next) {
        return Err(SourceScanError::failed(
            "afterReviewId is only valid with reviewMode \"next\".",
        ));
    }
    if requested == Some(ReviewMode::Focus) && !arguments.has_focus_path {
        return Err(SourceScanError::failed(
            "reviewMode \"focus\" requires focusPath.",
        ));
    }
    if arguments.has_focus_path && requested != Some(ReviewMode::Focus) {
        return Err(SourceScanError::failed(
            "focusPath is only valid with reviewMode \"focus\" or with reviewMode omitted.",
        ));
    }
    if arguments.has_focus_options && requested != Some(ReviewMode::Focus) {
        return Err(SourceScanError::failed(
            "focusDirection, focusLimit, and focusAfterEdgeId are only valid in focus mode.",
        ));
    }
    if arguments.review_mode == Some(ReviewMode::Next) && arguments.reconcile == Some(false) {
        return Err(SourceScanError::failed(
            "reviewMode \"next\" requires reconcile:true because the review queue is a vault diff.",
        ));
    }
    Ok(requested)
}

#[derive(Debug, Serialize)]
pub struct FullArguments {
    #[serde(rename = "reviewMode")]
    pub review_mode: &'static str,
    #[serde(rename = "allowLargeResponse")]
    pub allow_large_response: bool,
}

pub const FULL_ARGUMENTS: FullArguments = FullArguments {
    review_mode: "full",
    allow_large_response: true,
};

/// Why a reply became a compact review.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactDelivery {
    pub selection: &'static str,
    pub reason: &'static str,
    pub estimated_full_response_bytes: usize,
    pub automatic_limit_bytes: usize,
    pub explicit_full_available: bool,
    pub explicit_full_arguments: FullArguments,
}

/// What a reply that was not asked for whole becomes.
#[derive(Debug)]
pub enum Delivery {
    Whole,
    Compact(CompactDelivery),
}

/// Why neither the whole reply nor a compact one can be sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeliveryRefusal {
    /// An explicit `full` request over the limit: the person must confirm the size.
    LargeResponseConfirmationRequired { estimated_bytes: usize },
    /// A compact review needs a reconciliation, and this call has none.
    CompactNeedsReconciliation { estimated_bytes: usize },
}

impl DeliveryRefusal {
    pub fn message(self) -> String {
        match self {
            Self::LargeResponseConfirmationRequired { estimated_bytes } => format!(
                "Estimated full response ({estimated_bytes} bytes) exceeds the 128 KiB delivery limit. Retry with reviewMode:\"full\", allowLargeResponse:true only when the complete arrays are intentionally required, or use reviewMode:\"next\" for one bounded review packet."
            ),
            Self::CompactNeedsReconciliation { estimated_bytes } => format!(
                "Estimated full response ({estimated_bytes} bytes) exceeds the automatic 128 KiB delivery limit, but compact review requires reconcile:true and a loadable active vault. Retry with reconcile:true, or explicitly opt in to the large payload with reviewMode:\"full\", allowLargeResponse:true."
            ),
        }
    }
}

/// Sends `estimated_full_response_bytes` whole when it fits, else as a compact review.
pub fn choose_automatic_import_delivery(
    review_mode: Option<ReviewMode>,
    reconcile: Option<bool>,
    has_reconciliation: bool,
    estimated_full_response_bytes: usize,
) -> Result<Delivery, DeliveryRefusal> {
    if estimated_full_response_bytes <= AUTOMATIC_LIMIT_BYTES {
        return Ok(Delivery::Whole);
    }
    if review_mode == Some(ReviewMode::Full) {
        return Err(DeliveryRefusal::LargeResponseConfirmationRequired {
            estimated_bytes: estimated_full_response_bytes,
        });
    }
    if reconcile == Some(false) || !has_reconciliation {
        return Err(DeliveryRefusal::CompactNeedsReconciliation {
            estimated_bytes: estimated_full_response_bytes,
        });
    }
    Ok(Delivery::Compact(CompactDelivery {
        selection: "automatic_compact",
        reason: "estimated_full_response_exceeds_limit",
        estimated_full_response_bytes,
        automatic_limit_bytes: AUTOMATIC_LIMIT_BYTES,
        explicit_full_available: true,
        explicit_full_arguments: FULL_ARGUMENTS,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modes_follow_the_arguments_and_unsupported_pairs_are_refused() {
        let focus = ModeArguments {
            has_focus_path: true,
            ..ModeArguments::default()
        };
        assert_eq!(
            resolve_import_review_mode(&focus).expect("focus"),
            Some(ReviewMode::Focus)
        );
        let lone_limit = ModeArguments {
            has_focus_options: true,
            ..ModeArguments::default()
        };
        assert!(resolve_import_review_mode(&lone_limit).is_err());
        let next_without_reconcile = ModeArguments {
            review_mode: Some(ReviewMode::Next),
            reconcile: Some(false),
            ..ModeArguments::default()
        };
        assert_eq!(
            resolve_import_review_mode(&next_without_reconcile)
                .expect_err("refused")
                .to_string(),
            "reviewMode \"next\" requires reconcile:true because the review queue is a vault diff."
        );
    }

    #[test]
    fn a_reply_over_the_limit_is_compact_unless_full_was_asked_or_nothing_can_be_reviewed() {
        let over = AUTOMATIC_LIMIT_BYTES + 1;
        assert!(matches!(
            choose_automatic_import_delivery(None, None, true, AUTOMATIC_LIMIT_BYTES),
            Ok(Delivery::Whole)
        ));
        assert!(matches!(
            choose_automatic_import_delivery(None, None, true, over),
            Ok(Delivery::Compact(_))
        ));
        assert!(matches!(
            choose_automatic_import_delivery(Some(ReviewMode::Full), None, true, over),
            Err(DeliveryRefusal::LargeResponseConfirmationRequired { .. })
        ));
        assert!(matches!(
            choose_automatic_import_delivery(None, None, false, over),
            Err(DeliveryRefusal::CompactNeedsReconciliation { .. })
        ));
    }
}
