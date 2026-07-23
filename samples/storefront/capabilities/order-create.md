---
slug: capabilities/order-create
kind: capability
title: 주문 생성
domain: order
dependencies: [capabilities/inventory-management, capabilities/payment-authorize]
elements: [order-table]
---

# 주문 생성

장바구니 내용을 실제 주문으로 확정합니다. 결제 승인이 통과하고 재고가
확보되어야만 주문이 성립하므로, 결제·재고 관리 두 기능에 모두 의존합니다.
