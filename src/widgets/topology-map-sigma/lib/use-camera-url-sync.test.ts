import { describe, expect, it } from 'vitest';
import { parseCameraParam } from './use-camera-url-sync';

describe('parseCameraParam', () => {
  it('정상 x,y,ratio 파싱', () => {
    expect(parseCameraParam('0.382,0.640,0.450')).toEqual({
      x: 0.382,
      y: 0.64,
      ratio: 0.45,
    });
  });

  it('null/빈 값 → null', () => {
    expect(parseCameraParam(null)).toBeNull();
    expect(parseCameraParam('')).toBeNull();
  });

  it('비유한(NaN)·ratio 결측 → null', () => {
    expect(parseCameraParam('abc,0.5,1')).toBeNull(); // x 가 NaN
    expect(parseCameraParam('0.5,0.5')).toBeNull(); // ratio 결측 → Number(undefined)=NaN
  });

  it('빈 좌표 토큰은 0 으로 강제(JS Number("")===0) — y=0 은 유효 좌표', () => {
    expect(parseCameraParam('0.5,,1')).toEqual({ x: 0.5, y: 0, ratio: 1 });
  });

  it('ratio 0/음수 → null (카메라 무한 줌/반전 방지, 공유 URL 안전)', () => {
    expect(parseCameraParam('0.5,0.5,0')).toBeNull();
    expect(parseCameraParam('0.5,0.5,-2')).toBeNull();
  });

  it('x/y 는 음수여도 허용 (카메라 좌표는 음수 가능), ratio 만 양수 강제', () => {
    expect(parseCameraParam('-0.3,-1.2,0.8')).toEqual({
      x: -0.3,
      y: -1.2,
      ratio: 0.8,
    });
  });
});
