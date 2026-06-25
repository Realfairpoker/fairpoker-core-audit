import {GameEvent, GameRoomEvents, GameRoomStatus} from "../GameRoom";
import {
  MentalPokerGameRoomEvents,
  MentalPokerRoundSettings
} from "../MentalPokerGameRoom";
import EventEmitter from "eventemitter3";
import LifecycleManager from "../LifecycleManager";
import {EventListener} from "../types";
import {Board, CARDS, evaluateStandardCards, Flop, Hole, River, Turn} from "../rules";
import Deferred from "../Deferred";
import {StandardCard} from "../secureMentalPoker";
import {handRank} from "phe";
import {TranscriptEntry, TranscriptSnapshot} from "../fairness/transcript";

export interface LastOneWins {
  how: 'LastOneWins',
  round: number,
  winner: string,
}

export interface ShowdownResult {
  how: 'Showdown',
  round: number,
  showdown: Array<{
    strength: number;
    handValue: number;
    players: string[];
  }>;
}

export type WinningResult =
  | LastOneWins
  | ShowdownResult;

export interface TexasHoldemGameRoomEvents {
  connected: (peerId: string) => void;
  status: (status: GameRoomStatus) => void;
  members: (members: string[]) => void;
  shuffled: () => void;

  players: (round: number, players: string[]) => void;
  board: (round: number, board: Board) => void;
  hole: (round: number, whose: string, hole: Hole) => void;
  bet: (round: number, amount: number, who: string, allin: boolean) => void;
  fold: (round: number, who: string) => void;
  pot: (round: number, amount: number) => void;

  whoseTurn: (round: number, whose: string | null, actionMeta?: {callAmount: number}) => void;
  allSet: (round: number) => void;
  fund: (fund: number, previousFund: number | undefined, whose: string, borrowed?: boolean) => void;
  winner: (result: WinningResult) => void;
  roundSettings: (round: number, settings: TexasHoldemRoundSettings) => void;
  transcript: (entry: TranscriptEntry<unknown>) => void;
}

export interface GameRoomLike<T> {
  peerIdAsync: Promise<string>;
  listener: EventListener<GameRoomEvents<GameEvent<T>>>;
  emitEvent: (e: GameEvent<T>) => Promise<void>;
  getTranscript?: () => TranscriptSnapshot<T>;
}

export interface MentalPokerGameRoomLike {
  listener: EventListener<MentalPokerGameRoomEvents>;
  peerId?: string;
  status?: GameRoomStatus;
  members: string[];
  startNewRound: (settings: MentalPokerRoundSettings) => Promise<number>;
  showCard: (round: number, cardOffset: number) => Promise<void>;
  dealCard: (round: number, cardOffset: number, recipient: string) => Promise<void>;
}

export interface TexasHoldemRoundSettings {
  bits?: number;
  initialFundAmount: number;
  smallBlindAmount?: number;
  bigBlindAmount?: number;
  autoFoldTimeoutSeconds?: number;
  plannedRounds?: number;
  seriesStartRound?: number;
}

export interface TexasHoldemStateSnapshot {
  currentRound?: number;
  playersByRound: Map<number, string[]>;
  boardByRound: Map<number, Board>;
  holesByRound: Map<number, Map<string, Hole>>;
  whoseTurnByRound: Map<number, { whoseTurn: string; callAmount: number } | null>;
  potAmount: number;
  bankrolls: Map<string, number>;
  winnersByRound: Map<number, WinningResult>;
  settingsByRound: Map<number, TexasHoldemRoundSettings>;
}

export const DEFAULT_SMALL_BLIND_AMOUNT = 1;
export const DEFAULT_BIG_BLIND_AMOUNT = 2;
export const DEFAULT_AUTO_FOLD_TIMEOUT_SECONDS = 60;
const MIN_AUTO_FOLD_TIMEOUT_SECONDS = 5;
const MAX_AUTO_FOLD_TIMEOUT_SECONDS = 300;
export const DEFAULT_ENCRYPTION_BITS = 256;
export const DEFAULT_PLANNED_ROUNDS = 10;
const MIN_PLANNED_ROUNDS = 1;
const MAX_PLANNED_ROUNDS = 100;
const REPLAY_AUTO_FOLD_GRACE_MS = 4000;
const HOLE_KEY_RETRY_DELAYS_MS = [400, 1200, 2600, 5000];

enum Stage {
  PRE_FLOP = 0,
  FLOP = 1,
  TURN = 2,
  RIVER = 3,
}

export interface NewRoundEvent {
  type: 'newRound';
  round: number;
  players: string[];
  settings: TexasHoldemRoundSettings;
}

export interface BetEvent {
  type: 'action/bet';
  round: number;
  amount: number;
}

export interface FoldEvent {
  type: 'action/fold';
  round: number;
}

export interface AutoFoldEvent {
  type: 'action/autoFold';
  round: number;
  target: string;
}

