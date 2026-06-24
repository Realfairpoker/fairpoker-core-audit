# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source for audit and
evidence: dealing, shuffling, encryption, decryption, signed transcripts,
hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://9dc7a499.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeihwpu3ajtggckcxmhals75ei7c3lrlblwsv7pghpktw3mpb2aryuq
- Core source audit package IPFS CID: bafkreiakxyltawwhkp3eayyq6lwnzpj3bwoqimajtzknjbpgvejms5pjx4
- Core source fingerprint: sha256:8b47c7d5bd6d824b68d486c3b230a26fbf74a79f857b17fd5eaf8f99209d66ed
- Core source archive: fair-poker-source-8b47c7d5bd6d.tar.gz
- Core source archive SHA256: sha256:0abe17305ac753f6406310f2ecdcbd3b0d9d0430099e54d485e6a912c975e9bf
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
