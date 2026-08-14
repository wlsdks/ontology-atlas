---
uid: e9f0b080-7840-4f92-94c9-3dc5bb75c516
slug: capabilities/product-recommendation
kind: capability
title: Related Product Recommendation
display_ko: 연관 상품 추천
display_en: Related Product Recommendation
description: "실제로 함께 팔리고 함께 조회된 기록을 근거로, 지금 보는 상품 다음에 볼 만한 상품을 골라 보여 주는 기능입니다."
domain: domains/catalog
dependencies: [capabilities/product-category]
relates: [capabilities/product-review]
elements: [elements/recommendation-rule]
---

# Related Product Recommendation · 연관 상품 추천

상품 상세 아래 「이 상품을 본 분들이 함께 본」 줄을 채우는 일입니다. 근거는 편집자의 감이 아니라 실제로 함께 팔리고 함께 조회된 기록입니다. 같은 카테고리라는 사실은 그 기록이 아직 얇을 때의 대비책입니다.

아직 못 정한 것: 품절 상품을 추천 줄에서 뺄 것인가. 빼면 줄이 빈약해지고, 두면 눌러 본 고객이 허탕을 칩니다. 재입고 알림으로 잇는 절충안이 후보로 남아 있습니다.

Fills the row of what to look at next using what actually sold and was viewed together, with shared category as the fallback when that record is thin. Whether sold-out items should stay in the row is still an open question.
