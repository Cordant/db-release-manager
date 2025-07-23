# DB Release Manager (bam)

A database release management tool for versioning, installing, and managing database schemas across different environments and clients.

## Installation

```sh
# Install globally
npm install -g @connect/bam

# Or install locally in your project
npm install --save-dev @connect/bam
```

## How does it work

The DB Release Manager (also known as "bam" - Bertrand Application Manager) helps you manage database versions and releases. It provides commands for:

- Initializing databases
- Creating new database versions
- Installing database versions to specific environments and clients
- Updating file hashes in the database

## Usage

### Initialize a database

```sh
bam init --database <database-name>
```

### Create a new version

```sh
# Interactive mode
bam create-version

# Specify version directly
bam create-version --version <version>
```

### Install a version

```sh
# Interactive mode
bam install --stage <stage-name> --clients <client-name>
bam install --stage <stage-name> --clients <client-name-a> <client-name-b>

# CI mode (installs all versions between current and latest)
bam install --ci --stage <stage-name> --clients <client-name>

# Install a specific version
bam install --version <version> --stage <stage-name> --clients <client-name>
```

### Update file hashes

```sh
bam update-hash
```

## Dynamic String Feature

The DB Release Manager includes a powerful dynamic string feature that allows you to use variable expressions in your configuration files and commands. This enables flexible configuration across different environments and clients.

### Supported Expression Types

- **AWS SSM Parameters**:
  ```
  ${ssm:/path/to/parameter}
  ${ssm(profile):/path/to/parameter}
  ${ssm(profile, region):/path/to/parameter}
  ```
  > SSM values are cached in memory during execution, so it's only retrieved once per dynamic string.

- **AWS Secrets Manager**:
  ```
  ${secretsmanager:/path/to/secret}
  ${secretsmanager(profile):/path/to/secret}
  ${secretsmanager(profile, region):/path/to/secret}
  ```
  > Secrets' values are cached in memory during execution, so it's only retrieved once per dynamic string.

- **Self-references** (only in bam-config.yml):
  ```
  ${self:path.to.config}
  ```

- **Environment Variables**:
  ```
  ${variable}
  ${variable.name}
  ```

- **CLI Options** (only available for `install` command):
  ```
  ${opt:stage}
  ${opt:stage, default}
  ```

- **Configuration Values**:
  ```
  ${config:path.to.config}
  ```

### Use Cases

Dynamic strings can be used in various scenarios:

1. **Database Connection Information**: Store sensitive database credentials in AWS Secrets Manager and reference them in your configuration.
   ```yaml
   database:
     password: ${secretsmanager:/db/password}
   ```

2. **Environment-specific Configuration**: Use different values based on the deployment environment.
   ```yaml
   stage: ${opt:stage, dev}
   ```

3. **Client-specific Settings**: Apply different configurations for different clients.
   ```yaml
   client: ${opt:client, default-client}
   ```

4. **Recursive Expressions**: Combine multiple expressions for complex scenarios.
   ```yaml
   database:
     host: ${ssm:/path/${self:stage}/db/host}
   ```

5. **SQL Query Examples**: Use dynamic strings within SQL queries for flexible database operations.
   ```sql
   -- Using client-specific schema
   SELECT * FROM ${config:client}.users;

   -- Dynamic table name based on environment
   INSERT INTO ${config:stage}_audit_log (message) VALUES ('audit entry');

   -- Using environment-specific configurations
   CREATE SCHEMA IF NOT EXISTS ${config:database.schema};

   -- Combining multiple dynamic values
   UPDATE ${config:client}.${config:stage}_settings 
   SET value = '${ssm:/configs/setting-value}',
       key = '${env:setting.key}'
   WHERE setting_key = 'api_endpoint';
   ```

## Configuration

The tool is configured using a `bam-config.yml` file in your project root. This file specifies default values and settings for your database release management.
> bam-config.yml is update to reflect each client individually during running of command

### Basic Structure

```yaml
name: project-name
stage: ${opt:stage, dev}
client: ${opt:client, default-client}
database:
  host: 'database-host'
  username: 'database-username'
  password: 'database-password'
env:
  custom_variable: 'value'
```

### Configuration Options

- **name**: A unique name for your project, if multiple projects live in a single database, this must be unique per project.
- **stage**: The default stage to release the database to (can use dynamic strings)
- **client**: The default client to release the database to (can use dynamic strings)
- **database**: Database connection settings
  - **host**: Database host
  - **username**: Database username
  - **password**: Database password
  - **port**: Database password (optional, defaults to 5432)
- **env**: Custom environment variables that can be accessed via dynamic strings

### Using Dynamic Strings in Configuration

You can use dynamic strings in your configuration to make it more flexible:

```yaml
name: my-project
stage: ${opt:stage, dev}
client: ${opt:client, connect}
database:
  host: ${ssm:/database/${self:stage}/host}
  username: ${ssm:/database/${self:stage}/username}
  password: ${secretsmanager:/database/${self:stage}/password}
```

This allows you to use different configuration values based on the environment, client, or other factors without modifying the configuration file.

## Example Project

Check out the example-project directory for a sample project structure and configuration.

## License

ISC