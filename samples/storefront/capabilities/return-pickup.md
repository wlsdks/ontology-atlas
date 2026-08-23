---
uid: ac84cdf7-3a20-4093-b818-0e92d9717b95
slug: capabilities/return-pickup
kind: capability
title: Return Pickup
display_ko: 반품 회수
display_en: Return Pickup
description: "Sends a courier to the shopper's door to collect something already delivered: a delivery run in the opposite direction. The hard difference is that the origin is a customer's doorstep, so a missing box must be recorded as a failed pickup rather than as silence."
domain: domains/fulfillment
dependencies: [capabilities/carrier-integration]
elements: [elements/pickup-request]
---

# Return Pickup

Sends a courier to the shopper's door to collect something already delivered: a delivery run in the opposite direction. The hard difference is that the origin is a customer's doorstep, so a missing box must be recorded as a failed pickup rather than as silence.
