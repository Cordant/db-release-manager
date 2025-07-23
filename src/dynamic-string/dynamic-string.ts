import jp from 'jsonpath';
import {ConfigManager} from '../config/index.js';
import {dynamicStringCache, Expression} from './dynamic-string-cache.js';
import {optionsCache} from '../options/options-cache.js';
import {SecretsManager, SSM} from '../aws/index.js';
import {logger} from '../console/logger.js';


export class DynamicString<Self extends object> {
  /**
   * @description
   * Resolve a dynamic string, possible values are:
   *
   * SSM Parameters:
   * ${ssm:/path/to/parameter}
   * ${ssm(profile):/path/to/parameter}
   * ${ssm(profile, region):/path/to/parameter}
   * ${ssm:arn:aws:ssm:region:account_id:parameter/path/to/parameter}
   *
   * Secrets Manager:
   * ${secretsmanager:/path/to/secret}
   * ${secretsmanager(profile):/path/to/secret}
   * ${secretsmanager(profile, region):/path/to/secret}
   * ${secretsmanager:arn:aws:secretsmanager:region:account_id:secret:/path/to/secret}
   *
   * Current File: only at the bam-config.yml file
   * ${self:path.to.config}
   *
   * Environment Variable:
   * ${variable}
   * ${variable.name}
   *
   * CLI Options:
   * ${opt:stage}
   * ${opt:stage, default}
   *
   * Recursive:
   * ${ssm:/path/${self:stage}/parameter}
   *
   * ${set-ssm:'SELECT pk_id FROM table', /connect/${stage}/dev}
   */
  private static readonly DYNAMIC_STRING_EXPRESSION_REGEX = /\$\{([^{}]*(?:\$\{[^{}]*(?:\$\{[^{}]*\}[^{}]*)*\}[^{}]*)*)\}/g;
  private static readonly SSM_EXPRESSION_REGEX = /^ssm(?:\(\s*(?<profile>[\w-]+)(?:,\s*(?<region>[\w-]+))?\s*\))?:(?<value>.+)(?<jsonpath>\$\..)?$/;
  private static readonly SECRETS_MANAGER_EXPRESSION_REGEX = /^secretsmanager(?:\(\s*(?<profile>[\w-]+)(?:,\s*(?<region>[\w-]+))?\s*\))?:(?<value>.+)(?<jsonpath>\$\..)?$/;

  constructor(private self: Self = {} as Self) {
  }


  async resolve(value: string): Promise<string> {
    if (!value) return value;

    const matches = value.match(DynamicString.DYNAMIC_STRING_EXPRESSION_REGEX) ?? []; // Match multiple expressions ei. ${value}-${test} = ['${value}', '${test}']
    logger.silly(`Found ${matches.length} expressions in value: "${value}"`);
    for (const match of matches) {
      logger.silly(`Resolving expression: "${match}"`);
      const expressionWithDefault = await this.resolve(match.substring(2, match.length - 1)) as Expression;
      logger.silly(`Resolved expression: "${expressionWithDefault}"`);

      // Expression can have default values separated by comma ei. ${value, default} = value, default = ['value', 'default']
      const [expression, fallbackValue] = expressionWithDefault.split(',').map(x => x.trim()) as Expression[];
      logger.silly(`Resolved expression: "${expressionWithDefault}" with fallback value: "${fallbackValue}"`);
      if (dynamicStringCache.has(expression)) {
        logger.silly(`Expression "${expression}" is cached, skipping...`);
        value = value.replace(match, dynamicStringCache.get(expression)!);
        continue;
      }

      const resolved = await this.resolveExpression(expression, !!fallbackValue);
      logger.silly(`Resolved expression: "${expression}" to value: "${resolved}"`);
      if (resolved) {
        logger.silly(`Expression "${expression}" resolved to value: "${resolved}", caching...`);
        dynamicStringCache.set(expression, resolved);
        value = value.replace(match, resolved);
        continue;
      }

      if (fallbackValue) {
        logger.silly(`Expression "${expression}" resolved to fallback value: "${fallbackValue}"`);
        value = value.replace(match, fallbackValue);
        continue;
      }

      logger.warn(`Could not resolve expression: "${expressionWithDefault}" in value: "${value}", skipping...`);
    }

    return value;
  }

  private async resolveExpression(expression: Expression, hasDefault: boolean = false): Promise<string | undefined> {
    const ssmMatch = expression.match(DynamicString.SSM_EXPRESSION_REGEX);
    if (ssmMatch) {
      const {profile, region, value, jsonpath} = ssmMatch.groups!;
      logger.verbose(`Retrieving SSM Parameter "${value}"`);

      try {
        const ssm = new SSM(profile, region);
        const parameterValue = await ssm.getParameter(value);

        if (!parameterValue) {
          return undefined;
        }

        if (jsonpath) {
          const jsonValue = JSON.parse(parameterValue);
          const values = jp.query(jsonValue, jsonpath);
          return values[0] as string | undefined;
        }

        return parameterValue;
      } catch (error) {
        logger.warn(`Error retrieving SSM parameter: ${value}`, error);
        return undefined;
      }
    }

    const secretsManagerMatch = expression.match(DynamicString.SECRETS_MANAGER_EXPRESSION_REGEX);
    if (secretsManagerMatch) {
      const {profile, region, value, jsonpath} = secretsManagerMatch.groups!;
      logger.verbose(`Retrieving Secret "${value}"`);

      try {
        const secretsManager = new SecretsManager(profile, region);
        const secretValue = await secretsManager.getSecret(value);

        if (!secretValue) {
          return undefined;
        }

        if (jsonpath) {
          const jsonValue = JSON.parse(secretValue);
          const values = jp.query(jsonValue, jsonpath);
          return values[0] as string | undefined;
        }

        return secretValue;
      } catch (error) {
        logger.warn(`Error retrieving secret: ${value}`, error);
        return undefined;
      }
    }

    if (expression.startsWith('opt:')) {
      const option = expression.substring(4).trim();
      logger.verbose(`Retrieving CLI Option: ${option}`);
      return optionsCache.get(`opt:${option.trim()}` as Expression);
    }

    if (expression.startsWith('config:')) {
      const configPath = expression.substring(7).trim();
      logger.verbose(`Retrieving value "${configPath}" from config`);
      return new ConfigManager().getConfigFromPath(configPath);
    }

    if (expression.startsWith('self:')) {
      const selfPath = expression.substring(5).trim();
      logger.verbose(`Retrieving value "${selfPath}" from self`);
      const values = jp.query(this.self, `$.${selfPath}`);
      const value = values[0] as string | undefined;
      if (!value) {
        return undefined;
      }
      return this.resolve(value);
    }

    if (expression.startsWith('env:')) {
      const envPath = expression.substring(4).trim();
      logger.verbose(`Retrieving value "${envPath}" from environment`);
      return new ConfigManager().getEnvFromPath(envPath);
    }

    logger.verbose(`Retrieving value "${expression}" from environment`);
    return new ConfigManager().getEnvFromPath(expression.trim());
  }
}