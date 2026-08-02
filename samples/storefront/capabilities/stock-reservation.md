---
uid: 03c839c5-318a-4165-939a-94645aba831f
slug: capabilities/stock-reservation
kind: capability
title: Stock Reservation
display_ko: 재고 선점
display_en: Stock Reservation
description: "Holds units for an order that is being paid for, so two shoppers cannot buy the same last item."
domain: domains/inventory
dependencies: [capabilities/stock-tracking]
elements: [elements/stock-hold]
---

# Stock Reservation · 재고 선점

Holds units for an order that is being paid for, so two shoppers cannot buy the same last item.

결제가 진행 중인 주문 몫을 잠시 붙들어 둡니다 — 마지막 한 개를 두 사람이 동시에 사는 일을 막습니다.
