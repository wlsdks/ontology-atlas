---
uid: 92d12829-9b6c-4bce-8e03-978ca6462560
slug: capabilities/order-partial-cancel
kind: capability
title: Partial Cancellation
display_ko: 부분 취소
display_en: Partial Cancellation
description: "여러 개 산 것 중 일부만 무르고 남은 주문은 그대로 출고하면서, 배송비·쿠폰·적립을 다시 계산해 차액만 돌려주는 일입니다."
domain: domains/order
dependencies: [capabilities/refund, capabilities/stock-tracking]
elements: []
---

# Partial Cancellation · 부분 취소

일부 품목만 빼고 나머지 주문은 살려 둡니다. 차액만 환불되고 남은 상품은 그대로 출고됩니다.

**전체 취소는 쉽고 부분 취소가 어렵습니다.** 세 개 중 하나만 무르면 네 가지가 한꺼번에 걸립니다:

- 배송비: 무료 배송 기준을 넘겨서 무료였는데, 하나 빼면 기준 아래로 내려갑니다
- 쿠폰: 「5만원 이상 1만원 할인」이 걸렸는데 남은 금액이 5만원 미만이 됩니다
- 적립: 이미 쌓인 포인트를 회수할 것인가, 쓴 뒤라면 어떻게 할 것인가
- 재고: 뺀 것만 되돌리면 되지만, 이미 창고에서 집었다면 되돌릴 것이 물건이 아니라 사람의 일입니다

지금 규칙: **할인은 남은 주문 기준으로 다시 계산하고, 차액은 환불에서 뺍니다.** 고객에게는 「원래 할인이 사라졌다」가 아니라 「이만큼 돌려드립니다」로 보입니다.

Drops some items and keeps the rest alive, so only the difference is refunded and the remaining parcel still ships. Full cancellation is easy; the partial case drags shipping fees, coupon thresholds, earned points, and already-picked stock into one recalculation.
