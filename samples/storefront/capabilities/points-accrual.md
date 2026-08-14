---
uid: 3493ba46-3e32-4b57-8fa5-94218aeb4217
slug: capabilities/points-accrual
kind: capability
title: Points Accrual
display_ko: 적립
display_en: Points Accrual
description: "주문 하나가 포인트를 얼마나 쌓아 주는지, 그렇게 쌓인 포인트를 언제부터 쓸 수 있게 할지를 정하는 규칙입니다."
domain: domains/loyalty
dependencies: [capabilities/order-placement]
elements: []
---

# Points Accrual · 적립

주문 하나가 포인트를 얼마나 쌓는지, 그리고 그 포인트를 언제부터 쓸 수 있는지를 정합니다. 결제 금액의 1%를 줄지, 배송비를 빼고 계산할지, 결제 완료 순간에 줄지 반품 기간이 지난 뒤에 줄지가 전부 여기서 갈립니다.

이 역량은 아직 계획입니다. 정해 둔 것은 「주문 확정에서 출발한다」는 연결 하나뿐이고, 적립 시점은 미정입니다. 결제 즉시 주면 반품 때 도로 뺏어야 하고, 반품 기간 뒤에 주면 고객은 3주 동안 「내 포인트 어디 갔지」를 묻습니다. 이 하나를 정하지 못해 나머지 설계가 멈춰 있습니다.

Decides how many points an order earns and when they become spendable. Still a plan: the accrual moment is undecided, because paying out instantly means clawing points back on returns, while waiting out the return window means three weeks of "where are my points".
