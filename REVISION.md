# Proposed changes

## Folder Structure
```
- postgres
  - release
    - 0.0.1 
      - scripts or migrations
      - version.json
    - 0.0.2
    - current
      - scripts or migrations
      - version.json # local
  - schema
    - 00-database-setup
    - ...
    - 07-functions
    - ...
    - 10-users-roles-permissions
    - version.json
```

## Each database repo have a config file

- `bam-config.yaml`
```yaml
stage: ${opt:stage, 'dev'}
client: ${opt:client, 'connect'}
environment:
  s3_bucket: ${ssm:/not/${self:client}/bucket/name}
  logo: ${ssm:/connect/${self:client}/logo/url}
  root_password: ${secretsmanager:/connect/${self:stage}/database/root::.password}
  app_user_password: ${ssm:/not/${self:stage}/database/password}
  client:
    domain: ${ssm:/connect/${self:client}/domain/name}
    name: ${ssm:/not/${self:stage}/name}
    display_name: ${ssm:/not/${self:stage}/display-name}
    welcome_name: ${ssm:/not/${self:stage}/welcome-name}
    theme: ${ssm:/not/${self:stage}/theme}
    header_image: ${ssm:/not/${self:stage}/header-image}
```


## Commands

```bash
# Create version
npx bam create-version --version 0.0 -clients connect kyloe 
npx bam create-version
> Select version:
  - 1.0.0
  - 0.1.0
  - 0.0.2

# Install version
npx bam installCommand --version (0.0.1 | current | schema) --stage dev --client connect # Build dev_connect
npx bam installCommand --version (0.0.1 | current | schema) --stage demo --client connect # Build demo_connect
npx bam installCommand --version (0.0.1 | current | schema) --stage prod --client kyloe # Build prod_kyloe
npx bam installCommand --version (0.0.1 | current | schema) --stage prod --client trc # Build prod_trc
```

npx bam install --version 0.0.1 --clients client1 

## postgres/release/0.0.1/version.json
```json
[
  {
    "userToUse": "root",
    "dependencies": [ ],
    "databaseToUse": "${stage}_${client}",
    "fileList": [
      "..//postgres/schema/03-tables/obt_version_ver.sql",
      
      "..//postgres/schema/07-functions/branches/obf_is_bullhorn_branch.sql",
      
      "..//postgres/release/current/script/alter_obt_ui_steps_uis.sql"
    ]
  }
]
```

## postgres/schema/version.json
```json
[
  {
    "userToUse": "root",
    "dependencies": [ ],
    "databaseToUse": "${env}_${brand}",
    "fileList": [
      "..//postgres/schema/03-tables/candidate/obt_pre_security_candidate_psc.sql",
      "..//postgres/schema/03-tables/candidate/obt_returning_candidate_rcd.sql",
      "..//postgres/schema/03-tables/obt_settings_set.sql",
      "..//postgres/schema/03-tables/obt_ui_steps_uis.sql",
      "..//postgres/schema/03-tables/obt_step_entity_attribute_master_eam.sql",
      "..//postgres/schema/03-tables/obt_ui_configuration_steps_ucs.sql",
      "..//postgres/schema/03-tables/obt_ui_steps_entity_attributes_instance_uea.sql",
      "..//postgres/schema/03-tables/obt_version_ver.sql",

      "..//postgres/schema/07-functions/branches/obf_list_branch_workflow.sql",
      "..//postgres/schema/07-functions/brands/obf_get_brands.sql",
      "..//postgres/schema/07-functions/brands/obf_get_brand_from_business_unit.sql",
      "..//postgres/schema/07-functions/bullhorn-sync/obf_export_candidate_sync.sql",
      "..//postgres/schema/07-functions/bullhorn-sync/obf_export_candidate_sync_init.sql",
      "..//postgres/schema/07-functions/bullhorn-sync/obf_export_candidate_sync_update_candidate.sql",
      "..//postgres/schema/07-functions/bullhorn-sync/obf_export_candidate_sync_update_status.sql",
      "..//postgres/schema/07-functions/bullhorn-sync/obf_get_brand_text_from_business_unit.sql",
      "..//postgres/schema/07-functions/bullhorn-sync/obf_import_candidate_from_bullhorn.sql",
      "..//postgres/schema/07-functions/branches/obf_is_bullhorn_branch.sql"
    ]
  }
]
```


```postgresql

```
