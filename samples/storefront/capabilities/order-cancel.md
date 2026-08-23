---
uid: 12fdd120-8b2e-4f79-933a-7a20fef0ed2c
slug: capabilities/order-cancel
kind: capability
title: Order Cancellation
display_ko: 주문 취소
display_en: Order Cancellation
description: "Voids a whole order before it ships: money returns in full through payment void, held stock returns to the ledger, and the order stops existing as a commitment. Cancelling only part of an order is a different, harder capability, and after dispatch this becomes a return instead."
domain: domains/order
dependencies: [capabilities/payment-cancel, capabilities/stock-tracking]
relates: [capabilities/order-partial-cancel]
elements: []
---

# Order Cancellation

Voids a whole order before it ships: money returns in full through payment void, held stock returns to the ledger, and the order stops existing as a commitment. Cancelling only part of an order is a different, harder capability, and after dispatch this becomes a return instead.
