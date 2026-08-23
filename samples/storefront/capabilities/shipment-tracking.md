---
uid: db1497cb-32da-4db2-acaf-a1556289d956
slug: capabilities/shipment-tracking
kind: capability
title: Shipment Tracking
display_ko: 배송 조회
display_en: Shipment Tracking
description: "Shows where the parcel is now, translating each carrier's own status codes into the store's single vocabulary. It cannot invent position: when the carrier goes quiet this page shows how old the last update is, instead of hiding two days of silence behind the words 'in transit'."
domain: domains/fulfillment
dependencies: [capabilities/carrier-integration]
elements: [elements/delivery-status-log]
---

# Shipment Tracking

Shows where the parcel is now, translating each carrier's own status codes into the store's single vocabulary. It cannot invent position: when the carrier goes quiet this page shows how old the last update is, instead of hiding two days of silence behind the words 'in transit'.
