// Hand-written answer pages, sources, near-miss pages and questions for the meaning-search fixture.
// Fictional product: Tidewell, a cold-chain grocery delivery platform.

export const SOURCES = {
  'sources/rfc-reefer-alarms.md': `# RFC: 적재칸 온도 경보 기준

## 배경

지난 분기 관제 화면에 뜬 경보의 절반 이상이 문을 잠깐 연 사이의 순간적인 온도 튐이었다.
관제 담당자들이 경보를 무시하기 시작했다는 보고가 있었다.

## 제안

냉동 적재칸은 영하 18도보다 따뜻한 상태가 10분 넘게 이어질 때만 경보를 보낸다.
냉장 적재칸은 0도에서 5도 범위를 벗어난 상태가 15분 이어질 때 경보를 보낸다.
경보는 기사 앱과 관제 화면에 동시에 띄운다.

## 결정

제안대로 지속 시간 조건을 둔다. 다음 분기에 오탐률을 다시 잰다.
`,
  'sources/finance-meeting-2026-05.md': `# 정산팀 회의 — 2026년 5월

## 참석

정산팀장, 고객지원 리드, 결제 담당 개발자

## 논의

- 환불 처리 대기 시간이 평균 2일이라 고객 불만이 많다.
- 상담원이 바로 처리할 수 있는 환불 한도를 3만 원에서 5만 원으로 올리자는 제안이 나왔다.
- 5만 원을 넘는 환불은 지금처럼 정산팀장이 승인한다.
- 한 고객이 한 달에 세 번 넘게 환불을 받으면 검토 대기열로 보낸다.

## 결정

- 상담원 한도 5만 원은 6월 1일부터 적용한다.
`,
  'sources/privacy-review-2026.md': `# 개인정보 보관 기간 검토 (2026)

## 범위

주문, 결제, 기사 위치, 고객 연락처 데이터를 검토했다.

## 결과

- 주문 기록은 세법상 의무 때문에 5년 동안 보관한다.
- 기사 위치 기록은 90일이 지나면 삭제한다. 예전에는 1년이었다.
- 고객이 탈퇴하면 연락처를 30일 안에 익명화한다.

## 남은 일

- 백업 테이프에 남은 위치 기록의 삭제 일정은 아직 정하지 않았다.
`,
  'sources/notification-meeting-notes.md': `# 고객 알림 채널 회의

## 문제

- 문자 발송 비용이 한 달 1,800만 원을 넘었다.
- 문자로는 도착 사진을 함께 보여 줄 수 없다.

## 결정

- 2026년 2월부터 배송 출발과 도착 안내는 앱 푸시로 보낸다.
- 앱을 설치하지 않은 고객에게만 문자를 보낸다.
`,
  'sources/labor-policy-2026.md': `# 기사 근무 규정 2026

## 야간 근무

- 밤 10시부터 아침 6시 사이에 일하는 기사는 2시간마다 15분씩 쉰다.
- 야간 근무는 연속 사흘을 넘길 수 없다.

## 확인 방법

- 휴식은 앱의 정차 기록으로 확인한다. 휴식을 건너뛰면 다음 배차가 막힌다.
`,
  'sources/delay-model-review.md': `# 배송 지연 예측 모델 검토 회의

## 입력 데이터

- 지난 8주 동안 정류장별 실제 도착 시각
- 출발 지역의 시간대별 강수 예보
- 차량 적재율과 정류장 수
- 물류센터 출발 지연 기록

## 성능

- 15분 넘는 지연을 82% 정확도로 미리 맞혔다.
- 비 오는 날 저녁에는 정확도가 70%로 떨어졌다.

## 다음 단계

- 아파트 단지 출입 대기 시간을 입력에 넣어 본다.
`,
  'sources/security-review-q2.md': `# 보안 점검 2분기

## 서명 키

- API 서명 키는 90일마다 새로 만든다.
- 이전 키는 교체 뒤 7일 동안만 검증에 쓰고 폐기한다.
- 교체에는 보안 담당자 두 명의 승인이 필요하다.
- 수작업 교체를 분기별 자동 작업으로 바꾸기로 했다.

## 기타

- 관리자 화면 접속은 회사 네트워크에서만 허용한다.
`,
  'sources/warehouse-sop.md': `# Warehouse standard operating procedure

## Receiving

Pallets are scanned at the dock door and moved to their temperature zone.

## Dock dwell

Chilled pallets may stay on the loading dock for at most 20 minutes.
Frozen pallets get 10 minutes before they must return to the freezer room.
The dock scanner starts the clock when a pallet label is first scanned outside the cold room.

## Picking

Pickers wear insulated gloves in the freezer room and rotate out every 45 minutes.
`,
  'sources/rfc-route-planner-cloud.md': `# RFC: one route planner for every depot

## Context

Each depot ran its own planning server. Fourteen servers had to be patched by hand,
and a planner could not see traffic data from a neighbouring depot.

## Proposal

Run the planner as one central service in a single cloud region with a warm standby.

## Outcome

Since January 2026, planning a full depot day takes 90 seconds instead of 11 minutes.
`,
  'sources/billing-handbook.md': `# Billing handbook

## Partner invoices

Grocery partners receive one invoice on the third business day of each month.
Deliveries, failed attempts and temperature credits are listed as separate lines.
Payment is due 30 days after the invoice date.

## History

Invoices were weekly until 2025; partner finance teams asked for monthly ones.
`,
  'sources/postmortem-2026-03-freezer.md': `# Postmortem: Riverside freezer room failure, 14 March 2026

## Summary

The main compressor of the Riverside freezer room failed at 02:10.
By 05:00 the room had warmed to minus 9 °C and 3,100 kg of stock was discarded.

## What we learned

- The room's alarm emails went to a shared mailbox nobody watched at night.
- There was no second compressor to take over.
- Nobody had tested the alarm path since the room opened.

## Actions

- Freezer room alarms now page the control room.
- A backup compressor was installed in April.
- The alarm path is tested every Monday.
`,
  'sources/rfc-coldhold-v2.md': `# RFC: coldhold-v2

## Problem

Excursion rules lived inside the alerting service, so a rule change meant redeploying alert delivery.

## Design

coldhold-v2 receives every sensor reading and decides whether an excursion has started.
It keeps the last 6 hours of readings per vehicle in memory.
Alert delivery stays in the alerting service and only receives decisions.

## Rollout

coldhold-v2 replaced the old rule engine in May 2026.
`,
  'sources/sustainability-method.md': `# How we estimate emissions per drop

## Method

Each delivery takes a share of its route's distance, weighted by parcel volume.
That distance is multiplied by the vehicle's fuel factor.
Refrigeration unit runtime is added at 0.8 kg CO2e per hour.

## Limits

Electric vans use the grid average for the month, not the depot's own tariff.
`,
  'sources/training-plan.md': `# Driver training plan

## First week

New drivers spend their first two shifts riding with a senior driver.

## Refrigeration module

A 40-minute module covers setting compartment temperatures and reading the unit display.
It used to be a classroom session; it is now a short video followed by a practical check.

## Sign-off

Drivers must pass a practical pre-cooling check before their first solo route.
`,
  'sources/drone-pilot-retro.md': `# Retrospective: rooftop drone trial

## What we tried

For six weeks we flew small parcels from the Bayview depot roof to two apartment blocks.

## Why we stopped

- The aircraft could lift 2.5 kg, while a typical basket weighs about 9 kg.
- Insulated boxes added weight and left even less room for groceries.
- Every flight needed a separate permit, so a route could not be planned a day ahead.

## What we keep

The landing-pad survey of the two blocks is reused for van access notes.
`,
  'sources/dawn-wave-plan.md': `# Dawn wave plan

## Timing

Vans leave the depot from 01:30.
Every handover in the dawn wave must be complete by 07:00.

## Eligibility

Orders placed before 23:00 qualify for the dawn wave.
`,
  'sources/fleet-maintenance-log.md': `# 차량 정비 기준

## 냉동기

- 냉동기는 가동 500시간마다 정비한다.
- 냉매 누설 점검은 분기마다 한다.
- 정비 기록은 차량별 정비 대장에 남긴다.

## 타이어

- 타이어 마모는 매주 월요일 차량 점검 때 잰다.
`,
  'sources/esg-meeting.md': `# 지속가능경영 회의

## 기부

- 유통기한이 이틀 남은 상품은 지역 푸드뱅크에 기부한다.
- 수거는 매주 화요일과 금요일에 한다.
- 냉동품을 기부할 때는 보관 온도 기록을 함께 넘긴다.

## 포장

- 보냉 가방 회수율을 다음 분기까지 60%로 올린다.
`,
  'sources/lost-package-runbook.md': `# 분실 배송 조사 절차

## 1단계: 기록 확인

배송 시각의 GPS 위치와 도착 사진을 확인한다.

## 2단계: 기사 연락

담당 기사에게 전화해 물건을 둔 위치를 묻는다.

## 3단계: 결론

48시간 안에 결론을 낸다. 결론을 내지 못하면 고객에게 다시 보낸다.
`,
  'sources/route-planner-notes.md': `# 배차 엔진 메모

## 재계산

- 남은 경로는 15분마다 다시 계산한다.
- 교통 정보가 크게 바뀌면 즉시 다시 계산한다.
- 기사가 이미 출발한 정류장 순서는 바꾸지 않는다.

## 이력

- 처음에는 5분마다 계산했지만 기사 화면이 너무 자주 바뀌었다.
`,
  'sources/partner-api-rfc.md': `# Partner API limits

## Rate limit

Each API key may send 600 requests per minute.
Over the limit, the API answers HTTP 429 with a Retry-After header.

## Batch

The batch endpoint accepts up to 500 orders in one request.

## Why per key

Partners call from many servers with one key, so limits by IP address were unfair.
`,
};

