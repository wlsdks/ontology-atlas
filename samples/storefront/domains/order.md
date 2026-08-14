---
uid: 44cf0da0-4f09-4a02-a9ab-f79e6162ecac
slug: domains/order
kind: domain
title: Orders
display_ko: 주문
display_en: Orders
description: "구경과 구매를 가르는 선, 그리고 그 선을 넘은 뒤의 취소와 부분 취소, 배송지 변경까지 주문의 모든 변경을 다루는 영역입니다."
capabilities: [capabilities/cart, capabilities/checkout, capabilities/order-address-change, capabilities/order-cancel, capabilities/order-lookup, capabilities/order-notification, capabilities/order-partial-cancel, capabilities/order-placement]
elements: [elements/cart-session, elements/checkout-draft, elements/order-line-item, elements/order-number, elements/order-record, elements/order-status-log]
relates: [domains/fulfillment, domains/payment, domains/support]
---

# Orders · 주문

이 영역이 맡는 질문은 「이 주문은 지금 어떤 상태이고, 아직 무엇을 바꿀 수 있는가」입니다. 구경과 구매를 가르는 선이 여기 있고, 그 선을 넘은 뒤 고객이 하는 모든 변경(취소·부분 취소·배송지 변경)까지가 여기의 일입니다.

일의 흐름은 이렇습니다. 장바구니에 담고, 주문서에서 금액과 배송지를 확인하고, 주문 생성으로 선을 넘습니다. 그 뒤로 고객은 주문 조회로 들여다보고, 상태가 바뀔 때마다 알림을 받고, 상자가 나가기 전이라면 배송지 변경과 취소, 일부만 무르는 부분 취소를 할 수 있습니다.

**주문은 이 지도에서 가장 많은 영역과 맞닿습니다**: 재고를 잡고, 결제를 부르고, 배송을 만들고, 적립을 발생시킵니다. 그래서 주문 하나의 상태가 바뀌면 네 영역이 같이 움직입니다. 다른 영역이 각자의 일을 맡고, 여기는 그 전부를 한 줄로 꿰는 기록을 맡습니다.

가장 어려운 것은 **부분 취소**입니다. 세 개 중 하나만 취소하면 배송비는 누가 무는지, 그 주문에 걸린 쿠폰의 최소 금액 조건이 깨지면 할인을 회수할 것인지, 이미 쌓인 포인트는 어떻게 되는지가 한꺼번에 걸립니다. 전체 취소는 쉽습니다. 부분이 어렵습니다.

This area owns the question "what state is this order in, and what can still be changed?". The line between browsing and buying sits here, and so does every change a shopper makes after crossing it: cancelling, cancelling part of it, moving the delivery address.

The flow: items go into the cart, the checkout page confirms the amount and the address, and placing the order crosses the line. From then on the shopper looks in through order lookup, gets a notification at every status change, and, as long as the parcel has not left, can change the address, cancel, or cancel just part of the order.

Orders touch more areas than anything else on this map: they reserve stock, call payment, create a delivery, and generate points. When one order changes state, four areas move with it. Each of those areas does its own work; this one keeps the single record that threads them together.

The hardest part is partial cancellation. Cancel one item of three and everything lands at once: who pays the shipping fee, whether the coupon's minimum-amount condition is now broken and the discount must be taken back, what happens to points already earned. Full cancellation is easy. Partial is hard.
