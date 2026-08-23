---
uid: 66df0642-1f73-4ab6-9943-7ee8ff2d793d
slug: elements/order-line-item
kind: element
title: Order Line Item
display_ko: 주문 상품 항목
display_en: Order Line Item
description: "One SKU inside one order, with the price it was actually bought at rather than today's price. Without this frozen price, changing today's price would silently rewrite last month's receipts."
domain: domains/order
dependencies: [elements/sku]
---

# Order Line Item

One SKU inside one order, with the price it was actually bought at rather than today's price. Without this frozen price, changing today's price would silently rewrite last month's receipts.
