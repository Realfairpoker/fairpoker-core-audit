# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source and release evidence:
server-not-dealer dealing, player-browser shuffle/encryption flow, signed
transcripts, hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://0a0a5280.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeifhjs7yszevbwm64dc3xojpjjhy4kd6fqcd5ilszpayykbxu3qg6m
- Core source audit package IPFS CID: bafkreidmvii7hsl73kag4pu56r3oxl7sy3bggdosxtl7b6bqcy6egurdqa
- Core source fingerprint: sha256:61db0ce78684cf9b72dfca70b60caadbd24dbd9c0e1cdee19399002029917d79
- Core source archive: fair-poker-source-61db0ce78684.tar.gz
- Core source archive SHA256: sha256:6caa11f3c97fda806e3e9df476ebaff2c6c2630dd2bcd7f0f830163c43522380
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
