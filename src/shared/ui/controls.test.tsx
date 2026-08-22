import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { controlClass } from './control-class';
import { Chip, IconButton, RowButton } from './controls';

/**
 * The contract for the control components — **born with a gate.**
 *
 * This repo once had three primitives with 0 consumers for three months
 * (`Card`, `Badge`, `DetailCard`), and the reason was not laziness but that
 * **the components violated the system** (`CardTitle` used `text-lg`, a step
 * absent from the ramp). Without a gate a primitive quietly drifts off-spec, and
 * an off-spec primitive is one nobody uses.
 *
 * So what this file asserts is not appearance but **the layer contract**: values
 * must come through `controlClass()`, and the component carries the behaviour.
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
    // A single hand-added character diverges here — that is where ramp drift begins.
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
    // A `<button>` defaults to submit. One chip submitting a form cannot be
    // prevented by a className in principle, which is half of why this component
    // layer exists.
    render(element);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('IconButton 은 접근 이름을 강제한다 — 아이콘에는 읽을 글자가 없다', () => {
    render(
      <IconButton label="지도 닫기">
        <span aria-hidden>×</span>
      </IconButton>,
    );
    // `label` is a required prop, so the type blocks omitting it. What is checked
    // here is that it really becomes the accessible name — accepting the prop and
    // never using it would still type-check.
    expect(screen.getByRole('button', { name: '지도 닫기' })).toBeInTheDocument();
  });

  it('RowButton 은 `<button>` 이다 — 넓다고 div 로 만들지 않는다', () => {
    // A list row is wide enough to tempt div+onClick, which makes it unreachable
    // by keyboard and stops screen readers from announcing it as a control.
    const { container } = render(<RowButton>행</RowButton>);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
  });

  it('비활성이 값 층에서 온다 — 컴포넌트마다 챙기지 않는다', () => {
    // Handled per component, one gets missed: ChromeChip and ChromeTile were both
    // missing it, and the owner found it on screen.
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
     * **What cannot be told apart from outside cannot be checked from outside.**
     * Without this attribute, answering "does every icon control on this screen
     * have a 44px hit area" forces a test to hand-list selectors, and that list
     * goes quietly stale as the screen changes. If `data-testid` marks *one site*,
     * this marks *one class*.
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
