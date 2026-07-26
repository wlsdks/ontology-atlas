---
slug: domains/payment
kind: domain
title: 결제
display_en: Payments
description: 결제를 승인하고 취소·반품 시 환불을 처리합니다.
capabilities: [payment-authorize, refund-process]
relates: [domains/order]
---

# 결제

카드사·PG(결제 대행)를 통해 결제를 승인하고, 취소·반품 시 환불을 처리하는
도메인입니다. 주문 확정과 취소 모두 이 도메인의 승인 결과에 의존합니다.
