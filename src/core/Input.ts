// Keyboard + gamepad input mapped to actions (data/config/controls.json).
// Presses are time-stamped with the audio clock so "on beat" judgement is exact.

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import type { ControlsConfig } from './types';

export type Action = keyof ControlsConfig;
const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'jump', 'shoot', 'parry', 'dash', 'pause', 'confirm'];

// Standard gamepad mapping
const PAD_BUTTONS: Partial<Record<Action, number[]>> = {
  jump: [0],
  dash: [1, 5],
  shoot: [2, 7],
  parry: [3],
  pause: [9],
  confirm: [0, 9],
  up: [12],
  down: [13],
  left: [14],
  right: [15],
};

export class Input {
  private keys = new Map<Action, Phaser.Input.Keyboard.Key[]>();
  private pressed = new Map<Action, number>(); // action -> ctx time of press (pending)
  private padPrev = new Map<Action, boolean>();
  private padDown = new Map<Action, boolean>();

  constructor(private scene: Phaser.Scene, controls: ControlsConfig) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    for (const action of ACTIONS) {
      const list: Phaser.Input.Keyboard.Key[] = [];
      for (const name of controls[action]) {
        const code = (Phaser.Input.Keyboard.KeyCodes as Record<string, number>)[name.toUpperCase()];
        if (code === undefined) {
          console.warn(`controls.json: unknown key "${name}" for ${action}`);
          continue;
        }
        const key = kb.addKey(code, true, false);
        key.on('down', () => this.pressed.set(action, AudioEngine.get().ctx.currentTime));
        list.push(key);
      }
      this.keys.set(action, list);
    }
  }

  /** Call once per frame before reading input. */
  update(): void {
    const pad = this.scene.input.gamepad?.total ? this.scene.input.gamepad.getPad(0) : null;
    for (const action of ACTIONS) {
      let down = false;
      if (pad) {
        for (const b of PAD_BUTTONS[action] ?? []) if (pad.buttons[b]?.pressed) down = true;
        const ax = pad.axes[0]?.getValue() ?? 0;
        const ay = pad.axes[1]?.getValue() ?? 0;
        if (action === 'left' && ax < -0.4) down = true;
        if (action === 'right' && ax > 0.4) down = true;
        if (action === 'up' && ay < -0.5) down = true;
        if (action === 'down' && ay > 0.5) down = true;
      }
      const prev = this.padPrev.get(action) ?? false;
      if (down && !prev) this.pressed.set(action, AudioEngine.get().ctx.currentTime);
      this.padPrev.set(action, down);
      this.padDown.set(action, down);
    }
  }

  isDown(action: Action): boolean {
    if (this.padDown.get(action)) return true;
    return (this.keys.get(action) ?? []).some((k) => k.isDown);
  }

  /** Returns the ctx time of the press if the action was pressed since last consumed, else null. */
  consume(action: Action): number | null {
    const t = this.pressed.get(action);
    if (t === undefined) return null;
    this.pressed.delete(action);
    return t;
  }

  clear(): void {
    this.pressed.clear();
  }
}
