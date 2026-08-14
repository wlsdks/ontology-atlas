---
uid: 22c5dc9d-a10c-417b-bfee-f2f318c12b36
slug: elements/hanjin-express
kind: element
title: Hanjin Express Integration
display_ko: 한진택배 연동
display_en: Hanjin Express Integration
description: "한진택배에 배송을 접수하고 상태를 받아 오는 연동으로, 합쳐 쓸 수 없는 이 회사만의 접수 규격과 상태 코드를 가집니다."
domain: domains/fulfillment
---

# Hanjin Express Integration · 한진택배 연동

한진택배에 접수를 넣고 배송 상태를 받아 오는 연결 부위입니다. 겉보기에 다른 택배사 연동과 똑같은 일을 하지만 하나로 합칠 수 없습니다.

접수 규격도 상태 코드 목록도 회사마다 달라서, 하나로 뭉치면 한 회사의 사정이 바뀔 때마다 다른 회사 배송까지 흔들립니다. 그래서 택배사 하나에 조각 하나씩 둡니다.

The delivery-company integration for Hanjin Express: its own booking call, its own status codes. It cannot be merged with the other carrier integrations, because formats and codes differ per company.
