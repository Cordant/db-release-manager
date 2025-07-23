import semver from 'semver';
import fs from 'node:fs/promises';
import {Paths} from '../paths.js';

export class ReleaseManager {
  private previousVersions: semver.SemVer[] = [];

  async getAllVersions() {
    if (this.previousVersions.length !== 0) {
      return this.previousVersions;
    }

    const allVersions = await fs.readdir(Paths.release().asAbsolute());
    for (let version of allVersions) {
      const stat = await fs.stat(Paths.release(version).asAbsolute());
      if (!stat.isDirectory()) {
        continue;
      }

      if (version === 'current') {
        continue;
      }

      if (!semver.valid(version)) {
        console.warn(`Folder '${version}' is not a valid version. please consider cleaning it up!`);
        continue;
      }

      this.previousVersions.push(new semver.SemVer(version));
    }

    if (this.previousVersions.length === 0) {
      return [];
    }

    // Sort so that the latest is the last on the list, ascending order
    this.previousVersions = semver.sort(this.previousVersions);

    return [...this.previousVersions];
  }

  async getNextPossibleVersions() {
    const previousVersions = await this.getAllVersions();
    if (previousVersions.length === 0) {
      previousVersions.push(new semver.SemVer('0.0.0'));
    }
    const latestVersion = previousVersions.pop()!;

    return [
      semver.inc(latestVersion, 'patch')!,
      semver.inc(latestVersion, 'minor')!,
      semver.inc(latestVersion, 'major')!,
    ];
  }

  /**
   * @description
   * Gets a list of a version between two versions
   * 
   * Given: 0.0.1, 1.0.0, 1.1.2, 2.1.0, 3.0.0, 4.0.0, 4.0.9, 5.0.0
   * When: from is 1.0.0 and to is 4.0.0
   * Then the result will be: 1.1.2, 2.1.0, 3.0.0, 4.0.0
   *
   * Given: 0.0.1, 1.0.0, 1.1.2, 2.1.0, 3.0.0, 4.0.0, 4.0.9, 5.0.0
   * When: from is 1.0.0 and to is 'latest'
   * Then the result will be: 1.1.2, 2.1.0, 3.0.0, 4.0.0, 4.0.9, 5.0.0
   *
   */
  async getVersionsBetween(from: semver.SemVer, to: semver.SemVer | 'latest' = 'latest') {
    const versions = await this.getAllVersions(); // Returns a semver sorted list
    if (to === 'latest') {
      to = versions[versions.length - 1];
    }

    const fromIndex = versions.indexOf(from);
    const toIndex = versions.indexOf(to);
    return versions.slice(fromIndex, toIndex + 1);
  }
}

export const versionManager = new ReleaseManager();
