---
uid: 7ca242f1-6b2e-466e-8d2b-b2e5749d3576
slug: capabilities/restock-alert
kind: capability
title: Restock Alert
display_ko: 재입고 알림
display_en: Restock Alert
description: "품절 상품을 원했던 사람을 기억해 두었다가 재고가 살아나는 순간 알려서, 놓칠 뻔한 판매를 나중의 판매로 바꿉니다."
domain: domains/inventory
dependencies: [capabilities/customer-messaging, capabilities/stock-tracking]
elements: [elements/restock-subscription]
---

# Restock Alert · 재입고 알림

품절 상품 앞에서 돌아서는 고객에게 「들어오면 알려 드릴까요?」를 묻는 기능입니다. 신청을 기억해 두었다가, 재고 장부에서 수량이 0에서 살아나는 순간 고객 메시지 발송으로 알립니다. 놓칠 뻔한 판매가 나중의 판매로 바뀝니다.

함정: 재입고 수량보다 신청자가 많은데 전원에게 알리면, 대부분은 다시 품절을 만납니다. 두 번 실망한 고객은 알림 자체를 꺼 버립니다. 신청 순서대로 끊어 보내는 것이 대비책이고, 몇 명씩 끊을지는 아직 정하지 못했습니다.

Remembers who wanted a sold-out item and tells them the moment stock comes back, turning a lost sale into a later one. Alerting more people than there are units manufactures a second disappointment, so alerts go out in request order, in batches whose size is still undecided.