export interface SitOutEvent {
  type: 'action/sitOut';
  round: number;
}

export interface ReturnToTableEvent {
  type: 'action/returnToTable';
  round: number;
}

export type TexasHoldemTableEvent =
  | NewRoundEvent
  | BetEvent
  | FoldEvent
  | AutoFoldEvent
  | SitOutEvent
  | ReturnToTableEvent;

function normalizeAutoFoldTimeoutSeconds(timeoutSeconds: number | undefined) {
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds === undefined) {
    return undefined;
  }
  const normalized = Math.round(timeoutSeconds);
  if (normalized <= 0) {
    return undefined;
  }
  return Math.max(MIN_AUTO_FOLD_TIMEOUT_SECONDS, Math.min(MAX_AUTO_FOLD_TIMEOUT_SECONDS, normalized));
}

function normalizePlannedRounds(plannedRounds: number | undefined) {
  if (!Number.isFinite(plannedRounds) || plannedRounds === undefined) {
    return DEFAULT_PLANNED_ROUNDS;
  }
  const normalized = Math.round(plannedRounds);
  return Math.max(MIN_PLANNED_ROUNDS, Math.min(MAX_PLANNED_ROUNDS, normalized));
}

function normalizeBlindAmount(amount: number | undefined, fallback: number) {
  if (!Number.isFinite(amount) || amount === undefined) {
    return fallback;
  }
  return Math.max(1, Math.round(amount));
}

function normalizeSeriesStartRound(seriesStartRound: number | undefined, fallback: number) {
  if (!Number.isFinite(seriesStartRound) || seriesStartRound === undefined) {
    return fallback;
  }
  return Math.max(1, Math.round(seriesStartRound));
}

function normalizeRoundSettings(settings: TexasHoldemRoundSettings, fallbackSeriesStartRound: number): TexasHoldemRoundSettings {
  const smallBlindAmount = normalizeBlindAmount(settings.smallBlindAmount, DEFAULT_SMALL_BLIND_AMOUNT);
  const bigBlindAmount = Math.max(
    smallBlindAmount + 1,
    normalizeBlindAmount(settings.bigBlindAmount, DEFAULT_BIG_BLIND_AMOUNT),
  );
  return {
    bits: settings.bits ?? DEFAULT_ENCRYPTION_BITS,
    initialFundAmount: settings.initialFundAmount,
    smallBlindAmount,
    bigBlindAmount,
    autoFoldTimeoutSeconds: normalizeAutoFoldTimeoutSeconds(settings.autoFoldTimeoutSeconds),
    plannedRounds: normalizePlannedRounds(settings.plannedRounds),
    seriesStartRound: normalizeSeriesStartRound(settings.seriesStartRound, fallbackSeriesStartRound),
  };
}

class TexasHoldemRound {
  playersOrdered: Deferred<string[]> = new Deferred();
  initialFunds: Deferred<Map<string, number>> = new Deferred();
  knownCards: Array<Deferred<StandardCard>> = new Array(CARDS).fill({}).map(() => new Deferred());
  knownCardValues: Map<number, StandardCard> = new Map();

  pot: Map<string, number> = new Map();
  calledPlayers: Set<string> = new Set();
  foldPlayers: Set<string> = new Set();
  allInPlayers: Set<string> = new Set();

  stage: Stage = Stage.PRE_FLOP;
  showdownReady = false;
  result?: WinningResult = undefined;
  settings?: TexasHoldemRoundSettings;
  currentTurn: string | null = null;
  currentTurnStartedAtMs: number = 0;
  currentTurnTimer?: ReturnType<typeof setTimeout>;
}

export class TexasHoldemGameRoom {
  private readonly gameRoom: GameRoomLike<TexasHoldemTableEvent>;
  private readonly mentalPokerGameRoom: MentalPokerGameRoomLike;
  private readonly emitter = new EventEmitter<TexasHoldemGameRoomEvents>();

  private readonly lcm = new LifecycleManager();

  private round: number = 0;
  private dataByRounds: Map<number, TexasHoldemRound> = new Map();

  private funds: Map<string, number> = new Map();
  private sittingOutPlayers: Set<string> = new Set();
  private playersByRound: Map<number, string[]> = new Map();
  private boardByRound: Map<number, Board> = new Map();
  private holesByRound: Map<number, Map<string, Hole>> = new Map();
  private whoseTurnByRound: Map<number, { whoseTurn: string; callAmount: number } | null> = new Map();
  private potAmount: number = 0;
  private winnersByRound: Map<number, WinningResult> = new Map();
  private settingsByRound: Map<number, TexasHoldemRoundSettings> = new Map();
  private holeKeyRetryTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  // During replay, Raft's applyCommitted fires all events synchronously via
  // EventEmitter.  Async handlers (handleBetEvent, handleFoldEvent) modify
  // shared state (calledPlayers) synchronously but defer continueUnlessAllSet
  // to microtasks.  Without serialization, every bet's synchronous part runs
  // before any continueUnlessAllSet, corrupting the per-stage called tracking.
  // Chain replay events so each handler completes before the next starts.
  private replayChain: Promise<void> = Promise.resolve();

