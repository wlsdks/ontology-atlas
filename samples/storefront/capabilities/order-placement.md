---
uid: defe81dc-dfc4-426d-bd64-3cf587392583
slug: capabilities/order-placement
kind: capability
title: Order Placement
display_ko: 주문 확정
display_en: Order Placement
description: "The moment the store owes the shopper something: an order number is minted and the promise takes effect. It only happens when payment is authorised and stock is held, and it freezes a copy of that moment's price, discount, and address into the order."
domain: domains/order
dependencies: [capabilities/checkout, capabilities/payment-authorize, capabilities/stock-reservation]
elements: [elements/order-line-item, elements/order-number, elements/order-record]
---

# Order Placement

The moment the store owes the shopper something: an order number is minted and the promise takes effect. It only happens when payment is authorised and stock is held, and it freezes a copy of that moment's price, discount, and address into the order.
