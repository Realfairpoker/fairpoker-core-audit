const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const release = JSON.parse(fs.readFileSync(path.join(root, 'release', 'source', 'release.json'), 'utf8'));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function assertIncludes(relativePath, value) {
  if (!read(relativePath).includes(value)) {
    fail(`${relativePath} does not include ${value}`);
  }
}

function assertNotIncludes(relativePath, value) {
  if (read(relativePath).includes(value)) {
    fail(`${relativePath} still includes stale value ${value}`);
  }
}

function assertArchive(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${relativePath}`);
  }
  const actual = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
  if (actual !== release.archiveSha256) {
    fail(`${relativePath} SHA256 mismatch. Expected ${release.archiveSha256}, got ${actual}`);
  }
}

function main() {
  for (const relativePath of [
    'public/audit-report.html',
    'public/verify-guide.html',
    'public/llms.txt',
    'public/ai.json',
    'build/audit-report.html',
    'build/verify-guide.html',
    'build/llms.txt',
    'build/ai.json',
  ]) {
    assertNotIncludes(relativePath, 'not-provided');
  }

  for (const value of [release.archiveUrl, release.archiveSha256, release.sourceFingerprint, release.ipfsCid]) {
    assertIncludes('public/audit-report.html', value);
    assertIncludes('public/verify-guide.html', value);
    assertIncludes('public/llms.txt', value);
    assertIncludes('public/ai.json', value);
  }
  for (const value of [release.sourceFingerprint, release.ipfsCid]) {
    assertIncludes('public/security.html', value);
  }
  for (const value of [release.archiveUrl, release.archiveSha256, release.sourceFingerprint, release.ipfsCid]) {
    assertIncludes('src/generated/releaseMetadata.ts', value);
  }
  assertIncludes('public/audit-report.html', `https://${release.ipfsCid}.ipfs.dweb.link/`);
  assertNotIncludes('public/audit-report.html', 'href=""');
  assertIncludes('public/verify-guide.html', release.archiveUrl);
  assertIncludes('public/verify-guide.html', `curl -L -o fair-poker-source.tar.gz \\\n  ${release.archiveUrl}`);
  assertNotIncludes('public/verify-guide.html', `https://ipfs.io/ipfs/${release.ipfsCid}\n\nshasum`);
  assertIncludes('public/_headers', '/source/*.tar.gz');
  assertIncludes('public/_headers', '/ai.json');
  assertIncludes('public/sitemap.xml', 'https://fairpoker.app/ai.json');
  assertIncludes('public/llms.txt', release.archiveUrl);
  assertIncludes('public/llms.txt', release.archiveSha256);
  assertIncludes('public/llms.txt', release.sourceFingerprint);
  assertIncludes('public/ai.json', release.archiveUrl);
  assertIncludes('public/ai.json', release.archiveSha256);
  assertIncludes('public/ai.json', release.sourceFingerprint);
  assertArchive(path.join('release', 'source', release.archiveFile));
  assertArchive(path.join('build', 'source', release.archiveFile));
  assertIncludes('build/source/release.json', release.archiveFile);
  assertIncludes('build/audit-report.html', release.archiveUrl);
  assertNotIncludes('build/audit-report.html', 'href=""');
  assertIncludes('build/verify-guide.html', `curl -L -o fair-poker-source.tar.gz \\\n  ${release.archiveUrl}`);
  assertIncludes('build/llms.txt', release.archiveUrl);
  assertIncludes('build/ai.json', release.archiveUrl);

  console.log(`Release evidence is consistent for ${release.archiveFile}`);
}

main();