  constructor(
    gameRoom: GameRoomLike<TexasHoldemTableEvent | any>,
    mentalPokerGameRoom: MentalPokerGameRoomLike,
  ) {
    this.gameRoom = gameRoom;
    this.mentalPokerGameRoom = mentalPokerGameRoom;

    this.propagate('connected');
    this.propagate('status');
    this.propagate('members');
    this.propagate('shuffled');

    mentalPokerGameRoom.listener.on('members', this.lcm.register((members) => {
      this.handleMembersChanged(members);
    }, listener => mentalPokerGameRoom.listener.off('members', listener)));

    this.gameRoom.listener.on('transcript', this.lcm.register((entry) => {
      this.emitter.emit('transcript', entry);
    }, listener => this.gameRoom.listener.off('transcript', listener)));

    // mental poker event listeners
    mentalPokerGameRoom.listener.on('card', this.lcm.register(async (round, offset, card) => {
      const roundData = this.getOrCreateDataForRound(round);
      roundData.knownCardValues.set(offset, card);
      roundData.knownCards[offset].resolve(card);
      this.tryResolveShowdown(round, roundData);
    }, listener => mentalPokerGameRoom.listener.off('card', listener)));

    // texas holdem event listeners
    this.gameRoom.listener.on('event', this.lcm.register(({ data }, who, replay) => {
      const handle = () => {
        switch (data.type) {
          case 'newRound':
            return this.handleNewRoundEvent(data, !!replay);
          case 'action/bet':
            return this.handleBetEvent(data, who, !!replay);
          case 'action/fold':
            return this.handleFoldEvent(data, who, !!replay);
          case 'action/autoFold':
            return this.handleAutoFoldEvent(data, !!replay);
          case 'action/sitOut':
            return this.handleSitOutEvent(data, who, !!replay);
          case 'action/returnToTable':
            return this.handleReturnToTableEvent(data, who);
        }
      };

      if (replay) {
        this.replayChain = this.replayChain.then(handle);
      } else {
        handle();
      }
    }, listener => this.gameRoom.listener.off('event', listener)));
  }

  async startNewRound(settings: TexasHoldemRoundSettings) {
    const normalizedSettings = normalizeRoundSettings(settings, settings.seriesStartRound ?? this.round + 1);
    const seatedPlayers = this.mentalPokerGameRoom.members
      .filter(player => !this.sittingOutPlayers.has(player));
    const seatedPlayerSet = new Set(seatedPlayers);
    const previousPlayers = this.playersByRound.get(this.round);
    const previousPlayersStillSeated = previousPlayers
      ? previousPlayers.filter(player => seatedPlayerSet.has(player))
      : [];
    const newSeatedPlayers = seatedPlayers.filter(player => !previousPlayersStillSeated.includes(player));
    const players: string[] = previousPlayersStillSeated.length > 0
      ? [...previousPlayersStillSeated, ...newSeatedPlayers]
      : seatedPlayers;
    if (players.length < 2) {
      throw new Error('There should be at least 2 players to start a new round.');
    }

    const sbOffset = this.round % players.length;
    const playersOrdered = [
      ...players.slice(sbOffset),
      ...players.slice(0, sbOffset),
    ];

    const deckReady = new Promise<void>(resolve => {
      const handler = () => {
        this.mentalPokerGameRoom.listener.off('shuffled', handler);
        resolve();
      };
      this.mentalPokerGameRoom.listener.on('shuffled', handler);
    });

    this.round = await this.mentalPokerGameRoom.startNewRound({
      participants: playersOrdered,
      bits: normalizedSettings.bits,
    });

    // Wait for the deck protocol (encrypt/shuffle/finalize) to complete
    // before firing newRound. This ensures all protocol events are committed
    // to the Raft log, so a page refresh at any point after the game UI
    // appears can be fully replayed.
    await deckReady;

    await this.gameRoom.emitEvent({
      type: 'public',
      sender: await this.gameRoom.peerIdAsync,
      data: {
        type: 'newRound',
        round: this.round,
        settings: normalizedSettings,
        players: playersOrdered,
      },
    });
  }

  async bet(round: number, amount: number) {
    await this.clearLocalTurnTimerForSubmittedAction(round);
    await this.gameRoom.emitEvent({
      type: 'public',
      sender: await this.gameRoom.peerIdAsync,
      data: {
        type: 'action/bet',
        round,
        amount,
      },
    });
  }

  async fold(round: number) {
    await this.clearLocalTurnTimerForSubmittedAction(round);
    await this.gameRoom.emitEvent({
      type: 'public',
      sender: await this.gameRoom.peerIdAsync,
      data: {
        type: 'action/fold',
        round,
      },
    });
  }

