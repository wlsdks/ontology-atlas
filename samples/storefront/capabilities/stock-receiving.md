---
uid: b9b41e37-7feb-45ea-b34d-79703e28857b
slug: capabilities/stock-receiving
kind: capability
title: Goods Receiving
display_ko: 입고 처리
display_en: Goods Receiving
description: "공급처에서 실제로 도착한 수량을 세어 발주 수량과 맞춰 기록해서, 재고가 계획이 아니라 선반을 가리키게 하는 일입니다."
domain: domains/inventory
dependencies: [capabilities/product-option]
elements: [elements/purchase-order]
---

# Goods Receiving · 입고 처리

공급처 트럭이 창고에 닿으면, 발주서에는 100개라 적혀 있어도 실제로 온 것이 97개일 수 있습니다. 상자를 열어 세고, 그 실제 수량을 상품 옵션 단위로 장부에 올리는 일입니다. 이 순간부터 재고는 계획이 아니라 선반을 가리킵니다.

경계: 여기는 「들어온 것」만 다룹니다. 파손이나 수량 부족을 공급처와 정산하는 일은 별개의 대화이고, 장부에는 우선 온 만큼만 올라갑니다.

함정: 검수 없이 발주 수량대로 올리는 지름길은 3개의 유령 재고를 만들고, 그 3개는 몇 주 뒤 「있다고 해서 팔았는데 없는」 주문으로 돌아옵니다.

Counts what physically arrived from a supplier and books it, per sellable unit, against what was ordered, so stock reflects the shelf and not the plan. Booking the ordered quantity without counting creates ghost stock that returns weeks later as unshippable orders.
