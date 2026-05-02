/**
 * 프로젝트 카테고리(=영역) 도메인 모델.
 *
 * 각 카테고리는 토폴로지에서 하나의 클러스터 박스에 해당한다.
 * 좌표·크기·보더 스타일까지 admin이 관리한다.
 *
 * 디자인 시스템 제약:
 * - 색 추가 금지. borderStyle은 preset 4개 중 택일.
 * - 인디고는 허브 노드 전용.
 */

/** 노드 카드의 보더 표현 방식 — design system preset. */
export type BorderStyle = 'underline' | 'dashed' | 'sideLabel' | 'solid';

export interface CategoryPosition {
  x: number;
  y: number;
}

export interface CategorySize {
  width: number;
  height: number;
}

export interface Category {
  /** Stable ID. 소문자·숫자·하이픈. 예: 'in-progress'. */
  id: string;
  /** 한국어 라벨 (UI 기본 표시). */
  label: string;
  /** 영문 라벨 (툴팁·Legend 부기 등 선택). */
  labelEn?: string;
  /** 정렬 순서 (RegionNavigator·Legend·filters 공통). */
  order: number;
  /** 클러스터 박스 중심 좌표. */
  position: CategoryPosition;
  /** 클러스터 박스 크기. 노드가 이 안에 머문다. */
  size: CategorySize;
  /** 네비게이션 zoom 계산용 대략 반경. */
  radius: number;
  /** 카테고리 내 노드의 보더 표현 방식. */
  borderStyle: BorderStyle;
  /**
   * borderStyle='sideLabel'일 때 노드 좌측에 세로로 표시될 짧은 텍스트.
   * 미설정 시 labelEn 또는 label을 사용.
   */
  sideLabelText?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 생성·수정 입력 — createdAt/updatedAt은 서버가 관리. */
export type CategoryInput = Omit<Category, 'createdAt' | 'updatedAt'>;
