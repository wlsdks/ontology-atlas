---
uid: 23ebf680-08f5-4be9-be61-5677208e0032
slug: capabilities/installment
kind: capability
title: Instalment Payment
display_ko: 할부 결제
display_en: Instalment Payment
description: "카드 결제 한 건을 여러 달로 나눠서, 고객이 매달 내는 돈은 달라져도 가게가 받는 금액은 그대로인 결제 방식입니다."
domain: domains/payment
dependencies: [capabilities/payment-authorize]
elements: []
---

# Instalment Payment · 할부 결제

50만원짜리 카드 결제를 「월 10만원씩 다섯 달」로 나누는 일입니다. 나뉘는 것은 고객이 매달 내는 돈이지, 가게가 받는 돈이 아닙니다. 가게에는 처음부터 전액이 들어옵니다.

할부는 결제 승인의 한 형태로, 카드사와의 사이에서 일어납니다. 그래서 무이자 행사를 열려면 그 이자를 누가 무는지(대개 가게)가 먼저 정해져야 합니다. 화면에 「무이자」라고 쓰는 일은 쉽고, 그 비용을 장부 어디에 적을지가 진짜 결정입니다.

Splits one card payment across months. What changes is what the shopper owes each month, not what the store receives; and an interest-free promotion is really a decision about who absorbs the interest.
