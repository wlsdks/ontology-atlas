---
uid: b9b41e37-7feb-45ea-b34d-79703e28857b
slug: capabilities/stock-receiving
kind: capability
title: Goods Receiving
display_ko: 입고 처리
display_en: Goods Receiving
description: "Counts what physically arrived from a supplier and books it, per sellable unit, against what was ordered, so stock reflects the shelf and not the plan. Booking the ordered quantity without counting creates ghost stock that returns weeks later as unshippable orders."
domain: domains/inventory
dependencies: [capabilities/product-option]
elements: [elements/purchase-order]
---

# Goods Receiving

Counts what physically arrived from a supplier and books it, per sellable unit, against what was ordered, so stock reflects the shelf and not the plan. Booking the ordered quantity without counting creates ghost stock that returns weeks later as unshippable orders.
