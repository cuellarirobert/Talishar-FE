import { useAppSelector } from 'app/Hooks';
import { RootState } from 'app/Store';
import { GAME_FORMAT } from 'appConstants';
import { useJoinGameMutation } from 'features/api/apiSlice';
import { getGameInfo } from 'features/game/GameSlice';
import { Matchup } from 'interface/API/GetLobbyRefresh.php';
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import { shallowEqual } from 'react-redux';
import { HEROES_OF_RATHE } from 'routes/index/components/filter/constants';
import { generateCroppedImageUrl } from 'utils/cropImages';
import styles from './Matchups.module.css';
import MatchupTooltip from './MatchupTooltip';

const FAB_BAZAAR_LEARN_MORE_URL = 'https://fabbazaar.app/tutorials/talishar';

export interface Matchups {
  refetch: () => void;
  selectedMatchupId?: string | null;
  onMatchupSelected?: (matchupId: string) => void;
  isAutoApplyingMatchup?: boolean;
  onExpandChat?: () => void;
  format?: string;
  isBazaarDeck?: boolean;
}

const HERO_CLASS_MAP: Record<string, string> = {
  Arakni: 'Assassin', Uzuri: 'Assassin', Nuu: 'Assassin',
  Bravo: 'Guardian', Oldhim: 'Guardian', Betsy: 'Guardian', Victor: 'Guardian',
  Jarl: 'Guardian', Valda: 'Guardian', Lyath: 'Guardian', Pleiades: 'Guardian',
  Genis: 'Guardian', Brevant: 'Guardian', Terra: 'Guardian',
  Rhinar: 'Brute', Levia: 'Brute', Kayo: 'Brute', Tuffnut: 'Brute',
  Katsu: 'Ninja', Ira: 'Ninja', Benji: 'Ninja', Fai: 'Ninja',
  Emperor: 'Ninja', Fang: 'Ninja',
  Dorinthea: 'Warrior', Boltyn: 'Warrior', Kassai: 'Warrior', Ser: 'Warrior',
  Olympia: 'Warrior', Yoji: 'Warrior', Hala: 'Warrior',
  Briar: 'Runeblade', Chane: 'Runeblade', Viserai: 'Runeblade',
  Blasmophet: 'Runeblade', Vynnset: 'Runeblade', Dromai: 'Runeblade', Cindra: 'Runeblade',
  Prism: 'Illusionist', Enigma: 'Illusionist', Aurora: 'Illusionist',
  Kano: 'Wizard', Iyslander: 'Wizard', Blaze: 'Wizard',
  Dash: 'Mechanologist', Maxx: 'Mechanologist', Teklovossen: 'Mechanologist',
  Puffin: 'Mechanologist', Data: 'Mechanologist', Professor: 'Mechanologist',
  Azalea: 'Ranger', Gorganian: 'Ranger', Lexi: 'Ranger', Riptide: 'Ranger',
  Gravy: 'Pirate', Anothos: 'Pirate', Marlynn: 'Pirate', Scurv: 'Pirate',
  Florian: 'Necromancer', Verdance: 'Necromancer', Oscilio: 'Necromancer',
};

const CLASS_ORDER = [
  'Assassin', 'Brute', 'Guardian', 'Illusionist',
  'Mechanologist', 'Necromancer', 'Ninja', 'Pirate',
  'Ranger', 'Runeblade', 'Warrior', 'Wizard', 'Other',
];

const BLITZ_FORMATS = new Set([
  GAME_FORMAT.BLITZ, GAME_FORMAT.COMPETITIVE_BLITZ, GAME_FORMAT.OPEN_BLITZ,
  GAME_FORMAT.SAGE, GAME_FORMAT.COMPETITIVE_SAGE, GAME_FORMAT.OPEN_SAGE,
  GAME_FORMAT.COMMONER,
]);

const getHeroClass = (name: string): string => {
  const firstName = name.split(/[\s,]/)[0];
  return HERO_CLASS_MAP[firstName] ?? 'Other';
};

