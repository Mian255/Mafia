import React, { useCallback, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

export type RoleId = 'mafia' | 'detective' | 'doctor' | 'civilian';

export interface RoleData {
  id: RoleId;
  name: string;
  faction: string;
  factionColor: string;
  badgeBg: string;
  accentColor: string;
  icon: string;
  iconColor: string;
  abilityTitle: string;
  abilityColor: string;
  shortDesc: string;
  dramaticTitle: string;
  dramaticLore: string;
  actionPhase: string;
  winCondition: string;
  strategyTip: string;
}

// Exact character images from assets
export const CHARACTER_IMAGES: Record<RoleId, any> = {
  mafia: require('../../assets/characters/mafia.png'),
  detective: require('../../assets/characters/detective.png'),
  doctor: require('../../assets/characters/doctor.png'),
  civilian: require('../../assets/characters/civilian.png'),
};

// Prefetch asset URIs for instant zero-lag rendering
Object.values(CHARACTER_IMAGES).forEach((source) => {
  const resolved = Image.resolveAssetSource(source);
  if (resolved?.uri) {
    Image.prefetch(resolved.uri);
  }
});

export const ROLES_DATA: Record<RoleId, RoleData> = {
  mafia: {
    id: 'mafia',
    name: 'MAFIA',
    faction: 'MAFIA FACTION',
    factionColor: '#ffffff',
    badgeBg: '#dc2626',
    accentColor: '#dc2626',
    icon: '💀',
    iconColor: '#ef4444',
    abilityTitle: 'NIGHT ELIMINATION',
    abilityColor: '#f43f5e',
    shortDesc:
      'Master of midnight assassination. Secretly marks and executes innocent citizens under the shroud of darkness.',
    dramaticTitle: 'The Shadow Kingpin',
    dramaticLore:
      'When midnight falls and darkness swallows the city, you rule the streets. Lurking in smoke-filled speakeasies, you orchestrate cold-blooded assassinations without leaving a trace. By sunlight, you wear the mask of a charming ally; under moonlight, your blade carves the syndicate’s bloody reign.',
    actionPhase: 'Night Phase • Secret Syndicate Elimination',
    winCondition: 'Eliminate all opposition until Mafia numbers equal or surpass innocent citizens.',
    strategyTip: 'Blend seamlessly during daytime debates. Cast subtle doubts on inquisitive leaders and steer courtroom paranoia toward vulnerable civilians.',
  },
  detective: {
    id: 'detective',
    name: 'DETECTIVE',
    faction: 'CITIZEN TEAM',
    factionColor: '#ffffff',
    badgeBg: '#334155',
    accentColor: '#38bdf8',
    icon: '🔍',
    iconColor: '#cbd5e1',
    abilityTitle: 'NIGHT INVESTIGATE',
    abilityColor: '#eab308',
    shortDesc:
      'The relentless inquisitor. Stalks rain-slicked alleys to interrogate suspects and unmask syndicate imposters.',
    dramaticTitle: 'The Relentless Inquisitor',
    dramaticLore:
      'A solitary bloodhound hunting through rain and gunfire. While corrupt officials avert their eyes, your piercing gaze unravels manufactured alibis and exposes hidden allegiances. Each night brings you face-to-face with the truth—or a bullet meant to keep it buried.',
    actionPhase: 'Night Phase • Private Interrogation',
    winCondition: 'Expose and convict every member of the Mafia syndicate in public trial.',
    strategyTip: 'Guard your identity fiercely. Guide daytime trials with calculated suggestions without making yourself the syndicate’s prime target of the night.',
  },
  doctor: {
    id: 'doctor',
    name: 'DOCTOR',
    faction: 'CITIZEN TEAM',
    factionColor: '#1e1b18',
    badgeBg: '#ca8a04',
    accentColor: '#10b981',
    icon: '🧰',
    iconColor: '#eab308',
    abilityTitle: 'NIGHT PROTECTION',
    abilityColor: '#eab308',
    shortDesc:
      'Underground emergency surgeon. Defies deadly curfews to shield marked citizens from fatal Mafia strikes.',
    dramaticTitle: 'The Midnight Guardian',
    dramaticLore:
      'Standing resolute between a fading pulse and the cold morgue slab. Armed with surgical precision and iron nerves, you brave hazardous curfews each night to shield targeted souls from the syndicate’s executioners. You are the fragile barrier preventing total ruin.',
    actionPhase: 'Night Phase • Emergency Protective Shield',
    winCondition: 'Preserve the lives of key townspeople until the syndicate is extinguished.',
    strategyTip: 'Anticipate the Mafia’s prime target each night. Protect influential citizens, and reserve self-treatment for when the danger closes in.',
  },
  civilian: {
    id: 'civilian',
    name: 'CIVILIAN',
    faction: 'CITIZEN TEAM',
    factionColor: '#ffffff',
    badgeBg: '#334155',
    accentColor: '#a855f7',
    icon: '📢',
    iconColor: '#cbd5e1',
    abilityTitle: 'DAY TRIAL VOTE',
    abilityColor: '#f43f5e',
    shortDesc:
      'The voice of justice. Uncovers web of deception and unites the public with decisive courtroom execution votes.',
    dramaticTitle: 'The Voice of Justice',
    dramaticLore:
      'You carry no badge and wield no blade, yet your conviction strikes fear into the deepest shadows. When the morning courtroom gavel echoes, your fiery words pierce through lies, rallying an honest populace to convict the wolves hiding in plain sight.',
    actionPhase: 'Day Phase • Courthouse Deliberation & Vote',
    winCondition: 'Unite the innocent majority to discover and vote out every Mafia imposter.',
    strategyTip: 'Scrutinize voting hesitations, subtle contradictions, and sudden bandwagon jumps. An alert civilian jury is the syndicate’s greatest nightmare.',
  },
};

interface RoleCardProps {
  role: RoleData;
  onSelect: (role: RoleData) => void;
}

export function RoleCard({ role, onSelect }: RoleCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.88}
      onPress={() => onSelect(role)}
    >
      {/* Top Image Frame with edge-to-edge coverage (zero side black bars) */}
      <View style={styles.imageFrame}>
        {/* Floating Faction Badge */}
        <View style={[styles.factionPill, { backgroundColor: role.badgeBg }]}>
          <Text style={[styles.factionPillText, { color: role.factionColor }]}>
            {role.faction}
          </Text>
        </View>

        {/* Real Character Artwork with cover to fill edge-to-edge */}
        <Image
          source={CHARACTER_IMAGES[role.id]}
          style={styles.characterImage}
          fadeDuration={0}
          resizeMode="cover"
        />
      </View>

      {/* Card Body Details */}
      <View style={styles.cardContent}>
        {/* Title & Role Icon */}
        <View style={styles.titleRow}>
          <Text style={styles.roleName}>{role.name}</Text>
          <Text style={[styles.roleIcon, { color: role.iconColor }]}>{role.icon}</Text>
        </View>

        {/* Ability Title */}
        <Text style={[styles.abilityTitle, { color: role.abilityColor }]}>
          {role.abilityTitle}
        </Text>

        {/* Dramatic English Description */}
        <Text style={styles.shortDescription} numberOfLines={4}>
          {role.shortDesc}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

interface ExpandedRoleModalProps {
  role: RoleData | null;
  visible: boolean;
  onClose: () => void;
}

export function ExpandedRoleModal({ role, visible, onClose }: ExpandedRoleModalProps) {
  if (!visible || !role) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <ExpandedRoleModalInner role={role} onClose={onClose} />
    </Modal>
  );
}

