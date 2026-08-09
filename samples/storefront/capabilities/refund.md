---
uid: de610a89-5b71-4426-9d5b-ed6d80b22fb9
slug: capabilities/refund
kind: capability
title: Refund Processing
display_ko: 환불 처리
display_en: Refund Processing
description: "Sends settled money back after the fact, in the amount and to the method the original payment used."
domain: domains/payment
dependencies: [capabilities/payment-cancel]
elements: [elements/refund-record]
---

# Refund Processing · 환불 처리

Sends settled money back after the fact, in the amount and to the method the original payment used.

이미 정산된 돈을 사후에 돌려보냅니다. 원 결제와 같은 수단으로, 정해진 금액만큼.

**되돌려 주는 길이 받은 길과 같지 않을 때가 있습니다.** 원칙은 원래 수단이지만, 카드가 해지됐거나 상품권으로 냈거나 포인트와 섞여 있으면 그 원칙이 성립하지 않습니다.

이 가게가 정한 순서: **포인트 먼저, 그다음 원래 수단.** 포인트는 되돌리기가 확실하고 즉시이기 때문입니다. 남은 금액만 카드로 갑니다.

되돌려 줄 수 없는 경우가 남습니다. 그때는 **정산 문제로 넘기고 고객에게 그렇게 말합니다**: 화면에서 처리되는 척하지 않습니다.
