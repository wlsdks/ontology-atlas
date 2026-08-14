---
uid: 4f1e5f2c-be53-4964-a739-569801cd3d56
slug: capabilities/loyalty-point
kind: capability
title: Loyalty Points
display_ko: 적립금
display_en: Loyalty Points
description: "구매 금액의 일부를 이 가게 안에서만 쓸 수 있는 돈으로 돌려주는, 다음 구매를 다시 부르는 장부 안의 할인입니다."
domain: domains/marketing
dependencies: [capabilities/order-placement]
elements: [elements/point-ledger]
---

# Loyalty Points · 적립금

「구매액의 1%를 돌려드립니다」의 그 1%입니다. 현금이 아니라 이 가게 안에서만 쓸 수 있는 돈으로 돌려주기 때문에, 실제로는 다음 구매를 부르는 할인입니다. 이 기능이 고객 관리가 아니라 마케팅 영역에 있는 이유입니다.

주문이 확정되어야 쌓입니다. 함정은 취소 쪽에 있습니다: 적립금을 주고 난 뒤 주문이 취소되면 되찾아야 하는데, 이미 써 버린 뒤라면 잔액이 마이너스가 될 수 있습니다. 그 마이너스를 허용할지가 이 기능에서 가장 먼저 부딪히는 결정입니다.

Gives back a fraction of what was spent as credit that only works inside this store, which makes it a discount that invites the next purchase; that is why it lives in marketing. The hard part is clawing points back when an order is cancelled after they were already spent.
