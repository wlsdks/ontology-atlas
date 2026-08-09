---
uid: bdecb4b7-0463-4378-ab15-7ee12da0593e
slug: domains/inventory
kind: domain
title: Inventory
display_ko: 재고
display_en: Inventory
description: "How many of each item the store actually has, what arrives from suppliers, and what happens the moment something sells out."
capabilities: [capabilities/restock-alert, capabilities/stock-receiving, capabilities/stock-reservation, capabilities/stock-tracking]
elements: [elements/backorder-queue, elements/purchase-order, elements/restock-subscription, elements/shelf-location, elements/stock-adjustment, elements/stock-count-sheet, elements/stock-hold, elements/stock-ledger, elements/stock-snapshot, elements/supplier-lead-time]
relates: [domains/fulfillment]
---

# Inventory · 재고

How many of each item the store actually has, what arrives from suppliers, and what happens the moment something sells out.

지금 몇 개가 남아 있는지, 공급처에서 무엇이 들어오는지, 그리고 품절된 순간 무슨 일이 벌어지는지를 다룹니다.

**이 영역은 반대입니다**: 하려는 일은 넷인데 실제로 다루는 대상이 열입니다. 재고는 「수량 하나」처럼 보이지만 실제로는 원장·실사·조정·스냅숏이 따로 있고, 그 넷이 어긋나는 순간이 곧 재고 사고입니다. 그래서 이 영역에서 늘어나는 것은 기능이 아니라 **구별해서 들고 있어야 하는 것**입니다.
