import jp from 'jsonpath';
import {ConfigManager} from '../config/index.js';
import {dynamicStringCache, Expression} from './dynamic-string-cache.js';
import {optionsCache} from '../options/options-cache.js';
import {SecretsManager, SSM} from '../aws/index.js';
import {logger} from '../console/logger.js';
import {parse, ParsedExpression} from './parser/index.js';


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
  constructor(private self: Self = {} as Self) {
  }

  private buildRawValue(action: string, options: string[], operation: string, fallback?: string): string {
    let value = action;
    if (options.length > 0) {
      value += `(${options.join(',')})`;
    }
    if (operation) {
      value += `:${operation}`;
    }
    if (fallback) {
      value += `, ${fallback}`;
    }
    return value;
  }

  private async runAction(action: string, options: string[], operation: string, fallback?: string): Promise<string | undefined> {
    logger.verbose(`Running action: "${action}", options: "${options.join(',')}", operation: "${operation}", fallback: "${fallback}"`);
    const raw = this.buildRawValue(action, options, operation, fallback);

    if (dynamicStringCache.has(raw as Expression)) {
      return dynamicStringCache.get(raw as Expression);
    }

    switch (action) {
      case 'ssm': {
        const [profile, region] = options;
        const [value, jsonpath] = operation.split('$');
        logger.verbose(`Retrieving SSM Parameter "${value}"`);

        try {
          const ssm = new SSM(profile, region);
          let parameterValue = await ssm.getParameter(value);
          if (!parameterValue) {
            return undefined;
          }

          if (jsonpath) {
            const jsonValue = JSON.parse(parameterValue);
            const values = jp.query(jsonValue, `$${jsonpath}`);
            parameterValue = values[0] as string | undefined;
          }

          if (parameterValue) {
            dynamicStringCache.set(raw as Expression, parameterValue);
          }

          return parameterValue;
        } catch (error) {
          logger.warn(`Error retrieving SSM parameter: ${value}`, error);
          return undefined;
        }
      }
      case 'secretsmanager': {
        const [profile, region] = options;
        const [value, jsonpath] = operation.split('$');
        logger.verbose(`Retrieving Secret "${value}"`);

        try {
          const secretsManager = new SecretsManager(profile, region);
          let secretValue = await secretsManager.getSecret(value);

          if (!secretValue) {
            return undefined;
          }

          if (jsonpath) {
            const jsonValue = JSON.parse(secretValue);
            const values = jp.query(jsonValue, `$${jsonpath}`);
            secretValue = values[0] as string | undefined;
          }

          if (secretValue) {
            dynamicStringCache.set(raw as Expression, secretValue);
          }

          return secretValue;
        } catch (error) {
          logger.warn(`Error retrieving secret: ${value}`, error);
          return undefined;
        }
      }
      case 'opt': {
        logger.verbose(`Retrieving CLI Option: ${operation}`);
        return optionsCache.get(`opt:${operation}` as Expression);
      }
      case 'config': {
        logger.verbose(`Retrieving value "${operation}" from config`);
        return await new ConfigManager().getConfigFromPath(operation);
      }
      case 'env': {
        logger.verbose(`Retrieving value "${operation}" from environment`);
        return await new ConfigManager().getEnvFromPath(operation);
      }
      case 'self': {
        logger.verbose(`Retrieving value "${operation}" from self`);
        const values = jp.query(this.self, `$.${operation}`);
        let value =  values[0] as string | undefined;
        if (!value) {
          return undefined;
        }
        return this.resolve(value);
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async resolveExpression(expression: ParsedExpression, errorOnUnresolvedWarning = false): Promise<string | undefined> {
    for (const childExpression of expression.expressions) {
      const resolved = await this.resolveExpression(childExpression);
      if (!resolved) {
        return undefined;
      }

      // Update parent with the resolved value
      const raw = childExpression.raw;
      expression.options = expression.options.map(x => x.replaceAll(raw, resolved));
      expression.operation = expression.operation.replaceAll(raw, resolved);
      if (expression.fallback) {
        expression.fallback = expression.fallback.replaceAll(raw, resolved);
      }
    }

    logger.verbose(`Resolving expression: ${expression.raw}`);
    let resolved = await this.runAction(expression.action, expression.options, expression.operation, expression.fallback);
    if (!resolved) {
      if (expression.fallback) {
        logger.warn(`Unresolved expression: ${expression.raw}, using fallback: ${expression.fallback}`);
        return expression.fallback;
      }

      if (errorOnUnresolvedWarning) {
        throw new Error(`Unresolved expression: ${expression.raw}`);
      }

      logger.warn(`Unresolved expression: ${expression.raw}`);
      return undefined;
    }
    return resolved;
  }


  async resolve(value: string, errorOnUnresolvedWarning = false): Promise<string> {
    if (!value) return value;


    const result = parse(value);
    for (const expression of result.expressions) {
      const raw = expression.raw;
      const resolved = await this.resolveExpression(expression, errorOnUnresolvedWarning);
      if (!resolved) {
        continue;
      }

      value = value.replaceAll(raw, resolved);
    }

    return value;
  }
}