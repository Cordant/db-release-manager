import {GetParameterCommand, SSMClient, SSMClientConfig} from '@aws-sdk/client-ssm';
import {fromIni} from '@aws-sdk/credential-providers';

export class SSM {
  private client: SSMClient;

  constructor(private profile?: string, private region?: string) {
    const clientConfig: SSMClientConfig = {};

    if (region) {
      clientConfig.region = region;
    }

    if (profile) {
      clientConfig.credentials = fromIni({profile});
    }

    this.client = new SSMClient(clientConfig);
  }

  /**
   * Get a parameter from SSM
   * @param parameterName The name of the parameter to retrieve
   * @returns The parameter value or undefined if not found
   */
  async getParameter(parameterName: string): Promise<string | undefined> {
    try {
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      });

      const response = await this.client.send(command);
      return response.Parameter?.Value;
    } catch (error) {
      console.warn(`Failed to retrieve SSM parameter: ${parameterName}`, error);
      return undefined;
    }
  }
}