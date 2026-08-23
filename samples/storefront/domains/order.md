---
uid: 44cf0da0-4f09-4a02-a9ab-f79e6162ecac
slug: domains/order
kind: domain
title: Orders
display_ko: 주문
display_en: Orders
description: "This area owns the question \"what state is this order in, and what can still be changed?\". The line between browsing and buying sits here, and so does every change a shopper makes after crossing it: cancelling, cancelling part of it, moving the delivery address."
capabilities: [capabilities/cart, capabilities/checkout, capabilities/order-address-change, capabilities/order-cancel, capabilities/order-lookup, capabilities/order-notification, capabilities/order-partial-cancel, capabilities/order-placement]
elements: [elements/cart-session, elements/checkout-draft, elements/order-line-item, elements/order-number, elements/order-record, elements/order-status-log]
relates: [domains/fulfillment, domains/payment, domains/support]
---

# Orders

This area owns the question "what state is this order in, and what can still be changed?". The line between browsing and buying sits here, and so does every change a shopper makes after crossing it: cancelling, cancelling part of it, moving the delivery address.

The flow: items go into the cart, the checkout page confirms the amount and the address, and placing the order crosses the line. From then on the shopper looks in through order lookup, gets a notification at every status change, and, as long as the parcel has not left, can change the address, cancel, or cancel just part of the order.

Orders touch more areas than anything else on this map: they reserve stock, call payment, create a delivery, and generate points. When one order changes state, four areas move with it. Each of those areas does its own work; this one keeps the single record that threads them together.

The hardest part is partial cancellation. Cancel one item of three and everything lands at once: who pays the shipping fee, whether the coupon's minimum-amount condition is now broken and the discount must be taken back, what happens to points already earned. Full cancellation is easy. Partial is hard.
