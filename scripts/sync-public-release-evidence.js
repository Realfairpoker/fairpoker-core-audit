const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const releaseJsonPath = path.join(root, 'release', 'source', 'release.json');
const releaseMetadataPath = path.join(root, 'src', 'generated', 'releaseMetadata.ts');
const defaultGameCid = 'bafybeifdfidvhfomylo67vu5wq4nnjk2qbqcetmf2kijqmjyhhkoqvjuxm';

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${path.relative(root, filePath)}. Run npm run release:source first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readGeneratedSourceFingerprint() {
  if (!fs.existsSync(releaseMetadataPath)) {
    throw new Error('Missing src/generated/releaseMetadata.ts. Run npm run generate:release-metadata first.');
  }
  const text = fs.readFileSync(releaseMetadataPath, 'utf8');
  const match = text.match(/"sourceFingerprint":\s*"(sha256:[a-f0-9]{64})"/);
  if (!match) {
    throw new Error('Could not read sourceFingerprint from src/generated/releaseMetadata.ts.');
  }
  return match[1];
}

function replaceRequired(text, pattern, replacement, label, filePath) {
  if (!pattern.test(text)) {
    throw new Error(`Could not update ${label} in ${path.relative(root, filePath)}.`);
  }
  return text.replace(pattern, replacement);
}

function updateDefinition(text, term, value, filePath) {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return replaceRequired(
    text,
    new RegExp(`(<dt>${escapedTerm}<\\/dt>\\s*<dd>)([^<]+)(<\\/dd>)`),
    `$1${value}$3`,
    term,
    filePath
  );
}

function replaceSourceUrls(text, release) {
  const archiveUrl = release.archiveUrl || `https://fairpoker.app/source/${release.archiveFile}`;
  const ipfsGatewayUrl = release.ipfsGatewayUrl || (release.ipfsCid ? `https://ipfs.io/ipfs/${release.ipfsCid}` : '');
  const dwebUrl = release.ipfsCid ? `https://${release.ipfsCid}.ipfs.dweb.link/` : '';

  return text
    .replace(/fair-poker-source-[a-f0-9]{12}\.tar\.gz/g, release.archiveFile)
    .replace(/not-provided-source-url\/fair-poker-source-[a-f0-9]{12}\.tar\.gz/g, archiveUrl)
    .replace(/https:\/\/fairpoker\.app\/source\/fair-poker-source-[a-f0-9]{12}\.tar\.gz/g, archiveUrl)
    .replace(/https:\/\/ipfs\.io\/ipfs\/bafkrei[a-z0-9]+\/?/g, ipfsGatewayUrl)
    .replace(/https:\/\/bafkrei[a-z0-9]+\.ipfs\.dweb\.link\/?/g, dwebUrl);
}

function upsertAuditLink(text, label, href) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkPattern = new RegExp(`<a href="[^"]*" target="_blank" rel="noreferrer">${escapedLabel}<\\/a>`);
  const link = `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
  if (linkPattern.test(text)) {
    return text.replace(linkPattern, link);
  }
  return text.replace(/(<div class="links">\n)/, `$1          ${link}\n`);
}

function ensureAuditReportLinks(text, release) {
  const archiveUrl = release.archiveUrl || `https://fairpoker.app/source/${release.archiveFile}`;
  text = upsertAuditLink(text, '源码审计包 / 官方下载', archiveUrl);
  text = upsertAuditLink(text, '源码发布清单 / 官方 JSON', 'https://fairpoker.app/source/release.json');
  if (release.ipfsCid) {
    text = upsertAuditLink(text, '源码审计包 / ipfs.io', `https://ipfs.io/ipfs/${release.ipfsCid}`);
    text = upsertAuditLink(text, '源码审计包 / dweb.link', `https://${release.ipfsCid}.ipfs.dweb.link/`);
  }
  if (text.includes('源码审计包 / 官方下载') && text.includes('源码发布清单 / 官方 JSON')) {
    return text;
  }
  throw new Error('Could not ensure official source links in public/audit-report.html.');
}

function ensureVerifyGuideSourceUrlFact(text, release) {
  if (text.includes('<dt>Source package URL</dt>')) {
    return text;
  }
  const archiveUrl = release.archiveUrl || `https://fairpoker.app/source/${release.archiveFile}`;
  return replaceRequired(
    text,
    /(<dt>Source package CID<\/dt>\s*<dd>[^<]+<\/dd>\n)/,
    `$1          <dt>Source package URL</dt>\n          <dd>${archiveUrl}</dd>\n`,
    'Source package URL fact',
    path.join(root, 'public', 'verify-guide.html')
  );
}

