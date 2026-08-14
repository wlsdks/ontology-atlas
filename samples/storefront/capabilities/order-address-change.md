---
uid: 7b04ff83-d51a-4337-b388-1b01b975e642
slug: capabilities/order-address-change
kind: capability
title: Delivery Address Change
display_ko: 배송지 변경
display_en: Delivery Address Change
description: "이미 접수된 주문에서 산 물건과 낸 돈은 건드리지 않고, 창고가 상자를 집기 전까지만 도착지 하나를 바꿔 주는 기능입니다."
domain: domains/order
dependencies: [capabilities/address-book]
relates: [capabilities/warehouse-picking]
elements: []
---

# Delivery Address Change · 배송지 변경

「아 참, 그거 회사로 보내 주세요」를 처리합니다. 이미 접수된 주문에서 도착지 하나만 바꿉니다. 산 물건도, 낸 돈도 건드리지 않습니다.

이 기능의 전부는 시한입니다. 창고에서 상자를 집기 전까지만 가능하고, 출고 지시가 나간 뒤에는 바꿀 수 없습니다. 그때부터는 배송지 변경이 아니라 「받아서 반품」의 문제가 됩니다. 새 주소는 배송지 주소록에서 고르게 해서, 손으로 잘못 친 주소가 들어올 길을 좁힙니다.

Changes where a live order is going without touching what was bought or what was paid. It is all about the deadline: possible until the warehouse picks the box, impossible after; the new address is chosen from the address book to keep typos out.
