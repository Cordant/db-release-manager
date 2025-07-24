import PGPromise from 'pg-promise';
import {ConnectionString} from 'connection-string';
import {ConfigManager} from '../config/index.js';
import {databaseCache} from './database-cache.js';
import fs from 'node:fs/promises';
import * as inquirer from '@inquirer/prompts';
import {RestartInstallationException, StopInstallationException} from '../exceptions/index.js';
import path from 'path';
import {FileUtils} from '../file.utils.js';
import {IClient} from 'pg-promise/typescript/pg-subset.js';
import {ProgressBar} from '../console/progress-bar.js';
import {DynamicString} from '../dynamic-string/index.js';
import {optionsCache} from '../options/options-cache.js';
import {logger} from '../console/logger.js';
import {getSchemaFilesQuery, insertOrUpdateSchemaFileQuery, removeSchemaFileQuery, SchemaFile} from './queries.js';
import semver, {SemVer} from 'semver';
import {PackageJsonManager} from '../package-json/index.js';
import {promptInitCommand} from '../commands/index.js';

const pgPromise = PGPromise();

export interface SchemaComparison {
  changed: SchemaFile[];
  added: Omit<SchemaFile, 'pk_scf_id'>[];
  removed: SchemaFile[];
}

export class Database {
  database: PGPromise.IDatabase<{}> | null = null;
  connection: PGPromise.IConnected<{}, IClient> | null = null;
  progressBar = new ProgressBar();
  logger = this.progressBar.getLogger();
  dynamicString = new DynamicString();

  private readonly databaseName: string;
  private isDatabaseInitialised = false;

  constructor(database: string) {
    this.databaseName = database;
  }

  private async initialiseDatabase() {
    const configManager = new ConfigManager();
    const host = await configManager.getConfigFromPath('database.host');
    if (!host) {
      throw new Error('Database host is not defined, please set the property "database.host" in the bam-config file.');
    }
    const username = await configManager.getConfigFromPath('database.username');
    if (!username) {
      throw new Error('Database username is not defined, please set the property "database.username" in the bam-config file.');
    }
    const password = await configManager.getConfigFromPath('database.password');
    if (!password) {
      throw new Error('Database password is not defined, please set the property "database.password" in the bam-config file.');
    }
    const port = await configManager.getConfigFromPath('database.port');

    const connectionString = new ConnectionString(`postgres://${host}:${port ?? '5432'}`, {
      user: username,
      password,
      path: [this.databaseName],
    });
    const connStr = connectionString.toString();
    if (databaseCache.has(connStr)) {
      this.database = databaseCache.get(connStr)!;
    } else {
      this.database = pgPromise(connectionString.toString());
      databaseCache.set(connStr, this.database);
    }
    this.isDatabaseInitialised = true;
  }

  async connect() {
    this.logger.verbose(`Connecting to database ${this.databaseName}`);
    await this.initialiseDatabase();
    this.connection = await this.database!.connect();
    this.logger.verbose(`Connected to database ${this.databaseName}`);
    return this;
  }

  async installFiles(fileList: string[], version: string) {
    if (!this.isDatabaseInitialised) {
      throw new Error('Database is not initialised, please call the "Database.connect" method before calling "Database.installFiles"');
    }

    const configManager = new ConfigManager();

    this.progressBar.start(fileList.length);
    await this.database!.tx(async transaction => {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        this.progressBar.update(i);
        this.logger.verbose(`Installing ${file}`);


        let filePath = path.resolve(process.cwd(), file.split('..//')[1]);
        let fileExists = await FileUtils.exists(filePath);

        if (!fileExists) {
          if (filePath.includes('/11-clients/')) {
            filePath = filePath.replace(/\/11-clients\/[^/]+\//, `/11-clients/connect/`);
            fileExists = await FileUtils.exists(filePath);
            if (fileExists) {
              this.logger.verbose(`File "${file}" exists in "${filePath}"`);
            }
          }

          if (!fileExists) {
            this.logger.error(`File "${file}" does not exist`);
            throw new Error(`File "${file}" does not exist`);
          }
        }

        const hash = await FileUtils.getHash(filePath);

        const fileBuffer = await fs.readFile(filePath);
        const rawQuery = fileBuffer.toString();
        if (rawQuery.trim().length === 0) {
          this.logger.warn(`File ${file} is empty, skipping...`);
          this.progressBar.update(i);
          continue;
        }

        const query = await this.dynamicString.resolve(rawQuery);
        const appName = await configManager.getConfigFromPath('name');
        await this.installFile(transaction, appName!, file, query, hash, version);

        this.progressBar.update(i);
        this.logger.verbose(`Installed ${file}`);
      }
    }).catch(error => {
      if (this.progressBar.isActive) {
        this.progressBar.stop();
      }
      throw error;
    }).finally(() => {
      if (this.progressBar.isActive) {
        this.progressBar.stop();
      }
    });
  }