function updateAuditReport(release) {
  const filePath = path.join(root, 'public', 'audit-report.html');
  let text = fs.readFileSync(filePath, 'utf8');
  text = updateDefinition(text, '核心源码包 CID', release.ipfsCid || 'not-provided-ipfs-cid', filePath);
  text = updateDefinition(text, '源码指纹', release.sourceFingerprint, filePath);
  text = updateDefinition(text, '源码压缩包 SHA256', release.archiveSha256, filePath);
  text = text.replace('3. 浏览器可打开的 IPFS 链接', '3. 浏览器可打开的审计链接');
  text = text.replace(
    '普通用户不需要安装 IPFS 浏览器。以下链接都是 HTTPS 网关，可直接打开；不同网关访问的是同一个 CID 内容。',
    '建议优先使用官方域名下载源码审计包；IPFS HTTPS 网关作为备用，不同网关访问的是同一个 CID 内容。'
  );
  text = ensureAuditReportLinks(text, release);
  text = replaceSourceUrls(text, release);
  fs.writeFileSync(filePath, text);
}

function updateVerifyGuide(release) {
  const filePath = path.join(root, 'public', 'verify-guide.html');
  const archiveUrl = release.archiveUrl || `https://fairpoker.app/source/${release.archiveFile}`;
  let text = fs.readFileSync(filePath, 'utf8');
  text = updateDefinition(text, 'Source package CID', release.ipfsCid || 'not-provided-ipfs-cid', filePath);
  text = ensureVerifyGuideSourceUrlFact(text, release);
  text = updateDefinition(text, 'Source package URL', archiveUrl, filePath);
  text = updateDefinition(text, 'Source fingerprint', release.sourceFingerprint, filePath);
  text = updateDefinition(text, 'Archive SHA256', release.archiveSha256, filePath);
  text = replaceSourceUrls(text, release);
  text = text.replace(
    /(curl -L -o fair-poker-source\.tar\.gz \\\n  )(?:https:\/\/(?:ipfs\.io\/ipfs\/bafkrei[a-z0-9]+|fairpoker\.app\/source\/fair-poker-source-[a-f0-9]{12}\.tar\.gz)|not-provided-source-url\/fair-poker-source-[a-f0-9]{12}\.tar\.gz)/g,
    `$1${archiveUrl}`
  );
  fs.writeFileSync(filePath, text);
}

function updateSecurity(release) {
  const filePath = path.join(root, 'public', 'security.html');
  let text = fs.readFileSync(filePath, 'utf8');
  text = updateDefinition(text, 'Source package CID', release.ipfsCid || 'not-provided-ipfs-cid', filePath);
  text = updateDefinition(text, 'Source fingerprint', release.sourceFingerprint, filePath);
  text = replaceSourceUrls(text, release);
  fs.writeFileSync(filePath, text);
}

function updateHeaders() {
  const filePath = path.join(root, 'public', '_headers');
  let text = fs.readFileSync(filePath, 'utf8');
  if (!text.includes('/ai.json')) {
    text = text.replace(
      /\n\/llms\.txt\n/,
      '\n/ai.json\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: public, max-age=300\n\n/llms.txt\n'
    );
  }
  if (text.includes('/source/release.json')) {
    fs.writeFileSync(filePath, text);
    return;
  }
  const sourceHeaders = `
/source/release.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=300

/source/*.tar.gz
  Content-Type: application/gzip
  Cache-Control: public, max-age=14400, must-revalidate

/source/*.sha256
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=14400, must-revalidate

`;
  text = replaceRequired(text, /\n\/robots\.txt\n/, `${sourceHeaders}/robots.txt\n`, 'source headers', filePath);
  fs.writeFileSync(filePath, text);
}

