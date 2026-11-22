// Shows JSON validation problems so they can be fixed without opening the console.

import Phaser from 'phaser';

export class ErrorScene extends Phaser.Scene {
  constructor() {
    super('Error');
  }

  create(data: { file: string; problems: string[] }): void {
    this.cameras.main.setBackgroundColor('#1a0d0d');
    this.add.text(40, 30, 'Oops! The reel is tangled.', { fontFamily: 'Georgia, serif', fontSize: '40px', color: '#ffd9c9' });
    this.add.text(40, 90, `Problem in ${data.file}:`, { fontFamily: 'Georgia, serif', fontSize: '24px', color: '#ffffff' });
    this.add.text(40, 135, data.problems.slice(0, 18).map((p) => `• ${p}`).join('\n'), {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#ffe9a8',
      wordWrap: { width: 1200 },
      lineSpacing: 6,
    });
    if (data.problems.length > 18) {
      this.add.text(40, 680, `...and ${data.problems.length - 18} more (see the browser console).`, { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' });
    }
    this.add.text(1240, 690, 'Fix the file and reload the page (F5)', { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#cccccc' }).setOrigin(1, 1);
    console.error(`[data] ${data.file}\n - ${data.problems.join('\n - ')}`);
  }
}
