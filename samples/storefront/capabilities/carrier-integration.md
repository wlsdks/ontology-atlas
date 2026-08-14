---
uid: 3e928544-81c9-48ec-8188-2dadaf6ab62c
slug: capabilities/carrier-integration
kind: capability
title: Carrier Integration
display_ko: 택배사 연동
display_en: Carrier Integration
description: "포장된 상자를 택배사에 넘기고, 운송장 번호와 택배사가 보내오는 배송 상태 변화를 되받아 오는 연결 창구입니다."
domain: domains/fulfillment
elements: [elements/cj-logistics, elements/hanjin-express, elements/korea-post, elements/waybill]
---

# Carrier Integration · 택배사 연동

포장이 끝난 상자를 CJ대한통운·한진택배·우체국 같은 택배사에 넘기고, 운송장 번호와 「집화 완료」 「배송 중」 같은 상태 변화를 되받아 오는 창구입니다.

택배사마다 보내오는 말이 다릅니다. 같은 상황을 어떤 회사는 「간선 상차」라 부르고 어떤 회사는 「이동 중」이라 부릅니다. 이 창구의 일은 그 말들을 받아 오는 데까지이고, 가게의 말로 번역해 보여 주는 일은 배송 조회가 맡습니다.

Hands a packed parcel to CJ Logistics, Hanjin, or Korea Post, and takes back the waybill number and every status update the carrier reports. Translating each carrier's own vocabulary into the store's words is shipment tracking's job, not this one's.
