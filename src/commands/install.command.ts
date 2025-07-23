import {PackageJsonManager} from '../package-json/index.js';
import {ReleaseManager} from '../release/index.js';
import {VersionJsonManager} from '../version-json/index.js';
import {Paths} from '../paths.js';
import {logger} from '../console/logger.js';
import semver from 'semver';
import {DynamicString} from '../dynamic-string/index.js';
import { Database } from '../database/database.js';

export type InstallOptions = {
  ci: boolean;
  stage: string;
  client: string;
  version: string | undefined;
}

/**
 * @description
 * The `install` command does the following:
 * 1. Installs a specific version if provided
 * 2. In CI mode, installs all versions between current and latest
 * 3. Validates stage and clients
 * 4. Applies the selected version(s) to the database
 */
export async function installCommand(options: InstallOptions) {

  if (options.version === 'current') {
    await new VersionJsonManager(Paths.current('version.json').asAbsolute()).install(options.version);
    return;
  }

  if (options.version === 'schema') {
    await new VersionJsonManager(Paths.schema('version.json').asAbsolute()).install('schema');
    return;
  }

  if (options.ci) {
    const latestVersion = new PackageJsonManager().getVersion();

    // Get last installed version
    const versionJson = new VersionJsonManager(Paths.release(latestVersion.format(), 'version.json').asAbsolute()).getVersionJson()

    // There are multiple options that allow for multiple database installation in a version.json, so we get the latest for all versions first
    // Then we sort them and take the last one
    const installedVersions: semver.SemVer[] = [];
    for (const versionJsonOption of versionJson) {
      const databaseToUse = await new DynamicString().resolve(versionJsonOption.databaseToUse);
      const lastInstalledVersion = await Database.getLastInstalledVersion(databaseToUse, latestVersion);
      installedVersions.push(lastInstalledVersion);
    }
    const lastInstalledVersion = semver.sort(installedVersions).pop() ?? new semver.SemVer(latestVersion);

    const versions = await new ReleaseManager().getVersionsBetween(lastInstalledVersion, latestVersion);
    for (const version of versions) {
      await new VersionJsonManager(Paths.release(version.format(), 'version.json').asAbsolute()).install(version.format());
    }
  }


  // Get versions to release
  const versionsToRelease = await getVersionsToRelease(options);

  logger.info(`Installing version(s) "${versionsToRelease.join('", "')}" to client "${options.client}" for stage "${options.stage}"`);

  for (const version of versionsToRelease) {
    logger.verbose(`Installing version ${version}...`);
    const getVersionJsonManager = () => {
      if (version === 'current') {
        return new VersionJsonManager(Paths.current('version.json').asAbsolute());
      }

      if (version === 'schema') {
        return new VersionJsonManager(Paths.schema('version.json').asAbsolute());
      }

      return new VersionJsonManager(Paths.release(version, 'version.json').asAbsolute());
    }

    const versionJsonManager = getVersionJsonManager();
    await versionJsonManager.install(version);

    logger.info(`Successfully installed version ${version}`);
  }

  logger.info('Installation completed successfully.');
}

async function getVersionsToRelease(options: InstallOptions) {
  if (options.version) {
    if (options.version === 'current') {
      return ['current'];
    }

    if (options.version === 'schema') {
      return ['schema'];
    }

    // Verify that the version exists
    const allVersions = await new ReleaseManager().getAllVersions();
    const versionExists = allVersions.some(v => v.compare(new semver.SemVer(options.version!)) === 0);

    if (!versionExists) {
      throw new Error(`Version ${options.version} does not exist.`);
    }

    return [options.version!];
  }

  if (options.ci) {
    const currentVersion = new PackageJsonManager().getVersion();
    const versions = await new ReleaseManager().getVersionsBetween(currentVersion);
    return versions.map(v => v.format());
  }

  throw new Error('No version provided, or ci flag is not set.');
}
