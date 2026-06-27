import {GameEvent, GameRoomEvents, GameRoomStatus} from "./GameRoom";
import {
  createPlayer,
  decodeStandardCard,
  DEFAULT_MENTAL_POKER_BITS,
  DecryptionKey,
  EncodedDeck,
  encodeStandardCard,
  getStandard52Deck,
  isEncodedStandardCard,
  Player,
  PublicKey,
  StandardCard
} from "./secureMentalPoker";
import {CARDS} from "./rules";
import Deferred from "./Deferred";
import {EventListener} from "./types";
import EventEmitter from "eventemitter3";
import LifecycleManager from "./LifecycleManager";
import {encryptAndSecureShuffle} from "./cryptoShuffle";
import {validateMentalPokerEvent, isMentalPokerEventType} from "./fairness/mentalPokerSchema";
import {sealCardKey, openCardKey} from "./fairness/privateEventCrypto";

export interface MentalPokerRoundSettings {
  participants?: string[];
  alice?: string;
  bob?: string;
  bits?: number;
}

export interface RoundStartEvent {
  type: 'start';
  round: number;
  mentalPokerSettings: MentalPokerRoundSettings;
}

export type StringEncodedDeck = string[];

export interface DeckShuffleEvent {
  type: 'deck/shuffle';
  round: number;
  player: string;
  shuffleIndex: number;
  deck: StringEncodedDeck;
  publicKey?: {
    p: string;
    q: string;
  };
}

export interface DeckLockEvent {
  type: 'deck/lock';
  round: number;
  player: string;
  lockIndex: number;
  deck: StringEncodedDeck;
}

export interface DeckFinalizedEvent {
  type: 'deck/finalized';
  round: number;
  player: string;
  deck: StringEncodedDeck;
}

export interface DecryptCardEvent {
  type: 'card/decrypt';
  round: number;
  cardOffset: number;
  player?: string;
  aliceOrBob?: 'alice' | 'bob';
  // Plaintext per-card key — used for PUBLIC reveals (board/showdown), which must
  // stay verifiable by the offline transcript verifier.
  decryptionKey?: { d: string; n: string };
  // End-to-end sealed per-card key — used for PRIVATE deals, so the relay only
  // sees ciphertext. Exactly one of decryptionKey / sealedKey is present.
  sealedKey?: string;
}

// Announces this client's RSA-OAEP public key so peers can seal private per-card
// decryption keys to it end-to-end. Sent as a signed public event, so the
// mapping peerId -> encryption key is authenticated by the signing identity.
export interface EncryptionKeyAnnounceEvent {
  type: 'identity/encryptionKey';
  publicKeyJwk: JsonWebKey;
}

// Local RSA-OAEP keypair used to seal (send) and open (receive) private per-card
// keys end-to-end, so the relay only sees ciphertext. Optional: when absent the
// room keeps the legacy plaintext private-key behavior (used by unit tests).
export interface MentalPokerCryptoOptions {
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
}

export type MentalPokerEvent =
  | RoundStartEvent
  | DeckShuffleEvent
  | DeckLockEvent
  | DeckFinalizedEvent
  | DecryptCardEvent
  | EncryptionKeyAnnounceEvent
;

function toStringEncodedDeck(deck: EncodedDeck): StringEncodedDeck {
  return deck.cards.map(i => i.toString());
}

function toBigIntEncodedDeck(deck: StringEncodedDeck): EncodedDeck {
  return new EncodedDeck(deck.map(s => BigInt(s)));
}

const SESSION_INDIVIDUAL_KEYS = 'fair-poker:individualKeys';
const SESSION_REVEALED_BOARD_CARDS = 'fair-poker:revealedBoardCards';

function clearLegacyPersistentItem(key: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
  }
}

function readSessionItem(key: string): string | null {
  clearLegacyPersistentItem(key);
  return sessionStorage.getItem(key);
}

