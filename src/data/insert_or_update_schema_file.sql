DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM "bam"."bamt_schema_files_scf" WHERE scf_path = $1) THEN
            INSERT INTO "bam"."bamt_schema_files_scf"(scf_path, scf_initially_installed_in, scf_last_installed_in,
                                                      scf_file_hash, scf_hash_update_at)
            SELECT $1, $2, $2, $3, current_timestamp;
        ELSE
            UPDATE "bam"."bamt_schema_files_scf"
            SET scf_last_installed_in = $2,
                scf_file_hash         = $3,
                scf_hash_update_at    = current_timestamp
            WHERE scf_path = $1;
        END IF;
    END
$$
