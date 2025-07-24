import semver from 'semver';
import fs from 'node:fs/promises';
import {Paths} from '../paths.js';
import {VersionJsonManager, VersionJsonOptions} from '../version-json/index.js';
import {PackageJsonManager} from '../package-json/index.js';
import {logger} from '../console/logger.js';
import {FileUtils} from '../file.utils.js';
import {Database, SchemaComparison} from '../database/database.js';
import * as inquirer from '@inquirer/prompts';
import {SkipSchemaCheckException} from '../exceptions/skip-schema-check-exception.js';
import {DynamicString} from '../dynamic-string/index.js';
import {promptInitCommand} from './init.command.js';

export type CreateVersionOptions = {
  semver: semver.SemVer;
}

/**
 * @description
 * The `create-version` command does the following:
 * - Renames any references to `postgres/release/current` inside version.json to `postgres/release/{SEMVER}`
 * - Renames `postgres/release/current` directory to `postgres/release/{SEMVER}`
 * - Updates the version of the project package.json
 */
export async function createVersionCommand(options: CreateVersionOptions) {
  const version = options.semver.format();

  const currentVersionJsonPath = Paths.current('version.json');
  logger.verbose(`Checking if a version.json exist in the "current" folder at ${currentVersionJsonPath.asRelative()}`);
  if (!await FileUtils.exists(currentVersionJsonPath.asAbsolute())) {
    throw new Error(`A version.json does not exist in the "current" folder at ${currentVersionJsonPath.asRelative()}`);
  }
  logger.verbose(`A version.json exists at "${currentVersionJsonPath.asRelative()}"`);

  const schemaVersionJsonPath = Paths.schema('version.json');
  logger.verbose(`Checking if a schema.json exist in the "schema" folder at ${schemaVersionJsonPath.asRelative()}`);
  if (!await FileUtils.exists(schemaVersionJsonPath.asAbsolute())) {
    throw new Error(`A schema.json does not exist in the "schema" folder at ${schemaVersionJsonPath.asRelative()}`);
  }
  logger.verbose(`A schema.json exists at "${schemaVersionJsonPath.asRelative()}"`);

  try {
    const schemaVersionJson = new VersionJsonManager(schemaVersionJsonPath.asAbsolute()).getVersionJson();
    for (const schemaVersionJsonOption of schemaVersionJson) {
      const databaseToUse = await new DynamicString().resolve(schemaVersionJsonOption.databaseToUse);
      const database = new Database(databaseToUse);
      await database.connect().catch(async (e) => {
        if (e.message?.includes(`database "${databaseToUse}" does not exist`)) {
          const initialised = await promptInitCommand({database: databaseToUse});
          if (initialised) {
            logger.info(`Resuming create-version command...`);
            return await database.connect();
          }
        }

        logger.error(`Failed to connect to database: ${databaseToUse}`);
        const confirmed = await inquirer.confirm({
          message: 'Do you wish to continue creating a version without checking for changes in the schema?',
          default: false,
        });

        if (!confirmed) {
          throw e;
        }

        throw new SkipSchemaCheckException(e);
      });

      logger.info(`Checking schema for changes...`);
      const comparison = await database.compareSchemas(schemaVersionJsonOption.fileList);

      await database.disconnect();

      const currentVersionJsonManager = new VersionJsonManager(currentVersionJsonPath.asAbsolute());
      const currentVersionJson = currentVersionJsonManager.getVersionJson();
      const currentVersionJsonOption = currentVersionJson.find(v => v.databaseToUse === schemaVersionJsonOption.databaseToUse);
      if (hasChanges(comparison)) {
        let actionPerformed = false;
        if (currentVersionJsonOption) {
          comparison.added = comparison.added.filter(f => !currentVersionJsonOption.fileList.includes(f.scf_path));
          comparison.removed = comparison.removed.filter(f => !(currentVersionJsonOption.removedFiles ?? []).includes(f.scf_path));
          comparison.changed = comparison.changed.filter(f => !currentVersionJsonOption.fileList.includes(f.scf_path));
          actionPerformed = await actionOnComparisonResults(comparison, currentVersionJsonOption);
        } else {
          const versionJsonOptions: VersionJsonOptions = {
            databaseToUse: schemaVersionJsonOption.databaseToUse,
            fileList: [],
            removedFiles: [],
          };
          currentVersionJson.push(versionJsonOptions);
          actionPerformed = await actionOnComparisonResults(comparison, versionJsonOptions);
        }

        if (actionPerformed) {
          currentVersionJsonManager.save();

          const confirm = await inquirer.confirm({
            message: 'Changes detected, please review the changes then confirm. Do you wish to continue?',
            default: true,
          });
          if (!confirm) {
            throw new Error('Changes detected, please review the changes.');
          }
        }
      }
    }
  } catch (error) {
    if (!(error instanceof SkipSchemaCheckException)) {
      throw error;
    }

    logger.warn(`Skipping schema check due to error: ${error.message}`);
  }


  // Add any changed file to current/schema from schema/
  try {
    await new VersionJsonManager(currentVersionJsonPath.asAbsolute()).addFilesFromSchema('current/schema');
  } catch (error) {
    logger.error(`Error updating "${currentVersionJsonPath.asRelative()}": ${error}`);
  }

  // Rename the current directory to the new version
  try {
    await fs.rename(Paths.current().asAbsolute(), Paths.release(version).asAbsolute());
    logger.info(`Renamed "current" to "${version}"`);
  } catch (error) {
    logger.error(`Error renaming "current" to "${version}": ${error}`);
    throw error;
  }


  // Add any new files from current/version.json to schema/version.json
  try {
    const schemaVersionJsonManager = new VersionJsonManager(schemaVersionJsonPath.asAbsolute());
    schemaVersionJsonManager.addFilesToSchemaFrom(Paths.release(version, 'version.json').asAbsolute());
    schemaVersionJsonManager.save();
  } catch (error) {
    logger.error(`Error updating "${schemaVersionJsonPath.asRelative()}": ${error}`);
    throw error;
  }


  // Update package.json version
  const packageJsonPath = './package.json';
  try {
    const manager = new PackageJsonManager(packageJsonPath);
    manager.setVersion(version);
    manager.save();
    logger.info(`Updated version in ${packageJsonPath} to ${version}`);
  } catch (error) {
    console.error(`Error updating package.json: ${error}`);
    throw error;
  }

  logger.info(`Successfully created version ${version}`);
}

