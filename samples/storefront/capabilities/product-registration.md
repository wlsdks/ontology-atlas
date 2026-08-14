---
uid: 4937dbb9-9044-447f-a573-461d4ddd5c05
slug: capabilities/product-registration
kind: capability
title: Product Registration
display_ko: 상품 등록
display_en: Product Registration
description: "이름·설명·사진을 올리고 어느 카테고리에 걸릴지 정해서, 팔 물건이 가게에 처음 생기게 하는 등록 절차입니다."
domain: domains/catalog
dependencies: [capabilities/product-category]
elements: [elements/product-image-store, elements/product-record]
---

# Product Registration · 상품 등록

팔 물건이 가게에 처음 생기는 순간입니다. 이름과 설명을 쓰고 사진을 올리고 카테고리의 어느 가지에 걸릴지 정하면, 그때부터 검색되고 진열될 수 있는 상품이 됩니다.

여기서 만드는 것은 「보여 줄 것」까지입니다. 얼마에 팔지는 판매가 관리가, 사이즈·색상으로 쪼개는 일은 상품 옵션이, 몇 개 팔 수 있는지는 재고가 각자 이어받습니다. 등록 화면에서 그 전부를 한 번에 요구하면 등록이 무거워지므로, 이 가게는 「일단 올리고 다듬는」 순서를 택했습니다.

Creates a sellable product: name, description, photos, and a place in the category tree. Price, options, and stock are each taken up by their own capabilities afterwards, so registration itself stays light.
