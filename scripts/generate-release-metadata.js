const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'src', 'generated', 'releaseMetadata.ts');
const packageJson = require(path.join(root, 'package.json'));

const includedRoots = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'README.md',
  'FAIR_POKER_LICENSE.md',
  'scripts/verify-transcript.js',
  'scripts/generate-release-metadata.js',
  'scripts/create-source-release.js',
  'scripts/create-ipfs-game-build.js',
  'src/lib/fairness',
  'src/lib/texas-holdem',
  'src/lib/MentalPokerGameRoom.ts',
  'src/lib/GameRoom.ts',
  'src/lib/cryptoShuffle.ts',
  'src/lib/secureMentalPoker.ts',
  'src/lib/HybridPublicKeyCrypto.ts',
  'src/lib/clientVersion.ts',
  'src/lib/runtimeCodeSource.ts',
  'src/lib/rules.ts',
  'src/lib/types.ts',
  'src/lib/utils.ts',
];

const ignoredParts = new Set(['node_modules', 'build', '.git', 'generated']);
const ignoredExtensions = new Set(['.png', '.ico']);

function shouldInclude(filePath) {
  const relative = path.relative(root, filePath);
  const parts = relative.split(path.sep);
  if (parts.some((part) => ignoredParts.has(part))) {
    return false;
  }
  if (ignoredExtensions.has(path.extname(filePath))) {
    return false;
  }
  return true;
}

function collectFiles(entry) {
  const fullPath = path.join(root, entry);
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return shouldInclude(fullPath) ? [fullPath] : [];
  }

  const result = [];
  for (const name of fs.readdirSync(fullPath)) {
    result.push(...collectFiles(path.join(entry, name)));
  }
  return result;
}

const files = includedRoots
  .flatMap(collectFiles)
  .sort((a, b) => path.relative(root, a).localeCompare(path.relative(root, b)));

function hashContent(file) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  if (relative !== 'package.json') {
    return fs.readFileSync(file);
  }
  const packageJson = JSON.parse(fs.readFileSync(file, 'utf8'));
  packageJson.description = 'Fair Poker core fairness audit package';
  packageJson.scripts = {
    'generate:release-metadata': 'node scripts/generate-release-metadata.js',
    'build:ipfs-game': 'node scripts/create-ipfs-game-build.js',
    'verify:transcript': 'node scripts/verify-transcript.js',
    'release:source': 'npm run generate:release-metadata && node scripts/create-source-release.js',
    test: 'react-scripts test',
  };
  return Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`);
}

const hash = crypto.createHash('sha256');
for (const file of files) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  hash.update(relative);
  hash.update('\0');
  hash.update(hashContent(file));
  hash.update('\0');
}

const sourceFingerprint = `sha256:${hash.digest('hex')}`;
const releaseJsonPath = path.join(root, 'release', 'source', 'release.json');
let previousRelease = null;
if (fs.existsSync(releaseJsonPath)) {
  try {
    previousRelease = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
  } catch (_) {
    previousRelease = null;
  }
}
const matchingPreviousRelease = previousRelease?.sourceFingerprint === sourceFingerprint
  ? previousRelease
  : null;
const sourceCommit = process.env.REACT_APP_SOURCE_COMMIT
  || process.env.SOURCE_COMMIT
  || 'source-fingerprint-only';
const releaseSignature = process.env.REACT_APP_RELEASE_SIGNATURE
  || process.env.RELEASE_SIGNATURE
  || 'unsigned-local-build';
const sourceArchiveUrl = process.env.REACT_APP_SOURCE_ARCHIVE_URL
  || process.env.SOURCE_ARCHIVE_URL
  || matchingPreviousRelease?.archiveUrl
  || 'not-provided-source-url';
const sourceArchiveSha256 = process.env.REACT_APP_SOURCE_ARCHIVE_SHA256
  || process.env.SOURCE_ARCHIVE_SHA256
  || matchingPreviousRelease?.archiveSha256
  || 'not-provided-source-archive';
const sourceArchiveIpfsCid = process.env.REACT_APP_SOURCE_ARCHIVE_IPFS_CID
  || process.env.SOURCE_ARCHIVE_IPFS_CID
  || matchingPreviousRelease?.ipfsCid
  || 'not-provided-ipfs-cid';
const sourceArchiveIpfsUrl = process.env.REACT_APP_SOURCE_ARCHIVE_IPFS_URL
  || process.env.SOURCE_ARCHIVE_IPFS_URL
  || matchingPreviousRelease?.ipfsGatewayUrl
  || 'not-provided-ipfs-url';
const sourceReleaseManifestUrl = process.env.REACT_APP_SOURCE_RELEASE_MANIFEST_URL
  || process.env.SOURCE_RELEASE_MANIFEST_URL
  || (matchingPreviousRelease ? 'https://fairpoker.app/source/release.json' : '')
  || 'not-provided-release-manifest-url';

const metadata = {
  appName: 'Fair Poker',
  appVersion: packageJson.version,
  protocolVersion: 'signed-transcript-v0 + mental-poker-v0',
  verifierVersion: 'hash-chain-signature-result-replay-v0',
  sourceCommit,
  sourceFingerprint,
  releaseSignature,
  sourceArchiveUrl,
  sourceArchiveSha256,
  sourceArchiveIpfsCid,
  sourceArchiveIpfsUrl,
  sourceReleaseManifestUrl,
  buildMode: process.env.REACT_APP_BUILD_MODE || process.env.NODE_ENV || 'production',
  filesHashed: files.length,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  `// This file is generated by scripts/generate-release-metadata.js.\n`
  + `// Do not edit it by hand.\n\n`
  + `export interface ReleaseMetadata {\n`
  + `  appName: string;\n`
  + `  appVersion: string;\n`
  + `  protocolVersion: string;\n`
  + `  verifierVersion: string;\n`
  + `  sourceCommit: string;\n`
  + `  sourceFingerprint: string;\n`
  + `  releaseSignature: string;\n`
  + `  sourceArchiveUrl: string;\n`
  + `  sourceArchiveSha256: string;\n`
  + `  sourceArchiveIpfsCid: string;\n`
  + `  sourceArchiveIpfsUrl: string;\n`
  + `  sourceReleaseManifestUrl: string;\n`
  + `  buildMode: string;\n`
  + `  filesHashed: number;\n`
  + `}\n\n`
  + `export const releaseMetadata: ReleaseMetadata = ${JSON.stringify(metadata, null, 2)};\n`
);

console.log(`Generated ${path.relative(root, output)} (${sourceFingerprint})`);
