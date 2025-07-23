# Install Command Requirements

## Overview
The `installCommand` command is used to installCommand or apply database versions. It can installCommand a specific version or all versions between the current version and the latest version in a CI environment.

## Command Syntax
```
bam installCommand [options]
```

## Options
- `--ci`: Optional. Indicates that the command is running in a Continuous Integration environment. In this mode, it will installCommand all versions between the current version (from package.json) and the latest version.
- `--version, -v`: Optional. Specifies a specific version to installCommand. If not provided and `--ci` is not set, an error will be thrown.
- `--stage, -s`: Required. Specifies which stage to release the database to.
- `--clients, -c`: Required. A list of comma-separated clients to release the database to.

## Functionality Requirements

### Version Selection
- If a specific version is provided via the `--version` option, only that version will be installed.
- If the `--ci` flag is set, all versions between the current version (from package.json) and the latest version will be installed.
- If neither a specific version nor the `--ci` flag is provided, the command must throw an error.

### Version Retrieval
- The command must be able to retrieve all available versions from the release directory.
- The command must be able to get the current version from package.json.
- The command must be able to get all versions between two specified versions.

### Stage Retrieval
- The command must retrieve the stage from the bam-config.yml file.
- The command must be able to resolve the dynamic string ${opt:stage, default-value}, when retrieving the stage from bam-config.yml
- The command must use the default stage value if no stage is provided and a default is configured.
- The command must validate that the stage name follows the allowed format (alphanumeric characters and hyphens only).

### Installation Process
- The command must apply the selected version(s) to the database.
- The command must handle dependencies between versions.
- The command must ensure that versions are applied in the correct order.

### Error Handling
- The command must provide clear error messages if:
  - No version is provided and the `--ci` flag is not set
  - The specified version does not exist
  - There are issues retrieving versions
  - There are issues applying versions to the database

### Feedback
- The command must provide clear feedback about:
  - The version(s) being installed
  - The progress of the installation
  - Successful completion of the installation process

## Future Enhancements
- Add support for installing a range of versions specified by the user
- Add support for dry-run mode to show what would be installed without actually installing
- Add support for rolling back to a previous version if installation fails

## Dependencies
- semver: For semantic versioning operations
- fs/promises: For file system operations
- pg-promise: For PostgreSQL database operations
- Paths: For resolving file paths
- ReleaseManager: For managing and retrieving versions
- PackageJsonManager: For getting the current version from package.json