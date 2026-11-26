// Fire-and-forget cartoon sound effects (played "now" on the sfx bus).

import { AudioEngine } from './AudioEngine';
import * as S from './Synth';

export type SfxName =
  | 'jump' | 'jumpBeat' | 'land' | 'dash' | 'hit' | 'onBeat' | 'whistle' | 'crash' | 'bigCrash'
  | 'pianoCrash' | 'keyLo' | 'keyMid' | 'keyHi' | 'hop' | 'boing' | 'pop' | 'death' | 'victory' | 'rewind' | 'click' | 'select' | 'fall'
  | 'bell' | 'cuckoo' | 'punch' | 'tick' | 'stamp';

export function sfx(name: SfxName, delay = 0): void {
  const e = AudioEngine.get();
  const t = e.ctx.currentTime + delay;
  const d = e.sfx;
  switch (name) {
    case 'jump': S.slideWhistle(d, t, true, 0.16); break;
    case 'jumpBeat': S.slideWhistle(d, t, true, 0.2); S.ding(d, t, 91); break;
    case 'land': S.woodblock(d, t, 55); break;
    case 'dash': S.whoosh(d, t); break;
    case 'hit': S.bonk(d, t); break;
    case 'onBeat': S.ding(d, t, 96); break;
    case 'whistle': S.steamWhistle(d, t, 0.45); break;
    case 'crash': S.crash(d, t, 1); break;
    case 'bigCrash': S.crash(d, t, 2); S.crash(d, t + 0.12, 1.4); break;
    case 'pianoCrash': S.pianoCrash(d, t); break;
    // the funeral march on the piano's keys: low, sombre notes with a thump of the hammer
    case 'keyLo': S.ding(d, t, 46); S.ding(d, t, 53); S.woodblock(d, t, 40); break;
    case 'keyMid': S.ding(d, t, 49); S.ding(d, t, 56); S.woodblock(d, t, 42); break;
    case 'keyHi': S.ding(d, t, 53); S.ding(d, t, 58); S.woodblock(d, t, 44); break;
    case 'hop': S.woodblock(d, t, 72 + Math.floor(Math.random() * 5)); break;
    case 'boing': S.boing(d, t); break;
    case 'pop': S.pop(d, t); break;
    case 'death': S.sadTrombone(d, t); break;
    case 'victory': S.fanfare(d, t); break;
    case 'rewind': S.tapeRewind(d, t, 1.1); break;
    case 'click': S.projectorClick(d, t); break;
    case 'select': S.woodblock(d, t, 79); S.ding(d, t + 0.02, 100); break;
    case 'fall': S.slideWhistle(d, t, false, 0.7); break;
    case 'bell': S.ding(d, t, 98); S.ding(d, t + 0.09, 98); break;
    case 'cuckoo': S.ding(d, t, 88); S.ding(d, t + 0.18, 84); break;
    case 'punch': S.crash(d, t, 0.6); S.woodblock(d, t, 50); break;
    case 'tick': S.woodblock(d, t, 86); break;
    case 'stamp': S.bonk(d, t); S.woodblock(d, t + 0.03, 60); break;
  }
}
