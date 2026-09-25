import {Profiler} from 'react';
import {motionValue} from 'framer-motion';
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
it('uses traveled distance for controlled walking and does not animate a stationary frame',()=>{
 vi.useFakeTimers();const walkFrame=motionValue(2);let commits=0;
 const {container,rerender}=render(<Profiler id="walking-sprite" onRender={()=>{commits++;}}><CompanionSprite pose="walk" playing walkFrame={walkFrame}/></Profiler>);
 const sprite=()=>container.querySelector('[data-frame]')!;
 expect(sprite()).toHaveAttribute('data-frame','2');act(()=>vi.advanceTimersByTime(1200));expect(sprite()).toHaveAttribute('data-frame','2');
 const before=commits;act(()=>walkFrame.set(5));expect(sprite()).toHaveAttribute('data-frame','5');expect(commits).toBe(before);
 rerender(<Profiler id="walking-sprite" onRender={()=>{commits++;}}><CompanionSprite pose="walk" playing={false} walkFrame={walkFrame}/></Profiler>);
 act(()=>walkFrame.set(6));expect(sprite()).toHaveAttribute('data-frame','0');
});
