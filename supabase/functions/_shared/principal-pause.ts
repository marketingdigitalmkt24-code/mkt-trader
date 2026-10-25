import { TAKASHI_AFTER_226 } from './takashi-after-226.ts';
// All legacy principal strategies and daily reports remain paused.
// Only the prospectively claimed Takashi-after-2.26 sequence is enabled.
export const PRINCIPAL_IQ_PAUSED = true;
export function principalIQEnabled(strategy?: string): boolean { return strategy === TAKASHI_AFTER_226; }
export function telegramTradingEnabled(strategy?: string): boolean { return strategy === TAKASHI_AFTER_226; }