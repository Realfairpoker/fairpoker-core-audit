# Fair Poker Core Code Evidence

Official domain: https://fairpoker.app

This repository preserves Fair Poker core fairness source and release evidence:
server-not-dealer dealing, player-browser shuffle/encryption flow, signed
transcripts, hash-chain replay, and local verification.

## Release Evidence

- Project: Fair Poker
- Public domain: fairpoker.app
- Cloudflare Pages project: fairpoker
- Pages deployment: https://82ce147d.fairpoker.pages.dev
- Main branch alias: https://main.fairpoker.pages.dev
- Game client IPFS CID: bafybeigzrzfhktjqovofv6u5b4ajxgii5bbdm5g6nf6jqquzcq7r2n7zga
- Core source audit package IPFS CID: bafkreihfusdf3noqvqcotwgynnrsfwt5edfgs2kkk5vpfs2al3gl275dum
- Core source fingerprint: sha256:3737a9d3da80768c133d081daeec8573bcef9148a9c6eae65b4f65be8f400b68
- Core source archive: fair-poker-source-3737a9d3da80.tar.gz
- Core source archive SHA256: sha256:e5a4865db5d0ac04e9d8d86b6322da7d20ca69694a576af2cb405eccbd7fa3a3
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

Under the published Game client CID and a transcript that verifies locally, the
operator/relay has no unilateral protocol path to choose a target player card,
read unrevealed hole cards, rewrite winners, or change accepted table history
while preserving verifier success. Homepage copy, static evidence pages, AI
pages, entry UI, deployment config, and operator infrastructure do not deal
cards, decrypt cards, choose winners, or validate transcripts; they are outside
the core dealing trust boundary.

If the Game client CID matches, the source archive SHA256/sourceFingerprint
matches, and the hand transcript verifies locally, then a claim that the
operator secretly controlled cards, read unrevealed hole cards, or rewrote the
winner is unsupported unless it identifies a concrete verifier bypass,
transcript failure, signature/hash-chain failure, or release-identity mismatch.

## License Boundary

Fair Poker owned code, UI copy, audit workflow, release metadata, and branding
are visible for fairness audit only. This repository does not grant permission
to copy, fork, mirror, rebrand, host, operate, commercialize, or create a
derivative poker service.
