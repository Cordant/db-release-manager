const {execSync} = require('node:child_process');
const path = require('node:path');

const repoName = path.parse(__dirname).name;

console.log('Installing dependencies...')
execSync('npm install', {stdio: 'inherit', cwd: path.resolve(__dirname)});

console.log('Installing cli dependencies...')
execSync('npm install', {stdio: 'inherit', cwd: path.resolve(__dirname, './cli')});

console.log('Building cli...');
execSync('npm run build', {stdio: 'inherit', cwd: path.resolve(__dirname, './cli')});

console.log('Building cli...');
execSync(`npm install ./${repoName} -g`, {stdio: 'inherit', cwd: path.resolve(__dirname, './..')});

console.log('\nRunning "npx bam --version"');
execSync('npx bam --version', {stdio: 'inherit', cwd: path.resolve(__dirname, './cli')});
