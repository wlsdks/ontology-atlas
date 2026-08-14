---
uid: 2743e491-ae47-4ed5-bc6f-d2ef8d369d73
slug: capabilities/payment-cancel
kind: capability
title: Payment Void
display_ko: 결제 취소
display_en: Payment Void
description: "아직 정산되지 않은 결제 승인을 풀어 주어서, 이미 정산된 돈을 환불하는 것보다 싸고 빠르게 결제를 되돌리는 방법입니다."
domain: domains/payment
dependencies: [capabilities/payment-authorize]
elements: []
---

# Payment Void · 결제 취소

붙들어만 두고 아직 정산되지 않은 승인을 놓아 주는 일입니다. 고객 눈에는 「결제가 취소됐다」로 보이지만, 돈이 이동했다가 돌아오는 것이 아니라 애초에 이동하지 않게 막는 것입니다. 그래서 환불보다 싸고 빠르며, 카드 명세서에서도 곧 사라집니다.

경계: 이미 정산이 끝난 돈을 되돌리는 일은 여기가 아니라 환불 처리입니다. 같은 「취소」라는 말이 전혀 다른 두 가지 일을 가리키기 때문에, 이 가게는 정산 전을 「결제 취소」, 정산 후를 「환불」로 부르기로 정해 두었습니다.

Releases an authorisation that was never settled, so the money never moves at all, which is cheaper and faster than refunding settled money. This store reserves the word refund for after settlement and payment void for before, because calling both 'cancel' hides the difference.
