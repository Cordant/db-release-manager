import fs from 'node:fs';
import jsonpath from 'jsonpath';
import {DynamicString} from '../dynamic-string/index.js';
import {configManagerCache} from './config-manager-cache.js';
import YAML from 'yaml';
import path from 'path';

export interface Config {
  name: string;
  stage: string;
  client: string;
  env?: {
    [key: string]: unknown;
  };
}


export class ConfigManager {
  readonly config: Config;

  constructor() {
    const configPath = configManagerCache.get('internal:config-path')!;
    try {
      this.config = YAML.parse(fs.readFileSync(path.resolve(process.cwd(), configPath)).toString());
    } catch (e) {
      if (e instanceof Error) {
        const {message, ...rest} = e;
        throw new Error(`Could not read config file at ${configPath}: ${e.message}`, rest);
      }
      throw new Error(`Could not read config file at ${configPath}: ${e}`);
    }

    if (!this.config.name) {
      throw new Error('Config file must have a "name" property');
    }
    if (!this.config.stage) {
      throw new Error('Config file must have a "stage" property');
    }
    if (!this.config.client) {
      throw new Error('Config file must have a "client" property');
    }
  }

  async getConfigFromPath(name: string, suppressUnresolvedWarning = false) {
    if (configManagerCache.has(`config:${name}`)) {
      return configManagerCache.get(`config:${name}`)!;
    }
    const value = jsonpath.query(this.config, `$.${name}`)[0] as string | undefined;
    if (!value) {
      return undefined;
    }

    const resolved = await new DynamicString(this.config).resolve(value, suppressUnresolvedWarning);
    configManagerCache.set(`config:${name}`, resolved);
    return resolved;
  }

  async getEnvFromPath(path: string) {
    if (configManagerCache.has(`env:${path}`)) {
      return configManagerCache.get(`env:${path}`)!;
    }

    const value = jsonpath.query(this.config.env ?? {}, `$.${path}`)[0] as string | undefined;
    if (!value) {
      return undefined;
    }

    const resolved = await new DynamicString(this.config).resolve(value);
    configManagerCache.set(`env:${path}`, resolved);
    return resolved;
  }
}
