import {useCallback, useEffect, useMemo, useState} from "react";
import {GameRoomStatus} from "../GameRoom";
import {TexasHoldem} from "../setup";
import {Board, Hole} from "../rules";
import {
  DEFAULT_AUTO_FOLD_TIMEOUT_SECONDS,
  DEFAULT_BIG_BLIND_AMOUNT,
  DEFAULT_ENCRYPTION_BITS,
  DEFAULT_PLANNED_ROUNDS,
  DEFAULT_SMALL_BLIND_AMOUNT,
  TexasHoldemGameRoomEvents,
  TexasHoldemRoundSettings,
  WinningResult,
} from "./TexasHoldemGameRoom";

function useMyPlayerId() {
  const [peerId, setPeerId] = useState<string | undefined>(() => TexasHoldem.peerId);
  useEffect(() => {
    const peerIdListener = (peerIdAssigned: string) => setPeerId(peerIdAssigned);
    if (TexasHoldem.peerId) {
      setPeerId(TexasHoldem.peerId);
    }
    TexasHoldem.listener.on('connected', peerIdListener);
    return () => {
      TexasHoldem.listener.off('connected', peerIdListener);
    }
  }, []);
  return peerId;
}

function generateLocalActionId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function useStatus() {
  const [status, setStatus] = useState<GameRoomStatus>(() => TexasHoldem.status ?? 'NotReady');
  useEffect(() => {
    const statusListener = (statusChanged: GameRoomStatus) => setStatus(statusChanged);
    setStatus(TexasHoldem.status ?? 'NotReady');
    TexasHoldem.listener.on('status', statusListener);
    return () => {
      TexasHoldem.listener.off('status', statusListener);
    }
  }, []);
  return status;
}

function useGameSetup() {
  const [members, setMembers] = useState<string[]>(() => [...(TexasHoldem.members ?? [])]);

  useEffect(() => {
    const membersListener = (membersUpdated: string[]) => {
      setMembers([...membersUpdated]);
    };
    setMembers([...(TexasHoldem.members ?? [])]);
    TexasHoldem.listener.on('members', membersListener);
    return () => {
      TexasHoldem.listener.off('members', membersListener);
    };
  }, []);

  const initialSnapshot = TexasHoldem.getStateSnapshot();
  const [currentRound, setCurrentRound] = useState<number | undefined>(() => initialSnapshot.currentRound);
  const [players, setPlayers] = useState<string[] | undefined>(() => {
    const round = initialSnapshot.currentRound;
    return round ? initialSnapshot.playersByRound.get(round) : undefined;
  });

  useEffect(() => {
    const newRoundListener = (round: number, players: string[]) => {
      setCurrentRound(round);
      setPlayers(players);
    };
    TexasHoldem.listener.on('players', newRoundListener);
    return () => {
      TexasHoldem.listener.off('players', newRoundListener);
    };
  }, []);

  const smallBlind = useMemo(() => players ? players[0] : undefined, [players]);
  const bigBlind = useMemo(() => players ? players[1] : undefined, [players]);
  const button = useMemo(() => players ? players[players.length - 1] : undefined, [players]);

  return {
    members,
    players,
    smallBlind,
    bigBlind,
    button,
    currentRound,
  };
}

function useBankrolls() {
  const [bankrolls, setBankrolls] = useState<Map<string, number>>(() => TexasHoldem.getStateSnapshot().bankrolls);
  useEffect(() => {
    const fundListener: TexasHoldemGameRoomEvents['fund'] = (fund, previousFund, whose) => {
      setBankrolls(prev => {
        const newBankrolls = new Map(prev);
        newBankrolls.set(whose, fund);
        return newBankrolls;
      });
    };
    TexasHoldem.listener.on('fund', fundListener);
    return () => {
      TexasHoldem.listener.off('fund', fundListener);
    };
  }, []);

  return bankrolls;
}

function useScoreBoard() {
  const [scoreBoard, setScoreBoard] = useState<Map<string, number>>(new Map());
  const [totalDebt, setTotalDebt] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const fundListener: TexasHoldemGameRoomEvents['fund'] = (fund, previousFund, whose, borrowed) => {
      const diff = fund - (previousFund ?? 0);
      if (!borrowed) {
        setScoreBoard(prev => {
          const next = new Map(prev);
          next.set(whose, (next.get(whose) ?? 0) + diff);
          return next;
        });
      }
      if (borrowed) {
        setTotalDebt(prev => {
          const next = new Map(prev);
          next.set(whose, (next.get(whose) ?? 0) + diff);
          return next;
        })
      }
    };
    TexasHoldem.listener.on('fund', fundListener);
    return () => {
      TexasHoldem.listener.off('fund', fundListener);
    };
  }, []);

  return {
    scoreBoard,
    totalDebt,
  };
}

