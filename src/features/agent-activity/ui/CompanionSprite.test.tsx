import {act,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {CompanionSprite} from './CompanionSprite';
afterEach(()=>vi.useRealTimers());
it('advances visible walk frames, freezes when paused, and stops after removal',()=>{
 vi.useFakeTimers();const {container,rerender,unmount}=render(<CompanionSprite pose="walk" playing/>);
 const frame=()=>container.querySelector('[data-frame]')?.getAttribute('data-frame');
 expect(frame()).toBe('0');act(()=>vi.advanceTimersByTime(150));expect(frame()).toBe('1');
 rerender(<CompanionSprite pose="walk" playing={false}/>);act(()=>vi.advanceTimersByTime(1000));expect(frame()).toBe('1');
 unmount();act(()=>vi.advanceTimersByTime(1000));expect(container.childElementCount).toBe(0);
});
it('a strike plays once and a static sleep pose preserves its identity',()=>{
 vi.useFakeTimers();const {container,rerender}=render(<CompanionSprite pose="attack" playing/>);
 act(()=>vi.advanceTimersByTime(600));expect(container.querySelector('[data-frame]')).toHaveAttribute('data-frame','7');
 act(()=>vi.advanceTimersByTime(600));expect(container.querySelector('[data-frame]')).toHaveAttribute('data-frame','7');
 rerender(<CompanionSprite pose="sleep"/>);expect(container.querySelector('[data-frame]')).toHaveAttribute('data-frame','14');
});
