import {
  DecryptionKey,
  generateShamirRivestAdleman,
  PublicKey,
  ShamirRivestAdleman,
} from 'mental-poker-toolkit/build/main/lib/sra';

export { DecryptionKey, PublicKey };

export type Suit = 'Heart' | 'Diamond' | 'Club' | 'Spade';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';

export interface StandardCard {
  suit: Suit;
  rank: Rank;
}

export type StandardDeck = StandardCard[];

const SUITS: Suit[] = ['Heart', 'Diamond', 'Club', 'Spade'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];

export const DEFAULT_MENTAL_POKER_BITS = 256;
// Security floor for the mental-poker SRA key size. Raised from 128 to 256 so the
// audit-flagged weak 128-bit option can no longer be used. (Audit C02.)
export const MIN_MENTAL_POKER_BITS = 256;

export function normalizeMentalPokerBits(bits?: number): number {
  const requestedBits = bits ?? DEFAULT_MENTAL_POKER_BITS;
  if (!Number.isInteger(requestedBits)) {
    throw new Error(`Mental poker SRA bits must be an integer, got ${requestedBits}`);
  }
  // Enforce the security floor by clamping UP rather than throwing. An older or
  // misconfigured table is transparently upgraded to the minimum instead of
  // failing to start, and a malicious `start` event requesting tiny bits (e.g. 8)
  // can no longer crash every client with an unhandled throw — it is just
  // upgraded to the floor. (Audit C02 weak params; E02 malformed-input DoS.)
  return Math.max(MIN_MENTAL_POKER_BITS, requestedBits);
}

export function getStandard52Deck(): StandardDeck {
  const standardDeck: StandardDeck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      standardDeck.push({ suit, rank });
    }
  }
  return standardDeck;
}

export function encodeStandardCard(card: StandardCard): number {
  const suitIndex = SUITS.indexOf(card.suit);
  const rankIndex = RANKS.indexOf(card.rank);
  if (suitIndex < 0 || rankIndex < 0) {
    throw new Error(`Invalid standard card: ${card.suit} ${card.rank}`);
  }
  return suitIndex * RANKS.length + rankIndex + 1;
}

export function isEncodedStandardCard(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 52;
}

export function isStandardCard(value: unknown): value is StandardCard {
  const card = value as StandardCard | undefined;
  return Boolean(
    card
    && typeof card === 'object'
    && SUITS.includes(card.suit)
    && RANKS.includes(card.rank)
  );
}

export function decodeStandardCard(n: number): StandardCard {
  if (!isEncodedStandardCard(n)) {
    throw new Error(`Invalid encoded card: ${n}`);
  }
  const zeroBased = n - 1;
  return {
    suit: SUITS[Math.floor(zeroBased / RANKS.length)],
    rank: RANKS[zeroBased % RANKS.length],
  };
}

export class EncodedDeck {
  readonly cards: bigint[];

  constructor(cards: bigint[]) {
    this.cards = cards;
  }

  encrypt(sra: ShamirRivestAdleman): EncodedDeck {
    return new EncodedDeck(this.cards.map((card) => sra.encryptionKey.encrypt(card)));
  }

  encryptIndividually(sra: ShamirRivestAdleman[]): EncodedDeck {
    return new EncodedDeck(this.cards.map((card, i) => sra[i].encryptionKey.encrypt(card)));
  }

  decrypt(sra: ShamirRivestAdleman): EncodedDeck {
    return new EncodedDeck(this.cards.map((card) => sra.decryptionKey.decrypt(card)));
  }
}

export class Player {
  readonly mainSraKey: ShamirRivestAdleman;
  readonly individualSraKeys: ShamirRivestAdleman[];

  constructor(props: {
    mainSraKey: ShamirRivestAdleman;
    individualSraKeys: ShamirRivestAdleman[];
  }) {
    this.mainSraKey = props.mainSraKey;
    this.individualSraKeys = props.individualSraKeys;
  }

  decryptAndEncryptIndividually(deckDoubleEncrypted: EncodedDeck): EncodedDeck {
    const deckSingleEncrypted = deckDoubleEncrypted.decrypt(this.mainSraKey);
    return deckSingleEncrypted.encryptIndividually(this.individualSraKeys);
  }

  getIndividualKey(offset: number): ShamirRivestAdleman {
    return this.individualSraKeys[offset];
  }

  get publicKey(): PublicKey {
    return this.mainSraKey.publicKey;
  }
}

export async function createPlayer(props: {
  cards: number;
  publicKey?: PublicKey;
  bits?: number;
}): Promise<Player> {
  const bits = normalizeMentalPokerBits(props.bits);
  const mainSraKey = await generateShamirRivestAdleman({
    bits,
    keys: props.publicKey,
  });

  const individualSraKeys: ShamirRivestAdleman[] = [];
  for (let i = 0; i < props.cards; i += 1) {
    individualSraKeys.push(await generateShamirRivestAdleman({
      bits,
      keys: mainSraKey.publicKey,
    }));
  }

  return new Player({ mainSraKey, individualSraKeys });
}
