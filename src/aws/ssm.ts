import {GetParameterCommand, SSMClient, SSMClientConfig} from '@aws-sdk/client-ssm';
import {fromIni} from '@aws-sdk/credential-providers';
import {optionsCache} from '../options/options-cache.js';

export class SSM {
  private client: SSMClient;

  constructor(private profile?: string, private region?: string) {
    const clientConfig: SSMClientConfig = {};

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

    this.client = new SSMClient(clientConfig);
  }

  /**
   * Get a parameter from SSM
   * @param parameterName The name of the parameter to retrieve
   * @returns The parameter value or undefined if not found
   */
  async getParameter(parameterName: string): Promise<string | undefined> {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    });

    const response = await this.client.send(command);
    return response.Parameter?.Value;
  }
}