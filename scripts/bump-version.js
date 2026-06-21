const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_JSON = path.join(__dirname, '..', 'app.json');

function getLastTag() {
  try {
    return execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function getCommitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  try {
    return execSync(`git log ${range} --pretty=format:"%s"`, { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function determineBump(commits) {
  let bump = null;

  for (const msg of commits) {
    const lower = msg.toLowerCase();
    if (lower.includes('breaking change') || lower.startsWith('breaking:')) {
      return 'major';
    }
    if (lower.startsWith('feat:') || lower.startsWith('feat(')) {
      bump = 'minor';
    }
    if (!bump && (lower.startsWith('fix:') || lower.startsWith('fix('))) {
      bump = 'patch';
    }
  }

  return bump || 'patch';
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return version;
  }
}

const appJson = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
const currentVersion = appJson.expo.version;

const lastTag = getLastTag();
const commits = getCommitsSince(lastTag);

if (commits.length === 0) {
  console.log(`No new commits since ${lastTag || 'start'}. Version stays at ${currentVersion}`);
  process.exit(0);
}

const bump = determineBump(commits);
const newVersion = bumpVersion(currentVersion, bump);

if (newVersion === currentVersion) {
  console.log(`Version unchanged: ${currentVersion}`);
  process.exit(0);
}

appJson.expo.version = newVersion;
fs.writeFileSync(APP_JSON, JSON.stringify(appJson, null, 2) + '\n');

console.log(`${bump}: ${currentVersion} → ${newVersion}`);
console.log(`Commits analyzed: ${commits.length}`);
commits.forEach(c => console.log(`  - ${c}`));
