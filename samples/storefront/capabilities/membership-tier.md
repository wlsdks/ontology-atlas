---
uid: c4b5557d-fb71-4a66-8b01-7d6c66614d02
slug: capabilities/membership-tier
kind: capability
title: Membership Tier
display_ko: 회원 등급
display_en: Membership Tier
description: "실제 구매 실적으로 고객의 등급을 매기고, 그 등급이 고객이 보는 가격과 혜택을 실제로 바꾸게 하는 제도입니다."
domain: domains/customer
dependencies: [capabilities/order-placement]
relates: [capabilities/loyalty-point]
elements: [elements/tier-rule]
---

# Membership Tier · 회원 등급

석 달에 얼마를 샀는지 같은 실제 구매 실적으로 고객을 새싹·우수·VIP 같은 등급으로 나눕니다. 등급은 장식이 아니라, 그 고객이 보는 가격과 혜택을 실제로 바꿉니다.

확정된 주문의 실적이 재료이고, 적립 혜택과 자주 짝을 이룹니다. 함정: 등급 계산에 취소와 환불을 반영하지 않으면, 사고 무르기를 반복하는 것만으로 VIP가 될 수 있습니다. 실적은 「산 금액」이 아니라 「사고 무르지 않은 금액」이어야 합니다.

Grades a customer by what they have actually spent over a period, and the grade really changes the prices and perks they see. Spend must be counted net of cancellations and refunds, or the tier can be gamed by buying and returning.
