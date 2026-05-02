// `isAdmin` 은 `@/entities/admin/api` 로 직접 import — firebase 정적 leak 차단.
// barrel 자체가 비면 import 자체가 unused 가 되어 webpack 이 erase 하기 더 쉬움.
export {};
