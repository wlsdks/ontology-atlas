---
uid: 66df0642-1f73-4ab6-9943-7ee8ff2d793d
slug: elements/order-line-item
kind: element
title: Order Line Item
display_ko: 주문 상품 항목
display_en: Order Line Item
description: "한 주문 안에 담긴 상품 한 줄로, 어느 옵션을 몇 개 샀는지와 오늘 가격이 아닌 결제 당시의 실제 가격을 들고 있습니다."
domain: domains/order
dependencies: [elements/sku]
---

# Order Line Item · 주문 상품 항목

주문 안에 담긴 상품 한 줄입니다. 어느 SKU를 몇 개, 얼마에 샀는지를 들고 있는데, 여기 적히는 가격은 오늘의 판매가가 아니라 결제하던 그 순간의 가격입니다. 이 값을 따로 얼려 두지 않으면 상품 가격을 바꿀 때마다 지난 주문의 영수증 합계가 함께 바뀌는, 있어서는 안 되는 일이 생깁니다.

One SKU inside one order, with the price it was actually bought at rather than today's price. Without this frozen price, changing today's price would silently rewrite last month's receipts.