interface InnerProps {
  role: RoleData;
  onClose: () => void;
}

function ExpandedRoleModalInner({ role, onClose }: InnerProps) {
  const [isFlipped, setIsFlipped] = useState(true);
  const [flipAnim] = useState(() => new Animated.Value(0));
  const [scaleAnim] = useState(() => new Animated.Value(0.7));
  const [opacityAnim] = useState(() => new Animated.Value(0));

  // Trigger simultaneous flip and expand animation on mount
  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(flipAnim, {
        toValue: 180,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [flipAnim, scaleAnim, opacityAnim]);

  const toggleFlip = useCallback(() => {
    setIsFlipped((prev) => {
      const next = !prev;
      Animated.spring(flipAnim, {
        toValue: next ? 180 : 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
      return next;
    });
  }, [flipAnim]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.75,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [scaleAnim, opacityAnim, onClose]);

  // Front face rotation (0deg -> 180deg)
  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  // Back face rotation (180deg -> 360deg)
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  // Opacity cutoff at 90deg to ensure clean flip on Android and iOS
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 89, 90, 180],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 89, 90, 180],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <TouchableWithoutFeedback onPress={handleClose}>
      <View style={styles.modalOverlay}>
        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[
              styles.modalBox,
              {
                opacity: opacityAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {/* FRONT FACE (ENLARGED FULL CHARACTER ARTWORK) */}
            <Animated.View
              pointerEvents={isFlipped ? 'none' : 'auto'}
              style={[
                styles.cardFace,
                styles.cardFrontFace,
                {
                  opacity: frontOpacity,
                  transform: [
                    { perspective: 1200 },
                    { rotateY: frontInterpolate },
                  ],
                },
              ]}
            >
              <View style={[styles.modalFactionPill, { backgroundColor: role.badgeBg }]}>
                <Text style={[styles.factionPillText, { color: role.factionColor }]}>
                  {role.faction}
                </Text>
              </View>

              <View style={styles.modalImageWrapper}>
                <Image
                  source={CHARACTER_IMAGES[role.id]}
                  style={styles.modalEnlargedImage}
                  fadeDuration={0}
                  resizeMode="cover"
                />
              </View>

              <View style={styles.modalFrontBody}>
                <View style={styles.modalTitleRow}>
                  <Text style={styles.modalRoleName}>{role.name}</Text>
                  <Text style={[styles.modalRoleIcon, { color: role.iconColor }]}>
                    {role.icon}
                  </Text>
                </View>

                <Text style={[styles.modalAbilityTitle, { color: role.abilityColor }]}>
                  {role.abilityTitle}
                </Text>

                <Text style={styles.modalShortDesc}>{role.shortDesc}</Text>

                <TouchableOpacity
                  style={[styles.flipPromptBtn, { backgroundColor: role.accentColor }]}
                  onPress={toggleFlip}
                  activeOpacity={0.8}
                >
                  <Text style={styles.flipPromptBtnText}>FLIP</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* BACK FACE (DRAMATIC NOIR DOSSIER) */}
            <Animated.View
              pointerEvents={isFlipped ? 'auto' : 'none'}
              style={[
                styles.cardFace,
                styles.cardBackFace,
                {
                  opacity: backOpacity,
                  transform: [
                    { perspective: 1200 },
                    { rotateY: backInterpolate },
                  ],
                },
              ]}
            >
              <View style={styles.backHeader}>
                <View style={[styles.backBadgePill, { backgroundColor: role.badgeBg }]}>
                  <Text style={[styles.factionPillText, { color: role.factionColor }]}>
                    {role.faction}
                  </Text>
                </View>
              </View>

              <View style={styles.backBody}>
                <View style={styles.backTitleRow}>
                  <Text style={styles.backRoleName}>{role.name}</Text>
                  <Text style={[styles.backRoleIcon, { color: role.iconColor }]}>
                    {role.icon}
                  </Text>
                </View>

                <Text style={[styles.backDramaticTitle, { color: role.accentColor }]}>
                  {`“${role.dramaticTitle}”`}
                </Text>

                {/* Dramatic Noir Lore Box */}
                <View style={styles.loreBox}>
                  <Text style={styles.loreText}>{role.dramaticLore}</Text>
                </View>

                {/* Operational Mechanics */}
                <View style={styles.specsBox}>
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>PHASE:</Text>
                    <Text style={styles.specVal}>{role.actionPhase}</Text>
                  </View>

                    <View style={styles.specRow}>
                    <Text style={styles.specKey}>OBJECTIVE:</Text>
                    <Text style={styles.specVal}>{role.winCondition}</Text>
                  </View>

                  <View style={styles.specRow}>
                    <Text style={[styles.specKey, { color: role.accentColor }]}>
                      TACTIC:
                    </Text>
                    <Text style={styles.specVal}>{role.strategyTip}</Text>
                  </View>
                </View>

                {/* Flip back & Dismiss buttons */}
                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={styles.actionBtnFlip}
                    onPress={toggleFlip}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnFlipText}>FLIP</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtnClose, { backgroundColor: role.accentColor }]}
                    onPress={handleClose}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnCloseText}>CLOSE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#101522',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1d2738',
    overflow: 'hidden',
  },
  imageFrame: {
    width: '100%',
    height: 180,
    backgroundColor: '#0c1017',
    position: 'relative',
    overflow: 'hidden',
  },
  factionPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  factionPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  characterImage: {
    width: '100%',
    height: 360,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  cardContent: {
    padding: 10,
    backgroundColor: '#101522',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  roleName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  roleIcon: {
    fontSize: 14,
  },
  abilityTitle: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  shortDescription: {
    color: '#cbd5e1',
    fontSize: 10,
    lineHeight: 14,
    minHeight: 42,
  },

  /* Modal & 3D Flip */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 7, 14, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 350,
    height: 540,
    position: 'relative',
  },
  cardFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#243046',
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  cardFrontFace: {
    backgroundColor: '#101522',
  },
  modalFactionPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
  },
  modalImageWrapper: {
    width: '100%',
    height: 250,
    backgroundColor: '#0c1017',
    position: 'relative',
    overflow: 'hidden',
  },
  modalEnlargedImage: {
    width: '100%',
    height: 500,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  modalFrontBody: {
    padding: 16,
    flex: 1,
    justifyContent: 'space-between',
  },
  modalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalRoleName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  modalRoleIcon: {
    fontSize: 24,
  },
  modalAbilityTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 6,
  },
  modalShortDesc: {
    color: '#cbd5e1',
    fontSize: 12.5,
    lineHeight: 18,
  },
  flipPromptBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  flipPromptBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  /* Back Face Dossier */
  cardBackFace: {
    backgroundColor: '#0f141f',
    padding: 18,
  },
  backHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 10,
  },
  backBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  backBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  backTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backRoleName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  backRoleIcon: {
    fontSize: 24,
  },
  backDramaticTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginVertical: 4,
  },
  loreBox: {
    backgroundColor: '#090d14',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#dc2626',
    padding: 12,
    marginVertical: 6,
  },
  loreText: {
    color: '#e2e8f0',
    fontSize: 11.5,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  specsBox: {
    backgroundColor: '#161c2b',
    borderRadius: 10,
    padding: 10,
    gap: 5,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  specKey: {
    color: '#94a3b8',
    fontSize: 9.5,
    fontWeight: '900',
    width: 76,
    letterSpacing: 0.5,
  },
  specVal: {
    color: '#cbd5e1',
    fontSize: 10.5,
    flex: 1,
    lineHeight: 14,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionBtnFlip: {
    flex: 1,
    backgroundColor: '#1e2638',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionBtnFlipText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtnClose: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionBtnCloseText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
