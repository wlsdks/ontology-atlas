---
slug: capabilities/review-write
kind: capability
title: 리뷰 작성
domain: customer
dependencies: [capabilities/order-create]
elements: [review-store]
relates: [domains/catalog]
---

# 리뷰 작성

구매를 마친 고객이 상품에 후기와 별점을 남깁니다. 실제로 주문을 완료한
고객만 리뷰를 남길 수 있도록 주문 생성 기능에 의존합니다.
