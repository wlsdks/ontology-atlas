---
id: pick
kind: project
project: pick
title: Pick
version: 1
---

# Pick

실시간 강의 참여 플랫폼. 강사가 수업 중 질문을 출제하면 학생이 모바일·
노트북으로 즉시 응답. 객관식 / 워드클라우드 / 퀴즈 / AI 심사 과제 등
10+ 참여 도구. React 19 + Vite + Firebase RTDB + Gemini.

## 도메인 (Domain)

### 학생 모드 (Student Mode)

QR 접속 → 닉네임 입력 → 실시간 응답 / 채팅 / 손들기 / 리더보드.

### 강사 모드 (Instructor Mode)

클래스 대시보드 / 질문 관리 / 게임 모드 / 키보드 단축키 / 세션 기록.

### 스태프 모드 (Staff Mode)

강사 보조. 1:1 DM / 학생 모니터링.

### 프레젠터 모드 (Projector Mode)

전자칠판 / 빔프로젝트 큰 화면 출력 — 응답 결과 실시간 시각화.

### AI 심사 (AI Judging)

7 판사 — Gemini 기반 과제 예심·본심.

## 기능 (Capability)

### QR 접속 (QR Onboarding)

링크 / QR 로 즉시 참여, 닉네임만.

### 응답 도구 10종 (Response Tools 10)

객관식 / O·X / 워드클라우드 / Q&A / 퀴즈 / 척도 / 토론 / 순위 /
빈칸채우기 / 체크.

### 타이머 (Timer)

질문별 원형 링 카운트다운, 5초 이하 펄스.

### 리액션 (Reactions)

👍🔥❤️😂👏 하단바 + 3초 쿨다운.

### 손들기 / 긴급 질문 (Hand Raise / Urgent Q)

익명 도움 요청.

### 공개 Q&A (Public Q&A)

질문 올리기 + 추천.

### 실시간 채팅 (Live Chat)

공개 + 스태프 1:1 DM.

### 리더보드·업적 (Leaderboard / Achievements)

퀴즈 점수 / 연속 정답 / 개인 리포트.

### 게임 모드 (Game Modes)

추첨 (Lottery) / 발표자 뽑기 / 쉬는 시간 타이머.

### 세션 기록 (Session Record)

질문별 응답 히스토리 / 학생 리포트 / CSV 내보내기.

### AI 질문 생성 (AI Question Generation)

Gemini 로 질문 자동 생성.

### AI 응답 요약 (AI Response Summary)

대량 응답 자동 요약.

## 핵심 요소 (Element)

### React 19

UI 런타임.

### Vite

build / dev server.

### Firebase Realtime Database

실시간 동기화 1 차 진실원.

### Firebase Hosting

배포 (https://jinan-6c884.web.app).

### Firebase Auth

스태프 / 강사 인증.

### Gemini (@google/generative-ai)

AI 심사 / 질문 생성 / 응답 요약.

### Framer Motion

애니메이션.

### dnd-kit

드래그 정렬 (질문 순서).

### Lucide React

아이콘.

### QRCode React

QR 생성.

### Pretendard

한글 폰트.

## 디자인 (Design)

### Anti-AI 디자인

slate 모노크로매틱 + 인디고 액센트. AI 생성 클리셰 회피.

### 다크모드 (Dark Mode)

Sun/Moon 토글, localStorage 보존.