function writeSessionItem(key: string, value: string) {
  clearLegacyPersistentItem(key);
  sessionStorage.setItem(key, value);
}

function normalizeStorageScope(scope: string | undefined) {
  return encodeURIComponent(scope || 'local-table');
}

function getParticipants(settings: MentalPokerRoundSettings): string[] {
  const participants: string[] = [];
  const add = (participant?: string) => {
    if (participant && !participants.includes(participant)) {
      participants.push(participant);
    }
  };

  if (settings.participants?.length) {
    settings.participants.forEach(add);
    return participants;
  }
  add(settings.alice);
  add(settings.bob);
  return participants;
}

function individualKeysStorageKey(scope: string, round: number, participant: string) {
  return `${SESSION_INDIVIDUAL_KEYS}:${normalizeStorageScope(scope)}:${round}:${participant}`;
}

function legacyIndividualKeysStorageKey(round: number, participant: string) {
  return `${SESSION_INDIVIDUAL_KEYS}:${round}:${participant}`;
}

function storeIndividualKeys(scope: string, round: number, participant: string, player: Player, cards: number) {
  const keys: Record<number, { d: string; n: string }> = {};
  for (let i = 0; i < cards; i++) {
    const dk = player.getIndividualKey(i).decryptionKey;
    keys[i] = { d: dk.d.toString(), n: dk.n.toString() };
  }
  const legacyKey = legacyIndividualKeysStorageKey(round, participant);
  clearLegacyPersistentItem(legacyKey);
  sessionStorage.removeItem(legacyKey);
  writeSessionItem(individualKeysStorageKey(scope, round, participant), JSON.stringify(keys));
}

function loadIndividualKeys(scope: string, round: number, participant: string): Map<number, DecryptionKey> {
  const result = new Map<number, DecryptionKey>();
  const legacyKey = legacyIndividualKeysStorageKey(round, participant);
  clearLegacyPersistentItem(legacyKey);
  sessionStorage.removeItem(legacyKey);
  const storageKey = individualKeysStorageKey(scope, round, participant);
  const stored = readSessionItem(storageKey);
  if (stored) {
    const keys: Record<string, { d: string; n: string }> = JSON.parse(stored);
    for (const [offset, key] of Object.entries(keys)) {
      result.set(Number(offset), new DecryptionKey(BigInt(key.d), BigInt(key.n)));
    }
  }
  return result;
}

function revealedBoardCardStorageKey(scope: string, round: number) {
  return `${SESSION_REVEALED_BOARD_CARDS}:${normalizeStorageScope(scope)}:${round}`;
}

function legacyRevealedBoardCardStorageKey(round: number) {
  return `${SESSION_REVEALED_BOARD_CARDS}:${round}`;
}

function storeRevealedBoardCard(scope: string, round: number, offset: number, card: StandardCard) {
  if (offset < 0 || offset > 4) {
    return;
  }
  const legacyKey = legacyRevealedBoardCardStorageKey(round);
  clearLegacyPersistentItem(legacyKey);
  sessionStorage.removeItem(legacyKey);
  const storageKey = revealedBoardCardStorageKey(scope, round);
  const stored = readSessionItem(storageKey);
  const cards: Record<string, StandardCard> = stored ? JSON.parse(stored) : {};
  cards[String(offset)] = card;
  writeSessionItem(storageKey, JSON.stringify(cards));
}

function loadRevealedBoardCards(scope: string, round: number): Map<number, StandardCard> {
  const result = new Map<number, StandardCard>();
  const legacyKey = legacyRevealedBoardCardStorageKey(round);
  clearLegacyPersistentItem(legacyKey);
  sessionStorage.removeItem(legacyKey);
  const stored = readSessionItem(revealedBoardCardStorageKey(scope, round));
  if (!stored) {
    return result;
  }
  const cards: Record<string, StandardCard> = JSON.parse(stored);
  for (const [offset, card] of Object.entries(cards)) {
    if (card && offset && Number(offset) >= 0 && Number(offset) <= 4) {
      result.set(Number(offset), card);
    }
  }
  return result;
}

