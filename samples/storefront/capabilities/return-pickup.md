---
uid: ac84cdf7-3a20-4093-b818-0e92d9717b95
slug: capabilities/return-pickup
kind: capability
title: Return Pickup
display_ko: 반품 회수
display_en: Return Pickup
description: "이미 배송된 물건을 가지러 택배 기사를 고객의 문 앞으로 보내는, 방향만 반대로 뒤집힌 또 한 번의 배송입니다."
domain: domains/fulfillment
dependencies: [capabilities/carrier-integration]
elements: [elements/pickup-request]
---

# Return Pickup · 반품 회수

반품이 접수되면 고객에게 「상자를 문 앞에 두세요」라고 안내하고, 택배사 연동을 통해 기사를 그 집으로 보냅니다. 방향만 반대인 배송입니다: 물건이 고객에게서 창고로 옵니다.

같은 배송인데 어려운 점이 하나 다릅니다. 보낼 때는 출발지가 창고라 언제든 실을 수 있지만, 거둘 때는 출발지가 고객의 문 앞입니다. 상자가 나와 있지 않으면 기사는 헛걸음을 하고, 그 헛걸음은 「회수 실패」라는 상태로 남아야 합니다. 그 상태가 없으면 「기사가 안 왔다」와 「상자가 없었다」를 가릴 수 없습니다.

Sends a courier to the shopper's door to collect something already delivered: a delivery run in the opposite direction. The hard difference is that the origin is a customer's doorstep, so a missing box must be recorded as a failed pickup rather than as silence.
