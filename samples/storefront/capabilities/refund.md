---
uid: de610a89-5b71-4426-9d5b-ed6d80b22fb9
slug: capabilities/refund
kind: capability
title: Refund Processing
display_ko: 환불 처리
display_en: Refund Processing
description: "Sends settled money back after the fact, in the amount and to the method the original payment used. When the original path no longer works, points go back first because they are certain and instant, and what cannot be returned is escalated honestly instead of faked."
domain: domains/payment
dependencies: [capabilities/payment-cancel]
elements: [elements/refund-record]
---

# Refund Processing

Sends settled money back after the fact, in the amount and to the method the original payment used. When the original path no longer works, points go back first because they are certain and instant, and what cannot be returned is escalated honestly instead of faked.
