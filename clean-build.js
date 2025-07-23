import {execSync} from 'node:child_process';
import path from 'node:path';
import fs from "node:fs";
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Cleaning up...');
fs.rmSync(path.resolve(__dirname, './dist'), {recursive: true, force: true});

console.log('Installing dependencies...')
execSync('npm ci', {stdio: 'inherit', cwd: path.resolve(__dirname)});

console.log('Building...');
execSync('npm run build', {stdio: 'inherit', cwd: path.resolve(__dirname)});
