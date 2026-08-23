---
uid: 3dfe4ceb-036c-4756-830c-d3fe2029c2ad
slug: domains/fulfillment
kind: domain
title: Fulfillment & Delivery
display_ko: 배송
display_en: Fulfillment & Delivery
description: "This area owns the question \"where is this parcel right now, and when will it arrive?\". Getting goods out of the warehouse, onto a carrier, into the shopper's hands, and back again when they must return: that is the whole job."
capabilities: [capabilities/carrier-integration, capabilities/return-pickup, capabilities/shipment-tracking, capabilities/shipping-fee, capabilities/warehouse-picking]
elements: [elements/cj-logistics, elements/delivery-status-log, elements/hanjin-express, elements/korea-post, elements/picking-list, elements/pickup-request, elements/shipping-fee-rule, elements/waybill]
relates: [domains/support]
---

# Fulfillment & Delivery

This area owns the question "where is this parcel right now, and when will it arrive?". Getting goods out of the warehouse, onto a carrier, into the shopper's hands, and back again when they must return: that is the whole job.

The flow: once an order is confirmed, a picking list is made in the warehouse, the shipping-fee rules set the charge, the carrier integration issues a waybill, and from then on shipment tracking watches the parcel move. When a return is decided, the same integration calls a pickup driver.

Delivery is the one area this store does not control. The carriers decide when they collect and where they stop, so most of the work here is telling the truth about what we do not know. Status codes from CJ Logistics, Hanjin and Korea Post differ by company and by meaning, so the store rewrites them in its own words: shipped, on the way, delivered. The most common incident lives in that gap: a waybill has been issued, the screen says "shipped", and the parcel has not actually left the warehouse.

The boundary shows at returns. Whether to accept a return is the support area's call, giving the money back is the payment area's job, and this area is responsible only for the movement of goods. A return is also not a delivery played backwards: whether to refund before the goods come back must be decided first, together with the payment area.
