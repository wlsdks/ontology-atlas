import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { controlClass } from './control-class';
import { Chip, IconButton, RowButton } from './controls';

/**
 * 컨트롤 컴포넌트의 계약 — **게이트를 갖고 태어난다.**
 *
 * 이 저장소에는 3개월간 사용처 0이던 프리미티브 셋이 있었고(`Card`·`Badge`·
 * `DetailCard`), 이유는 게으름이 아니라 **그 컴포넌트가 시스템을 위반**하고
 * 있었다는 것이다(`CardTitle` 이 램프에 없는 `text-lg`). 게이트가 없으면
 * 프리미티브는 조용히 규격 밖으로 흘러가고, 규격 밖 프리미티브는 아무도 안 쓴다.
 *
 * 그래서 이 파일이 단언하는 것은 겉모습이 아니라 **층의 계약**이다: 값은
 * 반드시 `controlClass()` 를 통과하고, 행동은 컴포넌트가 진다.
 */
describe('컨트롤 컴포넌트 — 값은 반드시 시스템을 통과한다', () => {
  it.each([
    ['Chip', <Chip key="c">칩</Chip>, controlClass({ shape: 'chip' })],
    [
      'IconButton',
      <IconButton key="i" label="닫기">
        <span>×</span>
      </IconButton>,
      controlClass({ shape: 'icon' }),
    ],
    ['RowButton', <RowButton key="r">행</RowButton>, controlClass({ shape: 'row' })],
  ])('%s 의 className 이 controlClass 산출물과 같다', (_name, element, expected) => {
    const { container } = render(element);
    // 손으로 한 글자라도 덧붙이면 여기서 갈린다 — 그게 램프 이탈이 시작되는 지점이다.
    expect(container.querySelector('button')?.className).toBe(expected);
  });
});

describe('컨트롤 컴포넌트 — className 이 못 나르는 것들', () => {
  it.each([
    ['Chip', <Chip key="c">칩</Chip>],
    [
      'IconButton',
      <IconButton key="i" label="닫기">
        <span>×</span>
      </IconButton>,
    ],
    ['RowButton', <RowButton key="r">행</RowButton>],
  ])('%s 는 type="button" 이다 — 폼 안에서 submit 이 되지 않는다', (_name, element) => {
    // `<button>` 의 기본은 submit 이다. 칩 하나가 폼을 보내는 사고는 className 으로
    // 원리적으로 막을 수 없고, 그게 이 컴포넌트 층이 존재하는 이유의 절반이다.
    render(element);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('IconButton 은 접근 이름을 강제한다 — 아이콘에는 읽을 글자가 없다', () => {
    render(
      <IconButton label="지도 닫기">
        <span aria-hidden>×</span>
      </IconButton>,
    );
    // `label` 이 필수 prop 이라 «빠뜨림» 이 타입에서 막힌다. 여기서는 그것이
    // 실제로 접근 이름이 되는지를 본다 — prop 만 받고 안 쓰면 타입은 통과한다.
    expect(screen.getByRole('button', { name: '지도 닫기' })).toBeInTheDocument();
  });

  it('RowButton 은 `<button>` 이다 — 넓다고 div 로 만들지 않는다', () => {
    // 목록 행은 넓어서 div+onClick 으로 만들고 싶어지는 자리다. 그러면 키보드로
    // 못 가고 스크린리더가 컨트롤로 안 읽는다.
    const { container } = render(<RowButton>행</RowButton>);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
  });

  it('비활성이 값 층에서 온다 — 컴포넌트마다 챙기지 않는다', () => {
    // 컴포넌트마다 챙기면 하나는 빠진다. 실제로 ChromeChip·ChromeTile 이 둘 다
    // 빠져 있었고 소유자가 화면에서 발견했다.
    render(<Chip disabled>칩</Chip>);
    const el = screen.getByRole('button');
    expect(el.className).toContain('disabled:opacity-55');
    expect(el.className).toContain('disabled:cursor-not-allowed');
  });

  it('자리잡기 className 은 덧붙고 모양은 남는다', () => {
    render(<Chip className="absolute right-2">칩</Chip>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('absolute');
    expect(el).toHaveClass('rounded-chip');
  });

  it.each([
    ['chip', <Chip key="c">칩</Chip>],
    [
      'icon',
      <IconButton key="i" label="닫기">
        <span>×</span>
      </IconButton>,
    ],
    ['row', <RowButton key="r">행</RowButton>],
  ])('%s 는 밖에서 질의된다 — data-control', (shape, element) => {
    /*
     * **밖에서 구분할 수 없는 것은 밖에서 검사할 수 없다.** 이 속성이 없으면
     * 「이 화면의 모든 아이콘 컨트롤이 44px 히트 영역을 갖는가」에 답하려고
     * 테스트가 셀렉터를 손으로 나열해야 하고, 그 목록은 화면이 바뀌면 조용히
     * 낡는다. `data-testid` 가 «한 자리» 라면 이건 «한 부류» 다.
     */
    const { container } = render(element);
    expect(container.querySelector(`[data-control="${shape}"]`)).toBeInTheDocument();
  });

  it('한 화면의 컨트롤을 부류로 셀 수 있다 — 계기가 쓰는 형태', () => {
    render(
      <div>
        <Chip>가</Chip>
        <Chip>나</Chip>
        <IconButton label="닫기">
          <span>×</span>
        </IconButton>
        <RowButton>행</RowButton>
      </div>,
    );
    expect(document.querySelectorAll('[data-control="chip"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-control="icon"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-control]')).toHaveLength(4);
  });
});
