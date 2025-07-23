import path from 'path';
import {Paths} from '../paths.js';
import {VersionJsonManager} from '../version-json/index.js';
import {Database} from '../database/database.js';
import {FileUtils} from '../file.utils.js';
import {logger} from '../console/logger.js';
import {updateHashQuery} from '../database/queries.js';
import {ConfigManager} from '../config/index.js';
import {DynamicString} from '../dynamic-string/index.js';

/**
 * @description
 * The `update-hash` command does the following:
 * 1. Reads the fileList from the schema version.json file
 * 2. Calculates the hash of each file
 * 3. Updates the database with the file hashes using the insertOrUpdateSchemaFile query
 */
export async function updateHashCommand() {
  logger.info('Updating file hashes in the database...');

  const configManager = new ConfigManager();
  const appName = await configManager.getConfigFromPath('name') as string;

  // Load the schema version.json file
  const schemaVersionJsonPath = Paths.schema('version.json').asAbsolute();
  const versionJsonManager = new VersionJsonManager(schemaVersionJsonPath);
  const versionJson = versionJsonManager.getVersionJson();

  // Process each database configuration in the version.json file
  for (const versionJsonOption of versionJson) {
    const databaseToUse = await new DynamicString().resolve(versionJsonOption.databaseToUse);
    logger.info(`Processing database: ${databaseToUse}`);

    // Connect to the database
    const database = new Database(databaseToUse);
    await database.connect().catch(error => {
      logger.error(`Error connecting to database: ${error}`);
      throw error;
    });

    // Process each file in the fileList
    logger.info(`Processing ${versionJsonOption.fileList.length} files...`);
    let updatedCount = 0;

    for (const file of versionJsonOption.fileList) {
      try {
        // Get the absolute path of the file
        const filePath = path.resolve(process.cwd(), file.split('..//')[1]);

        // Check if the file exists
        if (!await FileUtils.exists(filePath)) {
          logger.warn(`File ${file} does not exist, skipping...`);
          continue;
        }

        // Calculate the hash of the file
        const hash = await FileUtils.getHash(filePath);

        // Update the database with the file hash
        // We use an empty version string as we're just updating the hash, not installing a version
        await database.execute(async (transaction) => {
          // Use the existing insertOrUpdateSchemaFile query
          // The query takes 3 parameters: file path, version, and hash
          // Since we're just updating the hash, we'll use the existing version from the database
          const result = await transaction.result(updateHashQuery, [appName, file, hash]);
          updatedCount += result.rowCount;
        });

        logger.verbose(`Updated hash for ${file}`);
      } catch (error) {
        logger.error(`Error processing file ${file}: ${error}`);
      }
    }

    // Disconnect from the database
    await database.disconnect();
    logger.info(`Updated hashes for ${updatedCount} file(s) in database "${databaseToUse}"`);
  }

  logger.info('File hash update completed successfully.');
}
