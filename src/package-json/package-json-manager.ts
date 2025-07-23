import fs from 'node:fs';
import * as _ from 'lodash-es';
import semver from 'semver';

interface PackageJson {
  version: string;

  [key: string]: unknown;
}

export class PackageJsonManager {
  private originalPackageJson: PackageJson;
  private packageJson: PackageJson;

  constructor(private packageJsonPath: string = './package.json') {
    this.originalPackageJson = JSON.parse(fs.readFileSync(this.packageJsonPath).toString());
    this.packageJson = _.cloneDeep(this.originalPackageJson);
  }

  getVersion() {
    return new semver.SemVer(this.packageJson.version);
  }

  setVersion(version: string) {
    this.packageJson.version = version;
    return this;
  }

  save() {
    fs.writeFileSync(this.packageJsonPath, JSON.stringify(this.packageJson, null, 2));
    return this;
  }
}