// Each page: slug, title, summary, facts[], decisions[], cites (source path or null).
export const PAGES = [
  { slug: 'freezer-alarm-threshold', cites: 'sources/rfc-reefer-alarms.md', title: '냉동 적재칸 경보 기준',
    summary: '냉동 적재칸과 냉장 적재칸의 온도 경보가 언제 울리는지 정리했다.',
    facts: ['냉동 적재칸은 영하 18도보다 따뜻한 상태가 10분 넘게 이어지면 경보를 보낸다.',
      '냉장 적재칸의 경보 기준은 0도에서 5도 범위를 벗어난 상태가 15분 이어질 때다.',
      '경보는 기사 앱과 관제 화면에 동시에 뜬다.'],
    decisions: ['순간적인 온도 튐 때문에 경보가 남발되어, 즉시 경보 대신 지속 시간 조건을 두기로 했다.'] },
  { slug: 'driver-offline-photo-queue', title: '기사 앱 오프라인 사진 대기열',
    summary: '통신이 끊긴 곳에서 찍은 배송 증빙 사진을 다루는 방식이다.',
    facts: ['신호가 없을 때 찍은 배송 증빙 사진은 휴대폰 내부 저장소의 대기열에 암호화해 보관한다.',
      '연결이 돌아오면 대기열의 사진을 오래된 순서대로 올리고, 올린 뒤 기기에서 지운다.',
      '대기열은 최대 300장까지 쌓이며, 넘으면 기사에게 와이파이 연결을 요청한다.'],
    decisions: ['사진 압축은 업로드 직전이 아니라 촬영 직후에 하기로 했다. 저장 공간을 아끼기 위해서다.'] },
  { slug: 'alarm-error-codes', title: '경보 오류 코드 목록',
    summary: '센서와 관제 시스템이 내보내는 TW-ALRM 계열 오류 코드를 설명한다.',
    facts: ['TW-ALRM-03: 온도 프로브 연결이 끊김. 케이블을 점검해야 한다.',
      'TW-ALRM-17: 센서 배터리 전압이 3.1V 아래로 떨어짐. 24시간 안에 배터리를 바꿔야 한다.',
      'TW-ALRM-22: 센서 시계가 서버와 5분 넘게 어긋남.'],
    decisions: ['TW-ALRM-17은 배송을 멈추지 않는 경고 등급으로 분류했다.'] },
  { slug: 'refund-approval-policy', cites: 'sources/finance-meeting-2026-05.md', title: '환불 승인 기준',
    summary: '환불 금액에 따라 누가 처리하고 승인하는지 정리했다.',
    facts: ['5만 원 이하 환불은 고객지원 상담원이 바로 처리한다.',
      '5만 원을 넘는 환불은 정산팀장의 승인을 받아야 한다.',
      '같은 고객의 환불이 한 달에 세 번을 넘으면 자동으로 검토 대기열에 들어간다.'],
    decisions: ['상담원 처리 한도를 3만 원에서 5만 원으로 올렸다. 처리 대기 시간이 길다는 불만이 많았기 때문이다.'] },
  { slug: 'gwangju-depot-launch', title: '광주 물류센터 개소',
    summary: '호남 지역 배송을 맡는 광주 물류센터의 개소 기록이다.',
    facts: ['광주 물류센터는 2026년 4월 7일에 첫 출고를 했다.',
      '냉동 창고 1,200㎡와 냉장 창고 800㎡로 시작했다.',
      '첫 달 하루 평균 출고량은 410건이었다.'],
    decisions: ['호남 지역 배송을 대전에서 광주로 옮겨 평균 이동 시간을 50분 줄이기로 했다.'] },
  { slug: 'route-replanning-interval', cites: 'sources/route-planner-notes.md', title: '경로 재계산 주기',
    summary: '배차 엔진이 남은 경로를 언제 다시 계산하는지 설명한다.',
    facts: ['배차 엔진은 15분마다 남은 경로를 다시 계산한다.',
      '교통 정보가 크게 바뀌면 15분을 기다리지 않고 즉시 재계산한다.',
      '기사가 이미 출발한 정류장 순서는 재계산해도 바꾸지 않는다.'],
    decisions: ['5분 주기는 기사 화면이 너무 자주 바뀌어 15분으로 늘렸다.'] },
  { slug: 'data-retention', cites: 'sources/privacy-review-2026.md', title: '개인정보 보관 기간',
    summary: '주문, 위치, 연락처 데이터를 얼마나 오래 두는지 정리했다.',
    facts: ['주문 기록은 세법에 맞춰 5년 동안 보관한다.',
      '기사 위치 기록은 90일이 지나면 지운다.',
      '고객이 탈퇴하면 연락처는 30일 안에 익명화한다.'],
    decisions: ['위치 기록 보관 기간을 1년에서 90일로 줄였다.'] },
  { slug: 'reefer-hold-window', title: 'reefer_hold_window 설정',
    summary: '냉장차 시동이 꺼진 뒤 냉각을 얼마나 유지할지 정하는 설정이다.',
    facts: ['reefer_hold_window는 냉장차 시동이 꺼진 뒤 냉각기를 배터리로 계속 돌리는 시간이다.',
      '기본값은 45분이고, 여름철(6~8월)에는 60분으로 늘린다.',
      '값이 90분을 넘으면 차량 배터리 방전 위험 때문에 설정이 거부된다.'],
    decisions: ['지역별로 값을 다르게 두지 않고 계절별 값만 두기로 했다.'] },
  { slug: 'notification-channel-decision', cites: 'sources/notification-meeting-notes.md', title: '고객 알림 채널 변경',
    summary: '배송 안내를 어느 채널로 보내는지와 그 이유를 기록했다.',
    facts: ['2026년 2월부터 배송 출발과 도착 안내를 앱 푸시로 보낸다.',
      '앱을 설치하지 않은 고객에게만 문자 메시지를 보낸다.'],
    decisions: ['문자 발송 비용이 한 달 1,800만 원을 넘고 도착 사진을 함께 보여 줄 수 없어서 푸시를 기본으로 바꿨다.'] },
  { slug: 'sensor-firmware-rollout', title: '센서 펌웨어 배포 절차',
    summary: '센서 펌웨어를 차량에 단계적으로 내보내는 방법이다.',
    facts: ['센서 펌웨어는 먼저 차량 5%에 배포하고 48시간 지켜본다.',
      '문제가 없으면 25%, 그다음 전체 차량으로 넓힌다.',
      '단계마다 경보 오탐률이 1%를 넘으면 배포를 멈추고 이전 버전으로 되돌린다.'],
    decisions: ['야간에는 배포 단계를 넘기지 않는다. 관제 인력이 적기 때문이다.'] },
  { slug: 'pelican-release', title: '기사 앱 Pelican 릴리스',
    summary: '기사 앱 Pelican 릴리스의 변경 사항이다.',
    facts: ['Pelican 릴리스는 기사 앱에 서명 받기 화면을 새로 넣었다.',
      '배송 목록을 지도와 목록 두 가지 보기로 나눴다.',
      '오프라인 사진 대기열 한도를 200장에서 300장으로 늘렸다.'],
    decisions: ['Pelican부터 안드로이드 9 이하 지원을 끝냈다.'] },
  { slug: 'night-shift-rest', cites: 'sources/labor-policy-2026.md', title: '야간 근무 휴식 규정',
    summary: '밤에 일하는 기사의 휴식 규칙과 확인 방법이다.',
    facts: ['밤 10시부터 아침 6시 사이에 일하는 기사는 2시간마다 15분 쉰다.',
      '야간 근무는 연속 사흘을 넘기지 않는다.',
      '휴식을 건너뛰면 배차 시스템이 다음 배차를 막는다.'],
    decisions: ['휴식 확인을 기사 자율 보고에서 앱의 정차 기록 기반 확인으로 바꿨다.'] },
  { slug: 'excursion-compensation', title: '온도 이탈 보상 기준',
    summary: '배송 중 온도가 기준을 벗어났을 때 고객에게 돌려주는 것을 정리했다.',
    facts: ['온도 이탈이 기록된 주문은 해당 상품 금액 전액을 적립금으로 돌려준다.',
      '이탈 시간이 30분을 넘으면 배송비도 함께 돌려준다.',
      '보상은 고객 신고 없이 관제 기록만으로 자동 지급한다.'],
    decisions: ['현금 환불 대신 적립금을 기본으로 하되, 고객이 원하면 카드 취소로 바꿔 준다.'] },
  { slug: 'inbound-inspection', title: '창고 입고 검수',
    summary: '공급사에서 들어온 상품을 창고에 받을 때의 검수 절차다.',
    facts: ['창고 입고 검수는 수량 확인, 온도 측정, 유통기한 확인의 세 단계로 한다.',
      '입고 때 냉동품 표면 온도가 영하 15도보다 높으면 받지 않는다.',
      '유통기한이 7일 미만 남은 상품은 별도 구역에 둔다.'],
    decisions: ['온도 측정을 표본 검사에서 전수 검사로 바꿨다.'] },
  { slug: 'partner-api-rate-limit', cites: 'sources/partner-api-rfc.md', title: '파트너 API 호출 한도',
    summary: '파트너 API의 요청 한도와 초과했을 때의 응답이다.',
    facts: ['파트너 API는 API 키마다 분당 600회까지 요청을 받는다.',
      '한도를 넘으면 HTTP 429와 Retry-After 헤더를 돌려준다.',
      '대량 주문 등록은 batch endpoint로 한 번에 500건까지 보낼 수 있다.'],
    decisions: ['IP 기준 한도 대신 키 기준 한도로 바꿨다. 파트너가 여러 서버에서 같은 키를 쓰기 때문이다.'] },
  { slug: 'payment-retry', title: '정기결제 실패 재시도',
    summary: '구독 결제가 실패했을 때 다시 시도하는 규칙이다.',
    facts: ['정기결제가 실패하면 1일, 3일, 7일 뒤에 세 번 다시 시도한다.',
      '세 번 모두 실패하면 구독을 일시 정지하고 고객에게 카드 변경을 안내한다.',
      '잔액 부족으로 실패한 결제는 오전 9시에만 다시 시도한다.'],
    decisions: ['재시도 횟수를 다섯 번에서 세 번으로 줄였다. 카드사 수수료와 고객 불만 때문이다.'] },
  { slug: 'sensor-models-compared', title: 'Frostline과 Glacier 센서 비교',
    summary: '차량에 다는 두 센서 모델의 차이를 비교했다.',
    facts: ['Frostline은 온도만 재고, 배터리가 18개월 간다.',
      'Glacier는 온도와 습도, 문 열림을 함께 재고, 배터리가 9개월 간다.',
      'Glacier는 LTE로 직접 보내고, Frostline은 기사 휴대폰의 블루투스를 거쳐 보낸다.'],
    decisions: ['신규 냉동 차량에는 Glacier를, 냉장 소형 차량에는 Frostline을 단다.'] },
  { slug: 'door-open-alert', title: '적재함 문 열림 경고',
    summary: '적재함 문이 오래 열려 있을 때 보내는 경고의 규칙이다.',
    facts: ['적재함 문이 3분 넘게 열려 있으면 기사 앱에 진동 경고를 보낸다.',
      '5분이 지나도 닫히지 않으면 관제 센터에 경보가 올라간다.',
      '하역 중에는 기사가 하역 모드를 켜서 경고를 20분 동안 미룰 수 있다.'],
    decisions: ['하역 모드는 한 정류장에서 한 번만 켤 수 있게 했다.'] },
  { slug: 'key-rotation', cites: 'sources/security-review-q2.md', title: 'API 서명 키 교체',
    summary: 'API 서명 키를 언제, 누가 바꾸는지 정리했다.',
    facts: ['API 서명 키는 90일마다 새로 만든다.',
      '이전 키는 교체 뒤 7일 동안만 검증에 쓰고 폐기한다.',
      '키 교체는 보안 담당자 두 명이 함께 승인한다.'],
    decisions: ['키 교체를 수작업에서 매 분기 자동 작업으로 바꿨다.'] },

  { slug: 'dock-dwell-limit', cites: 'sources/warehouse-sop.md', title: 'Dock dwell limit for chilled goods',
    summary: 'How long pallets may sit on the loading dock outside their temperature zone.',
    facts: ['Chilled pallets may stay on the loading dock for at most 20 minutes.',
      'Frozen pallets get 10 minutes before they must return to the freezer room.',
      'The dock scanner starts the clock when a pallet label is first scanned outside the cold room.'],
    decisions: ['The limit is enforced by the scanner, not by supervisors, after audits showed manual checks were skipped at shift change.'] },
  { slug: 'sync-error-codes', title: 'Driver app sync error codes',
    summary: 'The TW-SYNC codes the driver app shows when an upload fails.',
    facts: ['TW-SYNC-02: the driver app could not reach the server; it retries every 30 seconds.',
      'TW-SYNC-04: the server rejected an upload because a dispatcher had already closed the stop.',
      'TW-SYNC-09: the local database is full; the driver must upload before taking new stops.'],
    decisions: ['TW-SYNC-04 no longer blocks the app; the driver sees a banner and the photo is attached to the closed stop.'] },
  { slug: 'alarm-on-call-rotation', title: 'Night alarm rotation',
    summary: 'Who answers reefer alarms outside office hours.',
    facts: ['Two control-room operators cover reefer alarms between 22:00 and 06:00.',
      'The rotation changes every Monday at 10:00.',
      'If neither operator acknowledges within 4 minutes, the alarm pages the regional logistics manager.'],
    decisions: ['Night alarms are no longer routed to drivers\' supervisors, who were asleep and missed them.'] },
  { slug: 'route-planner-migration', cites: 'sources/rfc-route-planner-cloud.md', title: 'Route planner migration',
    summary: 'The move from one planning server per depot to a central planner.',
    facts: ['Route planning ran on a server in each depot until January 2026.',
      'The planner now runs in one cloud region with a warm standby.',
      'Planning a full depot day dropped from 11 minutes to 90 seconds.'],
    decisions: ['A central service lets all depots share traffic data and removed the need to patch 14 depot servers by hand.'] },
  { slug: 'premium-temperature-report', title: 'Temperature report for Pro accounts',
    summary: 'Which accounts receive a per-delivery temperature report, and what it holds.',
    facts: ['Customers on the Pro plan receive a temperature report for every delivery.',
      'The report shows one reading per minute from loading to handover.',
      'Basic plan customers can request a report for a single order through support.'],
    decisions: ['Reports are generated as PDF at handover so the readings cannot be changed later.'] },
  { slug: 'sensor-battery-swap', title: 'Sensor battery swap threshold',
    summary: 'When a vehicle sensor is taken out for a fresh battery.',
    facts: ['A sensor is swapped when its battery drops below 20 percent.',
      'Swaps happen at the depot during the morning vehicle check.',
      'Depleted batteries are returned to the supplier for recycling.'],
    decisions: ['The threshold rose from 10 to 20 percent because sensors at 10 percent dropped readings in cold weather.'] },
  { slug: 'delivery-window-display', title: 'Delivery windows at checkout',
    summary: 'How the arrival window is presented to shoppers before and on the delivery day.',
    facts: ['Shoppers see a two-hour delivery window at checkout.',
      'On the delivery day the window narrows to 30 minutes once the driver is three stops away.',
      'Windows are shown in the shopper\'s local time zone.'],
    decisions: ['We stopped showing an exact minute because late arrivals against an exact time drove most complaints.'] },
  { slug: 'northgate-depot', title: 'Northgate depot',
    summary: 'Capacity and fleet of the Northgate depot.',
    facts: ['The Northgate depot ships up to 2,400 orders a day.',
      'It has 22 refrigerated vans and 6 freezer trucks.',
      'Loading starts at 04:30 for the early-morning wave.'],
    decisions: ['Northgate takes overflow from Riverside on public holidays.'] },
  { slug: 'partner-invoicing', cites: 'sources/billing-handbook.md', title: 'Partner invoicing',
    summary: 'When and how grocery partners are billed.',
    facts: ['Grocery partners receive an invoice on the third business day of each month.',
      'The invoice lists deliveries, failed attempts, and temperature credits separately.',
      'Payment is due 30 days after the invoice date.'],
    decisions: ['We moved from weekly to monthly invoices because partners\' finance teams reconciled monthly anyway.'] },
  { slug: 'damaged-package-flow', title: 'Damaged item at the door',
    summary: 'What the driver app asks for when an item arrives broken.',
    facts: ['The driver photographs the damage and picks a reason from a fixed list.',
      'The shopper is offered a credit or a redelivery on the same screen.',
      'Damaged items are brought back to the depot, never left at the door.'],
    decisions: ['Drivers no longer need a supervisor call before marking an item damaged.'] },
  { slug: 'portal-localization', title: 'Customer portal languages',
    summary: 'Languages and regional formats of the customer portal.',
    facts: ['The customer portal is available in English, Korean, and Japanese.',
      'Dates and prices follow the account\'s region, not the browser language.',
      'New strings are translated by a vendor within five business days.'],
    decisions: ['Chinese was postponed until a partner in that market signs.'] },
  { slug: 'coldhold-v2', cites: 'sources/rfc-coldhold-v2.md', title: 'coldhold-v2',
    summary: 'The service that detects temperature excursions from sensor readings.',
    facts: ['coldhold-v2 receives every sensor reading and decides whether an excursion has started.',
      'It replaced the rule engine inside the alerting service in May 2026.',
      'It keeps the last 6 hours of readings per vehicle in memory.'],
    decisions: ['Excursion detection was split from alert delivery so each can be deployed separately.'] },
  { slug: 'split-order-assignment', title: 'Split orders',
    summary: 'How an order too large for one compartment is divided between vehicles.',
    facts: ['An order is split when its frozen and chilled items exceed one van\'s compartments.',
      'The frozen part goes to the vehicle with the coldest free compartment on that route.',
      'Both parts must arrive within the same delivery window.'],
    decisions: ['We never split an order across two depots, because handover times could not be kept together.'] },
  { slug: 'complaint-response-sla', title: 'Temperature complaint response time',
    summary: 'How quickly support answers a complaint about temperature.',
    facts: ['Temperature complaints must get a first human reply within 2 hours during business hours.',
      'Complaints received overnight are answered by 09:30 the next morning.',
      'The agent attaches the delivery\'s temperature log to the first reply.'],
    decisions: ['Temperature complaints skip the general queue and go straight to the cold-chain support team.'] },
  { slug: 'pallet-ttl-flag', title: 'PALLET_TTL',
    summary: 'A depot setting for pallets assigned to a route but never scanned.',
    facts: ['PALLET_TTL sets how many hours an unscanned pallet stays assigned to a route.',
      'After it expires the pallet returns to the unassigned pool and the planner can reuse it.',
      'The default is 6 hours; depots with two waves use 12.'],
    decisions: ['The flag is set per depot, not globally.'] },
  { slug: 'driver-onboarding', cites: 'sources/training-plan.md', title: 'Driver onboarding',
    summary: 'The first week of a new driver, including the refrigeration module.',
    facts: ['New drivers spend their first two shifts riding with a senior driver.',
      'A 40-minute module covers setting compartment temperatures and reading the unit display.',
      'Drivers must pass a practical pre-cooling check before their first solo route.'],
    decisions: ['The refrigeration module moved from a classroom session to a short video plus the practical check.'] },
  { slug: 'store-rejection', title: 'Refused deliveries at receiving',
    summary: 'What happens when store receiving staff refuse goods.',
    facts: ['If a store refuses a delivery at receiving, the driver records the reason and a photo.',
      'Refused goods return to the depot on the same vehicle and are inspected before restocking.',
      'The store is not billed for a refused delivery when the reason is temperature.'],
    decisions: ['Drivers may not argue with receiving staff; disputes go to the account manager.'] },
  { slug: 'ops-dashboard-metrics', title: 'Weekly operations dashboard',
    summary: 'What the weekly operations dashboard measures.',
    facts: ['The weekly operations dashboard shows on-time rate, excursion minutes per 1,000 deliveries, and failed attempts.',
      'It also tracks average stops per route and driver overtime hours.',
      'Numbers are broken down by depot and by week.'],
    decisions: ['Revenue was removed from the dashboard so the operations review stays about service.'] },

  { slug: 'defrost-schedule', title: 'Evaporator defrost cycle',
    summary: 'When the refrigeration unit melts frost off its evaporator coil.',
    facts: ['Reefer evaporators run a defrost cycle every 6 hours.',
      'A cycle lasts about 12 minutes and pauses cooling in that compartment.',
      'Defrost is skipped while the cargo door is open.'],
    decisions: ['Defrost timing moved to the gaps between stops so it never overlaps unloading.'] },
  { slug: 'reschedule-cutoff', title: 'Changing a delivery slot',
    summary: 'Until when shoppers can move their slot, and what happens after.',
    facts: ['Shoppers can change their delivery slot until 22:00 the evening before.',
      'After that cutoff only support can move an order, for a fee of 3,000 won.',
      'A slot cannot change once the van has been loaded.'],
    decisions: ['The cutoff moved from 18:00 to 22:00 when picking started at midnight.'] },
  { slug: 'driver-pay-model', title: 'Driver pay',
    summary: 'How a driver\'s earnings for a shift are made up.',
    facts: ['Drivers are paid a base rate per shift plus a fee per completed stop.',
      'Cold-chain routes add a 12 percent premium to the stop fee.',
      'Waiting more than 15 minutes at a store is paid by the minute.'],
    decisions: ['Pay per kilometre was dropped because it rewarded inefficient routes.'] },
  { slug: 'ice-pack-reuse', title: 'Gel pack reuse',
    summary: 'What happens to the gel packs that travel with chilled goods.',
    facts: ['Gel packs are collected at the next delivery and reused up to 8 times.',
      'Each pack is washed and frozen for 24 hours before it goes out again.',
      'Packs with leaks are discarded.'],
    decisions: ['Shoppers who return packs get no deposit; collection is part of the service.'] },
  { slug: 'cancellation-fee', title: 'Cancelling an order',
    summary: 'What a shopper pays when they cancel.',
    facts: ['Orders cancelled more than 6 hours before the slot are free.',
      'Later cancellations cost 20 percent of the basket, capped at 10,000 won.',
      'Frozen items already picked for a cancelled order are donated rather than restocked.'],
    decisions: ['The charge is waived once per year for each shopper.'] },
  { slug: 'early-morning-cutoff', cites: 'sources/dawn-wave-plan.md', title: 'Dawn wave',
    summary: 'The overnight delivery wave that arrives before breakfast.',
    facts: ['The dawn wave must complete every handover by 07:00.',
      'Orders placed before 23:00 qualify for the dawn wave.',
      'Vans leave the depot from 01:30.'],
    decisions: ['Dawn deliveries never ring the doorbell; the driver sends a photo instead.'] },
  { slug: 'allergen-storage', title: '알레르기 표시 상품 보관',
    summary: '알레르기 유발 성분이 표시된 상품을 창고에서 다루는 규칙이다.',
    facts: ['알레르기 유발 성분이 표시된 상품은 전용 선반에 따로 보관한다.',
      '견과류가 든 상품은 선반의 맨 아래 칸에 둔다.',
      '이 선반에서 물건을 꺼낸 작업자는 다음 피킹 전에 장갑을 바꾼다.'],
    decisions: ['표시 상품을 일반 선반과 섞지 않도록 위치 코드를 따로 붙였다.'] },
  { slug: 'personal-device-policy', title: '기사 개인 휴대폰 사용 규칙',
    summary: '기사가 업무에 개인 기기를 쓸 수 있는지에 대한 규칙이다.',
    facts: ['기사는 개인 휴대폰에 업무 앱을 깔 수 없고 회사가 지급한 단말만 쓴다.',
      '운전 중에는 개인 휴대폰을 거치대에 두지 않는다.',
      '회사 단말을 잃어버리면 원격으로 초기화한다.'],
    decisions: ['고객 연락처가 개인 기기에 남는 것을 막으려고 개인 기기 사용을 금지했다.'] },
  { slug: 'reefer-maintenance', cites: 'sources/fleet-maintenance-log.md', title: '냉동기 정비 주기',
    summary: '차량 냉동기를 언제 정비하는지 정리했다.',
    facts: ['냉동기는 가동 500시간마다 정비한다.',
      '냉매 누설 점검은 분기마다 한다.',
      '정비 기록은 차량별 정비 대장에 남긴다.'],
    decisions: ['정비 시점을 날짜 기준에서 가동 시간 기준으로 바꿨다.'] },
  { slug: 'subscription-pricing', title: '월 구독 요금제 도입',
    summary: '건당 배송비를 월 구독으로 바꾼 배경이다.',
    facts: ['건당 배송비 대신 월 9,900원 구독을 도입했다.',
      '구독자는 최소 주문 2만 원 이상이면 배송비 없이 횟수 제한 없이 받는다.'],
    decisions: ['자주 주문하는 고객이 배송비 때문에 떠나고, 수요를 미리 예측하기 어려워서 구독제로 바꿨다.'] },
  { slug: 'near-expiry-donation', cites: 'sources/esg-meeting.md', title: '유통기한 임박 상품 기부',
    summary: '유통기한이 얼마 남지 않은 상품을 처리하는 방식이다.',
    facts: ['유통기한이 이틀 남은 상품은 지역 푸드뱅크에 기부한다.',
      '수거는 매주 화요일과 금요일에 한다.',
      '냉동품을 기부할 때는 보관 온도 기록을 함께 넘긴다.'],
    decisions: ['폐기 대신 기부를 기본으로 정했다.'] },
  { slug: 'unattended-delivery', title: '비대면 배송 조건',
    summary: '고객을 만나지 않고 물건을 두고 와도 되는 경우를 정리했다.',
    facts: ['고객이 주문할 때 문 앞 두기를 고른 경우에만 서명 없이 두고 온다.',
      '냉동품은 보냉 가방에 넣은 경우에만 문 앞에 둔다.',
      '공동현관 비밀번호는 배송이 끝나면 기사 앱에서 지운다.'],
    decisions: ['문 앞 두기 사진은 고객이 볼 수 있게 30일 동안 남긴다.'] },
  { slug: 'long-haul-frozen-packing', title: 'Packing frozen desserts for long routes',
    summary: 'Extra packing for frozen goods on routes longer than ninety minutes.',
    facts: ['On routes longer than 90 minutes, frozen desserts travel in insulated totes with dry ice.',
      'A tote holds 2 kg of dry ice for every 10 litres of volume.',
      'Totes are sealed at the depot and opened only at the shopper\'s door.'],
    decisions: ['Dry ice is used only for long routes because handling it needs trained staff.'] },
  { slug: 'route-edit-lock', title: 'Route lease',
    summary: 'How the planner keeps changes to one route from colliding.',
    facts: ['Only one planner can change a route at a time.',
      'Opening a route takes a 5-minute lease that renews while the planner is active.',
      'Others see the route read-only, with the lease holder\'s name.'],
    decisions: ['A lease was chosen over merging edits because stop order cannot be merged safely.'] },
  { slug: 'duplicate-capture-bug', title: 'Double capture after gateway timeout',
    summary: 'A payment defect in week 18 and its fix.',
    facts: ['When the payment gateway timed out after 10 seconds, our client retried the capture with a new idempotency key.',
      'About 0.3 percent of orders in week 18 were captured two times.',
      'Affected shoppers were refunded automatically within two days.'],
    decisions: ['Captures now reuse the order\'s idempotency key on every retry.'] },
  { slug: 'navigation-handoff', title: '운전 중 길 안내',
    summary: '기사 앱이 다음 정류장까지 안내하는 방식이다.',
    facts: ['기사 앱은 다음 정류장까지 턴바이턴 안내를 음성으로 들려준다.',
      '아파트 단지는 동 출입구 위치를 사진으로 보여 준다.',
      '처음 가는 주소는 이전 기사가 남긴 메모를 먼저 띄운다.'],
    decisions: ['안내 화면은 운전 중 손을 쓰지 않도록 큰 버튼 두 개만 둔다.'] },
  { slug: 'thawed-arrival-handling', title: '해동 상태 도착 처리',
    summary: '냉동식품이 물러진 채 도착했을 때 현장에서 하는 일이다.',
    facts: ['냉동식품이 말랑한 상태로 도착하면 기사가 표면 온도를 재고 사진을 남긴다.',
      '표면 온도가 영하 12도보다 높으면 고객에게 건네지 않고 회수한다.',
      '회수한 주문은 같은 날 다음 차량으로 다시 보낸다.'],
    decisions: ['다시 보낼 차량이 없으면 다음 날 첫 차로 보낸다.'] },
  { slug: 'offboarding-access', title: '퇴사자 계정 정리',
    summary: '직원이 떠날 때 계정과 기기를 정리하는 순서다.',
    facts: ['퇴사자의 계정은 마지막 근무일 18시에 자동으로 잠긴다.',
      '회사 단말은 그날 반납받고 원격으로 초기화한다.',
      '공용 비밀번호는 퇴사 다음 날까지 바꾼다.'],
    decisions: ['계정 잠금을 인사팀 요청이 아니라 근무 기록에 맞춰 자동으로 하기로 했다.'] },
];