  async autoFold(round: number, target: string) {
    await this.gameRoom.emitEvent({
      type: 'public',
      sender: await this.gameRoom.peerIdAsync,
      data: {
        type: 'action/autoFold',
        round,
        target,
      },
    });
  }

  async sitOut(round: number) {
    await this.clearLocalTurnTimerForSubmittedAction(round);
    await this.gameRoom.emitEvent({
      type: 'public',
      sender: await this.gameRoom.peerIdAsync,
      data: {
        type: 'action/sitOut',
        round,
      },
    });
  }

  async returnToTable(round: number) {
    await this.gameRoom.emitEvent({
      type: 'public',
      sender: await this.gameRoom.peerIdAsync,
      data: {
        type: 'action/returnToTable',
        round,
      },
    });
  }

  get listener(): EventListener<TexasHoldemGameRoomEvents> {
    return this.emitter;
  }

  get peerId() {
    return this.mentalPokerGameRoom.peerId;
  }

  get status() {
    return this.mentalPokerGameRoom.status ?? 'NotReady';
  }

  get members() {
    return this.mentalPokerGameRoom.members;
  }

  close() {
    for (const roundData of Array.from(this.dataByRounds.values())) {
      this.clearTurnTimer(roundData);
    }
    for (const timer of Array.from(this.holeKeyRetryTimers)) {
      clearTimeout(timer);
    }
    this.holeKeyRetryTimers.clear();
    this.lcm.close();
  }

  getTranscript(): TranscriptSnapshot<TexasHoldemTableEvent> | null {
    return this.gameRoom.getTranscript?.() ?? null;
  }

  getStateSnapshot(): TexasHoldemStateSnapshot {
    return {
      currentRound: this.round || undefined,
      playersByRound: new Map(Array.from(this.playersByRound.entries()).map(([round, players]) => [round, [...players]])),
      boardByRound: new Map(Array.from(this.boardByRound.entries()).map(([round, board]) => [round, [...board] as Board])),
      holesByRound: new Map(Array.from(this.holesByRound.entries()).map(([round, holes]) => [round, new Map(holes)])),
      whoseTurnByRound: new Map(this.whoseTurnByRound),
      potAmount: this.potAmount,
      bankrolls: new Map(this.funds),
      winnersByRound: new Map(this.winnersByRound),
      settingsByRound: new Map(this.settingsByRound),
    };
  }

  private propagate(eventName: (keyof (MentalPokerGameRoomEvents | TexasHoldemGameRoomEvents))) {
    this.mentalPokerGameRoom.listener.on(eventName, this.lcm.register((...args) => {
      this.emitter.emit(eventName, ...args);
    }, listener => this.mentalPokerGameRoom.listener.off(eventName, listener)));
  }

  private getOrCreateDataForRound(round: number): TexasHoldemRound {
    if (this.round < round) {
      this.round = round;
    }
    const existing = this.dataByRounds.get(round);
    if (existing) {
      return existing;
    }

    const roundData = new TexasHoldemRound();

    // bind events
    this.registerBoardEvents(round, roundData);

    // hole
    this.registerHoleEvents(round, roundData);

    // winner (for showdown)
    this.registerWinnerEvents(round, roundData);

    this.dataByRounds.set(round, roundData);
    return roundData;
  }

  private registerBoardEvents(round: number, roundData: TexasHoldemRound) {
    Promise.all(roundData.knownCards.slice(0, 3).map(d => d.promise)).then(flop => {
      roundData.stage = Stage.FLOP;
      this.boardByRound.set(round, [...flop] as Flop);
      this.emitter.emit('board', round, flop as Flop);
    });
    Promise.all(roundData.knownCards.slice(0, 4).map(d => d.promise)).then(turn => {
      roundData.stage = Stage.TURN;
      this.boardByRound.set(round, [...turn] as Turn);
      this.emitter.emit('board', round, turn as Turn);
    });
    Promise.all(roundData.knownCards.slice(0, 5).map(d => d.promise)).then(river => {
      roundData.stage = Stage.RIVER;
      this.boardByRound.set(round, [...river] as River);
      this.emitter.emit('board', round, river as River);
    });
  }

  private registerHoleEvents(round: number, roundData: TexasHoldemRound) {
    for (let i = 5; (i + 1) < roundData.knownCards.length; i += 2) {
      Promise.all([
        roundData.knownCards[i].promise,
        roundData.knownCards[i + 1].promise,
        roundData.playersOrdered.promise,
      ]).then(([hole1, hole2, playersOrdered]) => {
        const hole: Hole = [hole1, hole2];
        const playerOffset = Math.floor((i - 5) / 2);
        if (playerOffset < playersOrdered.length) {
          const holes = this.holesByRound.get(round) ?? new Map<string, Hole>();
          holes.set(playersOrdered[playerOffset], hole);
          this.holesByRound.set(round, holes);
          this.emitter.emit('hole', round, playersOrdered[playerOffset], hole);
        }
      });
    }
  }

