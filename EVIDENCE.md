# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source and release evidence:
server-not-dealer dealing, player-browser shuffle/encryption flow, signed
transcripts, hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://a5db415b.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeidtx2juzgaav3c5xsm62xdqr6hrudeqlafrzy2qkcfcods7xyqera
- Core source audit package IPFS CID: bafkreiabtedp3vipfrchydcb23va5b57eybnmwwwudya3uvwcrtmkp3qnq
- Core source fingerprint: sha256:402d4531d24096046569cb4a7a1b8b4c8d134984f98d4fa09eb2149297009c3c
- Core source archive: fair-poker-source-402d4531d240.tar.gz
- Core source archive SHA256: sha256:019906fdd50f2c447c0c41d6ea0e87bf2602d65ad6a0f00dd2b61466c53f706c
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
