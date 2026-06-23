# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core table fairness source for audit and
evidence. It does not publish account backend code, risk engine rules,
deployment credentials, private operations code, or infrastructure secrets.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://f2b65636.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeihwpu3ajtggckcxmhals75ei7c3lrlblwsv7pghpktw3mpb2aryuq
- Core source audit package IPFS CID: bafkreignv5pvnsrvny7ha2l4duoembydwknr6nyupykbrkko3tooudhjim
- Core source fingerprint: sha256:ad7e8b014ba49205b8fdbaed48f3a2f917b471f34f7b7d07bbc39c9ac48d79bf
- Core source archive: fair-poker-source-ad7e8b014ba4.tar.gz
- Core source archive SHA256: sha256:cdaf5f56ca356e3e70697c1d1c460703b29b1f37147e1418a94edcdcea0ce943
- Support and bug reports: support@fairpoker.app

## Public Scope

Published for audit:

- table fairness protocol
- mental poker shuffle/encryption flow
- signed event transcript and hash-chain verifier
- Texas Holdem table state and replay logic
- source release scripts and verifier script

Not included in this public audit repository:

- account backend implementation
- private risk scoring rules
- deployment secrets or credentials
- private operations code
- infrastructure administration code

## License Boundary

Fair Poker owned code, UI copy, audit workflow, release metadata, and branding
are visible for fairness audit only. This repository does not grant permission
to copy, fork, mirror, rebrand, host, operate, commercialize, or create a
derivative poker service.
