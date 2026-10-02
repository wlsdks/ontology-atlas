import {Profiler} from 'react';
import {motionValue} from 'framer-motion';
import {act,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {CompanionSprite} from './CompanionSprite';
const motionPreference=vi.hoisted(()=>({reduced:false}));
vi.mock('@/shared/lib/use-prefers-reduced-motion',()=>({usePrefersReducedMotion:()=>motionPreference.reduced}));
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();motionPreference.reduced=false;});
it('advances visible walk frames, freezes when paused, and stops after removal',()=>{
 vi.useFakeTimers();const {container,rerender,unmount}=render(<CompanionSprite pose="walk" playing/>);
 const frame=()=>container.querySelector('[data-frame]')?.getAttribute('data-frame');
 expect(frame()).toBe('0');act(()=>vi.advanceTimersByTime(150));expect(frame()).toBe('1');
 rerender(<CompanionSprite pose="walk" playing={false}/>);act(()=>vi.advanceTimersByTime(1000));expect(frame()).toBe('1');
 unmount();act(()=>vi.advanceTimersByTime(1000));expect(container.childElementCount).toBe(0);
});
it('a strike plays once and a static sleep pose preserves its identity',()=>{
 vi.useFakeTimers();const {container,rerender}=render(<CompanionSprite pose="attack" playing/>);
 act(()=>vi.advanceTimersByTime(600));expect(container.querySelector('[data-frame]')).toHaveAttribute('data-frame','15');
 act(()=>vi.advanceTimersByTime(600));expect(container.querySelector('[data-frame]')).toHaveAttribute('data-frame','15');
 rerender(<CompanionSprite pose="sleep"/>);expect(container.querySelector('[data-frame]')).toHaveAttribute('data-frame','18');
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
it('stops its own sprite clock when hidden or reduced motion changes live',()=>{
 vi.useFakeTimers();const {container,rerender}=render(<CompanionSprite pose="read" playing/>);
 const sprite=()=>container.querySelector('[data-frame]')!;
 act(()=>vi.advanceTimersByTime(300));expect(sprite()).toHaveAttribute('data-frame','9');
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);
 act(()=>document.dispatchEvent(new Event('visibilitychange')));
 expect(sprite()).toHaveAttribute('data-playing','false');act(()=>vi.advanceTimersByTime(1500));expect(sprite()).toHaveAttribute('data-frame','9');
 hidden.mockReturnValue(false);act(()=>document.dispatchEvent(new Event('visibilitychange')));
 motionPreference.reduced=true;rerender(<CompanionSprite pose="read" playing/>);
 expect(sprite()).toHaveAttribute('data-frame','8');expect(sprite()).toHaveAttribute('data-playing','false');
 act(()=>vi.advanceTimersByTime(1500));expect(sprite()).toHaveAttribute('data-frame','8');
 motionPreference.reduced=false;rerender(<CompanionSprite pose="read" playing/>);
 act(()=>vi.advanceTimersByTime(300));expect(sprite()).toHaveAttribute('data-frame','10');
});