  private registerWinnerEvents(round: number, roundData: TexasHoldemRound) {
    roundData.playersOrdered.promise.then(() => this.tryResolveShowdown(round, roundData));
  }

  private async tryResolveShowdown(round: number, roundData: TexasHoldemRound) {
    if (!roundData.showdownReady || roundData.result) {
      return;
    }
    const players = await roundData.playersOrdered.promise;
    if (roundData.result) {
      return;
    }

    const eligiblePlayers = players
      .map((player, playerOffset) => ({player, playerOffset}))
      .filter(({player}) => !roundData.foldPlayers.has(player));
    if (eligiblePlayers.length < 2) {
      return;
    }

    const requiredOffsets = [
      0, 1, 2, 3, 4,
      ...eligiblePlayers.flatMap(({playerOffset}) => [
        playerOffset * 2 + 5,
        playerOffset * 2 + 6,
      ]),
    ];
    if (!requiredOffsets.every(offset => roundData.knownCardValues.has(offset))) {
      return;
    }

    const board = [0, 1, 2, 3, 4].map(offset => roundData.knownCardValues.get(offset)!);
    const strengthOfPlayers: Array<{
      player: string;
      handValue: number;
      strength: number;
    }> = [];
    for (const {player, playerOffset} of eligiblePlayers) {
      const holeOffsets = [
        playerOffset * 2 + 5,
        playerOffset * 2 + 6,
      ];
      const hole = [
        roundData.knownCardValues.get(holeOffsets[0])!,
        roundData.knownCardValues.get(holeOffsets[1])!,
      ];
      const strength = evaluateStandardCards([...hole, ...board]);
      const handValue = handRank(strength);
      strengthOfPlayers.push({
        player,
        handValue,
        strength,
      });
    }

    const result: ShowdownResult['showdown'] = [];
    for (const s of strengthOfPlayers.sort((s1, s2) => s1.strength - s2.strength)) {
      const last = result.length > 0 ? result[result.length - 1] : null;
      if (last && last.strength === s.strength) {
        last.players.push(s.player);
      } else {
        result.push({
          players: [s.player],
          handValue: s.handValue,
          strength: s.strength,
        });
      }
    }

    roundData.result = {
      how: 'Showdown',
      round,
      showdown: result,
    };
    this.clearTurnTimer(roundData);
    this.winnersByRound.set(round, roundData.result);
    this.emitter.emit('winner', roundData.result);

    const awards = this.calculateAwards(roundData, result);
    for (let [winner, award] of Array.from(awards.entries())) {
      const newFundOfWinner = (this.funds.get(winner) ?? 0) + award;
      this.updateFundOfPlayer(winner, newFundOfWinner);
    }
  }

  private calculateAwards(roundData: TexasHoldemRound, showdownResult: ShowdownResult['showdown']) {
    const pot = new Map(roundData.pot);
    const amountsToBeUpdated = new Map<string, number>();
    for (let result of showdownResult) {
      const winners = result.players.sort((p1, p2) => (pot.get(p1) ?? 0) - (pot.get(p2) ?? 0));
      let amountUnallocated: number = 0;
      for (let winnerOffset = 0; winnerOffset < winners.length; ++winnerOffset) {
        let winner = winners[winnerOffset];
        const betPortion = pot.get(winner) ?? 0;

        for (let [p, betAmount] of Array.from(pot.entries())) {
          const wonAmount = Math.min(betPortion, betAmount);
          amountUnallocated += wonAmount;
          const remaining = betAmount - wonAmount;
          if (remaining === 0) {
            pot.delete(p);
          } else {
            pot.set(p, remaining);
          }
        }

        const wonPortion = Math.floor(amountUnallocated / (winners.length - winnerOffset));
        amountUnallocated -= wonPortion;
        console.log(`Player ${winner} won ${wonPortion}.`);
        amountsToBeUpdated.set(winner, (amountsToBeUpdated.get(winner) ?? 0) + wonPortion);
      }
    }
    // remaining
    for (let [p, remaining] of Array.from(pot.entries())) {
      amountsToBeUpdated.set(p, (amountsToBeUpdated.get(p) ?? 0) + remaining);
    }
    // remove zero amount
    for (let [p, amount] of Array.from(amountsToBeUpdated)) {
      if (amount === 0) {
        amountsToBeUpdated.delete(p);
      }
    }
    return amountsToBeUpdated;
  }

