---
uid: fb15b2d5-ae3c-48f2-8d44-3a885fb085cf
slug: capabilities/product-pricing
kind: capability
title: Price Management
display_ko: 판매가 관리
display_en: Price Management
description: "Sets the list price and the discounted price, and keeps a record of every change so a past order can still be explained."
domain: domains/catalog
dependencies: [capabilities/product-registration]
elements: [elements/price-history]
---

# Price Management · 판매가 관리

Sets the list price and the discounted price, and keeps a record of every change so a past order can still be explained.

정가와 할인가를 정하고, 지난 주문의 금액을 나중에도 설명할 수 있도록 모든 변경을 기록합니다.

**가격은 상품의 속성이 아니라 상품과 시점의 짝입니다.** 어제 산 사람과 오늘 산 사람이 다른 값을 냈다는 사실이 남아야 환불을 계산할 수 있습니다.

그래서 주문에는 **그때의 가격을 복사해 둡니다.** 상품 문서를 참조만 하면 나중에 가격이 바뀔 때 과거 주문의 금액이 같이 바뀝니다. 그건 계산이 아니라 사고입니다.
