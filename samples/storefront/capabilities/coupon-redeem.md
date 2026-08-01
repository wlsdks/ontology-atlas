---
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

쿠폰이 지금 이 장바구니에 쓸 수 있는지 따져 보고 한 번만 소진시킵니다 — 규칙이 실제로 작동하는 곳입니다.