function hasChanges(comparison: SchemaComparison) {
  if (comparison.added.length === 0 && comparison.removed.length === 0 && comparison.changed.length === 0) {
    logger.info('No changes detected');
    return false;
  }
  return true;
}

async function actionOnComparisonResults(comparison: SchemaComparison, versionJsonOptions: VersionJsonOptions) {
  let actionPerformed = false;
  if (comparison.added.length > 0) {
    for (const file of comparison.added) {
      logger.info(`NEW - ${file.scf_path}`);
      const selection = await inquirer.select({
        message: 'Do you wish to add this file to the "fileList" in the version.json?',
        choices: ['Yes', 'No'],
        default: 'Yes',
        loop: false,
      });
      if (selection === 'Yes') {
        versionJsonOptions.fileList.push(file.scf_path);
        actionPerformed = true;
      }
    }
  }

  if (comparison.removed.length > 0) {
    for (const file of comparison.removed) {
      logger.info(`REMOVED - ${file.scf_path}`);
      const selection = await inquirer.select({
        message: 'Do you want to add this file to the "removedFiles" from the version.json?',
        choices: ['Yes', 'No'],
        default: 'Yes',
        loop: false,
      });
      if (selection === 'Yes') {
        if (!versionJsonOptions.removedFiles) {
          versionJsonOptions.removedFiles = [];
        }
        versionJsonOptions.removedFiles.push(file.scf_path);
        actionPerformed = true;
      }
    }
  }

  if (comparison.changed.length > 0) {
    for (const file of comparison.changed) {
      logger.info(`CHANGED - ${file.scf_path}`);
      const selection = await inquirer.select({
        message: 'Do you want to add this file to the "fileList" in the version.json?',
        choices: ['Yes', 'No'],
        default: 'Yes',
        loop: false,
      });
      if (selection === 'Yes') {
        versionJsonOptions.fileList.push(file.scf_path);
        actionPerformed = true;
      }
    }
  }

  return actionPerformed;
}
