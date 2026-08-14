---
uid: dc4ceb54-20d6-4a40-9252-bc607290b96e
slug: capabilities/order-notification
kind: capability
title: Order Status Notification
display_ko: 주문 상태 알림
display_en: Order Status Notification
description: "주문이 접수되고 출고되고 도착할 때마다 고객에게 먼저 알려서, 고객이 계속 들여다보지 않아도 되게 하는 알림입니다."
domain: domains/order
dependencies: [capabilities/customer-messaging]
elements: []
---

# Order Status Notification · 주문 상태 알림

주문이 접수되고, 출고되고, 도착할 때마다 고객에게 먼저 알려 줍니다. 잘 되면 고객은 주문 조회 화면을 열 일조차 없습니다.

무엇이 「알릴 만한 변화」인지 정하는 것이 이 기능의 일이고, 실제 발송은 고객 메시지 발송에 맡깁니다. 함정: 단계를 전부 알리면 고객은 알림을 꺼 버립니다. 접수·출고·도착이면 충분하고, 나머지는 조회 화면에서 보이면 됩니다.

Tells the shopper each time their order changes state, so they never need to keep checking. Deciding which changes are worth announcing is this capability's job, the actual delivery belongs to customer messaging, and announcing everything teaches people to mute you.
