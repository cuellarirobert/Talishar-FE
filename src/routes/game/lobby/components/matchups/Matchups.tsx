import { useAppSelector } from 'app/Hooks';
import { RootState } from 'app/Store';
import { GAME_FORMAT } from 'appConstants';
import { useJoinGameMutation } from 'features/api/apiSlice';
import { getGameInfo } from 'features/game/GameSlice';
import React, { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { shallowEqual } from 'react-redux';
import { HEROES_OF_RATHE } from 'routes/index/components/filter/constants';
import { generateCroppedImageUrl } from 'utils/cropImages';
import styles from './Matchups.module.css';
import MatchupTooltip from './MatchupTooltip';

export interface Matchups {
  refetch: () => void;
  selectedMatchupId?: string | null;
  onMatchupSelected?: (matchupId: string) => void;
  isAutoApplyingMatchup?: boolean;
  onExpandChat?: () => void;
  format?: string;
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
}: Matchups) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  // Build data lookup from actual saved matchups
  const matchupDataMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof gameLobby>['matchups'] extends (infer T)[] | undefined ? T : never>();
    for (const m of gameLobby?.matchups ?? []) {
      map.set(m.matchupId, m);
    }
    return map;
  }, [gameLobby?.matchups]);

  // All heroes legal in this format, merged with saved matchup data
  const allHeroes = useMemo(() => {
    const useYoung = format ? BLITZ_FORMATS.has(format) : false;
    return HEROES_OF_RATHE
      .filter((h) => !!h.young === useYoung)
      .map((h) => {
        const saved = matchupDataMap.get(h.value);
        return {
          matchupId: h.value,
          name: h.label,
          preferredTurnOrder: saved?.preferredTurnOrder ?? null,
          notes: saved?.notes ?? null,
          hasData: !!saved,
        };
      });
  }, [format, matchupDataMap]);

  const filteredHeroes = useMemo(() =>
    allHeroes.filter((h) =>
      h.name.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [allHeroes, searchTerm]
  );

  const groupedMatchups = useMemo(() => {
    const groups: Record<string, typeof filteredHeroes> = {};
    for (const h of filteredHeroes) {
      const cls = getHeroClass(h.name);
      if (!groups[cls]) groups[cls] = [];
      groups[cls].push(h);
    }
    return CLASS_ORDER
      .filter((cls) => groups[cls]?.length)
      .map((cls) => ({ cls, matchups: groups[cls] }));
  }, [filteredHeroes]);

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
        {groupedMatchups.map(({ cls, matchups }) => (
          <div key={cls} className={styles.classGroup}>
            <p className={styles.groupHeader}>{cls.toUpperCase()}</p>
            <div className={styles.portraitGrid}>
              {matchups.map((matchup) => {
                const isSelected = selectedMatchupId === matchup.matchupId;
                return (
                  <MatchupTooltip key={matchup.matchupId} content={matchup.notes}>
                    <button
                      disabled={isUpdating}
                      className={`${styles.portraitCard} ${isSelected ? styles.portraitCardSelected : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
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
    </article>
  );
};

export default Matchups;
