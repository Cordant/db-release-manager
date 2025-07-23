export const configManagerCache = new Map<string, string>();

configManagerCache.set('internal:config-path', './bam-config.yml');

export function setConfigPath(path: string) {
  configManagerCache.set('internal:config-path', path);
}