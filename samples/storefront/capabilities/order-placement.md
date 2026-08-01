---
slug: capabilities/order-placement
kind: capability
title: Order Placement
display_ko: 주문 확정
display_en: Order Placement
description: "The moment the store owes the shopper something. It only happens if payment is authorised and stock is held."
domain: domains/order
dependencies: [capabilities/checkout, capabilities/payment-authorize, capabilities/stock-reservation]
elements: [elements/order-line-item, elements/order-number, elements/order-record]
---

# Order Placement · 주문 확정

The moment the store owes the shopper something. It only happens if payment is authorised and stock is held.

가게가 고객에게 빚을 지는 순간입니다. 결제 승인과 재고 확보가 둘 다 끝나야만 성립합니다.
