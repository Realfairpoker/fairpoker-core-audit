# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source and release evidence:
server-not-dealer dealing, player-browser shuffle/encryption flow, signed
transcripts, hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://56fb210f.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeigtgjajjklsdnuzv3lgkrx4qbxiam2akdqqedpt7uoichppwwphye
- Core source audit package IPFS CID: bafkreicmr74e4i6fo3y7z2ojrlblmdcotqqzvjykf2pjcyksrxqirnz42m
- Core source fingerprint: sha256:d2c716c0fac626c03ee66c4a57cf33ce9fb0df7661e7bee6af74a1d7107c1521
- Core source archive: fair-poker-source-d2c716c0fac6.tar.gz
- Core source archive SHA256: sha256:4c8ff84e23c576f1fce9c98ac2b60c4e9c219aa70a2e9e9161528de088b73cd3
- Support and bug reports: support@fairpoker.app

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

## License Boundary

Fair Poker owned code, UI copy, audit workflow, release metadata, and branding
are visible for fairness audit only. This repository does not grant permission
to copy, fork, mirror, rebrand, host, operate, commercialize, or create a
derivative poker service.
