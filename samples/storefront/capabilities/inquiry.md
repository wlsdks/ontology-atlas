---
uid: 3caa1908-b9ba-42d9-a3e2-6c6c27009e3f
slug: capabilities/inquiry
kind: capability
title: Customer Inquiry
display_ko: 1:1 문의
display_en: Customer Inquiry
description: "특정 주문이나 상품을 걸고 고객과 가게가 1:1 대화를 열어, 누군가 답하고 닫을 때까지 유지하는 상담 창구입니다."
domain: domains/support
dependencies: [capabilities/customer-messaging]
relates: [capabilities/faq]
elements: [elements/inquiry-ticket]
---

# Customer Inquiry · 1:1 문의

자주 묻는 질문으로 해결되지 않는 「제 주문만」의 사정을 다루는 창구입니다. 특정 주문이나 상품을 걸고 1:1 대화를 열면, 누군가 답하고 닫을 때까지 그 대화는 살아 있습니다.

답변이 달리면 고객 메시지 발송으로 알립니다. 답을 달아 놓고 알리지 않으면, 고객에게는 답이 없는 것과 같습니다.

경계: 접수 화면에 들어오기 전에 자주 묻는 질문을 먼저 보여 주는 데까지가 이 기능의 예의입니다. 그것으로 풀리면 문의는 생기지 않는 것이 최선입니다.

Opens a one-to-one thread tied to a specific order or product and keeps it alive until someone answers and closes it. When an answer lands, customer messaging tells the shopper; an unannounced answer is the same as no answer.
