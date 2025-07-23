import {createDefaultEsmPreset, ESM_TS_TRANSFORM_PATTERN} from 'ts-jest';

const tsJestConfig = createDefaultEsmPreset();

/** @type {import('jest').Config} **/
export default {
  ...tsJestConfig,
  testEnvironment: 'node',
  transform: {
    ...tsJestConfig.transform,
    [ESM_TS_TRANSFORM_PATTERN]: [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  testPathIgnorePatterns: [
    'cli',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleDirectories: ['node_modules', 'src'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
