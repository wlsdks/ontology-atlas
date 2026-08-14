---
uid: 3dfe4ceb-036c-4756-830c-d3fe2029c2ad
slug: domains/fulfillment
kind: domain
title: Fulfillment & Delivery
display_ko: 배송
display_en: Fulfillment & Delivery
description: "창고에서 물건을 꺼내 택배사에 넘기고 고객의 손에 닿기까지, 되돌려 받아야 할 때 회수하기까지 상자의 이동을 책임지는 영역입니다."
capabilities: [capabilities/carrier-integration, capabilities/return-pickup, capabilities/shipment-tracking, capabilities/shipping-fee, capabilities/warehouse-picking]
elements: [elements/cj-logistics, elements/delivery-status-log, elements/hanjin-express, elements/korea-post, elements/picking-list, elements/pickup-request, elements/shipping-fee-rule, elements/waybill]
relates: [domains/support]
---

# Fulfillment & Delivery · 배송

이 영역이 맡는 질문은 「이 상자는 지금 어디에 있고, 언제 도착하는가」입니다. 창고에서 물건을 꺼내 택배사에 넘기고 고객의 손에 닿기까지, 그리고 되돌려 받아야 할 때 회수하기까지가 여기의 일입니다.

일의 흐름은 이렇습니다. 주문이 확정되면 창고에서 꺼낼 목록이 만들어지고, 배송비 규칙에 따라 요금이 정해지고, 택배사 연동으로 송장이 나가고, 그때부터는 배송 조회가 상자의 이동을 지켜봅니다. 반품이 정해지면 같은 연동으로 회수 기사를 부릅니다.

**배송은 이 가게가 통제하지 못하는 유일한 영역입니다.** 택배사가 언제 가져가는지, 어디서 멈추는지를 우리가 정하지 못하므로, 이 영역의 일은 대부분 「모르는 것을 정직하게 말하기」가 됩니다. 그래서 상태를 우리 말로 다시 씁니다. CJ대한통운·한진택배·우체국택배가 주는 상태 코드는 회사마다 다르고 뜻도 다른데, 고객에게는 「보냈어요 / 오는 중이에요 / 도착했어요」 셋이면 충분합니다. 여기서 가장 흔한 사고도 이 틈에서 납니다. 송장은 나갔는데 상자는 아직 창고에 있어서, 화면에는 「배송 시작」이 떠 있는데 상자는 움직인 적이 없는 하루.

경계는 반품에서 분명해집니다. 반품을 받아 줄지 판단하는 것은 고객지원의 일이고, 돌아온 물건값을 돌려주는 것은 결제의 일이며, 여기는 물건의 이동만 책임집니다. 그리고 반품은 배송을 거꾸로 돌린 것이 아닙니다. 물건이 돌아오기 전에 환불할 것인가가 먼저 정해져야 하고, 그건 결제 영역과 같이 정해야 합니다.

This area owns the question "where is this parcel right now, and when will it arrive?". Getting goods out of the warehouse, onto a carrier, into the shopper's hands, and back again when they must return: that is the whole job.

The flow: once an order is confirmed, a picking list is made in the warehouse, the shipping-fee rules set the charge, the carrier integration issues a waybill, and from then on shipment tracking watches the parcel move. When a return is decided, the same integration calls a pickup driver.

Delivery is the one area this store does not control. The carriers decide when they collect and where they stop, so most of the work here is telling the truth about what we do not know. Status codes from CJ Logistics, Hanjin and Korea Post differ by company and by meaning, so the store rewrites them in its own words: shipped, on the way, delivered. The most common incident lives in that gap: a waybill has been issued, the screen says "shipped", and the parcel has not actually left the warehouse.

The boundary shows at returns. Whether to accept a return is the support area's call, giving the money back is the payment area's job, and this area is responsible only for the movement of goods. A return is also not a delivery played backwards: whether to refund before the goods come back must be decided first, together with the payment area.
