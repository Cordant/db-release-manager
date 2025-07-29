import {GetSecretValueCommand, SecretsManagerClient, SecretsManagerClientConfig} from '@aws-sdk/client-secrets-manager';
import {fromIni} from '@aws-sdk/credential-providers';
import {optionsCache} from '../options/options-cache.js';

export class SecretsManager {
  private client: SecretsManagerClient;

  constructor(private profile?: string, private region?: string) {
    const clientConfig: SecretsManagerClientConfig = {};

    if (region) {
      clientConfig.region = region;
    } else if (optionsCache.has('opt:region')) {
      clientConfig.region = optionsCache.get('opt:region') as string;
    }

    if (profile) {
      clientConfig.credentials = fromIni({profile});
    } else if (optionsCache.has('opt:profile')) {
      clientConfig.credentials = fromIni({profile: optionsCache.get('opt:profile') as string});
    }


    this.client = new SecretsManagerClient(clientConfig);
  }

  /**
   * Get a secret from Secrets Manager
   * @param secretId The ID or ARN of the secret to retrieve
   * @returns The secret value or undefined if not found
   */
  async getSecret(secretId: string): Promise<string | undefined> {
    const command = new GetSecretValueCommand({
      SecretId: secretId,
    });

    const response = await this.client.send(command);
    return response.SecretString;
  }
}