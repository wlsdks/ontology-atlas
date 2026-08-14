---
uid: 222b71f2-29d1-45c1-b1f4-d293e8a998fd
slug: capabilities/exchange-request
kind: capability
title: Exchange Request
display_ko: 교환 접수
display_en: Exchange Request
description: "받은 물건을 다른 것으로 바꿔 달라는 요청을 회수와 재발송 한 건으로 묶어, 돈은 오가지 않고 물건만 바뀌게 처리합니다."
domain: domains/support
dependencies: [capabilities/return-pickup, capabilities/stock-reservation]
elements: [elements/exchange-record]
---

# Exchange Request · 교환 접수

「같은 옷, 한 치수 큰 걸로 바꿔 주세요」를 처리합니다. 이미 배송된 물건을 거둬 오는 반품 회수와, 새로 내보낼 물건을 잡아 두는 재고 선점을 한 건으로 묶습니다. 돈은 오가지 않고, 고객 손에는 다른 물건이 남습니다.

함정 하나: 회수와 재발송을 따로 굴리면 「새 물건은 나갔는데 회수는 안 된」 상태가 생기고, 그 상태를 부르는 이름이 없으면 상담원마다 다르게 처리합니다. 한 건으로 묶는 이유가 그것입니다.

바꿔 줄 물건의 재고가 없으면 교환은 성립하지 않습니다. 그때는 교환을 붙들고 기다리게 하는 대신 반품과 환불로 안내하는 것이 맞습니다.

Ties a return pickup and a re-shipment into one case, so no money moves and the shopper ends up with a different item. If the replacement is out of stock, the exchange cannot stand and should become a return and refund instead.
