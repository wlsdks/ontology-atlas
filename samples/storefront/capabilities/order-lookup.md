---
uid: 047b1fed-ce05-49b1-8978-e30742bc3d03
slug: capabilities/order-lookup
kind: capability
title: Order Lookup
display_ko: 주문 조회
display_en: Order Lookup
description: "「내 주문 어디쯤 왔어요?」에 사람 없이 답하는, 접수부터 도착까지 지금 어느 단계인지 보여 주는 화면입니다."
domain: domains/order
dependencies: [capabilities/shipment-tracking]
elements: [elements/order-status-log]
---

# Order Lookup · 주문 조회

「내 주문 어디쯤 왔어요?」에 사람 없이 답하는 화면입니다. 접수·결제·출고·배송 가운데 지금 어느 단계인지, 배송 중이라면 배송 조회를 통해 어디를 지나고 있는지 보여 줍니다.

이 화면이 좋아질수록 1:1 문의가 줄어듭니다. 고객센터에 들어오는 질문의 첫 자리는 언제나 「어디쯤 왔나요」이기 때문입니다.

비회원도 주문번호와 연락처만으로 볼 수 있어야 합니다. 조회에 로그인을 요구하는 순간, 비회원 주문을 허용한 의미가 사라집니다.

Shows a shopper where their order stands, from acceptance to delivery, without them having to ask a person. The better this page is, the fewer inquiries arrive; and guests must be able to use it with just an order number and a contact.
