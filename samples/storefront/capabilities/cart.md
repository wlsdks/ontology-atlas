---
uid: b000aa3e-d9da-4e0d-bcc1-644934df42f1
slug: capabilities/cart
kind: capability
title: Shopping Cart
display_ko: 장바구니
display_en: Shopping Cart
description: "사겠다는 마음만 담아 두는 곳으로, 아직 아무것도 확정되지 않고 창을 닫았다가 다시 와도 그대로 남아 있습니다."
domain: domains/order
dependencies: [capabilities/product-detail]
elements: [elements/cart-session]
---

# Shopping Cart · 장바구니

상품 상세에서 「담기」를 누른 것들이 모이는 곳입니다. 아직 아무것도 약속되지 않았습니다: 가격은 바뀔 수 있고 재고는 다른 사람이 가져갈 수 있습니다. 창을 닫았다가 다음 주에 와도 담아 둔 것은 그대로 있습니다.

경계: 장바구니에 담는 것은 재고를 잡는 일이 아닙니다. 재고가 잡히는 것은 결제를 시작할 때입니다. 「담아 뒀는데 품절됐어요」는 오류가 아니라 이 경계가 의도한 결과입니다.

Holds what a shopper intends to buy without committing them or the store to anything, and survives the tab being closed. Adding to the cart does not hold stock; that only happens when payment begins, so an item can sell out while it sits here.
