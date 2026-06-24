# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source for audit and
evidence: dealing, shuffling, encryption, decryption, signed transcripts,
hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://4f7b0add.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeihwpu3ajtggckcxmhals75ei7c3lrlblwsv7pghpktw3mpb2aryuq
- Core source audit package IPFS CID: bafkreicsvooemdq4odstyykyhykms662gwhcg5kpkjsn7lo4klnuprmtpa
- Core source fingerprint: sha256:761332c3107beaa960f020a965baff1a7e4bfad5cdc40e7307324e26eedebfec
- Core source archive: fair-poker-source-761332c3107b.tar.gz
- Core source archive SHA256: sha256:52ab9c460e1c70e53c61583e14c97bda358e23754f5264dfaddc52db47c59378
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
