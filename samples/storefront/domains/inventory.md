---
uid: bdecb4b7-0463-4378-ab15-7ee12da0593e
slug: domains/inventory
kind: domain
title: Inventory
display_ko: 재고
display_en: Inventory
description: "지금 몇 개 남아 있고 그중 몇 개는 이미 팔린 셈 쳐야 하는지, 들어오는 물건과 품절 순간의 처리까지 수량의 진실을 지키는 영역입니다."
capabilities: [capabilities/restock-alert, capabilities/stock-receiving, capabilities/stock-reservation, capabilities/stock-tracking]
elements: [elements/backorder-queue, elements/purchase-order, elements/restock-subscription, elements/shelf-location, elements/stock-adjustment, elements/stock-count-sheet, elements/stock-hold, elements/stock-ledger, elements/stock-snapshot, elements/supplier-lead-time]
relates: [domains/fulfillment]
---

# Inventory · 재고

이 영역이 맡는 질문은 「지금 몇 개 있고, 그중 몇 개는 이미 팔린 셈 쳐야 하는가」입니다. 선반 위의 개수와 팔 수 있는 개수는 다릅니다. 방금 주문된 물건은 아직 선반에 있어도 팔린 셈 쳐야 하고, 이 둘을 섞는 순간 없는 물건을 팔게 됩니다.

일의 흐름은 넷입니다. 공급처에서 물건이 들어오면 입고가 수량을 늘리고, 재고 추적이 그 수를 계속 지켜보고, 주문이 들어오는 순간 재고 예약이 그만큼을 미리 잡아 두고, 바닥이 나면 재입고 알림이 기다리던 고객에게 소식을 보냅니다.

**이 영역은 지도에서 반대 모양입니다**: 하려는 일은 넷인데 실제로 다루는 대상이 열입니다. 재고는 「수량 하나」처럼 보이지만 실제로는 원장·실사·조정·스냅숏이 따로 있고, 그 넷이 어긋나는 순간이 곧 재고 사고입니다. 그래서 이 영역에서 늘어나는 것은 기능이 아니라 **구별해서 들고 있어야 하는 것**입니다.

가장 흔한 사고는 마지막 한 개를 두 사람이 거의 동시에 사는 초과 판매입니다. 예약이 추적보다 늦으면 반드시 생기므로, 넷 중 예약이 가장 먼저 정확해야 합니다. 경계는 이렇습니다. 품절을 화면에 어떻게 보여 줄지는 상품 영역이 정하고, 선반에서 물건을 실제로 꺼내는 일은 배송 영역이 하며, 여기는 수량의 진실만 지킵니다.

This area owns the question "how many do we actually have, and how many of those must already count as sold?". The count on the shelf and the count you can sell are different numbers: an item ordered a minute ago must count as sold even though it is still sitting there, and mixing the two means selling goods that do not exist.

The flow has four steps: goods arrive from suppliers and receiving raises the count, stock tracking watches that number continuously, the moment an order comes in a reservation sets that quantity aside, and when a product runs out the restock alert tells the customers who were waiting.

On the map this area has the opposite shape: four things it does, ten things it keeps. Stock looks like "one number" but is really a ledger, physical counts, adjustments and snapshots kept separately, and the moment those four disagree is what a stock incident is. What grows here is not features but things that must be kept distinct.

The most common incident is overselling: two shoppers buying the last item at almost the same moment. It is guaranteed whenever reservation lags behind tracking, so of the four steps, reservation has to be exact first. The boundary: how a sold-out product is shown on screen belongs to the catalog area, physically taking goods off the shelf belongs to fulfillment, and this area guards only the truth of the numbers.