  private async handleNewRoundEvent(e: NewRoundEvent, replay: boolean) {
    const normalizedSettings = normalizeRoundSettings(e.settings, e.round);
    for (let player of e.players) {
      const fund = this.funds.get(player);
      if (!fund || fund < normalizedSettings.bigBlindAmount!) {
        this.updateFundOfPlayer(player, (fund ?? 0) + normalizedSettings.initialFundAmount, true);
      }
    }

    const roundData = this.getOrCreateDataForRound(e.round);
    roundData.settings = normalizedSettings;
    this.settingsByRound.set(e.round, normalizedSettings);
    this.playersByRound.set(e.round, [...e.players]);
    roundData.playersOrdered.resolve(e.players);
    this.emitter.emit('roundSettings', e.round, roundData.settings);
    this.emitter.emit('players', e.round, e.players);
    roundData.initialFunds.resolve(new Map(this.funds));

    if (!replay) {
      await this.dealInitialHoleCards(e.round, e.players);
      this.scheduleHoleKeyRetry(e.round, e.players, roundData);
    }

    // Process blind bets synchronously (no await) to avoid race conditions
    // during replay, where subsequent events can interleave with async microtasks
    // and overwrite the correct whoseTurn state.
    // handleBet with isSbBbFirstBet=true has no real async operations.
    const smallBlindAmount = normalizedSettings.smallBlindAmount!;
    const bigBlindAmount = normalizedSettings.bigBlindAmount!;
    this.handleBet(e.round, smallBlindAmount, e.players[0], true);
    this.handleBet(e.round, bigBlindAmount, e.players[1], true);

    const playerNextToBb = e.players[2 % e.players.length];
    this.emitWhoseTurn(e.round, roundData, playerNextToBb, {
      callAmount: e.players.length === 2 ? bigBlindAmount - smallBlindAmount : bigBlindAmount,
    }, replay);
  }

  private async dealInitialHoleCards(round: number, players: string[]) {
    // [0] to [4] are the board cards, hole cards start from [5].
    // Re-sending these private decrypt-key events is safe: each event carries
    // the same per-card key and Deferred resolution is idempotent.
    for (let i = 0; i < players.length; ++i) {
      const holeOffsets = [
        i * 2 + 5,
        i * 2 + 6,
      ];

      await this.mentalPokerGameRoom.dealCard(round, holeOffsets[0], players[i]);
      await this.mentalPokerGameRoom.dealCard(round, holeOffsets[1], players[i]);
    }
  }

  private scheduleHoleKeyRetry(round: number, players: string[], roundData: TexasHoldemRound, attempt = 0) {
    const delayMs = HOLE_KEY_RETRY_DELAYS_MS[attempt];
    if (delayMs === undefined || roundData.result || this.areLocalInitialHoleCardsKnown(players, roundData)) {
      return;
    }
    const timer = setTimeout(() => {
      this.holeKeyRetryTimers.delete(timer);
      if (roundData.result || this.areLocalInitialHoleCardsKnown(players, roundData)) {
        return;
      }
      void this.dealInitialHoleCards(round, players)
        .catch(error => {
          console.warn(`Unable to retry initial hole key delivery for round ${round}.`, error);
        })
        .finally(() => {
          this.scheduleHoleKeyRetry(round, players, roundData, attempt + 1);
        });
    }, delayMs);
    this.holeKeyRetryTimers.add(timer);
  }

  private areLocalInitialHoleCardsKnown(players: string[], roundData: TexasHoldemRound) {
    const peerId = this.peerId;
    if (!peerId) {
      return true;
    }
    const playerOffset = players.indexOf(peerId);
    if (playerOffset < 0) {
      return true;
    }
    const firstOffset = playerOffset * 2 + 5;
    const secondOffset = playerOffset * 2 + 6;
    return roundData.knownCardValues.has(firstOffset) && roundData.knownCardValues.has(secondOffset);
  }

  private async handleBetEvent(e: BetEvent, who: string, replay: boolean) {
    await this.handleBet(e.round, e.amount, who, false, replay);
  }

  private async handleAutoFoldEvent(e: AutoFoldEvent, replay: boolean) {
    const round = this.getOrCreateDataForRound(e.round);
    if (!this.canAutoFold(round, e.target, replay)) {
      return;
    }
    this.sittingOutPlayers.add(e.target);
    await this.handleFold(e.round, e.target, replay);
  }

  private async handleSitOutEvent(e: SitOutEvent, who: string, replay: boolean) {
    const round = this.getOrCreateDataForRound(e.round);
    this.sittingOutPlayers.add(who);
    if (round.result) {
      return;
    }
    const players = await round.playersOrdered.promise;
    if (!players.includes(who)) {
      return;
    }
    await this.handleFold(e.round, who, replay);
  }

  private handleReturnToTableEvent(_e: ReturnToTableEvent, who: string) {
    this.sittingOutPlayers.delete(who);
  }

  private handleMembersChanged(members: string[]) {
    const activeMembers = new Set(members);

    for (const [roundNo, roundData] of Array.from(this.dataByRounds.entries())) {
      const disconnectedTurn = roundData.currentTurn;
      if (
        roundData.result
        || !disconnectedTurn
        || activeMembers.has(disconnectedTurn)
        || roundData.foldPlayers.has(disconnectedTurn)
        || roundData.allInPlayers.has(disconnectedTurn)
      ) {
        continue;
      }
      this.autoFold(roundNo, disconnectedTurn).catch(e => console.error('Failed to auto-fold disconnected player', e));
    }
  }

