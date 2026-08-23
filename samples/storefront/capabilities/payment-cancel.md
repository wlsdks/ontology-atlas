---
uid: 2743e491-ae47-4ed5-bc6f-d2ef8d369d73
slug: capabilities/payment-cancel
kind: capability
title: Payment Void
display_ko: 결제 취소
display_en: Payment Void
description: "Releases an authorisation that was never settled, so the money never moves at all, which is cheaper and faster than refunding settled money. This store reserves the word refund for after settlement and payment void for before, because calling both 'cancel' hides the difference."
domain: domains/payment
dependencies: [capabilities/payment-authorize]
elements: []
---

# Payment Void

Releases an authorisation that was never settled, so the money never moves at all, which is cheaper and faster than refunding settled money. This store reserves the word refund for after settlement and payment void for before, because calling both 'cancel' hides the difference.
