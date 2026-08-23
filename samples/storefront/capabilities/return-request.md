---
uid: 1481e831-03ab-46ac-8f77-d7cc4e42ef47
slug: capabilities/return-request
kind: capability
title: Return Request
display_ko: 반품 접수
display_en: Return Request
description: "Records that a shopper wants to send something back after it arrived, and starts the collection and refund it implies. The stated reason decides who pays the return shipping, so reasons are chosen by the shopper but verified after the goods arrive."
domain: domains/support
dependencies: [capabilities/order-lookup, capabilities/return-pickup]
relates: [capabilities/exchange-request, capabilities/refund-review]
elements: [elements/return-record]
---

# Return Request

Records that a shopper wants to send something back after it arrived, and starts the collection and refund it implies. The stated reason decides who pays the return shipping, so reasons are chosen by the shopper but verified after the goods arrive.
