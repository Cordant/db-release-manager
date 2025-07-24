import fs from 'node:fs';
import * as _ from 'lodash-es';
import {logger} from '../console/logger.js';
import {Database} from '../database/database.js';
import {DynamicString} from '../dynamic-string/index.js';
import {promptInitCommand} from '../commands/index.js';
import {RestartInstallationException} from '../exceptions/index.js';
import * as inquirer from '@inquirer/prompts';
import {optionsCache} from '../options/options-cache.js';
import {glob} from 'node:fs/promises';
import {FileUtils} from '../file.utils.js';
import path from 'path';

export interface VersionJsonOptions {
  databaseToUse: string;
  fileList: string[];
  removedFiles?: string[];
}

export type VersionJson = VersionJsonOptions[];

export class VersionJsonManager {
  private versionJson!: VersionJson;
  private originalVersionJson!: VersionJson;

  constructor(private versionJsonPath: string) {
    this.reload();
  }

  getVersionJson() {
    return this.versionJson;
  }

  save(path: string = this.versionJsonPath): void {
    fs.writeFileSync(path, JSON.stringify(this.versionJson, null, 2));
    logger.debug(`Version JSON file saved to ${path}`);
  }

  addFilesToSchemaFrom(releaseVersionJsonPath: string) {
    let totalAdded = 0;
    const versionJsonManager = new VersionJsonManager(releaseVersionJsonPath);
    versionJsonManager.versionJson.forEach((releaseOptions) => {
      const schemaOptions = this.versionJson.find((o) => o.databaseToUse === releaseOptions.databaseToUse);
      if (!schemaOptions) {
        const newReleaseOptions: VersionJsonOptions = _.cloneDeep(releaseOptions);
        newReleaseOptions.fileList = newReleaseOptions.fileList.filter((file) => file.startsWith('..//postgres/schema/'));
        this.versionJson.push(newReleaseOptions);
        totalAdded += newReleaseOptions.fileList.length;
        return;
      }


      releaseOptions.fileList.forEach((file) => {
        if (!file.startsWith('..//postgres/schema/')) {
          // File is a script or migration type script it
          return;
        }

        if (!schemaOptions.fileList.includes(file)) {
          const indexes = this.getLastIndexOfEachType(schemaOptions);
          logger.verbose(`Adding ${file} to "schema/version.json"`);
          // Add file to schemaOptions.fileList based on type
          const [type] = file.split('..//postgres/schema/')[1].split('/');
          const lastIndex = indexes.get(type);
          if (lastIndex === undefined) {
            // Add to end of list
            schemaOptions.fileList.push(file);
            totalAdded++;
            return;
          }
          // Insert in the last position of that type
          schemaOptions.fileList.splice(lastIndex + 1, 0, file);
        }
      });
    });
    logger.info(`Added ${totalAdded} files to "schema/version.json"`);
  }

  async install(version: string) {
    const dynamicString = new DynamicString();
    const versionJson = this.getVersionJson();
    for (const versionJsonOption of versionJson) {
      const databaseToUse = await dynamicString.resolve(versionJsonOption.databaseToUse);
      logger.info(`Selected database: ${databaseToUse}`);
      const database = new Database(databaseToUse);

      await database.connect().catch(async error => {
        logger.error(`Error connecting to database: ${error}`);
        if (error.code !== '3D000') {
          throw error;
        }

        const initialised = await promptInitCommand({database: databaseToUse});
        if (!initialised) {
          throw error;
        }

        if (!optionsCache.has('opt:ci') && version !== 'schema') {
          const response = await inquirer.confirm({
            message: `As the database "${databaseToUse}" was not previously initialised, and the version is not "schema".\nIt is likely that "schema" was not installed for this database.\nDo you wish to install "schema" instead of "${version}"?`,
            default: true,
          });
          if (!response) {
            logger.warn(`Installing "${version}" without "schema" installed.`);
            return;
          }
        }

        // We force the installation to be the schema, since the database didn't exist before.
        version = 'schema';
        logger.info(`Installing "schema" for database "${databaseToUse}"...`);
        return;
      });

      logger.info('Running files...');
      await database.installFiles(versionJsonOption.fileList, version).catch(async error => {
        await database.disconnect();
        if (error instanceof RestartInstallationException) {
          logger.info('Restarting installation...');
          this.reload();
          await this.install(version);
          return;
        }
        throw error;
      });

      if (versionJsonOption.removedFiles && versionJsonOption.removedFiles.length > 0) {
        logger.info('Updating files list table with removed files...');
        await database.removeFiles(versionJsonOption.removedFiles).catch(async error => {
          await database.disconnect();
          throw error;
        });
      }

      await database.disconnect();
    }
  }

  private getLastIndexOfEachType(options: VersionJsonOptions) {
    const types = new Map<string, number>();
    for (let i = 0; i < options.fileList.length; i++) {
      const file = options.fileList[i];
      const [type] = file.split('..//postgres/schema/')[1].split('/');
      types.set(type, i);
    }
    return types;
  }

  private reload() {
    this.originalVersionJson = JSON.parse(fs.readFileSync(this.versionJsonPath).toString());
    this.versionJson = _.cloneDeep(this.originalVersionJson);
  }

  async addFilesFromSchema(to: string) {
    logger.info(`Adding files from "schema" to "release/${to}"`);
    for (const releaseOptions of this.versionJson) {
      const filesToCopy = releaseOptions.fileList
        .filter((file) => file.startsWith('..//postgres/schema/')) // Filter only to include schema files
        .map((file) => file.replace('..//', './') // ..//postgres/schema/version.json to ./postgres/schema/version.json
          .replace('${config:client}', '*') // ./postgres/schema/11-clients/${config:client}/file.sql to ./postgres/schema/11-clients/*/file.sql
          .replace('${config:stage}', '*') // ./postgres/schema/11-clients/${config:client}/${config:stage}/file.sql to ./postgres/schema/11-clients/*/*/file.sql
        );
      for  (const fileToCopy of filesToCopy) {
        const files = glob(fileToCopy)
        for await (const file of files) {
          // Copy a file to the destination version
          const source = path.resolve('./' + file);
          const unresolvedDestination = file.replace('postgres\\schema\\', `postgres\\release\\${to.replace('/', '\\')}\\`)
          const destination = path.resolve(unresolvedDestination);
          await FileUtils.copyFile(source, destination)
          logger.verbose(`Copied "${source}" to "${destination}"`);
        }
      }
    }
    logger.info(`Added files from "schema" to "release/${to}"`);
  }
}
