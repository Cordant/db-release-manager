import {ProgressBar} from './progress-bar.js';
import winston from 'winston';

export class ProgressBarTransport extends winston.transports.Console {
  private progressBar: ProgressBar;
  constructor(opts: winston.transports.ConsoleTransportOptions & {progressBar: ProgressBar}) {
    super(opts);
    this.progressBar = opts.progressBar;
  }

  log(info: any, callback: () => void) {
    if (this.progressBar.isActive) {
      this.progressBar.clearLine();
      super.log!(info, callback);
      this.progressBar.render();
      return;
    }
    super.log!(info, callback);
  }
}
