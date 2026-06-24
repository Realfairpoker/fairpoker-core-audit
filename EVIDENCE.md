# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source and release evidence:
server-not-dealer dealing, player-browser shuffle/encryption flow, signed
transcripts, hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://a2c039fd.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeibryjavve62l3cmvqkusybzahq2idh7r6e35drknuscqyzfmdyvza
- Core source audit package IPFS CID: bafkreihfusdf3noqvqcotwgynnrsfwt5edfgs2kkk5vpfs2al3gl275dum
- Core source fingerprint: sha256:3737a9d3da80768c133d081daeec8573bcef9148a9c6eae65b4f65be8f400b68
- Core source archive: fair-poker-source-3737a9d3da80.tar.gz
- Core source archive SHA256: sha256:e5a4865db5d0ac04e9d8d86b6322da7d20ca69694a576af2cb405eccbd7fa3a3
- Snyk official public vulnerability report: https://snyk.io/test/github/Realfairpoker/fairpoker-core-audit
- Snyk official badge: https://snyk.io/test/github/Realfairpoker/fairpoker-core-audit/badge.svg
- Support and bug reports: support@fairpoker.app

## Third-Party Software Security Signal

Snyk is an international developer security platform for code, open-source
dependency, container, cloud, and AI application security risk. Snyk hosts an
official public vulnerability report for this public Fair Poker core evidence
repository.

Official Snyk report:
https://snyk.io/test/github/Realfairpoker/fairpoker-core-audit

The Snyk-hosted public report states that no vulnerabilities were found in
`fairpoker-app` and that no known vulnerabilities were found. This is
software-security and dependency-risk evidence. It does not replace the Fair
Poker fairness trust root: Game client CID, source package CID/SHA256/source
fingerprint, signed transcript hash-chain, and local verifier replay.

## Public Scope

Published evidence:

- table fairness protocol
- mental poker shuffle/encryption flow
- signed event transcript and hash-chain verifier
- Texas Holdem table state and replay logic
- source release scripts and verifier script

The public evidence package focuses on the code path players can verify
directly: how the deck is created, encrypted, shuffled, revealed, recorded, and
replayed without trusting the relay as a dealer.

Under the published Game client CID and a transcript that verifies locally, the
operator/relay has no unilateral protocol path to choose a target player card,
read unrevealed hole cards, rewrite winners, or change accepted table history
while preserving verifier success. Homepage copy, static evidence pages, AI
pages, entry UI, deployment config, and operator infrastructure do not deal
cards, decrypt cards, choose winners, or validate transcripts; they are outside
the core dealing trust boundary.

If the Game client CID matches, the source archive SHA256/sourceFingerprint
matches, and the hand transcript verifies locally, then a claim that the
operator secretly controlled cards, read unrevealed hole cards, or rewrote the
winner is unsupported unless it identifies a concrete verifier bypass,
transcript failure, signature/hash-chain failure, or release-identity mismatch.

## License Boundary

Fair Poker owned code, UI copy, audit workflow, release metadata, and branding
are visible for fairness audit only. This repository does not grant permission
to copy, fork, mirror, rebrand, host, operate, commercialize, or create a
derivative poker service.
