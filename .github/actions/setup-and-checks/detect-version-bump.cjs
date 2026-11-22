const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const currentVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

let previousVersion = null;
try {
  previousVersion = JSON.parse(
    execFileSync('git', ['show', 'HEAD^:package.json'], { encoding: 'utf8' })
  ).version;
} catch (error) {
  console.warn('Could not read package.json from HEAD^:', error.message);
}

const parseVersion = (version) => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?/);
  if (!match) {
    throw new Error(`Invalid extension version: ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ''];
};

const compareVersions = (left, right) => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  if (!leftParts[3] && rightParts[3]) return 1;
  if (leftParts[3] && !rightParts[3]) return -1;
  return leftParts[3].localeCompare(rightParts[3]);
};

const bumped = previousVersion ? compareVersions(currentVersion, previousVersion) > 0 : false;
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `bumped=${bumped}\n`);
}
console.log(`${previousVersion ?? 'none'} -> ${currentVersion}; publish=${bumped}`);
