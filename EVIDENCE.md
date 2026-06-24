# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source and release evidence:
server-not-dealer dealing, player-browser shuffle/encryption flow, signed
transcripts, hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://22cfe3ed.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeicx3wovb4qbcfk37nqpiperf34lvjihh6lysfhm2drutrgslnr3em
- Core source audit package IPFS CID: bafkreihmpwwehnobtf5j5czdi2gnptiqo45cozo4bsl3tk5vwqfqift5ga
- Core source fingerprint: sha256:c08afc8d544c8fe51dbcc99a60e519cccb261fd8d085922e75a57fa9127bb8f3
- Core source archive: fair-poker-source-c08afc8d544c.tar.gz
- Core source archive SHA256: sha256:ec7dac43b5c1997a9e8b23468cd7cd10773a2765dc0c97b9abb5b40b04167d30
- Support and bug reports: support@fairpoker.app

## Public Scope

Published for audit:

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
