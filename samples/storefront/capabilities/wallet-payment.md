---
uid: 4ccdd883-2646-4197-b6a4-2f0f45487a25
slug: capabilities/wallet-payment
kind: capability
title: One-Tap Wallet Payment
display_ko: 간편결제
display_en: One-Tap Wallet Payment
description: "Authorises a payment inside a wallet app the shopper already trusts, such as KakaoPay, Naver Pay, or Toss, so no card number is typed at checkout. It is one form of payment authorisation, not a different kind of payment; only the place of approval changes."
domain: domains/payment
dependencies: [capabilities/payment-authorize]
elements: [elements/kakao-pay, elements/naver-pay, elements/toss-pay]
---

# One-Tap Wallet Payment

Authorises a payment inside a wallet app the shopper already trusts, such as KakaoPay, Naver Pay, or Toss, so no card number is typed at checkout. It is one form of payment authorisation, not a different kind of payment; only the place of approval changes.
