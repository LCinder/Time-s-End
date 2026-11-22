import Phaser from 'phaser';
import { FilmPipeline } from './fx/FilmPipeline';
import { BootScene } from './scenes/BootScene';
import { CalibrateScene } from './scenes/CalibrateScene';
import { ChaseScene } from './scenes/ChaseScene';
import { ErrorScene } from './scenes/ErrorScene';
import { PlatformScene } from './scenes/PlatformScene';
import { BijouScene } from './scenes/BijouScene';
import { IntertitleScene } from './scenes/IntertitleScene';
import { MinigameScene } from './scenes/MinigameScene';
import { OptionsScene, ProgrammeScene, ResumeScene, SlotScene } from './scenes/MenuScenes';
import { SplashScene } from './scenes/SplashScene';
import { TitleCardScene } from './scenes/TitleCardScene';
import { TitleScene } from './scenes/TitleScene';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0b0b0b',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  audio: { noAudio: true },
  input: { gamepad: true },
  pipeline: { FilmPipeline } as unknown as Phaser.Types.Core.PipelineConfig,
  scene: [BootScene, ErrorScene, SplashScene, TitleScene, TitleCardScene, ChaseScene, CalibrateScene, PlatformScene, BijouScene, IntertitleScene, MinigameScene, OptionsScene, ProgrammeScene, ResumeScene, SlotScene],
});

// handy for debugging from the console
(window as unknown as { game: Phaser.Game }).game = game;
