# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source for audit and
evidence: dealing, shuffling, encryption, decryption, signed transcripts,
hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://c1777dd4.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeihs3vf2zelkdieoxo342eyxd5p4v6expuhoiczmgfqidn55u6ooxu
- Core source audit package IPFS CID: bafkreifg3w43vre24wyrsuokhpmc47obscrji5h4uj5foho5akw72h26xi
- Core source fingerprint: sha256:43b47b765fd09e33eef6e09f6946a302ed30d25a759684e2b2cf180ea25b3da8
- Core source archive: fair-poker-source-43b47b765fd0.tar.gz
- Core source archive SHA256: sha256:a6ddb9bac49ae5b11951ca3bd82e7dc190a29474fca27a571ddd02adfd1f5eba
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
