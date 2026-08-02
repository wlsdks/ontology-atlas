---
uid: 12fdd120-8b2e-4f79-933a-7a20fef0ed2c
slug: capabilities/order-cancel
kind: capability
title: Order Cancellation
display_ko: 주문 취소
display_en: Order Cancellation
description: "Voids a whole order before it ships: the order stops existing as a commitment and the full amount goes back."
domain: domains/order
dependencies: [capabilities/payment-cancel, capabilities/stock-tracking]
relates: [capabilities/order-partial-cancel]
elements: []
---

# Order Cancellation · 주문 취소

Voids a whole order before it ships: the order stops existing as a commitment and the full amount goes back.

출고 전에 주문 전체를 무효로 합니다 — 약속 자체가 사라지고 결제 금액은 전액 되돌아갑니다.
