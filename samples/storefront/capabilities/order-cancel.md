---
slug: capabilities/order-cancel
kind: capability
title: 주문 취소
domain: order
dependencies: [capabilities/payment-authorize]
relates: [domains/fulfillment]
---

# 주문 취소

고객이나 운영자가 아직 배송이 시작되지 않은 주문을 취소합니다. 이미 승인된
결제 건은 취소와 함께 결제 도메인에서 되돌려야 하므로 결제 승인 기능에
의존합니다.
