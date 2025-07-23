import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {ReleaseManager, versionManager} from './release/index.js';
import * as inquirer from '@inquirer/prompts';
import semver from 'semver';
import {createVersionCommand, initCommand, installCommand, updateHashCommand} from './commands/index.js';
import {ConfigManager} from './config/index.js';
import {dynamicStringCache, Expression} from './dynamic-string/index.js';
import {StopInstallationException} from './exceptions/index.js';
import {logger} from './console/logger.js';
import {optionsCache} from './options/options-cache.js';
import {FileUtils} from './file.utils.js';
import {Paths} from './paths.js';

export class CLI {
  async run() {
    const configManager = new ConfigManager();
    await yargs(hideBin(process.argv))
      .command(
        'init',
        'Initialise database',
        (yargs) => {
          return yargs
            .version(false)
            .showHelpOnFail(false)
            .option('database', {
              alias: 'db',
              describe: 'The name of the database to initialise',
              type: 'string',
              demandOption: true,
            });
        },
        async (args) => {
          await initCommand({database: args.database});
        },
      )
      .command(
        'create-version',
        'Create a database version',
        async (yargs) => {
          const nextPossibleVersions = await versionManager.getNextPossibleVersions();
          return yargs
            .version(false)
            .showHelpOnFail(false)
            .option('version', {
              alias: 'v',
              describe: 'The version to create',
              type: 'string',
              choices: nextPossibleVersions,
            });
        },
        async (args) => {
          let {version} = args;
          if (!version) {
            const nextPossibleVersions = await versionManager.getNextPossibleVersions();
            version = await inquirer.select<string>({
              message: 'Please selected the version to create',
              choices: nextPossibleVersions,
            });
          }
          logger.info(`Creating version '${version}'...`);
          await createVersionCommand({semver: new semver.SemVer(version)});
        },
      )
      .command(
        'install',
        'Install database versions',
        async (yargs) => {
          const defaultStage = await configManager.getConfigFromPath('stage');
          const client = await configManager.getConfigFromPath('client');
          const defaultClients = client ? [client] : [];

          return yargs
            .version(false)
            .showHelpOnFail(false)
            .option('ci', {
              describe: 'Run in CI mode, installing all versions between current and latest',
              type: 'boolean',
              default: false,
            })
            .option('version', {
              alias: 'v',
              describe: 'The specific version to install',
              type: 'string',
            })
            .option('stage', {
              alias: 's',
              describe: 'The stage to release the database to',
              type: 'string',
              default: defaultStage,
            })
            .option('clients', {
              alias: 'c',
              describe: 'A list of clients to release the database to',
              type: 'array',
              default: defaultClients,
            })
            .check(async (argv) => {
              if (argv.version) {
                const allVersions = await new ReleaseManager().getAllVersions();
                const allPossibleChoices = allVersions.map(x => x.format());
                allPossibleChoices.push('current');
                allPossibleChoices.push('schema');
                if (!allPossibleChoices.includes(argv.version)) {
                  throw new Error(`Version '${argv.version}' is not a valid version`);
                }
              }
              return true;
            });
        },
        async (args) => {
          const {ci, stage, clients} = args;

          if (!ci) {
            const choices = [];

            const currentExist = await FileUtils.exists(Paths.current('version.json').asAbsolute());
            if (currentExist) {
              choices.push('current');
            }

            const allVersions = await new ReleaseManager().getAllVersions();
            allVersions.sort((a, b) => b.compare(a));
            choices.push(...allVersions.map(x => x.format()));

            const schemaExist = await FileUtils.exists(Paths.schema('version.json').asAbsolute());
            if (schemaExist) {
              choices.push('schema');
            }

            args.version = await inquirer.select<string>({
              message: 'Please selected the version to install',
              choices,
            });
          }

          if (!this.isValidStage(stage, 'Stage must be provided. Use --stage or set the "stage" property in the bam-config file')) {
            return;
          }

          if (!this.isValidClientList(clients, 'A client must be provided. Use --clients or set the "client" property in the bam-config file')) {
            return;
          }

          try {
            for (const client of clients) {
              if (ci) {
                optionsCache.set('opt:ci', 'true');
              }
              optionsCache.set('opt:stage', stage);
              optionsCache.set('opt:client', client);

              dynamicStringCache.set('env:stage' as Expression, stage);
              dynamicStringCache.set('env:client' as Expression, client);

              dynamicStringCache.set('stage' as Expression, stage);
              dynamicStringCache.set('client' as Expression, client);

              await installCommand({
                ci,
                version: args.version,
                stage,
                client,
              });
            }
          } catch (error) {
            if (error instanceof StopInstallationException) {
              logger.info('Installation stopped.');
              throw error;
            }
            throw error;
          }
        },
      )
      .command(
        'update-hash',
        'Update file hashes in the database',
        (yargs) => {
          return yargs
            .version(false)
            .showHelpOnFail(false);
        },
        async () => {
          await updateHashCommand();
        },
      )
      .demandCommand()
      .completion()
      .scriptName('bam')
      .parseAsync();
  }


  isValidStage(stage: any, message?: string): stage is string {
    if (!stage) {
      if (message) {
        throw new Error(message);
      }
      return false;
    }

    if (typeof stage !== 'string') {
      logger.error('Stage must be a string');
      if (message) {
        throw new Error(message);
      }
      return false;
    }
    const regex = /^[A-z][A-z0-9-]+$/;

    if (!regex.test(stage)) {
      logger.error(`Stage must match the regex ${regex}`);
      if (message) {
        throw new Error(message);
      }
      return false;
    }

    return true;
  }

  isValidClient(client: any, message?: string): client is string {
    if (!client) return false;

    if (typeof client !== 'string') {
      logger.error('Client must be a string');
      if (message) {
        throw new Error(message);
      }
      return false;
    }

    const regex = /^[A-z][A-z0-9-]+$/;
    if (!regex.test(client)) {
      logger.error(`Client must match the regex ${regex}`);
      if (message) {
        throw new Error(message);
      }
      return false;
    }

    return true;
  }

  isValidClientList(clients: any, message?: string): clients is string[] {
    if (clients.length === 0) {
      if (message) {
        throw new Error(message);
      }
      return false;
    }

    for (const client of clients) {
      if (!this.isValidClient(client, message)) {
        return false;
      }
    }

    return true;
  }

}

export const cli = new CLI();
