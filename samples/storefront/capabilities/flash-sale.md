---
uid: dd2ecb07-d8ce-4d90-a3b9-a074c295b0cf
slug: capabilities/flash-sale
kind: capability
title: Flash Sale
display_ko: 타임세일
display_en: Flash Sale
description: "기다리면 손해가 될 만큼 짧은 시간 동안만 가격을 내렸다가, 시간이 끝나거나 재고가 떨어지면 그 즉시 멈추는 판매입니다."
domain: domains/marketing
dependencies: [capabilities/product-pricing, capabilities/stock-tracking]
relates: [capabilities/customer-messaging]
elements: [elements/sale-schedule]
---

# Flash Sale · 타임세일

「오늘 밤 9시부터 두 시간, 30% 할인」처럼 기다리면 손해가 되는 짧은 할인입니다. 시간이 끝나거나 재고가 떨어지면 그 순간 원래 가격으로 돌아갑니다.

판매가 관리에서 원래 가격을, 재고 수량 관리에서 남은 수량을 받아 옵니다. 시작을 알리는 메시지는 함께 나가야 효과가 있습니다.

아직 못 정한 것: 세일 직전에 장바구니에 담아 둔 사람에게 어느 가격을 보여 줄 것인가. 결제 시점 가격이 원칙이지만, 눈앞에서 값이 바뀌는 경험을 어떻게 설명할지는 정하지 못했습니다.

Drops a price for a window short enough that waiting is a real cost, and stops the moment the window or the stock ends. It borrows the base price from price management and the remaining units from stock tracking; what price a pre-sale cart should show is still undecided.
