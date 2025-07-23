export class StopInstallationException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'StopInstallationException';
  }
}