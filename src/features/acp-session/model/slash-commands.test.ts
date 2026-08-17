import { describe, expect, it } from 'vitest';

import { matchSlashCommands, readSlashCommands, slashQuery } from './slash-commands';

/**
 * 2026-08-17 소유자 문의: "`/` 입력하면 아틀라스 전용 스킬 같은게 있으면".
 * 된다 — 어댑터가 이미 `available_commands_update` 로 보내고 있었고 우리가
 * 안 받고 있었다.
 */
describe('명령 목록 읽기', () => {
  it('온 것만 읽는다', () => {
    expect(
      readSlashCommands({
        sessionUpdate: 'available_commands_update',
        availableCommands: [
          { name: 'init', description: '이 폴더를 훑어요' },
          { name: 'clear' },
        ],
      }),
    ).toEqual([
      { name: 'init', description: '이 폴더를 훑어요' },
      { name: 'clear', description: '' },
    ]);
  });

  it('아무것도 안 오면 빈 목록이다 — 없는 기능을 지어내지 않는다', () => {
    expect(readSlashCommands({})).toEqual([]);
    expect(readSlashCommands(null)).toEqual([]);
    expect(readSlashCommands({ availableCommands: 'nope' })).toEqual([]);
  });

  it('모양이 깨진 항목만 버리고 나머지는 살린다', () => {
    const out = readSlashCommands({
      availableCommands: [{ name: '  ' }, null, 7, { name: 'ok' }],
    });
    expect(out.map((c) => c.name)).toEqual(['ok']);
  });

  it('같은 이름이 두 번 오면 한 번만 쓴다', () => {
    const out = readSlashCommands({
      availableCommands: [{ name: 'a', description: '첫째' }, { name: 'a', description: '둘째' }],
    });
    expect(out).toEqual([{ name: 'a', description: '첫째' }]);
  });
});

describe('작성 칸이 명령을 고르는 중인가', () => {
  it('슬래시로 시작하면 고르는 중이다', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/on')).toBe('on');
  });

  it('공백이 들어가면 고르는 단계가 지났다 — 이미 인자를 치는 중이다', () => {
    expect(slashQuery('/skill 인자')).toBeNull();
    expect(slashQuery('/ ')).toBeNull();
  });

  it('평범한 말은 고르는 중이 아니다', () => {
    expect(slashQuery('안녕')).toBeNull();
    expect(slashQuery('a/b')).toBeNull();
    expect(slashQuery('')).toBeNull();
  });
});

describe('거르기', () => {
  const commands = [
    { name: 'ontology-sync', description: '' },
    { name: 'ontology-bootstrap', description: '' },
    { name: 'clear', description: '' },
  ];

  it('질의가 비면 전부 보여 준다', () => {
    expect(matchSlashCommands(commands, '')).toHaveLength(3);
  });

  it('이름 어디에 있어도 걸린다 — 앞글자만 맞출 이유가 없다', () => {
    expect(matchSlashCommands(commands, 'boot').map((c) => c.name)).toEqual(['ontology-bootstrap']);
    expect(matchSlashCommands(commands, 'ONTOLOGY')).toHaveLength(2);
  });

  it('안 맞으면 빈 목록이다', () => {
    expect(matchSlashCommands(commands, 'zzz')).toEqual([]);
  });
});
