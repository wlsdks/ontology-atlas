---
uid: 2a3941ac-bc36-48ee-9cce-f9bfcf155d2b
slug: domains/marketing
kind: domain
title: Marketing & Promotions
display_ko: 마케팅
display_en: Marketing & Promotions
description: "This area owns the question \"what will bring this person back?\". Half the job is making reasons: coupons, points, time-limited sales, curated campaigns. The other half is carrying those reasons to a person through messages and notifications."
capabilities: [capabilities/campaign-planning, capabilities/coupon-issue, capabilities/coupon-redeem, capabilities/customer-messaging, capabilities/flash-sale, capabilities/loyalty-point, capabilities/referral]
elements: [elements/campaign-page, elements/coupon-policy, elements/coupon-wallet, elements/email-sender, elements/kakao-alimtalk, elements/point-ledger, elements/push-sender, elements/referral-code, elements/sale-schedule, elements/sms-gateway]
---

# Marketing & Promotions

This area owns the question "what will bring this person back?". Half the job is making reasons: coupons, points, time-limited sales, curated campaigns. The other half is carrying those reasons to a person through messages and notifications.

The flow: plan a campaign, issue coupons, make sure those coupons can actually be redeemed at checkout, put a clock on a flash sale, add loyalty points to purchases, and let referrals bring new customers in. Customer messaging then delivers all of it to each person by text, KakaoTalk notification or push.

Discounts stack. A coupon, a flash sale and a tier discount can all land on one order at once, and the order in which they apply changes the final amount. This store applies percentage discounts first and fixed-amount discounts last; the other way round, the same coupon would be worth more on an expensive order.

Discounts must also be reversible. When a partial cancellation arrives, how to split the coupon that was applied to that order is the most frequent incident here, and the rule decided in this area flows straight into both payment and orders. That is also where the boundary sits: making the reasons and the discount rules is this area's job, while actually computing and charging the final amount belongs to orders and payment.