// set: ko | en | cross. kind (cross only): language | paraphrase.
export const QUESTIONS = [
  ['ko', 0, '냉동 화물 온도 알람은 몇 도에서 울리나요?', ['wiki/freezer-alarm-threshold.md', 'sources/rfc-reefer-alarms.md']],
  ['ko', 0, '기사 앱이 오프라인일 때 배송 완료 사진은 어떻게 저장돼?', ['wiki/driver-offline-photo-queue.md']],
  ['ko', 1, 'TW-ALRM-17 오류 코드는 무슨 뜻이야?', ['wiki/alarm-error-codes.md']],
  ['ko', 0, '환불 승인은 누가 할 수 있어?', ['wiki/refund-approval-policy.md', 'sources/finance-meeting-2026-05.md']],
  ['ko', 1, '광주 물류센터는 언제 문을 열었어?', ['wiki/gwangju-depot-launch.md']],
  ['ko', 0, '배송 경로 최적화는 몇 분마다 다시 계산해?', ['wiki/route-replanning-interval.md', 'sources/route-planner-notes.md']],
  ['ko', 0, '고객 데이터는 얼마나 오래 보관해?', ['wiki/data-retention.md', 'sources/privacy-review-2026.md']],
  ['ko', 1, 'reefer_hold_window 설정 기본값이 뭐야?', ['wiki/reefer-hold-window.md']],
  ['ko', 0, '왜 고객 알림을 문자에서 앱 푸시로 바꿨어?', ['wiki/notification-channel-decision.md', 'sources/notification-meeting-notes.md']],
  ['ko', 0, '센서 펌웨어 업데이트는 어떤 순서로 배포해?', ['wiki/sensor-firmware-rollout.md']],
  ['ko', 1, 'Pelican 릴리스에서 바뀐 점은?', ['wiki/pelican-release.md']],
  ['ko', 0, '야간 배송 기사 휴식 시간 규정은?', ['wiki/night-shift-rest.md', 'sources/labor-policy-2026.md']],
  ['ko', 0, '콜드체인 위반이 생기면 고객에게 보상은 어떻게 해?', ['wiki/excursion-compensation.md']],
  ['ko', 0, '창고 입고 검수는 몇 단계야?', ['wiki/inbound-inspection.md']],
  ['ko', 0, 'API 요청 한도는 분당 몇 번이야?', ['wiki/partner-api-rate-limit.md', 'sources/partner-api-rfc.md']],
  ['ko', 0, '결제 실패 재시도는 몇 번까지 해?', ['wiki/payment-retry.md']],
  ['ko', 1, 'Frostline 센서와 Glacier 센서 차이가 뭐야?', ['wiki/sensor-models-compared.md']],
  ['ko', 0, '배송 지연 예측 모델은 어떤 데이터를 써?', ['sources/delay-model-review.md']],
  ['ko', 0, '냉장차 문 열림 감지 후 얼마 뒤에 경보가 가?', ['wiki/door-open-alert.md']],
  ['ko', 0, '보안 키 교체 주기는?', ['wiki/key-rotation.md', 'sources/security-review-q2.md']],

  ['en', 0, 'How long can a chilled pallet wait on the dock before it must go back into cold storage?', ['wiki/dock-dwell-limit.md', 'sources/warehouse-sop.md']],
  ['en', 1, 'What does error code TW-SYNC-04 mean?', ['wiki/sync-error-codes.md']],
  ['en', 0, 'Who is on call for reefer alarms at night?', ['wiki/alarm-on-call-rotation.md']],
  ['en', 0, 'Why did we move route planning from the depot servers to the cloud?', ['wiki/route-planner-migration.md', 'sources/rfc-route-planner-cloud.md']],
  ['en', 0, 'Which customers get the premium temperature report?', ['wiki/premium-temperature-report.md']],
  ['en', 0, 'What is the minimum battery level before a sensor is swapped?', ['wiki/sensor-battery-swap.md']],
  ['en', 0, 'How are delivery windows shown to shoppers?', ['wiki/delivery-window-display.md']],
  ['en', 1, 'What is the Northgate depot\'s daily capacity?', ['wiki/northgate-depot.md']],
  ['en', 0, 'When do invoices get sent to grocery partners?', ['wiki/partner-invoicing.md', 'sources/billing-handbook.md']],
  ['en', 0, 'How does the driver app handle a damaged package?', ['wiki/damaged-package-flow.md']],
  ['en', 0, 'What did the March cold storage outage teach us?', ['sources/postmortem-2026-03-freezer.md']],
  ['en', 0, 'Which languages does the customer portal support?', ['wiki/portal-localization.md']],
  ['en', 1, 'What is the coldhold-v2 service responsible for?', ['wiki/coldhold-v2.md', 'sources/rfc-coldhold-v2.md']],
  ['en', 0, 'How do we decide which truck gets a split order?', ['wiki/split-order-assignment.md']],
  ['en', 0, 'What is the SLA for answering a temperature complaint?', ['wiki/complaint-response-sla.md']],
  ['en', 0, 'How is the carbon footprint per delivery estimated?', ['sources/sustainability-method.md']],
  ['en', 1, 'What does the PALLET_TTL flag control?', ['wiki/pallet-ttl-flag.md']],
  ['en', 0, 'How are new drivers trained on the reefer controls?', ['wiki/driver-onboarding.md', 'sources/training-plan.md']],
  ['en', 0, 'What happens when a store rejects a delivery at the door?', ['wiki/store-rejection.md']],
  ['en', 0, 'Which metrics are on the weekly operations dashboard?', ['wiki/ops-dashboard-metrics.md']],

  ['cross:language', 0, '냉장 적재함 성에 제거는 얼마나 자주 해?', ['wiki/defrost-schedule.md']],
  ['cross:language', 0, '고객이 배송 시간을 바꾸려면 언제까지 요청해야 해?', ['wiki/reschedule-cutoff.md']],
  ['cross:language', 0, '드론 배송 시범 사업은 왜 중단했어?', ['sources/drone-pilot-retro.md']],
  ['cross:language', 0, '운전기사 급여는 어떻게 계산돼?', ['wiki/driver-pay-model.md']],
  ['cross:language', 0, '아이스팩은 재사용해?', ['wiki/ice-pack-reuse.md']],
  ['cross:language', 0, '주문 취소 수수료가 있나요?', ['wiki/cancellation-fee.md']],
  ['cross:language', 0, '새벽 배송은 몇 시까지 끝내야 해?', ['wiki/early-morning-cutoff.md', 'sources/dawn-wave-plan.md']],
  ['cross:language', 0, 'How do we handle allergen-labelled products in the warehouse?', ['wiki/allergen-storage.md']],
  ['cross:language', 0, 'What is the policy for drivers using personal phones?', ['wiki/personal-device-policy.md']],
  ['cross:language', 0, 'How often are truck refrigeration units serviced?', ['wiki/reefer-maintenance.md', 'sources/fleet-maintenance-log.md']],
  ['cross:language', 0, 'Why did we choose a monthly subscription instead of per-delivery fees?', ['wiki/subscription-pricing.md']],
  ['cross:language', 0, 'What do we do with food that is close to its expiry date?', ['wiki/near-expiry-donation.md', 'sources/esg-meeting.md']],
  ['cross:language', 0, 'How is a lost package investigated?', ['sources/lost-package-runbook.md']],
  ['cross:language', 0, 'When are drivers allowed to leave a package without a signature?', ['wiki/unattended-delivery.md']],
  ['cross:paraphrase', 0, 'How do we stop ice cream from melting on long trips?', ['wiki/long-haul-frozen-packing.md']],
  ['cross:paraphrase', 0, 'What keeps two dispatchers from editing the same route at once?', ['wiki/route-edit-lock.md']],
  ['cross:paraphrase', 0, 'Why are some shoppers charged twice?', ['wiki/duplicate-capture-bug.md']],
  ['cross:paraphrase', 0, '기사님들이 길을 잃지 않게 하려면?', ['wiki/navigation-handoff.md']],
  ['cross:paraphrase', 0, '물건이 녹아서 도착하면 어떻게 해?', ['wiki/thawed-arrival-handling.md']],
  ['cross:paraphrase', 0, '직원이 회사를 그만두면 시스템 접근은 언제 막아?', ['wiki/offboarding-access.md']],
];

