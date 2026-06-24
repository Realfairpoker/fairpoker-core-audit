# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source for audit and
evidence: dealing, shuffling, encryption, decryption, signed transcripts,
hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://57853d02.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeihwpu3ajtggckcxmhals75ei7c3lrlblwsv7pghpktw3mpb2aryuq
- Core source audit package IPFS CID: bafkreifedw6owbkma2txdy4i4nrevfhz2daqcutvuxfd4rusig7paa7kxu
- Core source fingerprint: sha256:151ddedf04708ed04662c11976eb32ff4d4ebadc97e8ad654cf35cf24e17a47d
- Core source archive: fair-poker-source-151ddedf0470.tar.gz
- Core source archive SHA256: sha256:a41dbceb054c06a771e388e3624a94f9d0c1015275a5ca3e469241bef003eabd
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
