---
uid: 95abc534-2507-4b7e-b07e-d0fcccdfb74b
slug: domains/payment
kind: domain
title: Payments
display_ko: 결제
display_en: Payments
description: "This area owns the question \"where is the money right now?\": received, merely held, or given back. Taking the money, holding it while the order settles, and giving it back when the order does not."
capabilities: [capabilities/installment, capabilities/payment-authorize, capabilities/payment-cancel, capabilities/refund, capabilities/tax-receipt, capabilities/wallet-payment]
elements: [elements/bank-transfer, elements/card-payment, elements/kakao-pay, elements/naver-pay, elements/payment-gateway, elements/payment-transaction, elements/refund-record, elements/toss-pay, elements/virtual-account]
relates: [domains/support]
---

# Payments

This area owns the question "where is the money right now?": received, merely held, or given back. Taking the money, holding it while the order settles, and giving it back when the order does not.

The flow: payment authorization is the first step, and it holds the amount. Card instalments and one-tap wallets like KakaoPay, Naver Pay and Toss all converge on that same authorization. If the order breaks before it settles, a void releases the hold; if it unwinds after settling, a refund gives the money back; and when proof is needed, a tax receipt is issued.

The moment the money is taken and the moment it is settled are different. The card is authorized to hold the amount, and only when the goods go out is it settled. Most questions in this area live in that gap: authorized but out of stock? A partial cancellation before settlement? An authorization that expires before the parcel is ready? The last one is the most common incident here: while a delivery slips, the hold quietly lapses, and the goods go out with no money left to collect.

A refund is not payment in reverse. Returning money to the original method is the rule, but that card may already be closed, and from there it is a settlement problem rather than a payment one. The boundary is drawn the same way: whether money goes back is the support area's review, and this area executes the decided refund with real money.
