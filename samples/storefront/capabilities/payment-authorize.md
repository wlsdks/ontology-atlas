---
uid: 5ce43a0e-ba89-4be6-ade7-e4ff73bdbf3f
slug: capabilities/payment-authorize
kind: capability
title: Payment Authorization
display_ko: 결제 승인
display_en: Payment Authorization
description: "Asks the payment provider to guarantee the amount before the store promises anything to the shopper."
domain: domains/payment
elements: [elements/bank-transfer, elements/card-payment, elements/payment-gateway, elements/payment-transaction, elements/virtual-account]
---

# Payment Authorization · 결제 승인

Asks the payment provider to guarantee the amount before the store promises anything to the shopper.

가게가 고객에게 약속하기 전에, 결제사에 그 금액을 보증받습니다.

**승인은 돈을 받은 것이 아니라 붙들어 둔 것입니다.** 이 구별이 이 영역 문제의 절반을 만듭니다.

붙들어 둘 수 있는 기간은 카드사마다 다르고 보통 며칠입니다. 그 안에 확정하지 못하면 자동으로 풀리는데, 그때 주문은 살아 있고 돈만 없는 상태가 됩니다. 그래서 **확정하지 못할 것 같으면 먼저 풀고 주문을 세웁니다**: 조용히 만료되게 두지 않습니다.

한도 초과와 승인 거절은 다릅니다. 앞은 다른 수단을 권할 수 있고 뒤는 그러면 안 됩니다.
