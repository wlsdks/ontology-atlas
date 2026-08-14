---
uid: 88185a5b-4287-4623-b658-9ec1bd79dbe6
slug: elements/toss-pay
kind: element
title: TossPay Integration
display_ko: 토스페이 연동
display_en: TossPay Integration
description: "토스페이 지갑 결제를 맡는 연동으로, 계약과 정산 일정이 달라서 장부에서 다른 지갑 연동과 한 줄로 뭉쳐지지 않습니다."
domain: domains/payment
---

# TossPay Integration · 토스페이 연동

토스페이 지갑 결제를 맡는 연동입니다. 다른 지갑 연동과 하는 일은 같지만 계약서와 정산 일정이 다르고, 그 차이는 장부를 맞추는 날에 드러납니다. 어느 지갑에서 얼마가 언제 들어오는지는 이 조각 단위로 따로 계산되기 때문입니다.

The wallet integration for TossPay: its own approval screen, its own contract, its own settlement cycle. The difference shows up on reconciliation day, wallet by wallet.
