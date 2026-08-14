---
uid: 7dbe14e4-e368-441e-b021-e0dcdb88f831
slug: capabilities/product-search
kind: capability
title: Product Search
display_ko: 상품 검색
display_en: Product Search
description: "가게 내부의 이름이 아니라 고객이 입력한 말로, 띄어쓰기와 오타까지 흡수해 가면서 상품을 찾아 주는 검색 기능입니다."
domain: domains/catalog
dependencies: [capabilities/product-category]
elements: [elements/search-index]
---

# Product Search · 상품 검색

고객은 「MD-1042」가 아니라 「린넨 셔츠」라고 칩니다. 그 말로 상품을 찾아 주는 일입니다. 검색창은 카테고리를 타고 내려가는 길보다 빠른 지름길이고, 무엇을 찾다 실패했는지가 그대로 수요의 기록이 됩니다.

함정: 검색이 못 찾는 것과 없는 것을 고객은 구별하지 못합니다. 「린넨셔츠」로 못 찾으면 그 고객에게 이 가게에는 린넨 셔츠가 없는 것입니다. 띄어쓰기·오타·비슷한 말을 흡수하는 일이 검색 품질의 대부분입니다.

Finds products by the words a shopper types, not the identifiers the store uses internally. A search that misses is, to the shopper, a store that does not carry the item, so absorbing spacing, typos, and synonyms is most of the work.