class MentalPokerRound {
  mentalPokerSettings: Deferred<MentalPokerRoundSettings> = new Deferred();
  participants: string[] = [];
  players: Map<string, Deferred<Player | null>> = new Map();
  sharedPublicKey: Deferred<PublicKey> = new Deferred();
  deck: Deferred<EncodedDeck> = new Deferred();
  decryptionKeys: Array<Map<string, Deferred<DecryptionKey>>> = new Array(CARDS).fill({}).map(() => new Map());
  individualKeys: Map<string, Map<number, DecryptionKey>> = new Map();

  setParticipants(participants: string[]) {
    this.participants = participants;
    for (const participant of participants) {
      if (!this.players.has(participant)) {
        this.players.set(participant, new Deferred<Player | null>());
      }
      if (!this.individualKeys.has(participant)) {
        this.individualKeys.set(participant, new Map());
      }
      for (const cardKeys of this.decryptionKeys) {
        if (!cardKeys.has(participant)) {
          cardKeys.set(participant, new Deferred<DecryptionKey>());
        }
      }
    }
  }

  playerDeferred(participant: string): Deferred<Player | null> {
    let existing = this.players.get(participant);
    if (!existing) {
      existing = new Deferred<Player | null>();
      this.players.set(participant, existing);
    }
    return existing;
  }

  cardKeyDeferred(cardOffset: number, participant: string): Deferred<DecryptionKey> {
    let existing = this.decryptionKeys[cardOffset].get(participant);
    if (!existing) {
      existing = new Deferred<DecryptionKey>();
      this.decryptionKeys[cardOffset].set(participant, existing);
    }
    return existing;
  }
}

export interface MentalPokerGameRoomEvents {
  connected: (peerId: string) => void;
  status: (status: GameRoomStatus) => void;
  members: (members: string[]) => void;

  shuffled: () => void;
  card: (round: number, offset: number, card: StandardCard) => void;
}

export interface GameRoomLike<T> {
  listener: EventListener<GameRoomEvents<GameEvent<T>>>;
  peerIdAsync: Promise<string>;
  peerId?: string;
  status?: GameRoomStatus;
  emitEvent: (e: GameEvent<T>) => Promise<void>;
  members: string[];
  close: () => void;
}

export default class MentalPokerGameRoom {
  private readonly emitter = new EventEmitter<MentalPokerGameRoomEvents>();
  private readonly gameRoom: GameRoomLike<MentalPokerEvent>;
  private readonly storageScope: string;
  private round: number = 0;

  private dataByRounds: Map<number, MentalPokerRound> = new Map();

  private readonly lcm = new LifecycleManager();

  // Local RSA-OAEP keypair (optional) and the authenticated map of peer
  // encryption public keys collected from `identity/encryptionKey` announces.
  private readonly cryptoOptions?: MentalPokerCryptoOptions;
  private readonly peerEncryptionKeys: Map<string, Deferred<CryptoKey>> = new Map();

