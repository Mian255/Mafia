/**
 * MAF-055 — Narrator Script (script content only; the display/advance engine is MAF-054)
 *
 * One authoritative source of narration for every game phase, action, and outcome.
 * Keys mirror the backend schema exactly:
 *   - games.phase  → 'role_reveal' | 'night_mafia' | 'night_doctor' | 'night_detective'
 *                    | 'dawn' | 'day_discussion' | 'day_voting' | 'result' | 'game_over'
 *   - games.winner → 'town' | 'mafia' | 'draw' | null
 *
 * Tone: noir flavor for atmosphere, plain and clear for player instructions.
 * Every instruction line is safe to show to ALL players — it never reveals hidden
 * information (who the mafia are, who acted on whom). Role-specific whispers live
 * under `roleHints` and must only be surfaced by the engine to that single player.
 */

export type GamePhase =
  | 'role_reveal'
  | 'night_mafia'
  | 'night_doctor'
  | 'night_detective'
  | 'dawn'
  | 'day_discussion'
  | 'day_voting'
  | 'result'
  | 'game_over';

export type GameWinner = 'town' | 'mafia' | 'draw';

export interface NarratorLine {
  /** Noir flavor line, shown for atmosphere. */
  flavor: string;
  /** Clear instruction telling players what to do right now. */
  instruction: string;
}

export interface Narration {
  intro: NarratorLine;
  /** Optional mid-phase line the engine can rotate in on long phases. */
  idle?: NarratorLine;
}

export interface RoleHint {
  /** Shown ONLY to this role's player when their night phase opens. */
  whisper: string;
  /** Reinforcing line while they decide. */
  reminder: string;
}

/** Intro narration per phase, plus optional idle lines for long waits. */
export const PHASE_NARRATION: Record<GamePhase, Narration> = {
  role_reveal: {
    intro: {
      flavor: 'The city deals its cards in silence. Tonight, you wear one of its faces.',
      instruction: 'Memorize your role. Trust no one with it.',
    },
  },
  night_mafia: {
    intro: {
      flavor: 'Midnight. The streetlights drown in fog, and the family stirs.',
      instruction: 'Mafia, choose your target. Everyone else, sleep with one eye open.',
    },
    idle: {
      flavor: 'A cigarette burns down in the dark, waiting on a decision.',
      instruction: 'The family is still deciding...',
    },
  },
  night_doctor: {
    intro: {
      flavor: 'Somewhere, a bag of instruments opens with a soft click.',
      instruction: 'Doctor, choose someone to protect tonight. You may save a life.',
    },
    idle: {
      flavor: 'Gauze, needle, steadied breath — the good doctor works late.',
      instruction: 'The doctor is still choosing...',
    },
  },
  night_detective: {
    intro: {
      flavor: 'A trench coat slips through the alley. Questions need answers.',
      instruction: 'Detective, choose someone to investigate. The truth has a price.',
    },
    idle: {
      flavor: 'The detective cross-references hunches against the rain-streaked glass.',
      instruction: 'The detective is still working...',
    },
  },
  dawn: {
    intro: {
      flavor: 'Dawn crawls over the rooftops. The city braces for the news.',
      instruction: 'Everyone, wake up. The night’s tally is about to be read.',
    },
  },
  day_discussion: {
    intro: {
      flavor: 'Sunlight floods the piazza. Accasions come cheaper than coffee.',
      instruction: 'Discuss. Accuse. Defend yourself — the clock is running.',
    },
    idle: {
      flavor: 'Eyes dart. Whispers multiply. Someone here is lying.',
      instruction: 'Keep talking. The clock is ticking.',
    },
  },
  day_voting: {
    intro: {
      flavor: 'The town square falls quiet. Every gaze becomes an accusation.',
      instruction: 'Cast your vote. Send one suspect to the gallows.',
    },
    idle: {
      flavor: 'Ballots fold. Hands hover. History holds its breath.',
      instruction: 'The vote is still coming in...',
    },
  },
  result: {
    intro: {
      flavor: 'The verdict lands like a body on cobblestones.',
      instruction: 'The town hears the outcome of the vote.',
    },
  },
  game_over: {
    intro: {
      flavor: 'The rain finally washes the streets clean. The war is over.',
      instruction: 'The game has ended. See who came out on top.',
    },
  },
};

/** Lines keyed by the schema's winner values for the game_over screen. */
export const WINNER_NARRATION: Record<GameWinner, { headline: string; epilogue: string }> = {
  town: {
    headline: 'THE TOWN PREVAILS',
    epilogue:
      'The last of the family is dragged into the light. The city exhales — honest streets, for a while.',
  },
  mafia: {
    headline: 'THE MAFIA WINS',
    epilogue:
      'The town never saw it coming. Silk gloves, cold blood — the syndicate owns the night again.',
  },
  draw: {
    headline: 'STALEMATE',
    epilogue:
      'Nobody won. Bodies in the square, questions in the air, and the fog rolling back in.',
  },
};

/**
 * Night-action outcome lines for the dawn announcement. The engine feeds in the
 * resolved facts; the script only supplies the words. These are the only dawn
 * lines that may carry information — everything else stays player-safe.
 */
export interface DawnAnnouncementInput {
  /** True if a player was killed during the night. */
  killed: boolean;
  /** True if the doctor's protection saved the targeted player. */
  saved: boolean;
  /** True if the detective identified a mafia member last night. */
  detectiveFoundMafia: boolean | null;
}

export const buildDawnAnnouncement = ({
  killed,
  saved,
  detectiveFoundMafia,
}: DawnAnnouncementInput): string => {
  const parts: string[] = [];

  if (saved && !killed) {
    parts.push('A body should be cold this morning — the Doctor made sure it wasn’t.');
  } else if (killed) {
    parts.push('A player was found at dawn. Another name crossed off the city’s list.');
  } else {
    parts.push('The night passed quietly. Everyone is still breathing.');
  }

  if (detectiveFoundMafia === true) {
    parts.push('The Detective has something to share with the town.');
  } else if (detectiveFoundMafia === false) {
    parts.push('The Detective spent the night chasing shadows.');
  }

  return parts.join(' ');
};

/**
 * Per-role night whispers. Secret by design: the MAF-054 engine must only surface
 * a role's hint to that single player during their phase — never in global chat,
 * never in the shared narration view.
 */
export const ROLE_HINTS: Record<'mafia' | 'detective' | 'doctor' | 'civilian', RoleHint> = {
  mafia: {
    whisper: 'You are the Mafia. Decide who disappears tonight.',
    reminder: 'Agree on one target before dawn.',
  },
  detective: {
    whisper: 'You are the Detective. Pick one suspect to investigate.',
    reminder: 'Your badge only works on the truth — choose carefully.',
  },
  doctor: {
    whisper: 'You are the Doctor. Choose one player to shield tonight.',
    reminder: 'A steady hand tonight saves a life before breakfast.',
  },
  civilian: {
    whisper: 'You are a Civilian. Sleep — and survive until morning.',
    reminder: 'Your only weapons are words and suspicion.',
  },
};

/** Vote resolution lines for the result screen, by outcome. */
export const VOTE_RESULT_NARRATION = {
  /** Someone was voted out; engine inserts the player's name. */
  ejected: (playerName: string) => ({
    headline: 'THE TOWN HAS SPOKEN',
    line: `${playerName} is put against the wall. The square watches in silence.`,
  }),
  /** No majority was reached. */
  skipped: {
    headline: 'NO CONSENSUS',
    line: 'The vote splits down the middle. Nobody hangs today — the night will not be so forgiving.',
  },
} as const;