  private async installFile(transaction: PGPromise.ITask<{}>, appName: string, file: string, sql: string, hash: string, version: string) {
    await transaction.tx(async t => {
      try {
        const response = await t.any(sql);
        this.logger.silly(`Result of query: ${JSON.stringify(response, null, 2)}`);

        if (version === 'schema') {
          version = new PackageJsonManager().getVersion().format();
        }

        if (version !== 'current') {
          await t.none(insertOrUpdateSchemaFileQuery, [appName, file, version, hash]);
        }
      } catch (error: any) {
        this.progressBar.stop();
        this.logger.error(`Error executing file "${file}": ${error.toString()}`);

        if (!optionsCache.has('opt:ci')) {
          await FileUtils.openFileInFileEditor(path.resolve(process.cwd(), file.split('..//')[1]));

          const restart = await inquirer.confirm({
            message: `Do you want to retry the whole installation?`,
            default: true,
          });

          if (restart) {
            throw new RestartInstallationException(error);
          }
        }

        throw new StopInstallationException(error);
      }
    });
  }

  async execute(cb: (transaction: PGPromise.ITask<{}>) => Promise<void>): Promise<void> {
    if (!this.isDatabaseInitialised) {
      throw new Error('Database is not initialised, please call the "connect" method before calling "execute"');
    }
    await this.database!.tx(cb);
  }

  async disconnect() {
    this.logger.verbose(`Disconnecting from database "${this.databaseName}"`);
    if (this.connection) {
      await this.connection.done(true);
      this.connection = null;
      this.logger.verbose(`Disconnected from database "${this.databaseName}"`);
      return;
    }
    this.logger.verbose(`Database "${this.databaseName}" is not connected`);
  }

  async compareSchemas(localFileList: string[]) {
    if (!this.isDatabaseInitialised) {
      throw new Error('Database is not initialised, please call the "connect" method before calling "compareSchemas"');
    }
    const configManager = new ConfigManager();
    const appName = await configManager.getConfigFromPath('name');

    const remoteFileList: SchemaFile[] = await this.database!.any(getSchemaFilesQuery);
    logger.silly(`Installed schema: ${JSON.stringify(remoteFileList, null, 2)}`);

    const comparison: SchemaComparison = {
      changed: [],
      added: [],
      removed: [],
    };

    for (const localFile of localFileList) {
      const filePath = path.resolve(process.cwd(), localFile.split('..//')[1]);
      const hash = await FileUtils.getHash(filePath);
      const remoteFile = remoteFileList.find(f => f.scf_path === localFile);

      if (!remoteFile) {
        comparison.added.push({
          scf_app_name: appName!,
          scf_path: localFile,
          scf_file_hash: hash,
          scf_initially_installed_in: '',
          scf_last_installed_in: '',
          scf_hash_update_at: new Date(),
          modified_at: new Date(),
          created_at: new Date(),
        });
        continue;
      }

      if (remoteFile.scf_file_hash !== hash) {
        comparison.changed.push(remoteFile);
      }
    }

    comparison.removed = remoteFileList.filter(remoteFile => !localFileList.includes(remoteFile.scf_path));

    return comparison;
  }

  async removeFiles(removedFiles: string[]) {
    if (!this.isDatabaseInitialised) {
      throw new Error('Database is not initialised, please call the "connect" method before calling "removeFiles"');
    }
    const configManager = new ConfigManager();
    await this.database!.tx(async transaction => {
      for (const file of removedFiles) {
        logger.verbose(`Removing ${file}`);
        const appName = await configManager.getConfigFromPath('name');
        await transaction.none(removeSchemaFileQuery, [appName, file]);
      }
    });
  }

  async isBamInitialised() {
    if (!this.isDatabaseInitialised) {
      throw new Error('Database is not initialised, please call the "connect" method before calling "isBamConfigured"');
    }
    try {
      logger.verbose('Trying to open bam-config file');
      const configManager = new ConfigManager();
      if (!configManager) {
        return false;
      }

      logger.verbose('Checking if bam schema exists in database');
      const schema = await this.database!.one(`SELECT true as "hasSchema"
                                               FROM information_schema.schemata
                                               WHERE schema_name = 'bam'`);
      if (!(schema?.hasSchema ?? false)) {
        return false;
      }

      const table = await this.database!.one(`SELECT true as "hasTable"
                                              FROM information_schema.tables
                                              WHERE table_schema = 'bam'
                                                AND table_name = 'bamt_schema_files_scf'`);
      if (!(table?.hasTable ?? false)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async create() {
    if (this.databaseName === 'postgres') {
      throw new Error('Cannot create database "postgres"');
    }
    const postgres = new Database('postgres');
    await postgres.connect();

    const isInitialised = await postgres.isBamInitialised();
    if (!isInitialised) {
      const initialised = await promptInitCommand({database: 'postgres'});
      if (!initialised) {
        throw new Error('Database "postgres" is not configured for BAM, please configure it manually, by running the "bam init --database postgres" command.');
      }
    }

    await postgres.database!.none('CREATE DATABASE $1~', [this.databaseName]);
    await postgres.disconnect();
  }

  static async getLastInstalledVersion(databaseName: string, latestVersion: SemVer) {
    const appName = await new ConfigManager().getConfigFromPath('name');
    const db = new Database(databaseName);
    await db.connect();
    const versions = await db.database!.many<{
      installedVersion: string
    }>(`SELECT DISTINCT scf_last_installed_in as "installedVersion"
        FROM bam.bamt_schema_files_scf
        WHERE scf_app_name = $1`, [appName]);
    await db.disconnect();
    const installedVersions = versions.map(v => new SemVer(v.installedVersion));
    return semver.sort(installedVersions).pop() ?? new SemVer(latestVersion);
  }
}
