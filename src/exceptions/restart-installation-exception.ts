export class RestartInstallationException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'RestartInstallationException';
  }
}