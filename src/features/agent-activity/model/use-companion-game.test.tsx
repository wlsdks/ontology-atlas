import {act,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GAME_PREFIX,newCompanionGame,actCompanionGame,parseCompanionGame,TURN_MS} from './companion-game';
import {useCompanionGame} from './use-companion-game';
const area={uid:'area',slug:'domains/area',title:'Area',difficulty:0,requiredKnowledge:5};
beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.setSystemTime(61000);vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('announces away rewards only after saving succeeds and retries the same interval once',()=>{
 const game=actCompanionGame({...newCompanionGame(1000),knowledge:5},{type:'depart',area},1000);
 const raw=JSON.stringify(game);localStorage.setItem(GAME_PREFIX+'project',raw);
 const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
 const h=renderHook(()=>useCompanionGame('project',5,true,'area'));
 expect(h.result.current.failed).toBe(true);expect(h.result.current.arrival?.wins).toBe(0);
 expect(localStorage.getItem(GAME_PREFIX+'project')).toBe(raw);
 fail.mockRestore();act(()=>vi.advanceTimersByTime(TURN_MS));
 expect(h.result.current.failed).toBe(false);expect(h.result.current.arrival!.wins).toBeGreaterThan(0);
 const saved=parseCompanionGame(localStorage.getItem(GAME_PREFIX+'project'))!;
 expect(saved.wins).toBe(h.result.current.arrival!.wins);
 act(()=>h.result.current.dismissArrival());expect(h.result.current.arrival).toBeNull();h.unmount();
 const stopped=localStorage.getItem(GAME_PREFIX+'project');act(()=>vi.advanceTimersByTime(TURN_MS*10));expect(localStorage.getItem(GAME_PREFIX+'project')).toBe(stopped);
});
it('keeps another project isolated and stops the simulation timer on inactive surfaces',()=>{
 const game={...newCompanionGame(61000),gold:50,xp:70};localStorage.setItem(GAME_PREFIX+'other',JSON.stringify(game));
 localStorage.setItem(GAME_PREFIX+'current',JSON.stringify(actCompanionGame({...newCompanionGame(61000),knowledge:5},{type:'depart',area},61000)));
 const h=renderHook(({active,project})=>useCompanionGame(project,5,active,'area'),{initialProps:{active:true,project:'current'}});
 expect(h.result.current.game.gold).toBe(0);h.rerender({active:false,project:'current'});const stopped=localStorage.getItem(GAME_PREFIX+'current');act(()=>vi.advanceTimersByTime(TURN_MS*10));expect(localStorage.getItem(GAME_PREFIX+'current')).toBe(stopped);
 expect(parseCompanionGame(localStorage.getItem(GAME_PREFIX+'other'))?.gold).toBe(50);
 h.rerender({active:false,project:'other'});expect(h.result.current.game.gold).toBe(50);expect(localStorage.getItem('ontology-atlas:companion-game:v1:other')).toBe(JSON.stringify(game));
});

it('applies construction once after old-power catch-up and announces it only after persistence',()=>{
 const current=actCompanionGame({...newCompanionGame(1000),knowledge:5},{type:'depart',area},1000);localStorage.setItem(GAME_PREFIX+'project',JSON.stringify(current));
 const snapshot={concepts:20,relations:10,implementation:5,wiki:3,detail:10};
 const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
 const h=renderHook(({counts})=>useCompanionGame('project',5,true,'area',counts),{initialProps:{counts:snapshot}});
 expect(h.result.current.constructionReward).toBe(0);expect(h.result.current.game.construction.concepts).toBe(0);
 fail.mockRestore();act(()=>vi.advanceTimersByTime(TURN_MS));
 expect(h.result.current.game.construction).toEqual(snapshot);expect(h.result.current.constructionReward).toBe(800);
 act(()=>h.result.current.dismissConstruction());h.rerender({counts:{...snapshot}});expect(h.result.current.constructionReward).toBe(0);
 h.rerender({counts:{...snapshot,wiki:4}});expect(h.result.current.constructionReward).toBe(40);
 h.rerender({counts:{concepts:0,relations:0,implementation:0,wiki:0,detail:0}});expect(h.result.current.game.construction.wiki).toBe(4);
 act(()=>h.result.current.reset());expect(h.result.current.game).toMatchObject({xp:0,knowledge:845,construction:{wiki:4}});
});
it('a fully recovered camp does no periodic storage work',()=>{
 const h=renderHook(()=>useCompanionGame('project',5,true,'area'));const write=vi.spyOn(Storage.prototype,'setItem');act(()=>vi.advanceTimersByTime(60000));expect(write).not.toHaveBeenCalled();h.unmount();
});
it('preserves a corrupt save until the explicit adventure reset recovers it',()=>{
 localStorage.setItem(GAME_PREFIX+'project','unreadable');const h=renderHook(()=>useCompanionGame('project',5,true,'area'));
 expect(h.result.current.unreadable).toBe(true);expect(localStorage.getItem(GAME_PREFIX+'project')).toBe('unreadable');
 act(()=>expect(h.result.current.reset()).toBe(true));expect(h.result.current.unreadable).toBe(false);expect(h.result.current.game.knowledge).toBe(5);
});
