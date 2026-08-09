---
uid: 95abc534-2507-4b7e-b07e-d0fcccdfb74b
slug: domains/payment
kind: domain
title: Payments
display_ko: 결제
display_en: Payments
description: "Taking the money, holding it while the order settles, and giving it back when the order does not."
capabilities: [capabilities/installment, capabilities/payment-authorize, capabilities/payment-cancel, capabilities/refund, capabilities/tax-receipt, capabilities/wallet-payment]
elements: [elements/bank-transfer, elements/card-payment, elements/kakao-pay, elements/naver-pay, elements/payment-gateway, elements/payment-transaction, elements/refund-record, elements/toss-pay, elements/virtual-account]
relates: [domains/support]
---

# Payments · 결제

Taking the money, holding it while the order settles, and giving it back when the order does not.

돈을 받고, 주문이 확정될 때까지 붙들고 있다가, 주문이 깨지면 돌려주는 일을 다룹니다.

**돈을 받는 순간과 확정하는 순간이 다릅니다.** 카드를 승인해 금액을 붙들어 두고, 물건이 나갈 때 비로소 확정합니다. 그 사이에 주문이 깨지면 붙들어 둔 것을 풀어 줍니다.

이 시차 때문에 생기는 질문이 이 영역의 대부분입니다. 승인은 됐는데 재고가 없으면? 확정 전에 부분 취소가 들어오면? 승인 유효기간이 배송 준비보다 짧으면?

환불은 결제의 반대가 아닙니다. 원래 낸 수단으로 돌려주는 것이 원칙이지만 그 카드가 이미 해지됐을 수 있고, 그때부터는 결제가 아니라 **정산의 문제**가 됩니다.
