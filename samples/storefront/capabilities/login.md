---
uid: a00abb55-c7f6-4101-a88f-6b1ccd77f307
slug: capabilities/login
kind: capability
title: Login
display_ko: 로그인
display_en: Login
description: "지금 화면 앞에 있는 사람이 그 계정의 주인임을 이번 방문에 한해 증명해서, 주문 내역과 쿠폰 같은 내 정보를 여는 문입니다."
domain: domains/customer
dependencies: [capabilities/signup]
elements: [elements/login-session]
---

# Login · 로그인

가입 때 만든 정체성의 주인이 지금 화면 앞에 있는 사람임을, 이번 방문에 한해 증명합니다. 증명이 끝나면 주문 내역·배송지·쿠폰이 그 사람의 것으로 열립니다.

경계 한 줄: 로그인이 확인하는 것은 「이 사람이 누구인가」까지입니다. 그 사람이 무엇을 볼 수 있는가는 각 기능이 정합니다.

함정: 비밀번호를 연속으로 틀렸을 때 얼마나 오래 잠글지는 편의와 안전 사이의 흥정입니다. 너무 짧으면 공격을 못 막고, 너무 길면 진짜 주인이 갇힙니다.

Proves, for this visit only, that the person at the keyboard owns the identity created at sign-up. It answers who this person is; what they may see is each feature's own decision.
