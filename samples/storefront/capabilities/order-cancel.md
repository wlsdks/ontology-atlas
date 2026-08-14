---
uid: 12fdd120-8b2e-4f79-933a-7a20fef0ed2c
slug: capabilities/order-cancel
kind: capability
title: Order Cancellation
display_ko: 주문 취소
display_en: Order Cancellation
description: "출고 전의 주문을 통째로 물러서 결제 금액은 전액 돌려주고 잡아 둔 재고는 풀며 주문을 약속에서 지우는 일입니다."
domain: domains/order
dependencies: [capabilities/payment-cancel, capabilities/stock-tracking]
relates: [capabilities/order-partial-cancel]
elements: []
---

# Order Cancellation · 주문 취소

출고 전의 주문을 통째로 무릅니다. 「주문 취소」 버튼을 누르면 결제 취소로 돈이 전액 돌아가고, 잡아 두었던 수량은 재고 장부로 되돌아가며, 주문은 약속으로서 사라집니다.

경계: 이 기능은 「전부 아니면 그대로」입니다. 세 개 중 하나만 무르고 싶다면 그것은 부분 취소라는 다른 기능이고, 규칙도 훨씬 복잡합니다. 이미 출고된 뒤라면 취소가 아니라 반품의 영역입니다.

취소가 쉬운 가게가 신뢰를 얻습니다. 취소를 어렵게 만들어 지킨 매출은, 다시 오지 않는 고객으로 갚게 됩니다.

Voids a whole order before it ships: money returns in full through payment void, held stock returns to the ledger, and the order stops existing as a commitment. Cancelling only part of an order is a different, harder capability, and after dispatch this becomes a return instead.
