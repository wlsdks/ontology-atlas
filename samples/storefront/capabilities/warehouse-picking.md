---
uid: 1d11c6ef-c486-441e-ae73-2e24681b5c64
slug: capabilities/warehouse-picking
kind: capability
title: Warehouse Picking
display_ko: 출고 지시
display_en: Warehouse Picking
description: "확정된 주문을 「이 선반에서 이만큼 집어 이 상자에」라는, 창고에서 사람이 걸어 다니며 수행할 지시로 바꿉니다."
domain: domains/fulfillment
dependencies: [capabilities/stock-tracking]
elements: [elements/picking-list]
---

# Warehouse Picking · 출고 지시

확정된 주문을 창고의 노동으로 번역합니다. 「A-3 선반에서 검정 L 두 개, 5번 상자에」처럼 사람이 실제로 걸어 다니며 수행할 지시가 됩니다. 여러 주문을 한 동선으로 묶으면 걸음이 줄어듭니다.

재고 장부의 위치 정보가 재료입니다. 경계: 집어서 상자에 넣고 송장을 붙이는 데까지가 이 일이고, 상자가 택배사에 넘어가는 순간부터는 택배사 연동의 영역입니다.

이 지시가 나가는 순간이 주문의 되돌림 비용이 뛰는 순간이기도 합니다. 배송지 변경과 주문 취소가 「출고 전까지」를 시한으로 삼는 이유가 여기 있습니다.

Turns a confirmed order into instructions a person in the warehouse can walk: this shelf, this many, this box. Once the picking list is out the cost of undoing the order jumps, which is why address changes and cancellations use 'before dispatch' as their deadline.
