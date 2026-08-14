---
uid: 95abc534-2507-4b7e-b07e-d0fcccdfb74b
slug: domains/payment
kind: domain
title: Payments
display_ko: 결제
display_en: Payments
description: "돈을 받고 주문이 확정될 때까지 붙들고 있다가 주문이 깨지면 돌려주기까지, 돈이 지금 어디에 있는지를 책임지는 영역입니다."
capabilities: [capabilities/installment, capabilities/payment-authorize, capabilities/payment-cancel, capabilities/refund, capabilities/tax-receipt, capabilities/wallet-payment]
elements: [elements/bank-transfer, elements/card-payment, elements/kakao-pay, elements/naver-pay, elements/payment-gateway, elements/payment-transaction, elements/refund-record, elements/toss-pay, elements/virtual-account]
relates: [domains/support]
---

# Payments · 결제

이 영역이 맡는 질문은 「돈이 지금 어디에 있는가」입니다. 받은 것인지, 붙들어만 둔 것인지, 돌려준 것인지. 돈을 받고, 주문이 확정될 때까지 붙들고 있다가, 주문이 깨지면 돌려주는 일을 다룹니다.

일의 흐름은 이렇습니다. 결제 승인이 금액을 붙들어 두는 첫 단추입니다. 카드 할부도, 카카오페이·네이버페이·토스 같은 간편결제도 결국 이 승인으로 모입니다. 확정 전에 주문이 깨지면 승인 취소로 붙든 것을 풀고, 확정 뒤에 무르게 되면 환불로 돌려주고, 증빙이 필요하면 세금 증빙을 발급합니다.

**돈을 받는 순간과 확정하는 순간이 다릅니다.** 카드를 승인해 금액을 붙들어 두고, 물건이 나갈 때 비로소 확정합니다. 이 시차 때문에 생기는 질문이 이 영역의 대부분입니다. 승인은 됐는데 재고가 없으면? 확정 전에 부분 취소가 들어오면? 승인 유효기간이 배송 준비보다 짧으면? 마지막 것이 여기서 가장 자주 나는 사고입니다. 배송이 늦어지는 사이 승인이 먼저 풀려 버리면, 물건은 나갔는데 받을 돈이 없는 상태가 됩니다.

환불은 결제의 반대가 아닙니다. 원래 낸 수단으로 돌려주는 것이 원칙이지만 그 카드가 이미 해지됐을 수 있고, 그때부터는 결제가 아니라 정산의 문제가 됩니다. 경계도 여기서 긋습니다. 돌려줄지 말지의 판단은 고객지원의 심사가 하고, 여기는 정해진 환불을 실제 돈으로 실행합니다.

This area owns the question "where is the money right now?": received, merely held, or given back. Taking the money, holding it while the order settles, and giving it back when the order does not.

The flow: payment authorization is the first step, and it holds the amount. Card instalments and one-tap wallets like KakaoPay, Naver Pay and Toss all converge on that same authorization. If the order breaks before it settles, a void releases the hold; if it unwinds after settling, a refund gives the money back; and when proof is needed, a tax receipt is issued.

The moment the money is taken and the moment it is settled are different. The card is authorized to hold the amount, and only when the goods go out is it settled. Most questions in this area live in that gap: authorized but out of stock? A partial cancellation before settlement? An authorization that expires before the parcel is ready? The last one is the most common incident here: while a delivery slips, the hold quietly lapses, and the goods go out with no money left to collect.

A refund is not payment in reverse. Returning money to the original method is the rule, but that card may already be closed, and from there it is a settlement problem rather than a payment one. The boundary is drawn the same way: whether money goes back is the support area's review, and this area executes the decided refund with real money.
