/** 현재 시각 공급자. 테스트에서 고정 시각으로 바꿔 끼운다. */
export const CLOCK = Symbol('CLOCK');
export type Clock = () => Date;

/** 실제 시스템 시각. 각 모듈의 기본 `CLOCK` 공급자로 쓴다. */
export const systemClock: Clock = () => new Date();
