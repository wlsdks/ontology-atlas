---
uid: defe81dc-dfc4-426d-bd64-3cf587392583
slug: capabilities/order-placement
kind: capability
title: Order Placement
display_ko: 주문 확정
display_en: Order Placement
description: "결제 승인과 재고 확보가 둘 다 끝났을 때 주문번호가 발급되며 가게가 고객에게 빚을 지는, 약속이 성립하는 순간입니다."
domain: domains/order
dependencies: [capabilities/checkout, capabilities/payment-authorize, capabilities/stock-reservation]
elements: [elements/order-line-item, elements/order-number, elements/order-record]
---

# Order Placement · 주문 확정

주문서에서 「결제하기」가 성공으로 끝나는 순간 일어나는 일입니다. 주문번호가 발급되고, 가게는 이 물건들을 이 값에 보내겠다는 빚을 진 것이 됩니다.

성립 조건은 둘 다여야 합니다: 결제 승인이 나 있고, 재고 선점이 그 몫을 붙들고 있어야 합니다. 하나라도 빠진 채 성립한 주문은 「돈만 받은 주문」이거나 「보낼 수 없는 주문」입니다.

이 순간 주문에는 그때의 가격·할인·주소가 복사되어 얼어붙습니다. 이후에 상품 가격이 바뀌어도, 이 주문은 어제의 약속 그대로 남습니다.

The moment the store owes the shopper something: an order number is minted and the promise takes effect. It only happens when payment is authorised and stock is held, and it freezes a copy of that moment's price, discount, and address into the order.
