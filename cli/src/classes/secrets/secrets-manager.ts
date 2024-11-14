import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import {GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {fromIni} from '@aws-sdk/credential-providers';
import {SecretsManagerClient} from '@aws-sdk/client-secrets-manager';
import jp from 'jsonpath';

export interface SecretOptions {
  service: 'ssm' | 'secretsmanager' | string;
  parameter: string;
  region?: string | undefined;
  profile?: string | undefined;
  jsonPath?: string | undefined;
}

export class SecretsManager {
  secrets: { [identifier: string]: SecretOptions & { value: string } } = {};

  ssmClients: { [profile: string]: SSMClient; } = {default: new SSMClient({})};
  secretsManagerClients: { [profile: string]: SecretsManagerClient; } = {default: new SecretsManagerClient({})};

  async getSecret(identifier: string, options: SecretOptions) {
    switch (options.service) {
      case 'ssm':
        if (this.secrets[identifier]) {
          return this.secrets[identifier].value;
        }

        const parameter = await this.getSSMParameter(options.parameter, options.profile, options.region);
        let parameterValue = parameter;
        if (options.jsonPath) {
          parameterValue = jp.query(JSON.parse(parameter), options.jsonPath)[0];
        }
        this.secrets = {
          ...this.secrets,
          [identifier]: {...options, value: parameterValue},
        };
        return this.secrets[identifier].value;
      case 'secretsmanager':
        if (this.secrets[identifier]) {
          return this.secrets[identifier].value;
        }
        const secret = await this.getSecretsManagerParameter(options.parameter, options.profile, options.region)
        let secretValue = secret;
        if (options.jsonPath) {
          secretValue = jp.query(JSON.parse(secret), options.jsonPath)[0];
        }
        this.secrets = {
          ...this.secrets,
          [identifier]: {...options, value: secretValue},
        };
        return this.secrets[identifier].value;
      default:
        throw new Error('Unknown secrets service');
    }
  }

  async getSSMParameter(parameter: string, profile: string = 'default', region?: string) {
    if (!this.ssmClients[profile]) {
      // if profile is default then the SSMClient will already exist from the initialization
      // so we assume anything at this point had a profile passed to it
      this.ssmClients[profile] = new SSMClient({
        region: region,
        credentials: fromIni({profile}),
      });
    }


    const ssmClient = this.ssmClients[profile];
    const command = new GetParameterCommand({
      Name: parameter,
      WithDecryption: true,
    });
    const response = await ssmClient.send(command);
    if (!response?.Parameter?.Value) {
      throw new Error('Parameter not found');
    }

    return response.Parameter.Value;
  }

  async getSecretsManagerParameter(parameter: string, profile: string = 'default', region?: string) {
    if (!this.secretsManagerClients[profile]) {
      // if profile is default then the SSMClient will already exist from the initialization
      // so we assume anything at this point had a profile passed to it
      this.secretsManagerClients[profile] = new SecretsManagerClient({
        region: region,
        credentials: fromIni({profile}),
      });
    }

    const secretsManagerClient = this.secretsManagerClients[profile];
    const command = new GetSecretValueCommand({
      SecretId: parameter,
    });
    const response = await secretsManagerClient.send(command);
    if (!response.SecretString) {
      throw new Error('Parameter not found');
    }
    return response.SecretString;
  }
}