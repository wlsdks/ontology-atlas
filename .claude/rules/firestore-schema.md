# Firestore 스키마 변경 프로세스

## 원칙

스키마 변경은 **문서가 먼저**다. 코드 수정보다 먼저 `docs/DATA-MODEL.md`에 변경을 반영한다.

## 변경 유형

1. **필드 추가** — 기존 데이터와 호환. `docs/DATA-MODEL.md`에 필드 추가 후 코드 수정.
2. **필드 삭제** — 기존 필드 제거 전, 참조하는 코드가 없음을 확인. 데이터도 수동 정리 필요.
3. **필드 타입 변경** — 마이그레이션 스크립트 작성. `scripts/migrations/` 디렉토리 사용.
4. **컬렉션 추가** — Security Rules도 같이 수정.
5. **컬렉션 이름 변경** — 데이터 마이그레이션 + Rules 수정 + 코드 대규모 수정. 가급적 피함.
6. **Storage 경로 계약 추가/변경** — `storage.rules`와 관련 문서를 같이 수정.

## 체크리스트

- [ ] `docs/DATA-MODEL.md` 갱신
- [ ] 설계 문서 (`docs/superpowers/specs/*`) 업데이트 (Data Model 섹션)
- [ ] `src/entities/*/model` 타입 수정
- [ ] `src/entities/*/api` CRUD 함수 시그니처 확인
- [ ] `firestore.rules` 수정 (권한 영향 시)
- [ ] `storage.rules` 수정 (Storage 경로 영향 시)
- [ ] 시드 스크립트 (`scripts/seed.ts`) 갱신
- [ ] 테스트 추가/수정
- [ ] `docs/CHANGELOG.md`에 기록

## Security Rules 수정 시

- 로컬 Emulator로 반드시 테스트 후 배포:
  ```bash
  firebase emulators:start --only firestore
  ```
- **공격 시나리오 테스트**:
  - 비로그인 쓰기 시도 → 거부되어야 함
  - 비인가 이메일 쓰기 시도 → 거부
  - 본인 외 `admins/{email}` 접근 시도 → 거부

## 인덱스 관리

Firestore 복합 인덱스가 필요하면 `firestore.indexes.json`에 정의 후 배포:

```bash
firebase deploy --only firestore:indexes
```

## 절대 금지

- 프로덕션 스키마를 코드 리뷰 없이 변경
- `admins` 컬렉션에 쓰기 권한 부여 (Security Rules로 완전 차단되어야 함)
- 민감 필드를 클라이언트 쓰기 가능하게 열기
