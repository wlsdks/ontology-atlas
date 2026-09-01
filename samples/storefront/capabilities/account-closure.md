---
uid: 0caae896-a624-4a9b-b2e0-8317236ff7f9
slug: capabilities/account-closure
kind: capability
title: Account Closure
display_ko: 회원 탈퇴
display_en: Account Closure
description: "When a shopper taps the close-account button, the account locks and personal data is erased, while order and payment records stay for the legally required period. Closure is deciding what to erase and what to keep, and the erasing waits for live orders and refunds to finish first."
domain: domains/customer
dependencies: [capabilities/order-lookup]
elements: []
review_state: human_decides
review_note: "How long payment records stay after closure is a legal retention call, not something the source can answer."
---

# Account Closure

When a shopper taps the close-account button, the account locks and personal data is erased, while order and payment records stay for the legally required period. Closure is deciding what to erase and what to keep, and the erasing waits for live orders and refunds to finish first.
