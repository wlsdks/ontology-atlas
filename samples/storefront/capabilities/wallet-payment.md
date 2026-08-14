---
uid: 4ccdd883-2646-4197-b6a4-2f0f45487a25
slug: capabilities/wallet-payment
kind: capability
title: One-Tap Wallet Payment
display_ko: 간편결제
display_en: One-Tap Wallet Payment
description: "카드번호를 치는 대신 고객이 이미 믿고 쓰는 지갑 앱 안에서 버튼 하나로 결제 승인을 받게 하는 간편한 결제 길입니다."
domain: domains/payment
dependencies: [capabilities/payment-authorize]
elements: [elements/kakao-pay, elements/naver-pay, elements/toss-pay]
---

# One-Tap Wallet Payment · 간편결제

결제창에서 카드번호를 치는 대신 카카오페이·네이버페이·토스 버튼 하나를 누르게 합니다. 승인은 고객이 이미 믿고 쓰는 지갑 앱 안에서 일어나고, 가게는 결과만 받습니다.

이것은 결제 승인의 한 갈래이지 다른 결제가 아닙니다: 승인·취소·환불의 규칙은 같고, 승인이 일어나는 장소만 다릅니다.

함정: 지갑 앱으로 넘어갔다가 돌아오지 않는 고객이 생깁니다. 앱을 오가는 중에 끊긴 결제를 「실패」로 정리해 두지 않으면, 붙들린 승인과 미아가 된 주문이 남습니다.

Authorises a payment inside a wallet app the shopper already trusts, such as KakaoPay, Naver Pay, or Toss, so no card number is typed at checkout. It is one form of payment authorisation, not a different kind of payment; only the place of approval changes.
