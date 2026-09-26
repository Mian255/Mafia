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
  const [doctorEnabled, setDoctorEnabled] = useState(true);
  const [detectiveEnabled, setDetectiveEnabled] = useState(true);
  const [nightDuration, setNightDuration] = useState(30);
  const [dayDuration, setDayDuration] = useState(90);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-derived mafia count based on player size
  const mafiaCount = useMemo(() => Math.max(1, Math.floor(maxPlayers / 4)), [maxPlayers]);
  const civilianCount = useMemo(
    () => Math.max(1, maxPlayers - mafiaCount - (doctorEnabled ? 1 : 0) - (detectiveEnabled ? 1 : 0)),
    [maxPlayers, mafiaCount, doctorEnabled, detectiveEnabled]
  );

  const handleCreate = useStableCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const { room } = await createRoom({
        name: roomName.trim() || 'Mafia Room',
        isPublic,
        maxPlayers,
        settings: {
          mafia_count: mafiaCount,
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
              <Text style={styles.sectionLabel}>PLAYERS</Text>
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
                  onPress={() => setMaxPlayers(preset)}
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
                onPress={() => setMaxPlayers((prev) => Math.max(4, prev - 1))}
                disabled={maxPlayers <= 4 || isLoading}
              >
                <Text style={styles.stepperBtnText}>-</Text>
              </TouchableOpacity>

              <Text style={styles.stepperValue}>{maxPlayers} Players (Max 20)</Text>

              <TouchableOpacity
                style={[styles.stepperBtn, maxPlayers >= 20 && styles.stepperDisabled]}
                onPress={() => setMaxPlayers((prev) => Math.min(20, prev + 1))}
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

          {/* Section: Role Allocation Preview */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>ROLE DISTRIBUTION PREVIEW</Text>

            <View style={styles.roleGrid}>
              <View style={[styles.rolePill, { borderColor: '#e11d48' }]}>
                <Text style={[styles.roleCount, { color: '#e11d48' }]}>{mafiaCount}</Text>
                <Text style={styles.roleName}>Mafia</Text>
              </View>

              <View style={[styles.rolePill, { borderColor: '#0ea5e9' }]}>
                <Text style={[styles.roleCount, { color: '#0ea5e9' }]}>
                  {detectiveEnabled ? 1 : 0}
                </Text>
                <Text style={styles.roleName}>Detective</Text>
              </View>

              <View style={[styles.rolePill, { borderColor: '#10b981' }]}>
                <Text style={[styles.roleCount, { color: '#10b981' }]}>
                  {doctorEnabled ? 1 : 0}
                </Text>
                <Text style={styles.roleName}>Doctor</Text>
              </View>

              <View style={[styles.rolePill, { borderColor: '#94a3b8' }]}>
                <Text style={[styles.roleCount, { color: '#94a3b8' }]}>{civilianCount}</Text>
                <Text style={styles.roleName}>Civilians</Text>
              </View>
            </View>

            {/* Special Roles Toggles */}
            <View style={styles.roleToggleGroup}>
              <View style={styles.subToggleRow}>
                <Text style={styles.subToggleLabel}>Enable Detective Role</Text>
                <Switch
                  value={detectiveEnabled}
                  onValueChange={setDetectiveEnabled}
                  thumbColor={detectiveEnabled ? '#0ea5e9' : '#64748b'}
                  trackColor={{ false: '#1e293b', true: '#0369a1' }}
                  disabled={isLoading}
                />
              </View>

              <View style={styles.subToggleRow}>
                <Text style={styles.subToggleLabel}>Enable Doctor Role</Text>
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
            <Text style={styles.sectionLabel}>OPERATION PHASE TIMERS</Text>

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
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    marginBottom: 10,
  },
  capacityBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#e11d48',
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
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
    marginHorizontal: 4,
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
    fontSize: 15,
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
    marginBottom: 16,
  },
  rolePill: {
    flex: 1,
    backgroundColor: '#07090e',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  roleCount: {
    fontSize: 18,
    fontWeight: '900',
  },
  roleName: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginTop: 2,
  },
  roleToggleGroup: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 12,
  },
  subToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  subToggleLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
