# Firebase Hosting 배포 가이드

oh-my-ontology 의 hosted demo 는 Firebase Hosting (project:
`oh-my-ontology`) 으로 정적 export 를 호스팅한다. Next.js
`output: 'export'` 라 서버 런타임 없음 — 무료 Spark plan 으로 충분.

## 1회 setup (이미 완료된 항목)

- [x] Firebase project `oh-my-ontology` 생성
- [x] `.firebaserc` 의 `default: oh-my-ontology` 설정
- [x] `firebase.json` 의 `hosting` 블록 — `public: out`, cleanUrls,
      trailingSlash, security headers, project/** rewrite

## 배포 명령

```bash
# 처음 한 번만
npm install -g firebase-tools
firebase login

# 매 배포 시
pnpm build                          # static export → out/
firebase deploy --only hosting      # firebase.json 의 hosting 블록만 배포
```

`predeploy` hook 이 `pnpm build` 를 자동 실행하므로
`firebase deploy --only hosting` 만 쳐도 빌드부터 한다.

## 배포 url

- Default: `https://oh-my-ontology.web.app`
- Alt: `https://oh-my-ontology.firebaseapp.com`
- Custom domain 원하면: Firebase 콘솔 → Hosting → Add custom domain

## 배포 후 smoke 검증

```bash
# 핵심 라우트 응답 확인
for path in / /topology/ /docs/ /ontology/edit/ /ontology/insights/ /projects/; do
  curl -s -o /dev/null -w "%{http_code} %{size_download}b $path\n" \
    https://oh-my-ontology.web.app$path
done
```

기대: 모두 200, 크기 50KB+ (정상 HTML).

브라우저 spot-check:
- `/` LandingPage 카피 + 로그인 링크
- `/topology` Sigma 노드 (dogfood 1 project)
- `/ontology/insights` "총 ~130 노드 / 165 관계"
- DevTools Network: firebase JS chunk 가 user-facing 첫 paint 에 0KB

## 회귀 차단

배포 전 `pnpm bundle:check` 통과 확인. local-first 라우트 11 개에
firebase 청크 0KB 유지가 약속이다 (PR #99 의 핵심).

## 비용

Firebase Hosting Spark plan = $0. 정적 export 는 cdn 캐시만 — 트래픽이
GB/일 수준까지 무료. 그 이상은 Blaze plan (pay-as-you-go).

## Firestore / Auth / Storage 도 같이 쓸 거면

mission v2 는 cloud 모드를 옵션으로 두지만, 사용자가 cloud sync 를
실제로 쓸 경우:

```bash
firebase deploy --only hosting,firestore,storage
```

`firestore.rules` / `storage.rules` 가 이미 repo 에 있어 함께 배포된다.
Functions 는 mission v2 가 폐기 → `functions/` 디렉토리 자체 없음.
