---
uid: 92d12829-9b6c-4bce-8e03-978ca6462560
slug: capabilities/order-partial-cancel
kind: capability
title: Partial Cancellation
display_ko: 부분 취소
display_en: Partial Cancellation
description: "Drops some items and keeps the rest alive, so only the difference is refunded and the remaining parcel still ships. Full cancellation is easy; the partial case drags shipping fees, coupon thresholds, earned points, and already-picked stock into one recalculation."
domain: domains/order
dependencies: [capabilities/refund, capabilities/stock-tracking]
elements: []
---

# Partial Cancellation

Drops some items and keeps the rest alive, so only the difference is refunded and the remaining parcel still ships. Full cancellation is easy; the partial case drags shipping fees, coupon thresholds, earned points, and already-picked stock into one recalculation.