  private clearTurnTimer(roundData: TexasHoldemRound) {
    if (roundData.currentTurnTimer) {
      clearTimeout(roundData.currentTurnTimer);
      roundData.currentTurnTimer = undefined;
    }
  }

  private async clearLocalTurnTimerForSubmittedAction(round: number) {
    const roundData = this.dataByRounds.get(round);
    if (!roundData) {
      return;
    }
    const myPeerId = await this.gameRoom.peerIdAsync;
    if (roundData.currentTurn === myPeerId) {
      this.clearTurnTimer(roundData);
    }
  }

  private emitWhoseTurn(
    round: number,
    roundData: TexasHoldemRound,
    whose: string | null,
    actionMeta?: {callAmount: number},
    replay?: boolean,
  ) {
    this.clearTurnTimer(roundData);
    const timeoutSeconds = roundData.settings?.autoFoldTimeoutSeconds;
    const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : 0;
    const replayedOpponentTurn = replay && whose !== this.mentalPokerGameRoom.peerId;
    const timerDelayMs = replayedOpponentTurn && timeoutMs
      ? Math.min(REPLAY_AUTO_FOLD_GRACE_MS, timeoutMs)
      : timeoutMs;
    roundData.currentTurn = whose;
    roundData.currentTurnStartedAtMs = whose
      ? Date.now() - Math.max(0, timeoutMs - timerDelayMs)
      : 0;
    this.whoseTurnByRound.set(round, whose ? {whoseTurn: whose, callAmount: actionMeta?.callAmount ?? 0} : null);
    if (actionMeta) {
      this.emitter.emit('whoseTurn', round, whose, actionMeta);
    } else {
      this.emitter.emit('whoseTurn', round, whose);
    }

    if (!whose || !timeoutSeconds || roundData.result) {
      return;
    }

    const timer = setTimeout(() => {
      if (!this.canAutoFold(roundData, whose, false)) {
        return;
      }
      this.autoFold(round, whose).catch(e => console.error('Failed to auto-fold inactive player', e));
    }, timerDelayMs);
    (timer as unknown as {unref?: () => void}).unref?.();
    roundData.currentTurnTimer = timer;
  }

  private canAutoFold(roundData: TexasHoldemRound, target: string, replay: boolean) {
    if (roundData.result || roundData.currentTurn !== target || roundData.foldPlayers.has(target) || roundData.allInPlayers.has(target)) {
      return false;
    }
    if (replay) {
      return true;
    }
    if (!this.mentalPokerGameRoom.members.includes(target)) {
      return true;
    }
    const timeoutSeconds = roundData.settings?.autoFoldTimeoutSeconds;
    if (!timeoutSeconds || !roundData.currentTurnStartedAtMs) {
      return false;
    }
    return Date.now() - roundData.currentTurnStartedAtMs >= (timeoutSeconds * 1000) - 250;
  }

  private async handleBet(roundNo: number, raisedAmount: number, who: string, isSbBbFirstBet?: boolean, replay?: boolean) {
    if (raisedAmount < 0) { // FIXME must be N * BB
      console.warn(`Bet amount cannot be negative: ${raisedAmount}`);
      return;
    }

    const fund = this.funds.get(who) ?? 0;
    if (fund < raisedAmount) {
      console.warn(`Fund is insufficient: ${fund}`);
      return;
    }

    const round = this.getOrCreateDataForRound(roundNo);
    if (round.result) {
      console.warn(`Cannot bet since this round has ended.`);
      return;
    }
    const pot = round.pot;
    const currentBetAmount = pot.get(who) ?? 0;
    const leastTotalBetAmount = Array.from(pot.values()).reduce((a, b) => Math.max(a, b), 0);
    const totalBetAmount = currentBetAmount + raisedAmount;
    const allin = fund === raisedAmount;
    if (totalBetAmount < leastTotalBetAmount && !allin) { // if less but not all-in
      console.warn(`Cannot bet ${raisedAmount} addition to ${currentBetAmount} because the least bet amount is ${leastTotalBetAmount}.`);
      return;
    }

    if (!isSbBbFirstBet) {
      if (totalBetAmount === leastTotalBetAmount) {
        // call or check
        round.calledPlayers.add(who);
      } else {
        // raise
        round.calledPlayers.clear();
        round.calledPlayers.add(who);
      }
    }

    if (allin) {
      round.allInPlayers.add(who);
    }

    pot.set(who, totalBetAmount);
    this.updateFundOfPlayer(who, fund - raisedAmount);

    this.emitter.emit('bet', roundNo, raisedAmount, who, allin);
    const potTotalAmount = Array.from(round.pot.values()).reduce((a, b) => a + b, 0);
    this.potAmount = potTotalAmount;
    this.emitter.emit('pot', roundNo, potTotalAmount);

    if (!isSbBbFirstBet) {
      if (round.currentTurn === who) {
        this.clearTurnTimer(round);
        round.currentTurn = null;
      }
      await this.continueUnlessAllSet(roundNo, round, who, !!replay);
    }
  }

