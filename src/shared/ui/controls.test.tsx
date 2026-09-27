import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { controlClass } from './control-class';
import { Chip, IconButton, RowButton } from './controls';

/** Values must come through `controlClass()`, and the component carries the behaviour. */
describe('control components take their values from the system', () => {
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
  ])('%s className equals the controlClass output', (_name, element, expected) => {
    const { container } = render(element);
    expect(container.querySelector('button')?.className).toBe(expected);
  });
});

describe('control components carry what a className cannot', () => {
  it.each([
    ['Chip', <Chip key="c">칩</Chip>],
    [
      'IconButton',
      <IconButton key="i" label="닫기">
        <span>×</span>
      </IconButton>,
    ],
    ['RowButton', <RowButton key="r">행</RowButton>],
  ])('%s is type="button" so it never submits a form', (_name, element) => {
    // A `<button>` defaults to submit, which no className can prevent.
    render(element);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('IconButton turns its label into the accessible name', () => {
    render(
      <IconButton label="지도 닫기">
        <span aria-hidden>×</span>
      </IconButton>,
    );
    // The type already requires `label`; this checks it really becomes the accessible name.
    expect(screen.getByRole('button', { name: '지도 닫기' })).toBeInTheDocument();
  });

  it('RowButton renders a button element, not a div', () => {
    // A div row would be unreachable by keyboard and not announced as a control.
    const { container } = render(<RowButton>행</RowButton>);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
  });

  it('takes the disabled styling from the value layer', () => {
    // Disabled styling handled per component gets missed.
    render(<Chip disabled>칩</Chip>);
    const el = screen.getByRole('button');
    expect(el.className).toContain('disabled:opacity-55');
    expect(el.className).toContain('disabled:cursor-not-allowed');
  });

  it('appends a placement className and keeps the shape', () => {
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
  ])('%s is queryable from outside through data-control', (shape, element) => {
    /* Lets a test query a whole class of control instead of hand-listing selectors. */
    const { container } = render(element);
    expect(container.querySelector(`[data-control="${shape}"]`)).toBeInTheDocument();
  });

  it('counts the controls on a screen by class', () => {
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
