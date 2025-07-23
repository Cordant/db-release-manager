# Create Version Command Requirements

## Overview
The `create-version` command is used to create a new database version by renaming the current development version to a versioned release. This command is a critical part of the database versioning workflow.

## Command Syntax
```
bam create-version [options]
```

## Options
- `--version, -v`: Specifies the version to create. If not provided, the user will be prompted to select from a list of possible next versions.

## Functionality Requirements

### 1. Version Selection
- The command must provide a list of possible next versions (patch, minor, major) based on the latest existing version.
- If no version exists yet, it should start with 0.0.0 and suggest 0.0.1, 0.1.0, and 1.0.0 as possible next versions.
- The user must be able to select a version from the command line using the `--version` option.
- If no version is provided via command line, the command must prompt the user to select from the list of possible next versions.

### 2. Validation
- The command must check if the 'current' folder exists before proceeding.
- The command should validate that the provided version is a valid semantic version.

### 3. Version File Updates
- The command must update references in the version.json file, changing paths from 'postgres/release/current' to 'postgres/release/{VERSION}'.
- The command must rename the 'current' directory to the new version directory.
- The command must add any new schema files from the release version.json to the schema version.json.
- The command must update the project's package.json version to match the new database version.

### 4. Error Handling
- The command must provide clear error messages if:
  - The 'current' folder does not exist
  - There are issues updating version.json
  - There are issues renaming the 'current' directory
  - There are issues updating schema/version.json
  - There are issues updating package.json

### 5. Feedback
- The command must provide clear feedback about:
  - The version being created
  - Updates to version.json
  - Renaming of the 'current' directory
  - Updates to schema/version.json
  - Updates to package.json
  - Successful completion of the version creation process

## Future Enhancements
- Check the schema folder to find if there are any changed files not listed in the `current/version.json` (as noted in the TODO comment).

## Dependencies
- semver: For semantic versioning operations
- fs/promises: For file system operations
- Paths: For resolving file paths
- VersionJsonManager: For managing version.json files
- PackageJsonManager: For managing package.json
