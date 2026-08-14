---
uid: 0caae896-a624-4a9b-b2e0-8317236ff7f9
slug: capabilities/account-closure
kind: capability
title: Account Closure
display_ko: 회원 탈퇴
display_en: Account Closure
description: "고객이 탈퇴 버튼을 누르면 개인정보는 지우고, 법이 보관을 요구하는 주문 기록만 남긴 채 가게와의 관계를 끝냅니다."
domain: domains/customer
dependencies: [capabilities/order-lookup]
elements: []
---

# Account Closure · 회원 탈퇴

고객이 「탈퇴하기」를 누르면 계정은 그 자리에서 잠기고, 이름·연락처·배송지 같은 개인정보는 지워집니다. 다만 주문과 결제 기록은 법이 정한 기간 동안 남습니다. 그래서 탈퇴는 「모든 것을 지우는 일」이 아니라 「지울 것과 남길 것을 가르는 일」입니다.

남긴 기록을 찾아볼 길이 필요하기 때문에 이 기능은 주문 조회에 기대고 있습니다. 탈퇴한 사람의 환불이 아직 진행 중일 수 있고, 그 환불은 끝까지 가야 합니다.

흔한 함정: 탈퇴 즉시 다 지웠다가 배송 중인 주문의 받는 사람 정보까지 사라지는 경우입니다. 진행 중인 주문이 있으면 탈퇴를 막는 것이 아니라, 그 주문이 끝난 뒤로 지우기를 미룹니다.

When a shopper taps the close-account button, the account locks and personal data is erased, while order and payment records stay for the legally required period. Closure is deciding what to erase and what to keep, and the erasing waits for live orders and refunds to finish first.