export type BoardStage =
  | 'Preflop'
  | 'Flop'
  | 'Turn'
  | 'River'
  ;

function useBoard(round: number | undefined) {
  const [boardPerRound, setBoardPerRound] = useState<Map<number, Board>>(() => TexasHoldem.getStateSnapshot().boardByRound);
  useEffect(() => {
    const boardListener = (round: number, board: Board) => {
      setBoardPerRound(prev => {
        const next = new Map(prev);
        next.set(round, board);
        return next;
      });
    }
    TexasHoldem.listener.on('board', boardListener);
    return () => {
      TexasHoldem.listener.off('board', boardListener);
    };
  }, []);

  const board: Board = useMemo(() => round ? (boardPerRound.get(round) ?? []) : [], [boardPerRound, round]);

  const boardStage: BoardStage | undefined = useMemo(() => {
    switch (board.length) {
      case 0:
        return 'Preflop';
      case 3:
        return 'Flop';
      case 4:
        return 'Turn';
      case 5:
        return 'River';
    }
  }, [board]);

  return {
    board,
    boardStage,
  };
}

function useHoles(round: number | undefined, myPlayerId: string | undefined) {
  const [holesPerPlayerPerRound, setHolesPerPlayerPerRound] = useState<Map<number, Map<string, Hole>>>(() => TexasHoldem.getStateSnapshot().holesByRound);
  useEffect(() => {
    const holeListener = (round: number, whose: string, hole: Hole) => {
      setHolesPerPlayerPerRound(prev => {
        const next = new Map(prev);
        const holesPerPlayer: Map<string, Hole> = next.get(round) ?? new Map();
        holesPerPlayer.set(whose, hole);
        next.set(round, holesPerPlayer);
        return next;
      });
    }
    TexasHoldem.listener.on('hole', holeListener);
    return () => {
      TexasHoldem.listener.off('hole', holeListener);
    };
  }, []);

  const holesPerPlayer = useMemo(() =>
      round ? holesPerPlayerPerRound.get(round) : undefined,
    [holesPerPlayerPerRound, round]);

  const myHole: Hole | undefined = useMemo(() => {
    if (!myPlayerId || !holesPerPlayer) {
      return undefined;
    }
    return holesPerPlayer.get(myPlayerId);
  }, [holesPerPlayer, myPlayerId]);

  return {
    myHole,
    holesPerPlayer,
  }
}

function useWhoseTurnAndCallAmount(round: number | undefined) {
  const [whoseTurnPerRound, setWhoseTurnPerRound] = useState<Map<number, { whoseTurn: string, callAmount: number } | null>>(() => TexasHoldem.getStateSnapshot().whoseTurnByRound);
  useEffect(() => {
    const whoseTurnListener = (round: number, whoseTurn: string | null, actionMeta?: { callAmount: number }) => {
      setWhoseTurnPerRound(prev => {
        const next = new Map(prev);
        next.set(round, whoseTurn ? { whoseTurn, callAmount: actionMeta?.callAmount ?? 0 } : null);
        return next;
      });
    };
    TexasHoldem.listener.on('whoseTurn', whoseTurnListener);
    return () => {
      TexasHoldem.listener.off('whoseTurn', whoseTurnListener);
    };
  }, []);

  return useMemo(() => round ? whoseTurnPerRound.get(round) ?? null : null, [round, whoseTurnPerRound]);
}

function usePotAmount() {
  const [potAmount, setPotAmount] = useState<number>(() => TexasHoldem.getStateSnapshot().potAmount);
  useEffect(() => {
    const potListener = (round: number, amount: number) => {
      setPotAmount(amount);
    };
    TexasHoldem.listener.on('pot', potListener);
    return () => {
      TexasHoldem.listener.off('pot', potListener);
    };
  }, []);

  return potAmount;
}

type Action =
  | 'fold'
  | 'all-in'
  | Array<{
  bet: number,
  uid: string, // used to de-deduplicate
}>

