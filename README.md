# Fair Poker Core Audit Release

Official domain: [fairpoker.app](https://fairpoker.app)

Fair Poker is a browser-based Texas Hold'em prototype focused on verifiable
fairness. The app records signed fairness transcripts, displays release
metadata, and includes a local transcript verifier.

This repository is used as a public audit and evidence record for Fair Poker
owned client-side fairness code. Backend account services, risk controls,
deployment credentials, private operations code, and infrastructure secrets are
not part of this public release.

## Local Development

```bash
npm install
npm start
```

## Production Build

```bash
npm run build
```

The generated static files are written to `build/`.

## Core Source Release

```bash
npm run release:source
```

The public source archive, SHA256 file, release manifest, and source index page
are written to `release/source/`.

## Fairness Verification

### Match The Deployed Client To The Public Core Source

中文说明：

1. 确认你打开的牌局客户端 CID 与官网公布的 Game client CID 一致。
2. 通过不同 IPFS 网关打开同一 CID，应得到同一份前端文件；CID 变化代表文件内容变化。
3. 下载核心源码审计包，校验压缩包 SHA256。
4. 解压源码包后重新生成 `sourceFingerprint`，与官网、审计报告和本仓库证据文件中的指纹比对。

English:

1. Confirm the table client CID matches the Game client CID published by the official site.
2. Opening the same CID through different IPFS gateways should produce the same frontend files; any file change changes the CID.
3. Download the core source audit package and verify its SHA256.
4. Extract the package, regenerate `sourceFingerprint`, and compare it with the fingerprint published on the official site, audit report, and evidence file.

```bash
curl -L -o fair-poker-source.tar.gz \
  https://ipfs.io/ipfs/bafkreignv5pvnsrvny7ha2l4duoembydwknr6nyupykbrkko3tooudhjim

shasum -a 256 fair-poker-source.tar.gz
# must equal cdaf5f56ca356e3e70697c1d1c460703b29b1f37147e1418a94edcdcea0ce943

mkdir fair-poker-source
tar -xzf fair-poker-source.tar.gz -C fair-poker-source --strip-components=1
cd fair-poker-source
npm ci
npm run generate:release-metadata
grep sourceFingerprint src/generated/releaseMetadata.ts
```

Expected source fingerprint:

```text
sha256:ad7e8b014ba49205b8fdbaed48f3a2f917b471f34f7b7d07bbc39c9ac48d79bf
```

If the archive SHA256 and source fingerprint match, the public core table,
fairness, shuffle, signing, transcript, and verifier code have not been
replaced. Scope note: this public repository covers core client-side fairness
code. Account services, risk controls, deployment credentials, private
operations code, and backend infrastructure are outside this public source
release.

### Replay A Table Transcript

Use this flow to reproduce a table result locally.

中文步骤：

1. 在 Fair Poker 牌桌左上角打开「安全牌局」面板。
2. 点击「下载」保存本局 transcript JSON。
3. 克隆本仓库，或下载官方核心源码审计包。
4. 安装依赖并运行 verifier。

English steps:

1. Open the Secure Table panel in the upper-left table tools.
2. Click Download to save the hand transcript JSON.
3. Clone this repository, or download the official core source audit package.
4. Install dependencies and run the verifier.

```bash
npm ci
npm run verify:transcript -- path/to/transcript.json
```

Successful verification means the transcript hash-chain, event order, signed
event format, table actions, pots, and final result can be replayed locally.
Changing important transcript fields should make verification fail or produce a
warning.

日本語: 安全パネルから transcript を保存し、このリポジトリで上記コマンドを実行すると、hash-chain、イベント順序、署名、ポット、結果を再検証できます。

Español: descarga el transcript desde el panel de seguridad y ejecuta el comando anterior para reproducir hash-chain, eventos, firmas, botes y resultado.

Français: téléchargez le transcript depuis le panneau de sécurité puis exécutez la commande ci-dessus pour vérifier hash-chain, événements, signatures, pots et résultat.

Deutsch: Laden Sie das Transcript im Sicherheitspanel herunter und führen Sie den obigen Befehl aus, um Hash-Chain, Ereignisse, Signaturen, Pots und Ergebnis zu prüfen.

Web guide: [fairpoker.app/verify-guide](https://fairpoker.app/verify-guide)

## License And Notices

Fair Poker owned code, UI copy, audit workflow, release metadata, and branding
are published for source-visible fairness audit only. They are not licensed for
copying, mirroring, rebranding, hosting, commercial operation, or derivative
poker services. See `FAIR_POKER_LICENSE.md`.
