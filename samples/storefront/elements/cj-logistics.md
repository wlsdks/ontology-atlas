---
uid: 3c0a57b7-85ba-4fe6-a345-78012d34c6f8
slug: elements/cj-logistics
kind: element
title: CJ Logistics Integration
display_ko: CJ대한통운 연동
display_en: CJ Logistics Integration
description: "CJ대한통운에 배송을 접수하고 상태를 받아 오는 연동으로, 이 회사만의 접수 규격과 상태 코드를 따로 가집니다."
domain: domains/fulfillment
---

# CJ Logistics Integration · CJ대한통운 연동

CJ대한통운에 배송을 접수하고 상태를 받아 오는 연결 부위입니다. 택배사마다 접수 규격과 상태 코드가 달라서 회사 하나에 이런 조각이 하나씩 있습니다. 여기서 받아 오는 「간선상차」 같은 낯선 코드는 그대로 고객에게 보여 주지 않고, 가게가 정한 몇 가지 상태로 번역되어 화면에 오릅니다.

The delivery-company integration for CJ Logistics: its own booking call, its own status codes. What it returns is translated before a shopper ever sees it.
