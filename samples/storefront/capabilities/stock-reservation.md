---
uid: 03c839c5-318a-4165-939a-94645aba831f
slug: capabilities/stock-reservation
kind: capability
title: Stock Reservation
display_ko: 재고 선점
display_en: Stock Reservation
description: "결제가 진행 중인 주문 몫의 재고를 잠시 붙들어 두어, 마지막 한 개를 두 사람이 동시에 사는 사고를 막는 장치입니다."
domain: domains/inventory
dependencies: [capabilities/stock-tracking]
elements: [elements/stock-hold]
---

# Stock Reservation · 재고 선점

결제가 진행 중인 주문 몫을 잠시 붙들어 둡니다. 마지막 한 개를 두 사람이 동시에 사는 일을 막습니다.

**언제 잡을 것인가가 이 기능의 전부입니다.**

장바구니에 넣을 때 잡으면 안 사는 사람이 재고를 묶습니다. 결제가 끝난 뒤 잡으면 두 사람이 마지막 하나를 동시에 삽니다. 이 가게는 **결제를 시작할 때 잡고, 정해진 시간이 지나면 자동으로 풉니다.**

그 시간이 짧으면 결제하다 재고를 잃고, 길면 재고가 묶입니다. 지금은 15분인데 이 값은 근거가 약합니다. 실제 결제 소요 시간을 재 본 적이 없습니다.

Holds units for an order that is being paid for, so two shoppers cannot buy the same last item. The whole capability is the question of when to hold: this store holds at payment start and releases automatically after a timeout whose current value is still a guess.
