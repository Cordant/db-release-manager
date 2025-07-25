export const createSchema = `CREATE SCHEMA IF NOT EXISTS "bam";`;

export const createSchemaFilesTableQuery = `
    CREATE TABLE IF NOT EXISTS "bam"."bamt_schema_files_scf"
    (
        pk_scf_id                  SERIAL PRIMARY KEY,
        scf_app_name               TEXT NOT NULL,
        scf_path                   TEXT NOT NULL,
        UNIQUE(scf_app_name, scf_path),
        scf_initially_installed_in TEXT NOT NULL,
        scf_last_installed_in      TEXT NOT NULL,
        scf_file_hash              TEXT NOT NULL,
        scf_hash_update_at         TIMESTAMP WITH TIME ZONE,
        modified_at                TIMESTAMP WITH TIME ZONE DEFAULT current_timestamp,
        created_at                 TIMESTAMP WITH TIME ZONE DEFAULT current_timestamp
    )`;

export interface SchemaFile {
  pk_scf_id: number;
  scf_app_name: string;
  scf_path: string;
  scf_initially_installed_in: string;
  scf_last_installed_in: string;
  scf_file_hash: string;
  scf_hash_update_at: Date;
  modified_at: Date;
  created_at: Date;
}

export const insertOrUpdateSchemaFileQuery = `
    DO
    $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM "bam"."bamt_schema_files_scf" WHERE scf_app_name = $1 AND scf_path = $2) THEN
                INSERT INTO "bam"."bamt_schema_files_scf"(scf_app_name, scf_path, scf_initially_installed_in, scf_last_installed_in, scf_file_hash, scf_hash_update_at)
                SELECT $1, $2, $3, $3, $4, current_timestamp;
            ELSE
                UPDATE "bam"."bamt_schema_files_scf"
                SET scf_last_installed_in = $3,
                    scf_file_hash         = $4,
                    scf_hash_update_at    = current_timestamp
                WHERE scf_app_name = $1 AND scf_path = $2;
            END IF;
        END
    $$`;

export const removeSchemaFileQuery = `DELETE
                                      FROM "bam"."bamt_schema_files_scf"
                                      WHERE scf_app_name = $1
                                        AND scf_path = $2;`;

export const getSchemaFilesQuery = `SELECT *
                                    FROM "bam"."bamt_schema_files_scf"
                                    WHERE scf_app_name = $1;`;

export const updateHashQuery = `
    UPDATE "bam"."bamt_schema_files_scf"
    SET scf_hash_update_at = current_timestamp,
        scf_file_hash      = $3
    WHERE scf_app_name = $1
      AND scf_path = $2;`;

export const createDatabase = `CREATE DATABASE $1~;`;