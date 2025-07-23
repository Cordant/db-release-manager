CREATE TABLE IF NOT EXISTS "bam"."bamt_schema_files_scf"
(
    pk_scf_id                  SERIAL PRIMARY KEY,
    scf_path                   TEXT NOT NULL UNIQUE,
    scf_initially_installed_in TEXT NOT NULL,
    scf_last_installed_in      TEXT NOT NULL,
    scf_file_hash              TEXT NOT NULL,
    scf_hash_update_at         TIMESTAMP WITH TIME ZONE,
    modified_at                TIMESTAMP WITH TIME ZONE DEFAULT current_timestamp,
    created_at                 TIMESTAMP WITH TIME ZONE DEFAULT current_timestamp
)