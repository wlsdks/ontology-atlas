---
uid: cb778b9d-9b2a-4411-9241-45fda9019512
slug: capabilities/tax-receipt
kind: capability
title: Tax Receipt Issuing
display_ko: 현금영수증 발행
display_en: Tax Receipt Issuing
description: "현금이나 계좌이체로 결제한 고객에게 세무 증빙을 발행하는, 편의 기능이 아니라 가게가 져야 하는 법적 의무입니다."
domain: domains/payment
dependencies: [capabilities/payment-authorize]
elements: []
---

# Tax Receipt Issuing · 현금영수증 발행

현금이나 계좌이체로 결제한 고객이 「현금영수증 해 주세요」라고 할 때 발행하는 그 증빙입니다. 고객에게는 연말정산 자료가 되고, 가게에는 편의 기능이 아니라 법적 의무입니다.

결제 승인 기록이 있어야 발행할 수 있고, 금액은 그 기록과 정확히 같아야 합니다. 함정은 환불 쪽입니다: 결제를 되돌렸으면 발행된 영수증도 취소해야 합니다. 돈만 돌려주고 증빙을 남겨 두면, 장부와 세무 기록이 어긋난 채 연말에 발견됩니다.

Issues the document a shopper needs for their own tax records after a cash or bank-transfer payment, which is a legal obligation rather than a feature. When the payment is reversed the issued receipt must be voided too, or the books disagree at year-end.
