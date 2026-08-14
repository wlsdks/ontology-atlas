---
uid: c2acbad2-dd29-49b0-97f1-ae49875564c7
slug: capabilities/shipping-fee
kind: capability
title: Shipping Fee Policy
display_ko: 배송비 정책
display_en: Shipping Fee Policy
description: "고객이 총액을 보기 전에 물건을 옮기는 값을 누가 얼마나 낼지, 무료 배송의 문턱까지 정해 두는 규칙입니다."
domain: domains/fulfillment
relates: [capabilities/coupon-issue]
elements: [elements/shipping-fee-rule]
---

# Shipping Fee Policy · 배송비 정책

「3만원 이상 무료, 그 아래는 3천원, 제주·도서 지역은 3천원 추가」 같은 규칙을 정하는 일입니다. 고객이 총액을 보기 전에 계산되어 있어야 하므로, 주문서가 열리는 순간 이미 답을 갖고 있어야 합니다.

무료 배송의 문턱은 광고이기도 해서, 배송비인데도 마케팅과 얽힙니다. 무료 배송 쿠폰이 대표적인 접점입니다.

함정: 문턱 근처의 주문은 부분 취소 때 되살아납니다. 3만원을 넘겨 무료였던 주문에서 하나를 무르면 배송비가 소급으로 생기는데, 그 셈을 여기서 정해 두지 않으면 취소 쪽이 즉흥으로 정하게 됩니다.

Decides who pays to move the parcel and how much, before the shopper ever sees a total. The free-shipping threshold is as much advertising as logistics, and it comes back to life whenever a partial cancellation drops an order below the line.