  constructor(
    gameRoom: GameRoomLike<MentalPokerEvent | any>,
    storageScope?: string,
    cryptoOptions?: MentalPokerCryptoOptions,
  ) {
    this.gameRoom = gameRoom;
    this.storageScope = storageScope || 'local-table';
    this.cryptoOptions = cryptoOptions;

    this.propagate('status');
    this.propagate('connected');
    this.propagate('members');

    this.gameRoom.listener.on('event', this.lcm.register(({ data }, who, replay) => {
      // Reject structurally invalid deck/key wire events before they reach
      // BigInt() and the SRA crypto, so malformed/oversized payloads cannot
      // throw, stall, or corrupt the deck. Only mental-poker events are gated
      // here; other event types pass through untouched. (Audit C03/C04/C05/E02.)
      if (isMentalPokerEventType((data as {type?: unknown}).type)) {
        const validation = validateMentalPokerEvent(data);
        if (!validation.ok) {
          console.warn(`Dropping invalid mental-poker event: ${validation.reason}`);
          return;
        }
      }
      switch (data.type) {
        case 'start':
          this.handleRoundStartEvent(data, !!replay);
          break;
        case 'deck/shuffle':
          this.handleDeckShuffleEvent(data, !!replay, who);
          break;
        case 'deck/lock':
          this.handleDeckLockEvent(data, !!replay, who);
          break;
        case 'deck/finalized':
          this.handleDeckFinalizedEvent(data, who);
          break;
        case 'card/decrypt':
          this.handleCardDecrypted(data, who);
          break;
        case 'identity/encryptionKey':
          void this.handleEncryptionKeyAnnounce(data, who);
          break;
      }
    }, listener => this.gameRoom.listener.off('event', listener)));
  }

  async startNewRound(settings: MentalPokerRoundSettings) {
    this.dataByRounds.delete(this.round);

    const newRound = ++this.round;
    this.getOrCreateDataForRound(newRound);

    await this.firePublicEvent({
      type: 'start',
      round: newRound,
      mentalPokerSettings: settings,
    });

    return newRound;
  }

  get members() {
    return this.gameRoom.members;
  }

  get peerId() {
    return this.gameRoom.peerId;
  }

  get status() {
    return this.gameRoom.status ?? 'NotReady';
  }

  private getOrCreateDataForRound(round: number): MentalPokerRound {
    if (this.round < round) {
      this.round = round;
    }
    const existing = this.dataByRounds.get(round);
    if (existing) {
      return existing;
    }

    const newRoundData = new MentalPokerRound();

    // bind events
    newRoundData.decryptionKeys.forEach((_decryptionKey, offset) => {
      newRoundData.mentalPokerSettings.promise.then(settings => {
        const participants = getParticipants(settings);
        newRoundData.setParticipants(participants);
        Promise.all([
          ...participants.map(participant => newRoundData.cardKeyDeferred(offset, participant).promise),
          newRoundData.deck.promise,
        ]).then(async (values) => {
          const deck = values[values.length - 1] as EncodedDeck;
          const keys = values.slice(0, -1) as DecryptionKey[];
          const fullyDecrypted = keys.reduce(
            (encryptedCard, key) => key.decrypt(encryptedCard),
            deck.cards[offset],
          );
          const encodedCard = Number(fullyDecrypted);
          if (!isEncodedStandardCard(encodedCard)) {
            console.warn(`Ignoring invalid decrypted card for round ${round}, offset ${offset}.`);
            return;
          }
          const card = decodeStandardCard(encodedCard);
          storeRevealedBoardCard(this.storageScope, round, offset, card);
          console.log(`The card [${offset}] has been decrypted: ${card.suit} ${card.rank}`);
          this.emitter.emit('card', round, offset, card);
        }).catch(err => {
          console.warn(`Unable to decrypt card for round ${round}, offset ${offset}.`, err);
        });
      });
    });
    newRoundData.deck.promise.then(() => {
      this.emitter.emit('shuffled');
    });

    this.dataByRounds.set(round, newRoundData);
    for (const [offset, card] of Array.from(loadRevealedBoardCards(this.storageScope, round).entries())) {
      this.emitter.emit('card', round, offset, card);
    }
    return newRoundData;
  }

  private async getDecryptionKeyForCard(
    roundData: MentalPokerRound,
    cardOffset: number,
    participant: string,
  ): Promise<{ d: string; n: string } | null> {
    const myPeerId = await this.gameRoom.peerIdAsync;
    if (participant === myPeerId) {
      const player = await roundData.playerDeferred(participant).promise;
      if (player) {
        const dk = player.getIndividualKey(cardOffset).decryptionKey;
        return { d: dk.d.toString(), n: dk.n.toString() };
      }
    }

    // Fall back to tab-session individual keys after page refresh/replay.
    // Do not persist per-card decryption material in localStorage.
    const storedKeys = roundData.individualKeys.get(participant);
    if (!storedKeys) {
      return null;
    }
    const dk = storedKeys.get(cardOffset);
    return dk ? { d: dk.d.toString(), n: dk.n.toString() } : null;
  }