  private async handleFoldEvent(e: FoldEvent, who: string, replay: boolean) {
    await this.handleFold(e.round, who, replay);
  }

  private async handleFold(roundNo: number, who: string, replay: boolean) {
    const round = this.getOrCreateDataForRound(roundNo);
    if (round.result) {
      return;
    }
    if (round.foldPlayers.has(who)) {
      return;
    }
    if (round.currentTurn === who) {
      this.clearTurnTimer(round);
      round.currentTurn = null;
    }
    round.foldPlayers.add(who);
    this.emitter.emit('fold', roundNo, who);

    const playersLeft = (await round.playersOrdered.promise).filter(p => !round.foldPlayers.has(p));
    if (playersLeft.length === 1) {
      // last one wins
      const winner = playersLeft[0];
      const result: LastOneWins = {
        how: 'LastOneWins',
        round: roundNo,
        winner,
      };
      round.result = result;
      this.clearTurnTimer(round);
      this.winnersByRound.set(roundNo, result);
      this.emitter.emit('winner', result);
      const totalPotAmount = Array.from(round.pot.values()).reduce((m1, m2) => m1 + m2, 0);
      const newFundOfWinner = (this.funds.get(winner) ?? 0) + totalPotAmount;
      this.updateFundOfPlayer(winner, newFundOfWinner);
    } else {
      await this.continueUnlessAllSet(roundNo, round, who, replay);
    }
  }

  private updateFundOfPlayer(whose: string, amount: number, borrowed?: boolean) {
    const previousAmount = this.funds.get(whose);
    this.funds.set(whose, amount);
    this.emitter.emit('fund', amount, previousAmount, whose, borrowed);
  }

  private async continueUnlessAllSet(round: number, roundData: TexasHoldemRound, whosePreviousTurn: string, replay?: boolean) {
    const players = await roundData.playersOrdered.promise;

    const prevOffset = players.findIndex(p => p === whosePreviousTurn);
    const whoseTurnNext = [...players.slice(prevOffset + 1), ...players.slice(0, prevOffset)]
      .find(player =>
        !roundData.allInPlayers.has(player) &&
        !roundData.calledPlayers.has(player) &&
        !roundData.foldPlayers.has(player));

    if (!whoseTurnNext) {
      const everyOneElseIsAllinOrFolds = (players.length - roundData.allInPlayers.size - roundData.foldPlayers.size) <= 1;
      roundData.calledPlayers.clear();
      this.emitter.emit('allSet', round);
      this.emitWhoseTurn(round, roundData, null, undefined, replay);
      const shouldShowdown = everyOneElseIsAllinOrFolds || roundData.stage === Stage.RIVER;
      if (shouldShowdown) {
        roundData.showdownReady = true;
        this.tryResolveShowdown(round, roundData);
      }

      if (!replay) {
        const cardOffsetsToShow: number[] = (() => {
          switch (roundData.stage) {
            case Stage.PRE_FLOP:
              return everyOneElseIsAllinOrFolds ? [0, 1, 2, 3, 4] : [0, 1, 2];
            case Stage.FLOP:
              return everyOneElseIsAllinOrFolds ? [3, 4] : [3];
            case Stage.TURN:
              return [4];
            case Stage.RIVER:
              return [];
          }
        })();

        for (let cardOffset of cardOffsetsToShow) {
          await this.mentalPokerGameRoom.showCard(round, cardOffset);
        }

        if (shouldShowdown) {
          await this.showdown(round, roundData);
        }
      }

      if (!everyOneElseIsAllinOrFolds && roundData.stage !== Stage.RIVER) {
        this.emitWhoseTurn(
          round,
          roundData,
          players.find(player => !roundData.allInPlayers.has(player) && !roundData.foldPlayers.has(player)) || null,
          {callAmount: 0},
          replay);
      }
    } else {
      const pot = roundData.pot;
      const currentBetAmount = pot.get(whoseTurnNext) ?? 0;
      const leastTotalBetAmount = Array.from(pot.values()).reduce((a, b) => Math.max(a, b), 0);
      const callAmount = leastTotalBetAmount - currentBetAmount;
      this.emitWhoseTurn(round, roundData, whoseTurnNext, {callAmount}, replay);
    }
  }

  private async showdown(round: number, roundData: TexasHoldemRound) {
    roundData.showdownReady = true;
    const players = await roundData.playersOrdered.promise;
    for (let i = 0; i < players.length; ++i) {
      if (roundData.foldPlayers.has(players[i])) {
        continue;
      }
      const holeOffsets = [
        i * 2 + 5,
        i * 2 + 6,
      ];
      await this.mentalPokerGameRoom.showCard(round, holeOffsets[0]);
      await this.mentalPokerGameRoom.showCard(round, holeOffsets[1]);
    }
    this.tryResolveShowdown(round, roundData);
  }
}
