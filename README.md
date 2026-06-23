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

```bash
npm run verify:transcript -- path/to/transcript.json
```

## License And Notices

Fair Poker owned code, UI copy, audit workflow, release metadata, and branding
are published for source-visible fairness audit only. They are not licensed for
copying, mirroring, rebranding, hosting, commercial operation, or derivative
poker services. See `FAIR_POKER_LICENSE.md`.
