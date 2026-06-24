# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source for audit and
evidence: dealing, shuffling, encryption, decryption, signed transcripts,
hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://e2522a9b.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeihwpu3ajtggckcxmhals75ei7c3lrlblwsv7pghpktw3mpb2aryuq
- Core source audit package IPFS CID: bafkreigzctjhuhxpqeutpfry5s22upmi5vv46dyj2lc3j2sdly7tzxlwau
- Core source fingerprint: sha256:61eb99e8776ca2f19dbdab305bdb438c28ac670ca6eb64e95979a3538f9ef4a9
- Core source archive: fair-poker-source-61eb99e8776c.tar.gz
- Core source archive SHA256: sha256:d914d27a1eef8129379638ecb5aa3d88ed6bcf0f09d2c5b4ea435e3f3cdd7605
- Support and bug reports: support@fairpoker.app

## Public Scope

Published for audit:

- table fairness protocol
- mental poker shuffle/encryption flow
- signed event transcript and hash-chain verifier
- Texas Holdem table state and replay logic
- source release scripts and verifier script

The public audit package focuses on the code path players can verify directly:
how the deck is created, encrypted, shuffled, revealed, recorded, and replayed.

## License Boundary

Fair Poker owned code, UI copy, audit workflow, release metadata, and branding
are visible for fairness audit only. This repository does not grant permission
to copy, fork, mirror, rebrand, host, operate, commercialize, or create a
derivative poker service.
