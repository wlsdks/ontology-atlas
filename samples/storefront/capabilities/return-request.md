---
slug: capabilities/return-request
kind: capability
title: Return Request
display_ko: 반품 접수
display_en: Return Request
description: "Records that a shopper wants to send something back after it arrived, and starts the collection and refund it implies."
domain: domains/support
dependencies: [capabilities/order-lookup, capabilities/return-pickup]
relates: [capabilities/exchange-request, capabilities/refund-review]
elements: [elements/return-record]
---

# Return Request · 반품 접수

Records that a shopper wants to send something back after it arrived, and starts the collection and refund it implies.

이미 받은 물건을 돌려보내고 싶다는 요청을 접수하고, 그에 따르는 회수와 환불을 시작시킵니다.
