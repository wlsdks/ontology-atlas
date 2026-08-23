---
uid: 0a89c65f-a592-4203-8670-c04c8ddee961
slug: capabilities/coupon-redeem
kind: capability
title: Coupon Redemption
display_ko: 쿠폰 사용
display_en: Coupon Redemption
description: "Checks a coupon against the cart it is being used on and consumes it once, which is where most of the rules actually bite. The coupon burns at order confirmation, not at selection, so a failed payment must hand it back."
domain: domains/marketing
dependencies: [capabilities/coupon-issue]
elements: [elements/coupon-wallet]
---

# Coupon Redemption

Checks a coupon against the cart it is being used on and consumes it once, which is where most of the rules actually bite. The coupon burns at order confirmation, not at selection, so a failed payment must hand it back.
