import {logger} from '../console/logger.js';

export type Expression = string & { brand: 'Expression' }


class DynamicStringCache extends Map<Expression, string> {
  get(key: Expression): string | undefined {
    const value =  super.get(key);
    logger.verbose(`Getting cached dynamic string: ${key} = ${value}`);
    return value;
  }

  set(key: Expression, value: string): this {
    logger.verbose(`Caching dynamic string: ${key} = ${value}`);
    super.set(key, value);
    return this;
  }
}

export const dynamicStringCache = new DynamicStringCache();