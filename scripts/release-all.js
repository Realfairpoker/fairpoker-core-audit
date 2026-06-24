const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(root, '..');
const defaultAuditRepo = '/tmp/fairpoker-core-audit';
const defaultGameCid = 'bafybeiegxcibhvlpdmq45ts7k5sohdsbsli5a77i6m4fwwrktgxq2ihil4';

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      continue;
    }
    const eq = item.indexOf('=');
    if (eq !== -1) {
      result[item.slice(2, eq)] = item.slice(eq + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const dryRun = args['dry-run'] === 'true';
const skipDeploy = args['skip-deploy'] === 'true';
const skipGithub = args['skip-github'] === 'true';
const skipVps = args['skip-vps'] === 'true';
const auditRepo = args['audit-repo'] || process.env.AUDIT_REPO || defaultAuditRepo;
const gameCid = args['game-cid'] || process.env.GAME_CID || process.env.REACT_APP_GAME_IPFS_CID || defaultGameCid;
const vpsHost = args['vps-host'] || process.env.PIN_VPS_HOST || '146.235.16.88';
const vpsUser = args['vps-user'] || process.env.PIN_VPS_USER || 'ubuntu';
const vpsKey = args['vps-key'] || process.env.PIN_VPS_KEY || path.join(workspaceRoot, 'ssh', 'ssh-key-2025-11-18.key');
const vpsIpfsUser = args['vps-ipfs-user'] || process.env.PIN_VPS_IPFS_USER || 'ipfs';
const vpsIpfsPath = args['vps-ipfs-path'] || process.env.PIN_VPS_IPFS_PATH || '/var/lib/ipfs';
const pagesProject = args['pages-project'] || process.env.PAGES_PROJECT || 'fairpoker';
const commitMessage = args['commit-message'] || process.env.RELEASE_COMMIT_MESSAGE || 'Update release evidence';

function log(message) {
  process.stdout.write(`\n== ${message} ==\n`);
}

function run(command, commandArgs, options = {}) {
  const display = [command, ...commandArgs].join(' ');
  console.log(`$ ${display}`);
  if (dryRun) {
    return '';
  }
  const output = childProcess.execFileSync(command, commandArgs, {
    cwd: options.cwd || root,
    env: {...process.env, ...(options.env || {})},
    encoding: options.encoding === 'buffer' ? undefined : 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  return output || '';
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFile(filePath, content) {
  if (dryRun) {
    console.log(`would write ${path.relative(root, filePath)}`);
    return;
  }
  fs.writeFileSync(filePath, content);
}

function copyFile(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }
  if (dryRun) {
    console.log(`would copy ${source} -> ${target}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target);
}

function removeFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  if (dryRun) {
    console.log(`would remove ${filePath}`);
    return;
  }
  fs.rmSync(filePath, {force: true});
}

function replaceAllFiles(files, replacements) {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }
    let text = fs.readFileSync(file, 'utf8');
    const before = text;
    for (const [from, to] of replacements) {
      if (!from || !to || from === to) {
        continue;
      }
      text = text.split(from).join(to);
      text = text.split(from.replace(/^sha256:/, '')).join(to.replace(/^sha256:/, ''));
    }
    if (text !== before) {
      writeFile(file, text);
    }
  }
}

function updateEvidenceDeployment(filePath, deploymentUrl) {
  if (!deploymentUrl || !fs.existsSync(filePath)) {
    return;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const next = text.replace(/- Pages deployment: https:\/\/[^\s]+/g, `- Pages deployment: ${deploymentUrl}`);
  if (next !== text) {
    writeFile(filePath, next);
  }
}

function ensureCid(value, label) {
  if (!/^[a-z0-9]+$/.test(value || '')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function runVpsIpfs(ipfsArgs) {
  const remoteCommand = [
    'sudo', '-n', '-u', vpsIpfsUser,
    'env', `IPFS_PATH=${vpsIpfsPath}`,
    'ipfs', ...ipfsArgs,
  ].join(' ');
  return runSsh(remoteCommand);
}

function runSsh(remoteCommand) {
  return run('ssh', [
    '-i', vpsKey,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=15',
    `${vpsUser}@${vpsHost}`,
    remoteCommand,
  ], {capture: true});
}

function uploadToVps(localPath, remotePath) {
  run('scp', [
    '-i', vpsKey,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=15',
    localPath,
    `${vpsUser}@${vpsHost}:${remotePath}`,
  ]);
}

function parseDeploymentUrl(output) {
  const match = output.match(/https:\/\/[a-z0-9-]+\.fairpoker\.pages\.dev/i);
  return match ? match[0] : '';
}

function main() {
  ensureCid(gameCid, 'game CID');

  const releaseJsonPath = path.join(root, 'release', 'source', 'release.json');
  const previousRelease = readJson(releaseJsonPath) || {};
  const oldSourceCid = previousRelease.ipfsCid || '';
  const oldSourceFingerprint = previousRelease.sourceFingerprint || '';
  const oldArchiveSha = previousRelease.archiveSha256 || '';
  const oldArchiveFile = previousRelease.archiveFile || '';
  const extraOldCids = (args['old-cids'] || process.env.OLD_CIDS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  log('Generate source archive');
  run('npm', ['run', 'release:source']);
  const firstRelease = readJson(releaseJsonPath);
  if (!firstRelease || !firstRelease.archiveFile) {
    throw new Error('Source release manifest was not generated.');
  }

  log('Pin source archive locally');
  const archivePath = path.join(root, 'release', 'source', firstRelease.archiveFile);
  const newSourceCid = run('ipfs', ['add', '--cid-version=1', '--raw-leaves', '-Q', archivePath], {capture: true}).trim();
  ensureCid(newSourceCid, 'source CID');

  log('Regenerate source manifest with IPFS CID');
  run('npm', ['run', 'release:source'], {
    env: {
      IPFS_CID: newSourceCid,
      SOURCE_ARCHIVE_BASE_URL: 'https://fairpoker.app/source',
    },
  });
  const newRelease = readJson(releaseJsonPath);

  const replacements = [
    [oldSourceCid, newRelease.ipfsCid],
    [oldSourceFingerprint, newRelease.sourceFingerprint],
    [oldArchiveSha, newRelease.archiveSha256],
    [oldArchiveFile, newRelease.archiveFile],
  ];

  log('Update public audit pages and GitHub evidence text');
  replaceAllFiles([
    path.join(root, 'public', 'verify-guide.html'),
    path.join(root, 'public', 'audit-report.html'),
    path.join(root, 'public', 'security.html'),
    path.join(root, 'release', 'github-core', 'fair-poker-source', 'README.md'),
    path.join(root, 'release', 'github-core', 'fair-poker-source', 'EVIDENCE.md'),
    path.join(auditRepo, 'README.md'),
    path.join(auditRepo, 'EVIDENCE.md'),
  ], replacements);

  log('Sync source evidence into GitHub audit copies');
  for (const targetRoot of [
    path.join(root, 'release', 'github-core', 'fair-poker-source'),
    auditRepo,
  ]) {
    copyFile(path.join(root, 'scripts', 'create-source-release.js'), path.join(targetRoot, 'scripts', 'create-source-release.js'));
    copyFile(path.join(root, 'scripts', 'generate-release-metadata.js'), path.join(targetRoot, 'scripts', 'generate-release-metadata.js'));
    copyFile(path.join(root, 'scripts', 'release-all.js'), path.join(targetRoot, 'scripts', 'release-all.js'));
    copyFile(path.join(root, 'release', 'source', 'release.json'), path.join(targetRoot, 'evidence', 'release.json'));
    copyFile(path.join(root, 'release', 'source', 'latest.txt'), path.join(targetRoot, 'evidence', 'latest.txt'));
    copyFile(path.join(root, 'release', 'source', newRelease.archiveFile), path.join(targetRoot, 'evidence', newRelease.archiveFile));
    copyFile(path.join(root, 'release', 'source', `${newRelease.archiveFile}.sha256`), path.join(targetRoot, 'evidence', `${newRelease.archiveFile}.sha256`));
    if (oldArchiveFile && oldArchiveFile !== newRelease.archiveFile) {
      removeFile(path.join(targetRoot, 'evidence', oldArchiveFile));
      removeFile(path.join(targetRoot, 'evidence', `${oldArchiveFile}.sha256`));
    }
  }
  if (oldArchiveFile && oldArchiveFile !== newRelease.archiveFile) {
    removeFile(path.join(root, 'release', 'source', oldArchiveFile));
    removeFile(path.join(root, 'release', 'source', `${oldArchiveFile}.sha256`));
  }

  log('Build official site');
  run('npm', ['run', 'build'], {
    env: {
      REACT_APP_GAME_IPFS_CID: gameCid,
      REACT_APP_SOURCE_ARCHIVE_IPFS_CID: newRelease.ipfsCid,
      REACT_APP_SOURCE_ARCHIVE_IPFS_URL: `https://ipfs.io/ipfs/${newRelease.ipfsCid}`,
      REACT_APP_SOURCE_ARCHIVE_SHA256: newRelease.archiveSha256,
      REACT_APP_SOURCE_ARCHIVE_URL: `https://fairpoker.app/source/${newRelease.archiveFile}`,
    },
  });
  if (!dryRun) {
    fs.rmSync(path.join(root, 'build', 'source'), {recursive: true, force: true});
    fs.mkdirSync(path.join(root, 'build', 'source'), {recursive: true});
    fs.cpSync(path.join(root, 'release', 'source'), path.join(root, 'build', 'source'), {recursive: true});
  }

  let deploymentUrl = '';
  if (!skipDeploy) {
    log('Deploy Cloudflare Pages');
    const output = run('npx', ['wrangler', 'pages', 'deploy', 'build', '--project-name', pagesProject], {capture: true});
    process.stdout.write(output);
    deploymentUrl = parseDeploymentUrl(output);
    updateEvidenceDeployment(path.join(auditRepo, 'EVIDENCE.md'), deploymentUrl);
    updateEvidenceDeployment(path.join(root, 'release', 'github-core', 'fair-poker-source', 'EVIDENCE.md'), deploymentUrl);
  }

  const staleCids = Array.from(new Set([oldSourceCid, ...extraOldCids].filter(cid => cid && cid !== newRelease.ipfsCid)));
  if (staleCids.length > 0) {
    log('Unpin old local source CIDs');
    for (const cid of staleCids) {
      try {
        run('ipfs', ['pin', 'rm', cid], {capture: true});
      } catch (error) {
        console.warn(`Local unpin skipped for ${cid}: ${error.message}`);
      }
    }
  }

  if (!skipVps) {
    log('Upload and pin new source archive on VPS');
    const remoteArchive = `/tmp/${newRelease.archiveFile}`;
    uploadToVps(path.join(root, 'release', 'source', newRelease.archiveFile), remoteArchive);
    const vpsAddedCid = runVpsIpfs(['add', '--cid-version=1', '--raw-leaves', '-Q', remoteArchive]).trim();
    if (vpsAddedCid !== newRelease.ipfsCid) {
      throw new Error(`VPS IPFS CID mismatch: expected ${newRelease.ipfsCid}, got ${vpsAddedCid}`);
    }
    runSsh(`rm -f ${remoteArchive}`);
    console.log(`Pinned on VPS: ${vpsAddedCid}`);
    for (const cid of staleCids) {
      log(`Unpin old source CID on VPS: ${cid}`);
      try {
        process.stdout.write(runVpsIpfs(['pin', 'rm', cid]));
      } catch (error) {
        console.warn(`VPS unpin skipped for ${cid}: ${error.message}`);
      }
    }
    process.stdout.write(runVpsIpfs(['pin', 'ls', '--type=recursive']));
  }

  if (!skipGithub) {
    log('Commit and push GitHub audit repository');
    run('git', ['add', '.'], {cwd: auditRepo});
    const status = run('git', ['status', '--short'], {cwd: auditRepo, capture: true});
    if (status.trim()) {
      run('git', ['commit', '-m', commitMessage], {cwd: auditRepo});
      run('git', ['push', 'origin', 'main'], {cwd: auditRepo});
    } else {
      console.log('GitHub audit repository has no changes.');
    }
  }

  log('Release complete');
  console.log(JSON.stringify({
    gameCid,
    sourceCid: newRelease.ipfsCid,
    sourceFingerprint: newRelease.sourceFingerprint,
    archiveFile: newRelease.archiveFile,
    archiveSha256: newRelease.archiveSha256,
    deploymentUrl: deploymentUrl || '(deploy skipped)',
    oldCidsRemoved: staleCids,
  }, null, 2));
}

main();
