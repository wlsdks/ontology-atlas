---
uid: 03c839c5-318a-4165-939a-94645aba831f
slug: capabilities/stock-reservation
kind: capability
title: Stock Reservation
display_ko: 재고 선점
display_en: Stock Reservation
description: "Holds units for an order that is being paid for, so two shoppers cannot buy the same last item. The whole capability is the question of when to hold: this store holds at payment start and releases automatically after a timeout whose current value is still a guess."
domain: domains/inventory
dependencies: [capabilities/stock-tracking]
elements: [elements/stock-hold]
---

# Stock Reservation

Holds units for an order that is being paid for, so two shoppers cannot buy the same last item. The whole capability is the question of when to hold: this store holds at payment start and releases automatically after a timeout whose current value is still a guess.
