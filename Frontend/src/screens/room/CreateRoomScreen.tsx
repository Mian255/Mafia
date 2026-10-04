import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { createRoom } from '../../lib/rooms';
import { useStableCallback } from '../../hooks/useStableCallback';
import type { Room } from '../../lib/rooms';

interface CreateRoomScreenProps {
  onBack: () => void;
  onRoomCreated: (room: Room) => void;
}

const PLAYER_PRESETS = [6, 8, 10, 12, 16, 20];

export default function CreateRoomScreen({ onBack, onRoomCreated }: CreateRoomScreenProps) {
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [customMafiaCount, setCustomMafiaCount] = useState(2);
  const [doctorEnabled, setDoctorEnabled] = useState(true);
  const [detectiveEnabled, setDetectiveEnabled] = useState(true);
  const [nightDuration, setNightDuration] = useState(30);
  const [dayDuration, setDayDuration] = useState(90);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Calculate maximum allowed Mafia so town always has a fair majority
  const maxAllowedMafia = useMemo(() => {
    const specialRoles = (doctorEnabled ? 1 : 0) + (detectiveEnabled ? 1 : 0);
    // Mafia must be strictly < half of players AND leave at least 1 civilian
    const halfLimit = Math.floor((maxPlayers - 1) / 2);
    const roomLimit = maxPlayers - specialRoles - 1;
    return Math.max(1, Math.min(halfLimit, roomLimit));
  }, [maxPlayers, doctorEnabled, detectiveEnabled]);

  const effectiveMafiaCount = Math.min(Math.max(1, customMafiaCount), maxAllowedMafia);

  // Auto-derived civilian count
  const civilianCount = useMemo(() => {
    return Math.max(
      1,
      maxPlayers - effectiveMafiaCount - (doctorEnabled ? 1 : 0) - (detectiveEnabled ? 1 : 0)
    );
  }, [maxPlayers, effectiveMafiaCount, doctorEnabled, detectiveEnabled]);

  // Balance rating
  const balanceInfo = useMemo(() => {
    const mafiaPct = Math.round((effectiveMafiaCount / maxPlayers) * 100);
    if (mafiaPct <= 25) {
      return { label: `Balanced Setup (${mafiaPct}% Mafia)`, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' };
    }
    if (mafiaPct <= 35) {
      return { label: `Competitive Setup (${mafiaPct}% Mafia)`, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' };
    }
    return { label: `Challenging Setup (${mafiaPct}% Mafia)`, color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)' };
  }, [effectiveMafiaCount, maxPlayers]);

  const handlePlayerPresetChange = (preset: number) => {
    setMaxPlayers(preset);
    const recommendedMafia = Math.max(1, Math.floor(preset / 4));
    setCustomMafiaCount(recommendedMafia);
  };

  const handleCreate = useStableCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      // Defense-in-depth: never send an out-of-range mafia_count even if the UI
      // state somehow drifts. Guarantee 1 <= mafia_count < capacity and that at
      // least one civilian remains after the enabled special roles are seated.
      const enabledSpecialRoles = (doctorEnabled ? 1 : 0) + (detectiveEnabled ? 1 : 0);
      const safeMafiaCount = Math.max(
        1,
        Math.min(effectiveMafiaCount, maxAllowedMafia, maxPlayers - enabledSpecialRoles - 1)
      );

      const { room } = await createRoom({
        name: roomName.trim() || 'Mafia Room',
        isPublic,
        maxPlayers,
        settings: {
          mafia_count: safeMafiaCount,
          doctor_enabled: doctorEnabled,
          detective_enabled: detectiveEnabled,
          night_duration_seconds: nightDuration,
          discussion_duration_seconds: dayDuration,
        },
      });

      onRoomCreated(room);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create room. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 19l-7-7 7-7" stroke="#f1f5f9" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>CREATE ROOM</Text>
          <Text style={styles.headerSub}>Host a Game Room</Text>
        </View>

        <View style={styles.headerRightPlaceholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flexOne}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Section: Room Name */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>ROOM NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mafia Room, Town Square"
              placeholderTextColor="#475569"
              value={roomName}
              onChangeText={setRoomName}
              maxLength={30}
              editable={!isLoading}
            />
          </View>

          {/* Section: Max Players */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionLabel}>PLAYERS CAPACITY</Text>
              <Text style={styles.capacityBadge}>{maxPlayers} PLAYERS MAX</Text>
            </View>

            {/* Presets Row */}
            <View style={styles.presetsRow}>
              {PLAYER_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetPill,
                    maxPlayers === preset && styles.presetPillActive,
                  ]}
                  onPress={() => handlePlayerPresetChange(preset)}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.presetText,
                      maxPlayers === preset && styles.presetTextActive,
                    ]}
                  >
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Stepper Buttons */}
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={[styles.stepperBtn, maxPlayers <= 4 && styles.stepperDisabled]}
                onPress={() => {
                  const next = Math.max(4, maxPlayers - 1);
                  setMaxPlayers(next);
                }}
                disabled={maxPlayers <= 4 || isLoading}
              >
                <Text style={styles.stepperBtnText}>-</Text>
              </TouchableOpacity>

              <Text style={styles.stepperValue}>{maxPlayers} Players (Min 4, Max 20)</Text>

              <TouchableOpacity
                style={[styles.stepperBtn, maxPlayers >= 20 && styles.stepperDisabled]}
                onPress={() => {
                  const next = Math.min(20, maxPlayers + 1);
                  setMaxPlayers(next);
                }}
                disabled={maxPlayers >= 20 || isLoading}
              >
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Section: Visibility (Public vs Private) */}
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleTitle}>
                  {isPublic ? 'Public Room' : 'Private Room'}
                </Text>
                <Text style={styles.toggleSub}>
                  {isPublic
                    ? 'Listed in public rooms. Anyone can join.'
                    : 'Unlisted. Players must enter the 5-character room code.'}
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                thumbColor={isPublic ? '#e11d48' : '#64748b'}
                trackColor={{ false: '#1e293b', true: '#881337' }}
                disabled={isLoading}
              />
            </View>
          </View>

          {/* Section: Fair Role Customization */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionLabel}>ROLE QUANTITIES & BALANCE</Text>
              <View style={[styles.balancePill, { backgroundColor: balanceInfo.bg }]}>
                <Text style={[styles.balancePillText, { color: balanceInfo.color }]}>
                  {balanceInfo.label}
                </Text>
              </View>
            </View>

            {/* Role Grid Preview */}
            <View style={styles.roleGrid}>
              {/* Mafia Card with Stepper */}
              <View style={[styles.rolePill, { borderColor: '#e11d48' }]}>
                <Text style={[styles.roleCount, { color: '#e11d48' }]}>{customMafiaCount}</Text>
                <Text style={styles.roleName}>Mafia</Text>
                <Text style={styles.roleSubtext}>Max {maxAllowedMafia}</Text>
              </View>

              {/* Detective Card */}
              <View style={[styles.rolePill, { borderColor: '#0ea5e9' }]}>
                <Text style={[styles.roleCount, { color: '#0ea5e9' }]}>
                  {detectiveEnabled ? 1 : 0}
                </Text>
                <Text style={styles.roleName}>Detective</Text>
                <Text style={styles.roleSubtext}>{detectiveEnabled ? 'Active' : 'Off'}</Text>
              </View>

              {/* Doctor Card */}
              <View style={[styles.rolePill, { borderColor: '#10b981' }]}>
                <Text style={[styles.roleCount, { color: '#10b981' }]}>
                  {doctorEnabled ? 1 : 0}
                </Text>
                <Text style={styles.roleName}>Doctor</Text>
                <Text style={styles.roleSubtext}>{doctorEnabled ? 'Active' : 'Off'}</Text>
              </View>

              {/* Civilian Card */}
              <View style={[styles.rolePill, { borderColor: '#94a3b8' }]}>
                <Text style={[styles.roleCount, { color: '#94a3b8' }]}>{civilianCount}</Text>
                <Text style={styles.roleName}>Civilians</Text>
                <Text style={styles.roleSubtext}>Town Base</Text>
              </View>
            </View>

            {/* Mafia Quantity Stepper Row */}
            <View style={styles.mafiaControlRow}>
              <View style={styles.mafiaControlInfo}>
                <Text style={styles.mafiaControlTitle}>Customize Mafia Count</Text>
                <Text style={styles.mafiaControlSub}>
                  {customMafiaCount} of {maxPlayers} total players (Fair cap: {maxAllowedMafia})
                </Text>
              </View>

              <View style={styles.miniStepper}>
                <TouchableOpacity
                  style={[styles.miniStepperBtn, customMafiaCount <= 1 && styles.stepperDisabled]}
                  onPress={() => setCustomMafiaCount((prev) => Math.max(1, prev - 1))}
                  disabled={customMafiaCount <= 1 || isLoading}
                >
                  <Text style={styles.miniStepperBtnText}>-</Text>
                </TouchableOpacity>

                <Text style={styles.miniStepperValue}>{customMafiaCount}</Text>

                <TouchableOpacity
                  style={[
                    styles.miniStepperBtn,
                    customMafiaCount >= maxAllowedMafia && styles.stepperDisabled,
                  ]}
                  onPress={() =>
                    setCustomMafiaCount((prev) => Math.min(maxAllowedMafia, prev + 1))
                  }
                  disabled={customMafiaCount >= maxAllowedMafia || isLoading}
                >
                  <Text style={styles.miniStepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Special Roles Toggles */}
            <View style={styles.roleToggleGroup}>
              <View style={styles.subToggleRow}>
                <View>
                  <Text style={styles.subToggleLabel}>Detective Role</Text>
                  <Text style={styles.subToggleDesc}>Investigates 1 suspect each night</Text>
                </View>
                <Switch
                  value={detectiveEnabled}
                  onValueChange={setDetectiveEnabled}
                  thumbColor={detectiveEnabled ? '#0ea5e9' : '#64748b'}
                  trackColor={{ false: '#1e293b', true: '#0369a1' }}
                  disabled={isLoading}
                />
              </View>

              <View style={styles.subToggleRow}>
                <View>
                  <Text style={styles.subToggleLabel}>Doctor Role</Text>
                  <Text style={styles.subToggleDesc}>Protects 1 player each night</Text>
                </View>
                <Switch
                  value={doctorEnabled}
                  onValueChange={setDoctorEnabled}
                  thumbColor={doctorEnabled ? '#10b981' : '#64748b'}
                  trackColor={{ false: '#1e293b', true: '#047857' }}
                  disabled={isLoading}
                />
              </View>
            </View>
          </View>

          {/* Section: Timers */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>PHASE TIMERS</Text>

            <View style={styles.timerRow}>
              <View style={styles.timerBlock}>
                <Text style={styles.timerTitle}>Day Discussion</Text>
                <View style={styles.timerSelector}>
                  {[60, 90, 120].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.timePill, dayDuration === t && styles.timePillActive]}
                      onPress={() => setDayDuration(t)}
                    >
                      <Text style={[styles.timePillText, dayDuration === t && styles.timePillTextActive]}>
                        {t}s
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.timerBlock}>
                <Text style={styles.timerTitle}>Night Phase</Text>
                <View style={styles.timerSelector}>
                  {[20, 30, 45].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.timePill, nightDuration === t && styles.timePillActive]}
                      onPress={() => setNightDuration(t)}
                    >
                      <Text style={[styles.timePillText, nightDuration === t && styles.timePillTextActive]}>
                        {t}s
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            style={[styles.createButton, isLoading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" size="small" style={styles.spinner} />
            ) : null}
            <Text style={styles.createButtonText}>
              {isLoading ? 'CREATING ROOM...' : 'CREATE ROOM'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#0c1017',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161e2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleGroup: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  headerRightPlaceholder: {
    width: 40,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  errorBanner: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderWidth: 1,
    borderColor: '#e11d48',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#fb7185',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  capacityBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#e11d48',
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  balancePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  balancePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#07090e',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f8fafc',
    fontSize: 15,
    marginTop: 8,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  presetPill: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 10,
    alignItems: 'center',
  },
  presetPillActive: {
    backgroundColor: '#e11d48',
  },
  presetText: {
    color: '#94a3b8',
    fontWeight: '700',
    fontSize: 14,
  },
  presetTextActive: {
    color: '#ffffff',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#07090e',
    borderRadius: 12,
    padding: 6,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: {
    opacity: 0.3,
  },
  stepperBtnText: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: 'bold',
  },
  stepperValue: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  toggleTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  toggleSub: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16,
  },
  roleGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  rolePill: {
    flex: 1,
    backgroundColor: '#07090e',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    marginHorizontal: 3,
    alignItems: 'center',
  },
  roleCount: {
    fontSize: 18,
    fontWeight: '900',
  },
  roleName: {
    fontSize: 11,
    color: '#f1f5f9',
    fontWeight: '700',
    marginTop: 2,
  },
  roleSubtext: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  mafiaControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#07090e',
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  mafiaControlInfo: {
    flex: 1,
    paddingRight: 8,
  },
  mafiaControlTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  mafiaControlSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  miniStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161e2e',
    borderRadius: 8,
    padding: 2,
  },
  miniStepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStepperBtnText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  miniStepperValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 12,
  },
  roleToggleGroup: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
    marginTop: 6,
  },
  subToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subToggleLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  subToggleDesc: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  timerBlock: {
    flex: 1,
    marginHorizontal: 4,
  },
  timerTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  timerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timePill: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    marginHorizontal: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  timePillActive: {
    backgroundColor: '#3b82f6',
  },
  timePillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  timePillTextActive: {
    color: '#ffffff',
  },
  createButton: {
    backgroundColor: '#e11d48',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 8,
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  spinner: {
    marginRight: 10,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
