do
$$
    BEGIN
        IF '${opt:stage}' = 'demo' THEN
--             RAISE EXCEPTION 'Error ${env:error.message}';
        ELSE
--             RAISE EXCEPTION 'Not demo, stage is ${opt:stage}';
        END IF;
    end;
$$