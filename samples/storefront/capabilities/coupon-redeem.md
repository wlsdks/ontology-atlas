---
uid: 0a89c65f-a592-4203-8670-c04c8ddee961
slug: capabilities/coupon-redeem
kind: capability
title: Coupon Redemption
display_ko: 쿠폰 사용
display_en: Coupon Redemption
description: "Checks a coupon against the cart it is being used on and consumes it once, which is where most of the rules actually bite."
domain: domains/marketing
dependencies: [capabilities/coupon-issue]
elements: [elements/coupon-wallet]
---

# Coupon Redemption · 쿠폰 사용

Checks a coupon against the cart it is being used on and consumes it once, which is where most of the rules actually bite.

쿠폰이 지금 이 장바구니에 쓸 수 있는지 따져 보고 한 번만 소진시킵니다. 규칙이 실제로 작동하는 곳입니다.

**쿠폰은 쓰는 순간이 아니라 주문이 확정되는 순간에 소진됩니다.** 그 사이에 결제가 실패하면 쿠폰은 돌아와야 하고, 돌아오지 않으면 고객은 아무것도 못 사고 쿠폰만 잃습니다.

겹치는 규칙도 여기서 걸립니다. 이 가게는 **한 주문에 쿠폰 하나**이고 등급 할인·타임세일과는 겹칠 수 있습니다. 「하나만」이 제약처럼 보이지만, 여러 장을 허용하면 최종 금액을 고객이 예측하지 못하게 됩니다.
