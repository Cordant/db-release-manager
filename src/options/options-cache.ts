import {logger} from '../console/logger.js';

class OptionsCache extends Map<string, string> {
  set(key: string, value: string) {
    logger.verbose(`Caching option: ${key} = ${value}`);
    super.set(key, value);
    return this;
  }

  get(key: string): string | undefined {
    logger.verbose(`Getting cached option: ${key}`);
    return super.get(key);
  }
}

export const optionsCache = new OptionsCache();