function updateLlms(release) {
  const filePath = path.join(root, 'public', 'llms.txt');
  const archiveUrl = release.archiveUrl || `https://fairpoker.app/source/${release.archiveFile}`;
  let text = fs.readFileSync(filePath, 'utf8');
  const section = `## Current Machine-Readable Release

- Source release manifest: https://fairpoker.app/source/release.json
- Source archive URL: ${archiveUrl}
- Source archive SHA256: ${release.archiveSha256}
- Source fingerprint: ${release.sourceFingerprint}
- Source package IPFS CID: ${release.ipfsCid || 'not-provided-ipfs-cid'}
- Source package IPFS gateway: ${release.ipfsGatewayUrl || 'not-provided-ipfs-url'}
- Latest source text pointer: https://fairpoker.app/source/latest.txt
- AI-readable JSON summary: https://fairpoker.app/ai.json
- Machine-readable audit status JSON: https://fairpoker.app/audit/status.json
`;
  if (text.includes('## Current Machine-Readable Release')) {
    text = text.replace(/## Current Machine-Readable Release\n[\s\S]*?(?=\n## |\n?$)/, section.trimEnd());
  } else {
    text = `${text.trimEnd()}\n\n${section.trimEnd()}\n`;
  }
  fs.writeFileSync(filePath, text);
}

function updateAiJson(release) {
  const filePath = path.join(root, 'public', 'ai.json');
  const archiveUrl = release.archiveUrl || `https://fairpoker.app/source/${release.archiveFile}`;
  const payload = {
    schema: 'fairpoker.ai-summary.v1',
    appName: 'Fair Poker',
    officialSite: 'https://fairpoker.app/',
    contact: 'support@fairpoker.app',
    purpose: 'Verifiable Texas Holdem platform with source-visible fairness code, signed transcripts, hash-chain replay, and local verification.',
    publicAuditResources: {
      auditReport: 'https://fairpoker.app/audit-report.html',
      verificationGuide: 'https://fairpoker.app/verify-guide.html',
      securityModel: 'https://fairpoker.app/security.html',
      independentAssurance: 'https://fairpoker.app/independent-assurance.html',
      auditStatusJson: 'https://fairpoker.app/audit/status.json',
      sourceReleaseManifest: 'https://fairpoker.app/source/release.json',
      sourceLatestText: 'https://fairpoker.app/source/latest.txt',
      llmsTxt: 'https://fairpoker.app/llms.txt',
    },
    currentSourceRelease: {
      archiveFile: release.archiveFile,
      archiveUrl,
      archiveSha256: release.archiveSha256,
      archiveSha256File: `https://fairpoker.app/source/${release.archiveSha256File}`,
      sourceFingerprint: release.sourceFingerprint,
      ipfsCid: release.ipfsCid || '',
      ipfsGatewayUrl: release.ipfsGatewayUrl || '',
      dwebGatewayUrl: release.ipfsCid ? `https://${release.ipfsCid}.ipfs.dweb.link/` : '',
      releaseManifestUrl: 'https://fairpoker.app/source/release.json',
    },
    verificationSummary: [
      'Download the source archive from archiveUrl.',
      'Compare its SHA256 with archiveSha256.',
      'Extract it, run npm ci and npm run generate:release-metadata.',
      'Compare src/generated/releaseMetadata.ts sourceFingerprint with currentSourceRelease.sourceFingerprint.',
      'Use npm run verify:transcript -- /path/to/transcript.json to replay a hand transcript locally.',
    ],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function updateSitemap() {
  const filePath = path.join(root, 'public', 'sitemap.xml');
  let text = fs.readFileSync(filePath, 'utf8');
  if (!text.includes('https://fairpoker.app/ai.json')) {
    text = text.replace(
      /\s*<url>\s*<loc>https:\/\/fairpoker\.app\/llms\.txt<\/loc>[\s\S]*?<\/url>/,
      `  <url>
    <loc>https://fairpoker.app/ai.json</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://fairpoker.app/llms.txt</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
    );
  }
  fs.writeFileSync(filePath, text);
}

function main() {
  const release = readJson(releaseJsonPath);
  const generatedSourceFingerprint = readGeneratedSourceFingerprint();
  if (release.sourceFingerprint !== generatedSourceFingerprint) {
    throw new Error(
      `release/source/release.json is stale. Expected ${generatedSourceFingerprint}, got ${release.sourceFingerprint}. Run npm run release:source.`
    );
  }
  const gameCid = process.env.GAME_CID || process.env.REACT_APP_GAME_IPFS_CID || defaultGameCid;
  updateAuditReport(release, gameCid);
  updateVerifyGuide(release, gameCid);
  updateSecurity(release, gameCid);
  updateLlms(release);
  updateAiJson(release);
  updateSitemap();
  updateHeaders();
  console.log(`Synced public release evidence to ${release.archiveFile}`);
}

main();
