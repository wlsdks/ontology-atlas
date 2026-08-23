---
uid: 4937dbb9-9044-447f-a573-461d4ddd5c05
slug: capabilities/product-registration
kind: capability
title: Product Registration
display_ko: 상품 등록
display_en: Product Registration
description: "Creates a sellable product: name, description, photos, and a place in the category tree. Price, options, and stock are each taken up by their own capabilities afterwards, so registration itself stays light."
domain: domains/catalog
dependencies: [capabilities/product-category]
elements: [elements/product-image-store, elements/product-record]
---

# Product Registration

Creates a sellable product: name, description, photos, and a place in the category tree. Price, options, and stock are each taken up by their own capabilities afterwards, so registration itself stays light.
