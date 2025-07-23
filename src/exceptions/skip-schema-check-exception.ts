export class SkipSchemaCheckException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'SkipSchemaCheckException';
  }
}