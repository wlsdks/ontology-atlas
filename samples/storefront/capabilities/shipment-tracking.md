---
uid: db1497cb-32da-4db2-acaf-a1556289d956
slug: capabilities/shipment-tracking
kind: capability
title: Shipment Tracking
display_ko: 배송 조회
display_en: Shipment Tracking
description: "택배사마다 다른 배송 상태 용어를 가게의 한 가지 말로 번역해서, 지금 물건이 어디쯤 있는지 보여 주는 화면입니다."
domain: domains/fulfillment
dependencies: [capabilities/carrier-integration]
elements: [elements/delivery-status-log]
---

# Shipment Tracking · 배송 조회

택배사 연동이 받아 온 「간선 상차」 「배송 출발」 같은 회사마다 다른 말을, 이 가게의 한 가지 말로 번역해 보여 줍니다. 고객은 어느 택배사인지 몰라도 「출발했고 오늘 도착 예정」을 읽을 수 있습니다.

경계: 이 기능은 위치를 만들어 내지 못합니다. 택배사가 갱신을 멈추면 여기도 멈춥니다. 그래서 정직함이 규칙입니다: 마지막 갱신이 언제였는지를 함께 보여 주고, 오래됐으면 오래된 대로 보입니다. 「배송 중」이라는 말로 이틀의 침묵을 덮지 않습니다.

Shows where the parcel is now, translating each carrier's own status codes into the store's single vocabulary. It cannot invent position: when the carrier goes quiet this page shows how old the last update is, instead of hiding two days of silence behind the words 'in transit'.
