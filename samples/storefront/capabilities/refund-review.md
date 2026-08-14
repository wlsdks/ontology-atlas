---
uid: e0a97ec7-f022-4bee-85bf-6b590a1601ee
slug: capabilities/refund-review
kind: capability
title: Refund Review
display_ko: 환불 심사
display_en: Refund Review
description: "돈이 움직이기 전에 되돌아온 물건을 살펴보고, 환불해 줄지와 얼마를 돌려줄지를 먼저 판정하는 심사 단계입니다."
domain: domains/support
dependencies: [capabilities/refund]
elements: []
---

# Refund Review · 환불 심사

되돌아온 물건을 열어 보고 「이건 환불해 드리는 게 맞다」를 판정하는 단계입니다. 돈이 움직이는 환불 처리 앞에 서서, 환불할지와 얼마를 돌려줄지(전액인지, 배송비를 뺄지)를 정합니다.

이 단계가 존재하는 이유는 단순합니다: 한번 나간 돈은 되찾기 어려우니, 판단은 돈보다 먼저 와야 합니다. 다만 모든 반품을 사람이 열어 보게 하면 심사가 병목이 됩니다. 소액은 자동으로 흘려보내고, 사람의 눈은 이상한 패턴에 쓰는 것이 이 가게의 방향입니다.

Decides whether the returned goods justify giving money back, and how much, before any money moves. Judgement must come before money because money, once out, is hard to recall; small amounts flow through automatically so human eyes go to the odd patterns.
