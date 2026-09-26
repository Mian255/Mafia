import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type NavTab = "play" | "friends" | "settings";

interface BottomNavBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export function BottomNavBar({ activeTab, onSelectTab }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();
  // Ensure we respect bottom gesture navigation bar and home indicators (minimum 12px padding)
  const bottomPadding = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.navBarContainer, { paddingBottom: bottomPadding }]}>
      {/* PLAY TAB */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => onSelectTab("play")}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          {/* Gamepad Controller Icon */}
          <Path
            d="M6 11H8M7 10V12M16 11H16.01M18 10H18.01"
            stroke={activeTab === "play" ? "#ef4444" : "#64748b"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M6 12H18C19.6569 12 21 13.3431 21 15C21 16.6569 19.6569 18 18 18L16.5 18C15.8 18 15.2 18.4 15 19L14.5 20.5C14.1 21.7 12.4 21.7 12 20.5L11.5 19C11.3 18.4 10.7 18 10 18L7.5 18C5.84315 18 4.5 16.6569 4.5 15C4.5 13.3431 5.84315 12 7.5 12Z"
            stroke={activeTab === "play" ? "#ef4444" : "#64748b"}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </Svg>
        <Text
          style={[
            styles.navLabel,
            activeTab === "play" ? styles.activeLabel : styles.inactiveLabel,
          ]}
        >
          PLAY
        </Text>
      </TouchableOpacity>

      {/* FRIENDS TAB */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => onSelectTab("friends")}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          {/* Friends / People Icon */}
          <Circle
            cx="9"
            cy="7"
            r="3.5"
            stroke={activeTab === "friends" ? "#ef4444" : "#64748b"}
            strokeWidth="1.8"
          />
          <Path
            d="M3 19C3 16 5.5 14 9 14C12.5 14 15 16 15 19"
            stroke={activeTab === "friends" ? "#ef4444" : "#64748b"}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <Path
            d="M16 8C17.3807 8 18.5 9.11929 18.5 10.5C18.5 11.8807 17.3807 13 16 13"
            stroke={activeTab === "friends" ? "#ef4444" : "#64748b"}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <Path
            d="M17.5 16C19.5 16.5 21 17.8 21 19.5"
            stroke={activeTab === "friends" ? "#ef4444" : "#64748b"}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </Svg>
        <Text
          style={[
            styles.navLabel,
            activeTab === "friends" ? styles.activeLabel : styles.inactiveLabel,
          ]}
        >
          FRIENDS
        </Text>
      </TouchableOpacity>

      {/* SETTINGS TAB */}
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => onSelectTab("settings")}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          {/* Gear / Settings Icon */}
          <Circle
            cx="12"
            cy="12"
            r="3"
            stroke={activeTab === "settings" ? "#ef4444" : "#64748b"}
            strokeWidth="1.8"
          />
          <Path
            d="M19.4 15A1.65 1.65 0 0 0 19.73 16.82L20.1 17.2A1.85 1.85 0 0 1 17.48 19.82L17.1 19.45A1.65 1.65 0 0 0 15.28 19.12A1.65 1.65 0 0 0 14.15 20.65L14.07 21.15A1.85 1.85 0 0 1 10.4 21.15L10.32 20.65A1.65 1.65 0 0 0 9.19 19.12A1.65 1.65 0 0 0 7.37 19.45L6.99 19.82A1.85 1.85 0 0 1 4.37 17.2L4.74 16.82A1.65 1.65 0 0 0 5.07 15A1.65 1.65 0 0 0 3.54 13.87L3.04 13.79A1.85 1.85 0 0 1 3.04 10.12L3.54 10.04A1.65 1.65 0 0 0 5.07 8.91A1.65 1.65 0 0 0 4.74 7.09L4.37 6.71A1.85 1.85 0 0 1 6.99 4.09L7.37 4.46A1.65 1.65 0 0 0 9.19 4.79A1.65 1.65 0 0 0 10.32 3.26L10.4 2.76A1.85 1.85 0 0 1 14.07 2.76L14.15 3.26A1.65 1.65 0 0 0 15.28 4.79A1.65 1.65 0 0 0 17.1 4.46L17.48 4.09A1.85 1.85 0 0 1 20.1 6.71L19.73 7.09A1.65 1.65 0 0 0 19.4 8.91A1.65 1.65 0 0 0 20.93 10.04L21.43 10.12A1.85 1.85 0 0 1 21.43 13.79L20.93 13.87A1.65 1.65 0 0 0 19.4 15Z"
            stroke={activeTab === "settings" ? "#ef4444" : "#64748b"}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text
          style={[
            styles.navLabel,
            activeTab === "settings" ? styles.activeLabel : styles.inactiveLabel,
          ]}
        >
          SETTINGS
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  navBarContainer: {
    backgroundColor: "#0a0d14",
    borderTopWidth: 1,
    borderTopColor: "#1e2433",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    width: "100%",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
  },
  activeLabel: {
    color: "#ef4444",
  },
  inactiveLabel: {
    color: "#64748b",
  },
});
