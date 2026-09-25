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
it('freezes a menu without spending turns, then resumes from the unfinished turn',()=>{
 const started=actCompanionGame({...newCompanionGame(61000),knowledge:5},{type:'depart',area},61000);
 localStorage.setItem(GAME_PREFIX+'project',JSON.stringify(started));
 const h=renderHook(({paused})=>useCompanionGame('project',5,true,'area',undefined,null,paused),{initialProps:{paused:false}});
 act(()=>vi.advanceTimersByTime(TURN_MS));
 const before=h.result.current.game;
 h.rerender({paused:true});
 act(()=>vi.advanceTimersByTime(TURN_MS*60));
 expect(h.result.current.game).toEqual(before);
 act(()=>expect(h.result.current.act({type:'plan-path',path:'elite',run:before.run.number,floor:1})).toBe(true));
 expect(h.result.current.game).toMatchObject({turn:before.turn,hp:before.hp,enemyHp:before.enemyHp,gold:before.gold});
 h.rerender({paused:false});
 expect(h.result.current.game.turn).toBe(before.turn);
 act(()=>vi.advanceTimersByTime(TURN_MS-1));
 expect(h.result.current.game.turn).toBe(before.turn);
 act(()=>vi.advanceTimersByTime(1));
 expect(h.result.current.game.turn).toBe(before.turn+1);
 h.unmount();
});
it('does not catch up a menu after a failed resume save, but still catches up after closing the game',()=>{
 const started=actCompanionGame({...newCompanionGame(61000),knowledge:5},{type:'depart',area},61000);
 localStorage.setItem(GAME_PREFIX+'project',JSON.stringify(started));
 const h=renderHook(({paused})=>useCompanionGame('project',5,true,'area',undefined,null,paused),{initialProps:{paused:false}});
 h.rerender({paused:true});
 const before=h.result.current.game;
 act(()=>vi.advanceTimersByTime(TURN_MS*5));
 const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
 h.rerender({paused:false});
 expect(h.result.current.failed).toBe(true);
 expect(h.result.current.game).toEqual(before);
 act(()=>vi.advanceTimersByTime(TURN_MS*2));
 expect(h.result.current.game).toEqual(before);
 fail.mockRestore();
 act(()=>vi.advanceTimersByTime(TURN_MS));
 expect(h.result.current.failed).toBe(false);
 expect(h.result.current.game.turn).toBe(before.turn);
 h.unmount();
 act(()=>vi.advanceTimersByTime(TURN_MS*3));
 const reopened=renderHook(()=>useCompanionGame('project',5,true,'area'));
 expect(reopened.result.current.game.turn).toBeGreaterThan(before.turn);
});
it('does not move a paused save clock backwards when system time rewinds',()=>{
 const started=actCompanionGame({...newCompanionGame(61000),knowledge:5},{type:'depart',area},61000);
 localStorage.setItem(GAME_PREFIX+'project',JSON.stringify(started));
 const h=renderHook(({paused})=>useCompanionGame('project',5,true,'area',undefined,null,paused),{initialProps:{paused:false}});
 h.rerender({paused:true});vi.setSystemTime(60000);h.rerender({paused:false});
 expect(h.result.current.game.lastAt).toBeGreaterThanOrEqual(started.lastAt);
 expect(h.result.current.game.turn).toBe(started.turn);
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
it('keeps a pending guardian clear retryable after a failed return save',()=>{
 const started=actCompanionGame({...newCompanionGame(61000),knowledge:800},{type:'depart',area},61000);
 const defeated=actCompanionGame({...started,encounter:14,enemyHp:1},{type:'skill'},61000);
 const raw=JSON.stringify(defeated);localStorage.setItem(GAME_PREFIX+'project',raw);
 const h=renderHook(()=>useCompanionGame('project',800,false,'area'));
 const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
 act(()=>expect(h.result.current.act({type:'return'})).toBe(false));expect(localStorage.getItem(GAME_PREFIX+'project')).toBe(raw);
 fail.mockRestore();act(()=>expect(h.result.current.act({type:'return'})).toBe(true));const saved=h.result.current.game;
 expect(saved.run.clears).toBe(1);expect(saved.gold).toBe(defeated.gold+30);
 act(()=>h.result.current.act({type:'return'}));expect(h.result.current.game.gold).toBe(saved.gold);expect(h.result.current.game.run.clears).toBe(1);
});
it('does not publish a path preference when persistence fails, then retries without granting rewards',()=>{
 const start=actCompanionGame({...newCompanionGame(61000),knowledge:5},{type:'depart',area},61000);localStorage.setItem(GAME_PREFIX+'project',JSON.stringify(start));
 const h=renderHook(()=>useCompanionGame('project',5,false,'area'));const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
 const choice={type:'plan-path' as const,path:'elite' as const,run:start.run.number,floor:1};
 act(()=>expect(h.result.current.act(choice)).toBe(false));expect(h.result.current.game.run.plan).toBe('camp');
 fail.mockRestore();act(()=>expect(h.result.current.act(choice)).toBe(true));expect(h.result.current.game.run.plan).toBe('elite');expect(h.result.current.game.hp).toBe(start.hp);expect(h.result.current.game.gold).toBe(start.gold);h.unmount();
});
it('claims quest rewards atomically, rejects foreign evidence, and grants nothing on a failed write',()=>{
 const target={uid:'00000000-0000-4000-8000-000000000001',slug:'capabilities/a',title:'A'};
 const evidence={project:'project',ready:true,counts:{concepts:3,relations:0,implementation:0,wiki:0,explored:0,reflected:0,acp:0},targets:{concepts:target,relations:null,implementation:null,wiki:null,explored:null,reflected:null,acp:null},acp:'unavailable' as const,byUid:new Map([[target.uid,target]]),bySlug:new Map([[target.slug,target]])};
 localStorage.setItem(GAME_PREFIX+'project',JSON.stringify(newCompanionGame(61000)));
 const h=renderHook(({projectEvidence})=>useCompanionGame('project',0,false,'',undefined,projectEvidence),{initialProps:{projectEvidence:evidence}});
 const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});act(()=>expect(h.result.current.act({type:'claim-quest',id:'roots'})).toBe(false));expect(h.result.current.game.relics).toBe(0);expect(h.result.current.game.questClaims).toEqual({});fail.mockRestore();
 h.rerender({projectEvidence:{...evidence,project:'other'}});act(()=>expect(h.result.current.act({type:'claim-quest',id:'roots'})).toBe(false));expect(h.result.current.game.relics).toBe(0);
 h.rerender({projectEvidence:evidence});act(()=>expect(h.result.current.act({type:'claim-quest',id:'roots'})).toBe(true));expect(h.result.current.game.relics).toBe(1);act(()=>expect(h.result.current.act({type:'claim-quest',id:'roots'})).toBe(false));expect(h.result.current.game.relics).toBe(1);h.unmount();
});
