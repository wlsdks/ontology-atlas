---
uid: 94cce5c7-e7bd-4491-b620-5e341b7c40e5
slug: elements/naver-pay
kind: element
title: NaverPay Integration
display_ko: 네이버페이 연동
display_en: NaverPay Integration
description: "네이버페이 지갑 결제를 맡는 연동으로, 승인 화면과 계약과 정산 주기가 모두 네이버페이 몫으로 따로 있습니다."
domain: domains/payment
---

# NaverPay Integration · 네이버페이 연동

네이버페이 지갑으로 결제하는 흐름을 맡는 연동입니다. 승인 화면, 가게와의 계약, 정산 주기가 모두 네이버페이 몫으로 따로 있습니다. 이 조각이 멈추면 카드 결제는 멀쩡한데 네이버페이 버튼만 실패합니다. 결제 수단마다 연동을 따로 두는 이유가 그 부분 장애를 부분으로 가두기 위해서입니다.

The wallet integration for NaverPay: its own approval screen, its own contract, its own settlement cycle. When it fails, only the NaverPay button fails; one integration per wallet keeps a partial outage partial.