function useActionsDone(round: number | undefined) {
  const [actionsPerRound, setActionsPerRound] = useState<Map<number, Map<string, Action>>>(new Map());
  const updateActionByWhom = useCallback((round: number, who: string, didWhat: number | 'fold' | 'all-in') => {
    // this is a workaround currently to avoid duplicate invocation of the state setter in StrictMode
    const uid = generateLocalActionId(); // TODO: generate from GameRoom
    setActionsPerRound(prev => {
      const next = new Map(prev);
      const actions: Map<string, Action> = next.get(round) ?? new Map();
      const prevAction = actions.get(who);
      if (!prevAction) {
        actions.set(who, typeof didWhat === 'string' ? didWhat : [{uid, bet: didWhat}]);
      } else if (typeof prevAction === 'string') {
        return prev; // do nothing
      } else if (typeof didWhat === 'string') {
        actions.set(who, didWhat);
      } else {
        actions.set(who, [...prevAction, {uid, bet: didWhat}]);
      }
      next.set(round, actions);
      return next;
    });
  }, []);

  useEffect(() => {
    const betListener = (round: number, amount: number, who: string, allin: boolean) => {
      updateActionByWhom(round, who, allin ? 'all-in' : amount);
    };
    TexasHoldem.listener.on('bet', betListener);
    return () => {
      TexasHoldem.listener.off('bet', betListener);
    };
  }, [updateActionByWhom]);

  useEffect(() => {
    const foldListener = (round: number, who: string) => {
      updateActionByWhom(round, who, 'fold');
    };
    TexasHoldem.listener.on('fold', foldListener);
    return () => {
      TexasHoldem.listener.off('fold', foldListener);
    };
  }, [updateActionByWhom]);

  useEffect(() => {
    const allSetListener = (round: number) => {
      setActionsPerRound(prev => {
        const next = new Map(prev);
        const actions = next.get(round);
        if (!actions) {
          return prev;
        }
        for (let [player, action] of Array.from(actions.entries())) {
          if (typeof action !== 'string') {
            actions.delete(player); // cleanup bet actions
          }
        }
        return next;
      });
    };
    TexasHoldem.listener.on('allSet', allSetListener);
    return () => {
      TexasHoldem.listener.off('allSet', allSetListener);
    };
  }, []);

  useEffect(() => {
    const winnerListener = () => {
      setActionsPerRound(new Map());
    };
    TexasHoldem.listener.on('winner', winnerListener);
    return () => {
      TexasHoldem.listener.off('winner', winnerListener);
    };
  }, []);

  return useMemo(() => {
    if (!round) {
      return null;
    }
    const actions = actionsPerRound.get(round);
    if (!actions) {
      return null;
    }
    return new Map<string, string | number>(Array.from(actions.entries()).map(([k, v]) => {
      if (typeof v === 'string') {
        return [k, v];
      }
      const uidSeen = new Set<string>();
      const deduplicatedBetAmount = v.map(bet => {
        if (uidSeen.has(bet.uid)) {
          return 0;
        }
        uidSeen.add(bet.uid);
        return bet.bet;
      }).reduce((a, b) => a + b, 0);
      return [k, deduplicatedBetAmount || 'check'];
    }));
  }, [round, actionsPerRound]);
}

function useMyBetAmount(round: number | undefined, myPlayerId: string | undefined) {
  const [myBetAmountPerRound, setMyBetAmountPerRound] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    const betListener = (round: number, amount: number, who: string) => {
      if (who === myPlayerId) {
        setMyBetAmountPerRound(prev => {
          const next = new Map(prev);
          next.set(round, (next.get(round) ?? 0) + amount);
          return next;
        })
      }
    };
    TexasHoldem.listener.on('bet', betListener);
    return () => {
      TexasHoldem.listener.off('bet', betListener);
    };
  }, [myPlayerId]);

  return useMemo(() => round ? myBetAmountPerRound.get(round) : undefined, [myBetAmountPerRound, round]);
}

function useShowdownAndWinner(round: number | undefined) {
  const initialWinners = TexasHoldem.getStateSnapshot().winnersByRound;
  const [lastWinningResult, setLastWinningResult] = useState<WinningResult | undefined>(() => {
    if (!initialWinners.size) {
      return undefined;
    }
    return Array.from(initialWinners.entries()).sort(([r1], [r2]) => r2 - r1)[0][1];
  });
  const [finishedPerRound, setFinishedPerRound] = useState<Map<number, true>>(() => (
    new Map(Array.from(initialWinners.keys()).map(finishedRound => [finishedRound, true]))
  ));
  useEffect(() => {
    const winnerListener = (result: WinningResult) => {
      setLastWinningResult(result);
      setFinishedPerRound(prev => {
        const next = new Map(prev);
        next.set(result.round, true);
        return next;
      });
    };
    TexasHoldem.listener.on('winner', winnerListener);
    return () => {
      TexasHoldem.listener.off('winner', winnerListener);
    };
  }, []);
  const currentRoundFinished = useMemo(() => round ? (finishedPerRound.get(round) ?? false) : true,
    [finishedPerRound, round]);
  return {
    lastWinningResult,
    currentRoundFinished,
  };
}

