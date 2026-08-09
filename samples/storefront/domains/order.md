---
uid: 44cf0da0-4f09-4a02-a9ab-f79e6162ecac
slug: domains/order
kind: domain
title: Orders
display_ko: 주문
display_en: Orders
description: "The line between browsing and buying, and every change a shopper makes after crossing it: cancelling, cancelling part of it, moving the delivery address."
capabilities: [capabilities/cart, capabilities/checkout, capabilities/order-address-change, capabilities/order-cancel, capabilities/order-lookup, capabilities/order-notification, capabilities/order-partial-cancel, capabilities/order-placement]
elements: [elements/cart-session, elements/checkout-draft, elements/order-line-item, elements/order-number, elements/order-record, elements/order-status-log]
relates: [domains/fulfillment, domains/payment, domains/support]
---

# Orders · 주문

The line between browsing and buying, and every change a shopper makes after crossing it: cancelling, cancelling part of it, moving the delivery address.

구경과 구매를 가르는 선, 그리고 그 선을 넘은 뒤 고객이 하는 모든 변경: 취소·부분 취소·배송지 변경까지를 다룹니다.

**주문은 이 지도에서 가장 많은 영역과 맞닿습니다**: 재고를 잡고, 결제를 부르고, 배송을 만들고, 적립을 발생시킵니다. 그래서 주문 하나의 상태가 바뀌면 네 영역이 같이 움직입니다.

가장 어려운 것은 **부분 취소**입니다. 세 개 중 하나만 취소하면 배송비는 누가 무는지, 그 주문에 걸린 쿠폰의 최소 금액 조건이 깨지면 할인을 회수할 것인지, 이미 쌓인 포인트는 어떻게 되는지가 한꺼번에 걸립니다. 전체 취소는 쉽습니다. 부분이 어렵습니다.
