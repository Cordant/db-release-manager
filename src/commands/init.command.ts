import {Database} from '../database/database.js';
import {logger} from '../console/logger.js';
import {createSchema, createSchemaFilesTableQuery} from '../database/queries.js';
import YAML from 'yaml';
import fs from 'node:fs/promises';
import path from 'path';
import {FileUtils} from '../file.utils.js';
import * as inquirer from '@inquirer/prompts';
import {Paths} from '../paths.js';
import {optionsCache} from '../options/options-cache.js';

interface InitOptions {
  database: string;
}

export async function initCommand(options: InitOptions) {
  const databaseName = options.database;
  logger.info(`Initializing database objects for "${databaseName}"...`);

  const configPath = path.resolve(process.cwd(), 'bam-config.yml');
  if (!await FileUtils.exists(configPath)) {
    logger.info(`Creating bam-config.yml file...`);

    const appName = await inquirer.input({
      message: 'Please enter the name of your application. This must be unique for each application within a shared database.',
    });
    const host = await inquirer.input({
      message: 'Please enter the database host. ei. localhost, ${ssm:/connect/${self:stage}/database/host, localhost}, etc.',
      default: 'localhost',
    });
    const username = await inquirer.input({
      message: 'Please enter the database username. ei. root, ${ssm:/connect/${self:stage}/database/root/username, root}, etc.',
      default: 'root',
    });
    const password = await inquirer.input({
      message: 'Please enter the database password. ei. MyS3cr3tP455w0rd, ${ssm:/connect/${self:stage}/database/password}, etc.',
      default: '${ssm:/connect/${self:stage}/database/password}',
    });

    const configFile = YAML.stringify({
      name: appName,
      stage: '${opt:stage, dev}',
      client: '${opt:client, connect}',
      database: {
        host,
        username,
        password,
      },
      env: {
        variable: 'some variable value here',
      },
    });
    await fs.writeFile(path.resolve(process.cwd(), 'bam-config.yml'), configFile);
    logger.info(`bam-config.yml file created successfully.`);
  } else {
    logger.info(`bam-config.yml file already exists. Using existing file to initialise database objects.`);
  }

  // Check if schema folder exists
  const schemaPath = Paths.schema();
  if (!await FileUtils.exists(schemaPath.asAbsolute())) {
    logger.info(`Creating schema folder...`);
    await FileUtils.createDirectories(schemaPath.asAbsolute());
    logger.info(`schema folder created successfully.`);
  }

  if (!await FileUtils.exists(Paths.schema('version.json').asAbsolute())) {
    logger.info(`Creating schema/version.json file...`);
    await FileUtils.createBlankVersionJsonFile(Paths.schema('version.json').asAbsolute());
    logger.info(`schema/version.json file created successfully.`);
  }

  if (!await FileUtils.exists(Paths.schema('release').asAbsolute())) {
    logger.info(`Creating schema/release folder...`);
    await FileUtils.createDirectories(Paths.schema('release').asAbsolute());
    logger.info(`schema/release folder created successfully.`);
  }

  logger.verbose(`Initializing database objects for "${databaseName}"...`);
  const database = new Database(databaseName);
  await database.connect().catch(async (e) => {
    if (e.message?.includes(`database "${databaseName}" does not exist`)) {
      if (databaseName === 'postgres') {
        throw new Error(`BAM is not able to create a database named "postgres". Please make sure that the default "postgres" database exists and is accessible.`);
      }

      if (!optionsCache.has('opt:ci')) {
        const confirmed = await inquirer.confirm({
          message: `Database "${databaseName}" does not exist, do you wish to create it?`,
          default: true,
        });
        if (!confirmed) {
          throw e;
        }
      }

      await database.create();
      logger.info(`Database "${databaseName}" created successfully.`);

      logger.info(`Resuming init command...`);
      return await database.connect();
    }

    logger.error(`Failed to connect to database: ${databaseName}`);
    throw e;
  });

  if (await database.isBamInitialised()) {
    logger.info(`Database objects already initialised for "${databaseName}"`);
    return;
  }

  await database.execute(async transaction => {
    logger.verbose(`Creating "bam" schema`);
    await transaction.none(createSchema);

    logger.verbose(`Creating table "bam_schema_files"`);
    await transaction.none(createSchemaFilesTableQuery);
  });

  await database.disconnect();
  logger.verbose(`Database objects initialised for "${databaseName}"`);

  logger.info(`Initialization completed successfully.`);
}

export async function promptInitCommand(options: InitOptions) {
  if (!optionsCache.has('opt:ci')) {
    const response = await inquirer.confirm({
      message: `Database objects for "${options.database}" have not been initialise. Do you wish to initialise them now, by running "bam init --database ${options.database}"?`,
      default: true,
    });
    if (!response) {
      return false;
    }
  }

  await initCommand(options);
  return true;
}
