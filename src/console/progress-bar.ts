import {ProgressBarTransport} from './progress-bar-transport.js';
import {createLogger} from './logger.js';
import {optionsCache} from '../options/options-cache.js';

export class ProgressBar {
  private total = 0;
  private current = 0;
  isActive: boolean = false;
  private logger = createLogger({
    transports: [
      new ProgressBarTransport({
        progressBar: this,
      }),
    ],
  });

  constructor(private barLength = 50) {
  }

  start(total: number): void {
    this.total = total;
    this.current = 0;
    this.isActive = true;
    this.render();
  }

  update(value: number) {
    if (!this.isActive) throw new Error('No active progress bar');
    this.current = value;
    this.render();
  }

  stop(): void {
    if (!this.isActive) throw new Error('No active progress bar');
    this.clearLine();
    this.isActive = false;
  }

  getLogger() {
    return this.logger;
  }

  clearLine() {
    if (optionsCache.has('opt:ci')) {
      return;
    }
    if (!this.isActive) throw new Error('No active progress bar');
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
  }

  render() {
    if (!this.isActive) throw new Error('No active progress bar');
    if (optionsCache.has('opt:ci')) {
      return;
    }


    const percentage = Math.min(Math.floor((this.current / this.total) * 100), 100);
    const filled = Math.floor((this.barLength * this.current) / this.total);
    const empty = this.barLength - filled;

    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);
    const progressBar = `[${filledBar}${emptyBar}] ${percentage}% | ${this.current}/${this.total}`;

    this.clearLine();
    process.stdout.write(progressBar);
  }
}