  private async participantsForRound(roundData: MentalPokerRound): Promise<string[]> {
    if (roundData.participants.length > 0) {
      return roundData.participants;
    }
    const settings = await roundData.mentalPokerSettings.promise;
    const participants = getParticipants(settings);
    roundData.setParticipants(participants);
    return participants;
  }

  async showCard(round: number, cardOffset: number) {
    const roundData = this.dataByRounds.get(round);
    if (!roundData) {
      console.warn(`There is no round ${round}.`);
      return;
    }

    const participants = await this.participantsForRound(roundData);
    for (const participant of participants) {
      const dk = await this.getDecryptionKeyForCard(roundData, cardOffset, participant);
      if (dk) {
        console.debug(`[${participant}] showing the card [ ${cardOffset} ] to all the players.`);
        await this.firePublicEvent({
          type: 'card/decrypt',
          round,
          cardOffset,
          player: participant,
          decryptionKey: dk,
        });
      }
    }
  }

  async dealCard(round: number, cardOffset: number, recipient: string) {
    const roundData = this.dataByRounds.get(round);
    if (!roundData) {
      console.warn(`There is no round ${round}.`);
      return;
    }

    const myPeerId = await this.gameRoom.peerIdAsync;
    const participants = await this.participantsForRound(roundData);
    for (const participant of participants) {
      const dk = await this.getDecryptionKeyForCard(roundData, cardOffset, participant);
      if (dk) {
        // Resolve our own card locally with the plaintext key (never hits the wire).
        if (recipient === myPeerId) {
          await this.handleCardDecrypted(
            {type: 'card/decrypt', round, cardOffset, player: participant, decryptionKey: dk},
            participant,
          );
        }
        // Wire event: end-to-end sealed to the recipient when crypto is enabled
        // (relay sees only ciphertext); legacy plaintext otherwise. Fail closed
        // (skip + let the caller retry) rather than ever downgrade to plaintext.
        const wireEvent = await this.buildCardDecryptWireEvent(participant, dk, recipient, round, cardOffset);
        if (!wireEvent) {
          continue;
        }
        console.debug(`Dealing the card [ ${cardOffset} ] to ${recipient}.`);
        await this.firePrivateEvent(wireEvent, recipient);
      }
    }
  }

  private async buildCardDecryptWireEvent(
    participant: string,
    dk: { d: string; n: string },
    recipient: string,
    round: number,
    cardOffset: number,
  ): Promise<DecryptCardEvent | null> {
    const base = {type: 'card/decrypt' as const, round, cardOffset, player: participant};
    if (!this.cryptoOptions) {
      return {...base, decryptionKey: dk};
    }
    const recipientKey = await this.awaitPeerEncryptionKey(recipient);
    if (!recipientKey) {
      console.warn(`No encryption key available for ${recipient} yet; deferring sealed deal for round ${round} card ${cardOffset} (will retry).`);
      return null;
    }
    const sealedKey = await sealCardKey(dk, {sender: participant, recipient, round, cardOffset}, recipientKey);
    return {...base, sealedKey};
  }

