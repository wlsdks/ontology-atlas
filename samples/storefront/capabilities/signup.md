---
uid: c43a5015-ac5c-46e5-8c8d-9a9c11c5385d
slug: capabilities/signup
kind: capability
title: Sign-up
display_ko: 회원 가입
display_en: Sign-up
description: "주문 내역·배송지·적립금·쿠폰이 앞으로 전부 매달리게 될, 이 가게 안에서의 「나」를 만드는 첫 번째 단계입니다."
domain: domains/customer
relates: [capabilities/coupon-issue]
elements: [elements/customer-account]
---

# Sign-up · 회원 가입

이름과 연락처, 로그인 수단을 받아 이 가게 안에서의 「나」를 만듭니다. 이후의 모든 것(주문 내역, 배송지 주소록, 적립금, 쿠폰함)이 이 정체성에 매달립니다.

가입 축하 쿠폰이 이 순간 발급되어, 첫 구매를 미루지 않을 이유가 됩니다. 다만 이 가게에는 비회원 주문이 있으므로, 가입은 문턱이 아니라 선택입니다.

함정: 가입 화면에서 생일·성별까지 다 받으려 들면, 그 문턱에서 잃는 고객이 그 정보로 버는 것보다 큽니다. 나중에 물어도 되는 것은 나중에 묻습니다.

Creates the identity everything else in the store attaches to: orders, addresses, points, coupons. With guest checkout available, signing up is a choice rather than a gate, so the form asks only what it needs now and leaves the rest for later.
