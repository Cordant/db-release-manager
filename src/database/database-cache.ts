import PGPromise from 'pg-promise';

export const databaseCache = new Map<string, PGPromise.IDatabase<{}>>();