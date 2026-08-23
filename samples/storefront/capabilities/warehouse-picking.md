---
uid: 1d11c6ef-c486-441e-ae73-2e24681b5c64
slug: capabilities/warehouse-picking
kind: capability
title: Warehouse Picking
display_ko: 출고 지시
display_en: Warehouse Picking
description: "Turns a confirmed order into instructions a person in the warehouse can walk: this shelf, this many, this box. Once the picking list is out the cost of undoing the order jumps, which is why address changes and cancellations use 'before dispatch' as their deadline."
domain: domains/fulfillment
dependencies: [capabilities/stock-tracking]
elements: [elements/picking-list]
---

# Warehouse Picking

Turns a confirmed order into instructions a person in the warehouse can walk: this shelf, this many, this box. Once the picking list is out the cost of undoing the order jumps, which is why address changes and cancellations use 'before dispatch' as their deadline.