// Near-miss pages: related to a question's topic, in the question's language, never its answer.
export const NEAR_MISSES = [
  { slug: 'reefer-fan-noise', title: '냉동기 소음 점검', summary: '냉동기 팬 소음과 겨울철 예열 기준이다.',
    facts: ['냉동기 팬 소음이 70데시벨을 넘으면 정비를 요청한다.', '겨울에는 출차 20분 전에 냉동기를 미리 돌린다.'], decisions: ['소음 측정은 월 1회 차량 점검 때 한다.'] },
  { slug: 'address-change', title: '배송 주소 변경', summary: '주문한 뒤 받는 곳을 바꾸는 규칙이다.',
    facts: ['배송 주소는 상차 전까지 앱에서 바꿀 수 있다.', '상차 뒤에는 같은 동네 안에서만 주소를 바꿀 수 있다.'], decisions: ['주소 변경 횟수는 주문마다 두 번으로 제한했다.'] },
  { slug: 'cargo-bike-trial', title: '전기 화물 자전거 시범 운영', summary: '도심 골목 배송에 전기 화물 자전거를 쓰는 시험이다.',
    facts: ['도심 골목 배송에 전기 화물 자전거 4대를 시험하고 있다.', '한 대에 30kg까지 싣는다.'], decisions: ['시범 운영을 연말까지 이어 간다.'] },
  { slug: 'fuel-settlement', title: '기사 연료비 정산', summary: '차량 연료비를 정산하는 방식이다.',
    facts: ['연료비는 주행 기록을 기준으로 월말에 정산한다.', '회사 주유 카드로 결제한 금액은 정산에서 뺀다.'], decisions: ['영수증 사진 제출을 없앴다.'] },
  { slug: 'insulated-bag-return', title: '보냉 가방 회수', summary: '보냉 가방을 돌려받는 방식과 회수율이다.',
    facts: ['보냉 가방은 다음 배송 때 문 앞에서 회수한다.', '지난 분기 회수율은 48%였다.', '찢어진 가방은 폐기한다.'], decisions: ['회수율을 높이려고 가방에 반납 안내 스티커를 붙였다.'] },
  { slug: 'return-shipping-fee', title: '반품 배송비', summary: '고객이 반품할 때 내는 비용이다.',
    facts: ['단순 변심 반품은 배송비 3,000원을 받는다.', '냉동품은 단순 변심으로 반품할 수 없다.'], decisions: ['상품 하자 반품은 배송비를 받지 않는다.'] },
  { slug: 'same-day-evening', title: '당일 저녁 배송', summary: '낮에 주문하면 그날 저녁에 받는 배송이다.',
    facts: ['오후 2시 전 주문은 당일 저녁 8시까지 도착한다.', '저녁 배송은 냉장 밴만 쓴다.'], decisions: ['저녁 배송은 수도권 센터에서만 운영한다.'] },
  { slug: 'religious-labels', title: 'Certification badges in the portal', summary: 'How certified products are marked for shoppers.',
    facts: ['Products with halal or kosher certification show a badge in the portal.', 'The badge links to the certificate the supplier uploaded.'], decisions: ['Expired certificates hide the badge automatically.'] },
  { slug: 'handset-replacement', title: 'Driver handset replacement', summary: 'When company handsets are renewed.',
    facts: ['Company handsets are replaced every three years.', 'A cracked screen is repaired at the depot within a day.'], decisions: ['Handsets are bought in bulk once a year.'] },
  { slug: 'tyre-rotation', title: 'Van tyre rotation', summary: 'Tyre care for the delivery fleet.',
    facts: ['Van tyres are rotated every 10,000 km.', 'Winter tyres go on in the first week of December.'], decisions: ['Tyre work moved to an outside workshop.'] },
  { slug: 'office-pantry-pricing', title: 'Pricing for office pantries', summary: 'How business customers that stock office kitchens are charged.',
    facts: ['Offices pay a flat fee per floor for weekly pantry restocking.', 'Fresh fruit is billed separately by weight.'], decisions: ['Office pricing is reviewed every January.'] },
  { slug: 'spoiled-stock-disposal', title: 'Spoiled stock disposal', summary: 'What happens to goods that can no longer be sold or eaten.',
    facts: ['Spoiled goods are weighed and logged before they leave the depot.', 'A composting contractor collects spoiled produce twice a week.'], decisions: ['Packaging is separated from food waste at the depot.'] },
  { slug: 'wrong-address-delivery', title: 'Wrong-address deliveries', summary: 'Fixing a delivery left at the wrong door.',
    facts: ['When a driver leaves goods at the wrong address, they return within the same shift to collect them.', 'The correct customer receives a new delivery if the goods cannot be recovered.'], decisions: ['Wrong-address cases are reviewed weekly with the driver.'] },
  { slug: 'delivery-photo-rules', title: 'Proof-of-delivery photos', summary: 'What a delivery photo must show.',
    facts: ['The photo must show the door number and the package together.', 'Photos are kept for 30 days.'], decisions: ['Blurry photos trigger a retake prompt in the app.'] },
  { slug: 'summer-heat-plan', title: 'Summer heat plan', summary: 'Depot routines on very hot days.',
    facts: ['On days above 33 °C, loading moves into the shaded bay.', 'Vans pre-cool for 30 minutes before the first wave.'], decisions: ['Heat days are declared by the regional manager the evening before.'] },
  { slug: 'route-templates', title: 'Route templates', summary: 'Saving recurring routes for reuse.',
    facts: ['Planners can save a recurring route as a template.', 'A template copies stop order and time windows, not the vehicle.'], decisions: ['Templates unused for 90 days are archived.'] },
  { slug: 'authorization-holds', title: 'Card authorization holds', summary: 'How the amount on a shopper\'s card is reserved and settled.',
    facts: ['An authorization hold is placed at checkout for the basket total plus 10 percent.', 'The final amount is captured after picking, and the hold drops within 7 days.'], decisions: ['Substitutions never raise the captured amount above the hold.'] },
  { slug: 'fixed-area-assignment', title: '신규 기사 지역 고정 배정', summary: '처음 일하는 기사의 배정 방식이다.',
    facts: ['신규 기사는 첫 달 동안 같은 지역에만 배정한다.', '둘째 달부터 인접 지역을 하나씩 더한다.'], decisions: ['지역 고정 기간을 2주에서 한 달로 늘렸다.'] },
  { slug: 'summer-coolant', title: '여름철 보냉재 기준', summary: '더운 날 보냉재를 얼마나 넣는지 정한다.',
    facts: ['기온이 30도를 넘는 날은 보냉재를 두 배로 넣는다.', '보냉재는 전날 밤 냉동실에서 12시간 얼린다.'], decisions: ['기온 기준은 출차 센터의 오전 6시 예보로 정한다.'] },
  { slug: 'new-hire-accounts', title: '신규 입사자 계정 발급', summary: '새 직원의 계정을 만드는 절차다.',
    facts: ['입사 첫날 오전에 계정을 발급한다.', '업무 권한은 팀장이 승인한 뒤에 열린다.'], decisions: ['임시 비밀번호는 문자로 보내지 않고 직접 전달한다.'] },
  { slug: 'chiller-humidity', title: '냉장 적재칸 습도 기준', summary: '채소를 싣는 냉장 적재칸의 습도 관리다.',
    facts: ['잎채소를 실을 때 냉장 적재칸 습도는 85~95%로 맞춘다.', '습도가 70% 아래로 떨어지면 기사 앱에 안내가 뜬다.'], decisions: ['습도 안내는 경보가 아니라 알림으로만 보낸다.'] },
  { slug: 'morning-handover', title: 'Morning shift handover', summary: 'How the control room hands over at the start of the day.',
    facts: ['The night operator hands over open alarms to the day team at 06:00.', 'Every open alarm needs a written note in the handover log.'], decisions: ['Handover happens standing at the wall screen, not by chat.'] },
  { slug: 'temperature-faq', title: 'Shopper temperature FAQ', summary: 'Answers support gives about how cold goods are kept.',
    facts: ['Frozen goods travel at minus 18 °C or colder.', 'Shoppers can see the compartment temperature on the tracking page.'], decisions: ['The FAQ avoids promising exact arrival temperatures.'] },
  { slug: 'payment-methods', title: '결제 수단 등록', summary: '고객이 등록할 수 있는 결제 수단이다.',
    facts: ['신용카드와 체크카드, 계좌 이체를 등록할 수 있다.', '결제 수단은 계정당 다섯 개까지 등록한다.'], decisions: ['간편결제는 다음 분기에 붙인다.'] },
  { slug: 'dock-door-heaters', title: 'Dock door heaters', summary: 'Keeping dock doors working in freezing weather.',
    facts: ['Dock doors have heated seals so they do not freeze shut in winter.', 'Heaters switch on below 2 °C outside.'], decisions: ['Heater faults are logged as facility tickets, not cold-chain incidents.'] },
];
