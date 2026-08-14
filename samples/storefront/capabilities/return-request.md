---
uid: 1481e831-03ab-46ac-8f77-d7cc4e42ef47
slug: capabilities/return-request
kind: capability
title: Return Request
display_ko: 반품 접수
display_en: Return Request
description: "받아 본 물건을 돌려보내겠다는 요청을 접수해서, 사유에 따라 배송비 부담을 가르고 회수와 환불 심사를 시작시킵니다."
domain: domains/support
dependencies: [capabilities/order-lookup, capabilities/return-pickup]
relates: [capabilities/exchange-request, capabilities/refund-review]
elements: [elements/return-record]
---

# Return Request · 반품 접수

이미 받은 물건을 돌려보내고 싶다는 요청을 접수하고, 그에 따르는 회수와 환불을 시작시킵니다.

**되돌리는 이유가 처리를 정합니다.** 마음이 바뀐 것과 물건이 잘못 온 것은 배송비를 누가 무는지가 다르고, 그 판단을 고객이 고른 사유에만 맡기면 전부 「불량」이 됩니다.

그래서 사유는 고객이 고르되 **확인은 물건이 도착한 뒤에** 합니다. 확인 전에 환불하면 빠르지만 되돌려 받지 못하는 경우가 생기고, 확인 후에 환불하면 안전하지만 고객이 오래 기다립니다.

지금은 금액을 기준으로 가릅니다. 작은 금액은 먼저 돌려주고 나중에 확인합니다. 그 기준선의 근거는 「반품 사기로 잃는 것보다 기다리게 해서 잃는 것이 크다」이고, 숫자는 아직 감입니다.

Records that a shopper wants to send something back after it arrived, and starts the collection and refund it implies. The stated reason decides who pays the return shipping, so reasons are chosen by the shopper but verified after the goods arrive.
