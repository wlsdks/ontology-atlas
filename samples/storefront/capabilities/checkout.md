---
uid: d6c66098-542f-4781-9199-04d3f0b6119b
slug: capabilities/checkout
kind: capability
title: Checkout
display_ko: 주문서 작성
display_en: Checkout
description: "Turns a cart into a concrete proposal: these items, to this address, with this coupon, paid this way."
domain: domains/order
dependencies: [capabilities/address-book, capabilities/cart, capabilities/coupon-redeem]
elements: [elements/checkout-draft]
---

# Checkout · 주문서 작성

Turns a cart into a concrete proposal: these items, to this address, with this coupon, paid this way.

장바구니를 구체적인 제안으로 바꿉니다. 이 상품들을, 이 주소로, 이 쿠폰을 써서, 이 수단으로.

**결제 화면은 이 가게에서 사람이 가장 많이 떠나는 자리입니다.** 그래서 여기서 새로 묻는 것은 하나하나가 비용입니다. 회원가입을 요구할 것인가, 주소를 다시 입력하게 할 것인가, 결제 수단을 몇 개나 보여줄 것인가.

지금 정해 둔 것: **비회원도 끝까지 갈 수 있다.** 대신 주문 조회에 필요한 것(주문번호와 연락처)은 반드시 받습니다.

아직 못 정한 것: 재고가 결제 중에 떨어지면 어디서 알릴 것인가. 들어올 때 잡아 두면 장바구니에 넣고 안 사는 사람이 재고를 묶고, 나갈 때 확인하면 결제까지 다 하고 실패합니다.