function useRoundSettings(round: number | undefined) {
  const [settingsPerRound, setSettingsPerRound] = useState<Map<number, TexasHoldemRoundSettings>>(() => TexasHoldem.getStateSnapshot().settingsByRound);

  useEffect(() => {
    const roundSettingsListener: TexasHoldemGameRoomEvents['roundSettings'] = (round, settings) => {
      setSettingsPerRound(prev => {
        const next = new Map(prev);
        next.set(round, settings);
        return next;
      });
    };
    TexasHoldem.listener.on('roundSettings', roundSettingsListener);
    return () => {
      TexasHoldem.listener.off('roundSettings', roundSettingsListener);
    };
  }, []);

  return useMemo(() => round ? settingsPerRound.get(round) : undefined, [round, settingsPerRound]);
}

function getSeriesProgress(round: number | undefined, settings: TexasHoldemRoundSettings | undefined) {
  const total = settings?.plannedRounds ?? DEFAULT_PLANNED_ROUNDS;
  const start = settings?.seriesStartRound ?? round ?? 1;
  const current = round ? Math.max(1, round - start + 1) : 0;
  return {
    current: Math.min(current, total),
    total,
    complete: Boolean(round && current >= total),
  };
}

export default function useTexasHoldem() {
  const myPlayerId = useMyPlayerId();
  const status = useStatus();
  const {
    members,
    players,
    smallBlind,
    bigBlind,
    button,
    currentRound,
  } = useGameSetup();

  const bankrolls = useBankrolls();

  const {
    scoreBoard,
    totalDebt,
  } = useScoreBoard();

  const {
    board,
  } = useBoard(currentRound);

  const {
    myHole,
    holesPerPlayer,
  } = useHoles(currentRound, myPlayerId);

  const whoseTurnAndCallAmount = useWhoseTurnAndCallAmount(currentRound);

  const fireBet = useCallback(async (amount: number) => {
    if (!currentRound) {
      return;
    }
    await TexasHoldem.bet(currentRound, amount);
  }, [currentRound]);

  const fireFold = useCallback(async () => {
    if (!currentRound) {
      return;
    }
    await TexasHoldem.fold(currentRound);
  }, [currentRound]);

  const actionsDone = useActionsDone(currentRound);

  const potAmount = usePotAmount();
  const myBetAmount = useMyBetAmount(currentRound, myPlayerId);
  const roundSettings = useRoundSettings(currentRound);

  const startNewRound = useCallback(async (settings?: Partial<TexasHoldemRoundSettings>) => {
    await TexasHoldem.startNewRound({
      bits: DEFAULT_ENCRYPTION_BITS,
      initialFundAmount: settings?.initialFundAmount ?? 100,
      smallBlindAmount: settings?.smallBlindAmount ?? DEFAULT_SMALL_BLIND_AMOUNT,
      bigBlindAmount: settings?.bigBlindAmount ?? DEFAULT_BIG_BLIND_AMOUNT,
      autoFoldTimeoutSeconds: settings?.autoFoldTimeoutSeconds ?? DEFAULT_AUTO_FOLD_TIMEOUT_SECONDS,
      plannedRounds: settings?.plannedRounds ?? DEFAULT_PLANNED_ROUNDS,
      seriesStartRound: settings?.seriesStartRound,
    });
  }, []);

  const {
    lastWinningResult,
    currentRoundFinished,
  } = useShowdownAndWinner(currentRound);

  const seriesProgress = useMemo(
    () => getSeriesProgress(currentRound, roundSettings),
    [currentRound, roundSettings],
  );

  return {
    peerState: status,
    playerId: myPlayerId,
    members,
    round: currentRound,
    currentRoundFinished,
    players,
    potAmount,
    hole: myHole,
    holesPerPlayer,
    board,
    whoseTurnAndCallAmount,
    smallBlind,
    bigBlind,
    button,
    startGame: startNewRound,
    bankrolls,
    scoreBoard,
    totalDebt,
    myBetAmount,
    lastWinningResult,
    actionsDone,
    roundSettings,
    seriesProgress,
    actions: {
      fireBet,
      fireFold,
    },
  };
}
