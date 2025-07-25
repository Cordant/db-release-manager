import {logger} from '../console/logger.js';


class ConfigManagerCache extends Map<string, string> {
  set(key: string, value: string): this {
    logger.verbose(`Caching config: ${key} = ${value}`);
    super.set(key, value);
    return this;
  }

  get(key: string): string | undefined {
    const value = super.get(key);
    logger.verbose(`Getting cached config: ${key} = ${value}`);
    return value;
  }
}

export const configManagerCache = new ConfigManagerCache();

configManagerCache.set('internal:config-path', './bam-config.yml');

export function setConfigPath(path: string) {
  configManagerCache.set('internal:config-path', path);
}