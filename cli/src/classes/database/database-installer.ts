import {DatabaseVersionFile} from '../../models/database-file.model';
import {FileUtils} from '../../utils/file.utils';
import {PostgresUtils} from '../../utils/postgres.utils';
import {RepositoryUtils} from '../../utils/repository.utils';
import {UiUtils} from '../../utils/ui.utils';
import {DatabaseHelper} from './database-helper';
import {ConnectionString} from 'connection-string';
import {SecretOptions, SecretsManager} from '../secrets/secrets-manager';

export class DatabaseInstaller {
  private static _origin = 'DatabaseInstaller';
  private static postgresUtils = new PostgresUtils();

  static async installDatabase(params: {
    applicationName: string;
    environment: string;
    version: string | null;
    parametersToOverride?: { [key: string]: string };
  }, uiUtils: UiUtils) {
    if (!params.environment) {
      uiUtils.warning({
        origin: DatabaseInstaller._origin,
        message: 'No environment provided, the installation will be ran for local',
      });
      params.environment = 'local';
    }
    await RepositoryUtils.checkOrGetApplicationName(params, 'database', uiUtils);
    await RepositoryUtils.readRepository({
      type: 'postgres',
    }, uiUtils);

    // get the db as object to get the params
    let databaseObject = await DatabaseHelper.getApplicationDatabaseObject(params.applicationName);
    // get the application and its versions
    let databaseData = await DatabaseHelper.getApplicationDatabaseFiles(params.applicationName);
    if (!databaseData || !databaseObject) {
      throw 'Invalid application name. Please run the "bam repo read" command in the desired folder beforehand.';
    }

    // await DatabaseRepositoryReader.readRepo(params.applicationName, databaseObject._properties.path, uiUtils);

    // get the application parameters
    if (params.parametersToOverride) {
      uiUtils.info({
        origin: DatabaseInstaller._origin,
        message: 'Overriding parameters temporarily with provided ones!',
      });
    }

    const tempParameters = await DatabaseHelper.getApplicationDatabaseParameters(params.applicationName);
    const fileParameters = {
      // ...tempParameters, // if we need the values from other environment we need to uncomment this
      [params.environment]: {
        ...tempParameters[params.environment],
        ...(params.parametersToOverride ?? {}),
      },
    };
    if (!fileParameters[params.environment]?.password_root || !fileParameters[params.environment]?.server) {
      while (!fileParameters[params.environment].password_root) {
        fileParameters[params.environment].password_root = await uiUtils.question({
          origin: DatabaseInstaller._origin,
          text: 'Please provide the root password',
        });
      }
      while (!fileParameters[params.environment].server) {
        fileParameters[params.environment].server = await uiUtils.question({
          origin: DatabaseInstaller._origin,
          text: 'Please provide the server',
        });
      }

      await DatabaseHelper.updateApplicationDatabaseParameters(params.applicationName, {
        [params.environment]: {
          ...tempParameters[params.environment],
          password_root: fileParameters[params.environment].password_root,
          server: fileParameters[params.environment].server,
        }
      });
    }

    // Handling variables from ssm or secretsmanager
    uiUtils.info({
      origin: DatabaseInstaller._origin,
      message: 'Handling secrets retrieval!',
    });
    const secretsManager = new SecretsManager();
    const transformerRegex = new RegExp(/^(\s+)?(?<service>ssm|secretsmanager)(\((\s+)?(?<profile>[A-z0-9_-]+)(\s+)?(,(\s+)?(?<region>[A-z0-9_-]+)?(\s+)?)?\)(\s+)?)?:(\s+)?(?<parameter>(.+(?=::)|.+))(\s+)?(::(?<jsonPath>.*))?/i);
    for (let [key, value] of Object.entries(fileParameters[params.environment])) {
      const matches = value.match(transformerRegex);
      if (matches) {
        const {service, profile, region, parameter, jsonPath} = matches?.groups ?? {};
        if (!service || !parameter) {
          throw new Error('Syntax error for secret variable!');
        }

        fileParameters[params.environment][key] = await secretsManager.getSecret(value, {
          service,
          profile,
          region,
          parameter,
          jsonPath,
        });
      }
    }

    // we get the database objects again after we read the repo
    // get the db as object to get the params
    databaseObject = await DatabaseHelper.getApplicationDatabaseObject(params.applicationName);
    // get the application and its versions
    databaseData = await DatabaseHelper.getApplicationDatabaseFiles(params.applicationName);

    let versionsToInstall: DatabaseVersionFile[] = [];
    if (params.version) {
      const databaseVersion = databaseData.find(x => x.versionName === params.version);
      if (databaseVersion) {
        versionsToInstall.push(databaseVersion);
      }
    } else if (['dev', 'demo', 'prod'].includes(params.environment)) {
      const confirmed = await uiUtils.choices({
        message: 'You are probably about to drop and recreate the database you are working with. Is it something you are ok about ?',
        choices: [
          'Yes',
          'Wait...',
        ],
        title: 'check',
      });
      if (confirmed['check'] === 'Yes') {
        const confirmed = await uiUtils.choices({
          message: 'You really sure ?',
          choices: [
            'Yes',
            'No',
          ],
          title: 'check2',
        });
        if (confirmed['check2'] === 'Yes') {
          versionsToInstall = databaseData;
        } else {
          throw 'ok';
        }
      } else {
        throw 'ok';
      }
    } else {
      versionsToInstall = databaseData;
    }

    if (!versionsToInstall[0]) {
      throw 'Invalid version name. Please run the "bam repo read" again if this version is missing.';
    }

    let paramsPerFile: {
      [fileName: string]: {
        paramName: string;
        value: string;
      }[];
    } = {};
    if (databaseObject && databaseObject._parameters) {

      for (let i = 0; i < Object.keys(databaseObject._parameters).length; i++) {
        const parameterName = Object.keys(databaseObject._parameters)[i];
        for (let j = 0; j < databaseObject._parameters[parameterName].length; j++) {
          const fileName = databaseObject._parameters[parameterName][j];
          if (!paramsPerFile[fileName]) {
            paramsPerFile[fileName] = [];
          }
          let parameterValue = '';
          if (fileParameters && fileParameters[params.environment]) {
            parameterValue = fileParameters[params.environment][parameterName];
          }
          paramsPerFile[fileName].push({
            paramName: parameterName,
            value: parameterValue,
          });
        }
      }
    }
    // todo check we have all the params
    // todo check we have the root password
    uiUtils.info({origin: DatabaseInstaller._origin, message: `Found ${versionsToInstall.length} versions to install`});
    let carryOn = true;
    versionsToInstall.sort((a, b) => {
      if (a.versionName === 'current') {
        return 1;
      } else if (b.versionName === 'current') {
        return -1;
      }
      const countA = a.versionName.split('.').reverse().reduce((agg, x, i) => agg + +x * Math.pow(100, i), 0);
      const countB = b.versionName.split('.').reverse().reduce((agg, x, i) => agg + +x * Math.pow(100, i), 0);
      return countA - countB;
    });
    try {
      for (let i = 0; i < versionsToInstall.length && carryOn; i++) {
        const version = versionsToInstall[i];
        for (let j = 0; j < version.versions.length && carryOn; j++) {
          uiUtils.info({
            origin: DatabaseInstaller._origin,
            message: `Installing ${params.applicationName} ${version.versionName}${version.versions.length > 1 ? ` (${j + 1} of ${version.versions.length})` : ''}`,
          });
          const subVersion = version.versions[j];
          if (subVersion.databaseToUse) {
            const connectionString = new ConnectionString(`postgres://${fileParameters[params.environment].server || 'localhost'}:5432`);
            connectionString.setDefaults({
              user: 'root',
              password: fileParameters[params.environment].password_root,
              path: [DatabaseInstaller.replaceParameters(subVersion.databaseToUse, fileParameters[params.environment])],
            });
            DatabaseInstaller.postgresUtils.setConnectionString(connectionString.toString(), uiUtils);
          } else {
            const connectionString = new ConnectionString(`postgres://${fileParameters[params.environment].server || 'localhost'}:5432`);
            connectionString.setDefaults({
              user: 'root',
              password: fileParameters[params.environment].password_root,
              path: [`${params.environment}_${databaseObject._properties.dbName}`],
            });
            DatabaseInstaller.postgresUtils.setConnectionString(connectionString.toString(), uiUtils);
          }
          uiUtils.startProgress({
            length: subVersion.files.length,
            start: 0,
            title: `${params.applicationName} - ${version.versionName}`,
          });
          for (let k = 0; k < subVersion.files.length && carryOn; k++) {
            const file = subVersion.files[k];
            let fileString = await FileUtils.readFile(file.fileName);
            if (paramsPerFile[file.fileName]) {
              for (let l = 0; l < paramsPerFile[file.fileName].length; l++) {
                const parameter = paramsPerFile[file.fileName][l];
                if (!parameter.value) {
                  // Only replace if value for parameter was provided
                  continue;
                }

                const paramRegex = new RegExp(`\\$\{${parameter.paramName}}`, 'g');
                fileString = fileString.replace(paramRegex, parameter.value);
              }
            }
            try {
              if (!fileString) {
                uiUtils.warning({
                  origin: DatabaseInstaller._origin,
                  message: `File "${file.fileName}" is empty - ignoring`,
                });
              } else {
                await DatabaseInstaller.postgresUtils.execute(fileString);
              }

            } catch (error) {
              uiUtils.stoprProgress();
              uiUtils.error({origin: DatabaseInstaller._origin, message: fileString});
              uiUtils.error({origin: DatabaseInstaller._origin, message: `Error on file ${file.fileName}`});
              FileUtils.openFileInFileEditor(file.fileName);
              let text = 'There has been an issue with this file.\n';
              text += 'Press "Enter" to retry this file\n';
              text += 'Use "r" to restart the whole installation\n';
              text += 'Use "s" to stop\n';
              console.log(error);
              const response = await uiUtils.question({
                origin: DatabaseInstaller._origin,
                text: text,
              });
              switch (response.toLowerCase()) {
                case 'r':
                  carryOn = false;
                  await DatabaseInstaller.installDatabase(params, uiUtils);
                  break;
                case '':
                  k = k - 1;
                  uiUtils.startProgress({
                    length: subVersion.files.length,
                    start: k + 1,
                    title: `${params.applicationName} - ${version.versionName}`,
                  });
                  break;
                case 's':
                default:
                  carryOn = false;
                  break;
              }
            }
            uiUtils.progress(k + 1, subVersion.files[k + 1]?.fileName);
          }
          uiUtils.stoprProgress();
        }
      }
    } catch (error: any) {
      console.log(error);
      uiUtils.error({origin: DatabaseInstaller._origin, message: error.toString()});
      DatabaseInstaller.postgresUtils.endAllConnections();
      process.exit(1);
    } finally {
      DatabaseInstaller.postgresUtils.endAllConnections();
    }
  }

  static replaceParameters(value: string, parameters: { [key: string]: string }) {
    let temp = value;
    for (let [key, parameter] of Object.entries(parameters)) {
      if (!parameter) {
        continue;
      }

      const regex = new RegExp(`\\$\{${key}}`, 'gi');
      temp = temp.replace(regex, parameter);
    }
    console.log(temp);
    return temp;
  }
}
