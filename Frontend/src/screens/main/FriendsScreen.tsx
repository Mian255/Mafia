import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function FriendsScreen() {
  const dummyFriends = [
    { id: '1', name: 'DonCorleone', status: 'Online', rank: 'Godfather • Rank 42', isOnline: true },
    { id: '2', name: 'Vito_Soprano', status: 'In Match (Classic Noir)', rank: 'Consigliere • Rank 28', isOnline: true },
    { id: '3', name: 'LadyShadow', status: 'Offline (2h ago)', rank: 'Underboss • Rank 19', isOnline: false },
    { id: '4', name: 'AgentCooper', status: 'Online', rank: 'Inspector • Rank 35', isOnline: true },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SYNDICATE CONTACTS</Text>
        <TouchableOpacity style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ ADD OPERATIVE</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {dummyFriends.map((friend) => (
          <View key={friend.id} style={styles.friendCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{friend.name.charAt(0)}</Text>
              {friend.isOnline && <View style={styles.onlineDot} />}
            </View>

            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{friend.name}</Text>
              <Text style={styles.friendRank}>{friend.rank}</Text>
              <Text style={[styles.friendStatus, friend.isOnline ? styles.statusOnline : styles.statusOffline]}>
                {friend.status}
              </Text>
            </View>

            <TouchableOpacity style={styles.inviteBtn}>
              <Text style={styles.inviteBtnText}>INVITE</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
    paddingHorizontal: 20,
    paddingTop: 54,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1,
  },
  addBtn: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  list: {
    gap: 12,
    paddingBottom: 24,
  },
  friendCard: {
    backgroundColor: '#0f141d',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    position: 'relative',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#0f141d',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  friendRank: {
    color: '#94a3b8',
    fontSize: 11,
  },
  friendStatus: {
    fontSize: 10.5,
    marginTop: 2,
    fontWeight: '700',
  },
  statusOnline: {
    color: '#34d399',
  },
  statusOffline: {
    color: '#64748b',
  },
  inviteBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inviteBtnText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
