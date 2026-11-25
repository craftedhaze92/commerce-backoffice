/** 현재 시각 공급자. 테스트에서 고정 시각으로 바꿔 끼운다. */
export const CLOCK = Symbol('CLOCK');
export type Clock = () => Date;