const Matchups = ({
  refetch,
  selectedMatchupId,
  onMatchupSelected,
  isAutoApplyingMatchup = false,
  onExpandChat,
  format,
  isBazaarDeck = false,
}: Matchups) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [noDataHero, setNoDataHero] = useState<{
    id: string;
    name: string;
    anchorRect: DOMRect;
  } | null>(null);

  const gameLobby = useAppSelector(
    (state: RootState) => state.game.gameLobby,
    shallowEqual
  );
  const { gameID, playerID } = useAppSelector(getGameInfo, shallowEqual);
  const [joinGameMutation] = useJoinGameMutation();

  const handleMatchupClick = async (matchupID: string) => {
    setIsUpdating(true);
    try {
      await joinGameMutation({
        gameName: gameID,
        playerID: playerID,
        fabdb: gameLobby?.myDeckLink ?? '',
        matchup: matchupID
      }).unwrap();
      onMatchupSelected?.(matchupID);
      refetch();
      toast.success(
        `Matchup profile applied, check your deck before submission`,
        { position: 'top-center' }
      );
    } catch (err) {
      console.warn(err);
      toast.error('Some error happened', { position: 'top-center' });
    } finally {
      setIsUpdating(false);
    }
  };

  // Lookup: hero ID -> hero entry (for ID-based matching)
  const HERO_BY_ID = useMemo(() => {
    const map = new Map<string, typeof HEROES_OF_RATHE[number]>();
    for (const h of HEROES_OF_RATHE) map.set(h.value, h);
    return map;
  }, []);

  // Lookup: lowercase hero label -> hero entry (for name-based matching, e.g. when
  // Bazaar/Fabrary sends matchupId='arakni_huntsman' but name='Arakni Huntsman')
  const HERO_BY_NAME = useMemo(() => {
    const map = new Map<string, typeof HEROES_OF_RATHE[number]>();
    for (const h of HEROES_OF_RATHE) map.set(h.label.toLowerCase(), h);
    return map;
  }, []);

  // Resolve a saved matchup to a hero entry if it conceptually targets one.
  // First try matchupId (card ID), then the matchup's display name.
  const resolveHero = (m: { matchupId: string; name?: string | null }) => {
    return (
      HERO_BY_ID.get(m.matchupId) ??
      (m.name ? HERO_BY_NAME.get(m.name.toLowerCase()) : undefined) ??
      null
    );
  };

  // Partition saved matchups into hero-backed (rendered as portrait) vs
  // custom-named (rendered as full-width button).
  const { savedHeroMatchups, customMatchups } = useMemo(() => {
    const heroes: { hero: typeof HEROES_OF_RATHE[number]; matchup: Matchup }[] = [];
    const customs: Matchup[] = [];
    for (const m of gameLobby?.matchups ?? []) {
      const hero = resolveHero(m);
      if (hero) heroes.push({ hero, matchup: m });
      else customs.push(m);
    }
    return { savedHeroMatchups: heroes, customMatchups: customs };
  }, [gameLobby?.matchups, HERO_BY_ID, HERO_BY_NAME]);

  // Format-legal heroes that AREN'T already saved (the discovery grid for Bazaar).
  // Non-Bazaar decks don't show this section at all.
  const unsavedHeroes = useMemo(() => {
    if (!isBazaarDeck) return [];
    const useYoung = format ? BLITZ_FORMATS.has(format) : false;
    const savedHeroIds = new Set(savedHeroMatchups.map((s) => s.hero.value));
    return HEROES_OF_RATHE
      .filter((h) => !!h.young === useYoung)
      .filter((h) => !savedHeroIds.has(h.value))
      .map((h) => ({
        matchupId: h.value,
        name: h.label,
        preferredTurnOrder: null as string | null,
        notes: null as string | null,
        hasData: false,
      }));
  }, [format, savedHeroMatchups, isBazaarDeck]);

  const matchesSearch = (s: string) =>
    s.toLowerCase().includes(searchTerm.toLowerCase());

  const filteredSavedHeroMatchups = useMemo(
    () => savedHeroMatchups.filter(({ matchup, hero }) =>
      matchesSearch(matchup.name ?? hero.label)
    ),
    [savedHeroMatchups, searchTerm]
  );

  const filteredCustomMatchups = useMemo(
    () => customMatchups.filter((m) => matchesSearch(m.name ?? m.matchupId)),
    [customMatchups, searchTerm]
  );

  const filteredUnsavedHeroes = useMemo(
    () => unsavedHeroes.filter((h) => matchesSearch(h.name)),
    [unsavedHeroes, searchTerm]
  );

  const groupedMatchups = useMemo(() => {
    const groups: Record<string, typeof filteredUnsavedHeroes> = {};
    for (const h of filteredUnsavedHeroes) {
      const cls = getHeroClass(h.name);
      if (!groups[cls]) groups[cls] = [];
      groups[cls].push(h);
    }
    return CLASS_ORDER
      .filter((cls) => groups[cls]?.length)
      .map((cls) => ({ cls, matchups: groups[cls] }));
  }, [filteredUnsavedHeroes]);

  if ((gameLobby?.matchups ?? []).length === 0) return null;

  return (
    <article className={styles.matchupContainer}>
      <div className={styles.matchupHeader}>
        <h4>Matchups</h4>
        {onExpandChat && (
          <button
            type="button"
            className={styles.chatToggleBtn}
            onClick={onExpandChat}
          >
            ◂ Chat
          </button>
        )}
      </div>
      <input
        type="text"
        placeholder="Search"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
      />
      {isAutoApplyingMatchup && (
        <p className={styles.autoApplyingStatus}>Applying hero matchup...</p>
      )}
      <div className={styles.groupsWrapper}>
        {(filteredSavedHeroMatchups.length > 0 || filteredCustomMatchups.length > 0) && (
          <div className={styles.classGroup}>
            <p className={styles.groupHeader}>SAVED PROFILES</p>
            {filteredSavedHeroMatchups.length > 0 && (
              <div className={styles.portraitGrid}>
                {filteredSavedHeroMatchups.map(({ hero, matchup }) => {
                  const isSelected = selectedMatchupId === matchup.matchupId;
                  return (
                    <MatchupTooltip key={matchup.matchupId} content={matchup.notes ?? null}>
                      <button
                        type="button"
                        disabled={isUpdating}
                        className={`${styles.portraitCard} ${isSelected ? styles.portraitCardSelected : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          handleMatchupClick(matchup.matchupId);
                        }}
                      >
                        <img
                          src={generateCroppedImageUrl(hero.value)}
                          alt={matchup.name ?? hero.label}
                          className={`${styles.portraitImg} ${styles.portraitImgHasData}`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.opacity = '0';
                          }}
                        />
                        <div className={styles.portraitOverlay}>
                          <span className={styles.portraitName}>
                            {matchup.name ?? hero.label}
                          </span>
                          {matchup.preferredTurnOrder && (
                            <span className={styles.turnOrderBadge}>
                              {matchup.preferredTurnOrder}
                            </span>
                          )}
                        </div>
                      </button>
                    </MatchupTooltip>
                  );
                })}
              </div>
            )}
            {filteredCustomMatchups.length > 0 && (
              <div className={styles.namedMatchupList}>
                {filteredCustomMatchups.map((m) => {
                  const isSelected = selectedMatchupId === m.matchupId;
                  return (
                    <MatchupTooltip key={m.matchupId} content={m.notes ?? null}>
                      <button
                        type="button"
                        disabled={isUpdating}
                        className={`${styles.namedMatchupItem} ${isSelected ? styles.namedMatchupSelected : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          handleMatchupClick(m.matchupId);
                        }}
                      >
                        <span className={styles.namedMatchupName}>
                          {m.name ?? m.matchupId}
                        </span>
                        {m.preferredTurnOrder && (
                          <span className={styles.namedMatchupBadge}>
                            {m.preferredTurnOrder}
                          </span>
                        )}
                      </button>
                    </MatchupTooltip>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {groupedMatchups.map(({ cls, matchups }) => (
          <div key={cls} className={styles.classGroup}>
            <p className={styles.groupHeader}>{cls.toUpperCase()}</p>
            <div className={styles.portraitGrid}>
              {matchups.map((matchup) => {
                const isSelected = selectedMatchupId === matchup.matchupId;
                return (
                  <MatchupTooltip key={matchup.matchupId} content={matchup.notes}>
                    <button
                      type="button"
                      disabled={isUpdating}
                      className={`${styles.portraitCard} ${isSelected ? styles.portraitCardSelected : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        if (!matchup.hasData) {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          setNoDataHero({
                            id: matchup.matchupId,
                            name: matchup.name,
                            anchorRect: rect,
                          });
                          return;
                        }
                        handleMatchupClick(matchup.matchupId);
                      }}
                    >
                      <img
                        src={generateCroppedImageUrl(matchup.matchupId)}
                        alt={matchup.name}
                        className={`${styles.portraitImg} ${matchup.hasData ? styles.portraitImgHasData : ''}`}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.opacity = '0';
                        }}
                      />
                      <div className={styles.portraitOverlay}>
                        <span className={styles.portraitName}>{matchup.name}</span>
                        {matchup.preferredTurnOrder && (
                          <span className={styles.turnOrderBadge}>
                            {matchup.preferredTurnOrder}
                          </span>
                        )}
                      </div>
                    </button>
                  </MatchupTooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {noDataHero &&
        createPortal(
          <NoDataPopover
            hero={noDataHero}
            onClose={() => setNoDataHero(null)}
          />,
          document.body
        )}
    </article>
  );
};

const POPOVER_WIDTH = 260;
const POPOVER_GAP = 10;

const NoDataPopover = ({
  hero,
  onClose,
}: {
  hero: { id: string; name: string; anchorRect: DOMRect };
  onClose: () => void;
}) => {
  const { anchorRect } = hero;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Anchor to the left of the hero card by default; flip to right side if no room
  let left = anchorRect.left - POPOVER_WIDTH - POPOVER_GAP;
  let placement: 'left' | 'right' = 'left';
  if (left < 8) {
    left = anchorRect.right + POPOVER_GAP;
    placement = 'right';
  }
  if (left + POPOVER_WIDTH > vw - 8) {
    left = vw - POPOVER_WIDTH - 8;
  }

  // Vertically center on the anchor, but keep within viewport
  let top = anchorRect.top + anchorRect.height / 2;
  const estimatedHeight = 150;
  top = Math.max(8 + estimatedHeight / 2, Math.min(top, vh - 8 - estimatedHeight / 2));

  return (
    <>
      <div className={styles.noDataBackdrop} onClick={onClose} />
      <div
        className={styles.noDataPopover}
        style={{
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translateY(-50%)',
        }}
        data-placement={placement}
      >
        <button
          type="button"
          className={styles.noDataCloseX}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <p className={styles.noDataTitle}>No matchup saved</p>
        <p className={styles.noDataBody}>
          No deck profile against <strong>{hero.name}</strong>. Save one in
          your deckbuilder to auto-apply sideboard adjustments.
        </p>
        <a
          href={FAB_BAZAAR_LEARN_MORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.noDataLearnLink}
        >
          Learn more ↗
        </a>
      </div>
    </>
  );
};

export default Matchups;