  private async awaitPeerEncryptionKey(peerId: string, timeoutMs = 8000): Promise<CryptoKey | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
      (timer as unknown as {unref?: () => void}).unref?.();
    });
    try {
      return await Promise.race([this.getPeerEncryptionKey(peerId), timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  get listener(): EventListener<MentalPokerGameRoomEvents> {
    return this.emitter;
  }

  close() {
    this.gameRoom.close();
    this.lcm.close();
  }

  private propagate(eventName: (keyof (GameRoomEvents<MentalPokerEvent> | MentalPokerGameRoomEvents))) {
    this.gameRoom.listener.on(eventName, this.lcm.register((...args) => {
      this.emitter.emit(eventName, ...args);
    }, listener => this.gameRoom.listener.off(eventName, listener)));
  }

  private async handleRoundStartEvent(e: RoundStartEvent, replay: boolean) {
    const settings = e.mentalPokerSettings;
    const participants = getParticipants(settings);

    const roundData = this.getOrCreateDataForRound(e.round);
    roundData.setParticipants(participants);
    roundData.mentalPokerSettings.resolve(settings);

    if (replay) {
      // During replay, skip Player creation and outgoing events.
      // The deck and card/decrypt events are already in the log
      // and will be replayed, resolving decryption keys directly.
      // Load stored individual keys so showCard/dealCard can work post-replay.
      for (const participant of participants) {
        roundData.playerDeferred(participant).resolve(null);
        roundData.individualKeys.set(participant, loadIndividualKeys(this.storageScope, e.round, participant));
      }
      return;
    }

    const myPeerId = await this.gameRoom.peerIdAsync;
    if (participants[0] === myPeerId) {
      console.debug(`Creating mental poker player ${myPeerId}`);
      const playerPromise = createPlayer({
        cards: CARDS,
        bits: settings.bits ?? DEFAULT_MENTAL_POKER_BITS,
      });
      roundData.playerDeferred(myPeerId).resolve(playerPromise);

      const player = await playerPromise;
      storeIndividualKeys(this.storageScope, e.round, myPeerId, player, CARDS);

      console.debug(`Encrypting and shuffling the deck by ${myPeerId}.`);

      const standard52Deck = getStandard52Deck();
      const deckEncoded = new EncodedDeck(
        standard52Deck.map((card) => BigInt(encodeStandardCard(card)))
      );
      const deckEncrypted = encryptAndSecureShuffle(player, deckEncoded);
      await this.firePublicEvent({
        type: 'deck/shuffle',
        round: e.round,
        player: myPeerId,
        shuffleIndex: 0,
        deck: toStringEncodedDeck(deckEncrypted),
        publicKey: {
          p: player.publicKey.p.toString(),
          q: player.publicKey.q.toString(),
        }
      });
    }
  }

  private async createLocalPlayer(
    round: number,
    roundData: MentalPokerRound,
    settings: MentalPokerRoundSettings,
    participant: string,
    publicKey: PublicKey,
  ): Promise<Player> {
    console.debug(`Creating mental poker player ${participant}`);
    const playerPromise = createPlayer({
      cards: CARDS,
      publicKey,
      bits: settings.bits ?? DEFAULT_MENTAL_POKER_BITS,
    });
    roundData.playerDeferred(participant).resolve(playerPromise);

    const player = await playerPromise;
    storeIndividualKeys(this.storageScope, round, participant, player, CARDS);
    return player;
  }

  private senderMatchesEventPlayer(sender: string | undefined, e: {type: string; round: number; player: string}) {
    if (!sender || sender === e.player) {
      return true;
    }
    console.warn(`Ignoring ${e.type} event for round ${e.round}: sender ${sender} cannot act as ${e.player}.`);
    return false;
  }

  private async handleDeckShuffleEvent(e: DeckShuffleEvent, replay: boolean, sender?: string) {
    if (!this.senderMatchesEventPlayer(sender, e)) {
      return;
    }
    if (replay) return;
    const roundData = this.getOrCreateDataForRound(e.round);
    const settings = await roundData.mentalPokerSettings.promise;
    const participants = getParticipants(settings);
    roundData.setParticipants(participants);
    const myPeerId = await this.gameRoom.peerIdAsync;
    const expectedPlayer = participants[e.shuffleIndex];

    if (!expectedPlayer || e.player !== expectedPlayer) {
      console.warn(`Ignoring out-of-order shuffle event for round ${e.round}.`);
      return;
    }

    if (e.publicKey) {
      roundData.sharedPublicKey.resolve(new PublicKey(BigInt(e.publicKey.p), BigInt(e.publicKey.q)));
    }

    const nextShuffleIndex = e.shuffleIndex + 1;
    if (nextShuffleIndex < participants.length) {
      const nextParticipant = participants[nextShuffleIndex];
      if (nextParticipant === myPeerId) {
        const sharedPublicKey = await roundData.sharedPublicKey.promise;
        const player = await this.createLocalPlayer(e.round, roundData, settings, myPeerId, sharedPublicKey);

        console.debug(`Encrypting and shuffling the deck by ${myPeerId}.`);
        const encryptedDeck = encryptAndSecureShuffle(player, toBigIntEncodedDeck(e.deck));

        await this.firePublicEvent({
          type: 'deck/shuffle',
          round: e.round,
          player: myPeerId,
          shuffleIndex: nextShuffleIndex,
          deck: toStringEncodedDeck(encryptedDeck),
        });
      }
      return;
    }

    if (participants[0] === myPeerId) {
      const player = await roundData.playerDeferred(myPeerId).promise;
      if (!player) return;

      console.debug(`Removing main lock and adding per-card locks by ${myPeerId}.`);
      const lockedDeck = player.decryptAndEncryptIndividually(toBigIntEncodedDeck(e.deck));
      await this.firePublicEvent({
        type: 'deck/lock',
        round: e.round,
        player: myPeerId,
        lockIndex: 0,
        deck: toStringEncodedDeck(lockedDeck),
      });
    }
  }

  private async handleDeckLockEvent(e: DeckLockEvent, replay: boolean, sender?: string) {
    if (!this.senderMatchesEventPlayer(sender, e)) {
      return;
    }
    if (replay) return;
    const roundData = this.getOrCreateDataForRound(e.round);
    const settings = await roundData.mentalPokerSettings.promise;
    const participants = getParticipants(settings);
    roundData.setParticipants(participants);
    const myPeerId = await this.gameRoom.peerIdAsync;
    const expectedPlayer = participants[e.lockIndex];

    if (!expectedPlayer || e.player !== expectedPlayer) {
      console.warn(`Ignoring out-of-order lock event for round ${e.round}.`);
      return;
    }

    const nextLockIndex = e.lockIndex + 1;
    if (nextLockIndex < participants.length) {
      const nextParticipant = participants[nextLockIndex];
      if (nextParticipant === myPeerId) {
        const player = await roundData.playerDeferred(myPeerId).promise;
        if (!player) return;

        console.debug(`Removing main lock and adding per-card locks by ${myPeerId}.`);
        const lockedDeck = player.decryptAndEncryptIndividually(toBigIntEncodedDeck(e.deck));
        await this.firePublicEvent({
          type: 'deck/lock',
          round: e.round,
          player: myPeerId,
          lockIndex: nextLockIndex,
          deck: toStringEncodedDeck(lockedDeck),
        });
      }
      return;
    }

    if (expectedPlayer === myPeerId) {
      console.debug(`Deck shuffling is finalized by ${myPeerId}.`);
      await this.firePublicEvent({
        type: 'deck/finalized',
        round: e.round,
        player: myPeerId,
        deck: e.deck,
      });
    }
  }

  private async handleDeckFinalizedEvent(e: DeckFinalizedEvent, sender?: string) {
    if (!this.senderMatchesEventPlayer(sender, e)) {
      return;
    }
    const roundData = this.getOrCreateDataForRound(e.round);
    const settings = await roundData.mentalPokerSettings.promise;
    const participants = getParticipants(settings);
    const expectedPlayer = participants[participants.length - 1];
    if (!expectedPlayer || e.player !== expectedPlayer) {
      console.warn(`Ignoring out-of-order deck finalization event for round ${e.round}.`);
      return;
    }
    roundData.deck.resolve(toBigIntEncodedDeck(e.deck));
  }

  // Returns the plaintext per-card key for an incoming card/decrypt event:
  // opens the sealed key with our private key (verifying the binding) when the
  // event is sealed, or returns the plaintext key for public reveals.
  private async resolveCardKeyMaterial(e: DecryptCardEvent, sender?: string): Promise<{ d: string; n: string } | null> {
    if (e.sealedKey) {
      if (!this.cryptoOptions) {
        console.warn(`Received a sealed card key but no local decryption key is configured (round ${e.round}, card ${e.cardOffset}).`);
        return null;
      }
      const myPeerId = await this.gameRoom.peerIdAsync;
      try {
        return await openCardKey(
          e.sealedKey,
          {sender: sender ?? e.player ?? '', recipient: myPeerId, round: e.round, cardOffset: e.cardOffset},
          this.cryptoOptions.privateKey,
        );
      } catch (error) {
        console.warn(`Failed to open sealed card key (round ${e.round}, card ${e.cardOffset}).`, error);
        return null;
      }
    }
    return e.decryptionKey ?? null;
  }

  private async handleCardDecrypted(e: DecryptCardEvent, sender?: string) {
    const roundData = this.getOrCreateDataForRound(e.round);
    const keyMaterial = await this.resolveCardKeyMaterial(e, sender);
    if (!keyMaterial) {
      return;
    }
    const dk = new DecryptionKey(BigInt(keyMaterial.d), BigInt(keyMaterial.n));
    let participant = e.player;
    if (!participant && e.aliceOrBob) {
      const settings = await roundData.mentalPokerSettings.promise;
      participant = e.aliceOrBob === 'alice' ? settings.alice : settings.bob;
    }
    if (participant) {
      if (sender && sender !== participant) {
        console.warn(`Ignoring card/decrypt event for round ${e.round}, card ${e.cardOffset}: sender ${sender} cannot provide ${participant}'s key.`);
        return;
      }
      roundData.cardKeyDeferred(e.cardOffset, participant).resolve(dk);
    }
  }

  private async firePublicEvent(e: MentalPokerEvent) {
    await this.gameRoom.emitEvent({
      type: 'public',
      sender: await this.gameRoom.peerIdAsync,
      data: e,
    });
  }

  private async firePrivateEvent(e: MentalPokerEvent, recipient: string) {
    await this.gameRoom.emitEvent({
      type: 'private',
      sender: await this.gameRoom.peerIdAsync,
      recipient,
      data: e,
    });
  }

  private peerEncryptionKeyDeferred(peerId: string): Deferred<CryptoKey> {
    let deferred = this.peerEncryptionKeys.get(peerId);
    if (!deferred) {
      deferred = new Deferred<CryptoKey>();
      this.peerEncryptionKeys.set(peerId, deferred);
    }
    return deferred;
  }

  // Resolves a peer's announced RSA-OAEP public key, used to seal private card
  // keys to that peer. Stays pending until the peer announces its key.
  getPeerEncryptionKey(peerId: string): Promise<CryptoKey> {
    return this.peerEncryptionKeyDeferred(peerId).promise;
  }

  // Publishes this client's RSA-OAEP public key (signed public event) so peers
  // can seal private per-card keys to it. No-op without crypto options.
  async announceEncryptionKey(): Promise<void> {
    if (!this.cryptoOptions) {
      return;
    }
    await this.firePublicEvent({
      type: 'identity/encryptionKey',
      publicKeyJwk: this.cryptoOptions.publicKeyJwk,
    });
  }

  private async handleEncryptionKeyAnnounce(e: EncryptionKeyAnnounceEvent, sender?: string) {
    if (!sender) {
      return;
    }
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        e.publicKeyJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt'],
      );
      this.peerEncryptionKeyDeferred(sender).resolve(key);
    } catch (error) {
      console.warn(`Ignoring invalid encryption key announce from ${sender}.`, error);
    }
  }
}
