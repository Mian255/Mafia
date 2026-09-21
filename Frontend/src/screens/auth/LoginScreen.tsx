import React, { useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';

const charLeft = require('../../../assets/mafia_vs_civilina-removebg-preview.png');
const charRight = require('../../../assets/mafia_vs_civilina__1_-removebg-preview.png');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

interface LoginScreenProps {
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
  onLoginSuccess?: (alias: string) => void;
}

const USER_ICON =
  'M 11 4 C 8.79 4 7 5.79 7 8 C 7 10.21 8.79 12 11 12 C 13.21 12 15 10.21 15 8 C 15 5.79 13.21 4 11 4 Z M 3 20 L 3 18 C 3 15.79 6.58 14 11 14 C 15.42 14 19 15.79 19 18 L 19 20 L 3 20 Z';

const KEY_ICON =
  'M 10 2 C 6.69 2 4 4.69 4 8 C 4 9.4 4.51 10.67 5.38 11.64 L 2 15 L 4 17 L 6 15 L 8 17 L 11 14 C 11.36 13.98 11.71 13.89 12.05 13.76 L 14 15.73 L 16.27 13.5 L 14.29 11.5 C 15.14 10.5 15.6 9.19 15.48 7.81 C 15.27 5.06 12.95 2.86 10.21 2.5 C 10.14 2.5 10.07 2.5 10 2 Z M 10 6 C 11.1 6 12 6.9 12 8 C 12 9.1 11.1 10 10 10 C 8.9 10 8 9.1 8 8 C 8 6.9 8.9 6 10 6 Z';

function GoldBorderedInputPlaceholder({
  label,
  icon,
  top,
  showLabel,
}: {
  label: string;
  icon: 'user' | 'key';
  top: number;
  showLabel: boolean;
}) {
  const iconD = icon === 'user' ? USER_ICON : KEY_ICON;
  return (
    <View style={[stylesPl.inputPlaceholder, { top }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 300 60" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`frameGold-${icon}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#fde68a" />
            <Stop offset="50%" stopColor="#d97706" />
            <Stop offset="100%" stopColor="#92400e" />
          </LinearGradient>
        </Defs>
        <Rect x="1" y="1" width="298" height="58" rx="20" ry="20" fill="#0d111a" />
        <Rect
          x="1"
          y="1"
          width="298"
          height="58"
          rx="20"
          ry="20"
          fill="none"
          stroke={`url(#frameGold-${icon})`}
          strokeWidth="1.5"
        />
      </Svg>
      <View style={stylesPl.iconWrap}>
        <Svg width="24" height="24" viewBox="0 0 22 22">
          <Path d={iconD} fill="#fde68a" />
        </Svg>
      </View>
      {showLabel ? (
        <View style={stylesPl.labelWrap}>
          <Text style={stylesPl.inputLabel}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LoginButtonPlaceholder({ top }: { top: number }) {
  return (
    <View style={[stylesPl.btnPlaceholder, { top }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 300 64" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="btnRed" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#b91c1c" />
            <Stop offset="50%" stopColor="#7f1d1d" />
            <Stop offset="100%" stopColor="#450a0a" />
          </LinearGradient>
          <LinearGradient id="btnGoldFrame" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#fde68a" />
            <Stop offset="50%" stopColor="#d97706" />
            <Stop offset="100%" stopColor="#78350f" />
          </LinearGradient>
        </Defs>
        <Path
          d="M 2 15 L 12 5 L 288 5 L 298 15 L 298 49 L 288 59 L 12 59 L 2 49 Z"
          fill="url(#btnRed)"
        />
        <Path
          d="M 5 17 L 14 8 L 286 8 L 295 17 L 295 47 L 286 56 L 14 56 L 5 47 Z"
          fill="none"
          stroke="url(#btnGoldFrame)"
          strokeWidth="2"
        />
        <SvgText
          x="150"
          y="42"
          textAnchor="middle"
          fontSize="32"
          fontWeight="900"
          letterSpacing="4"
          fill="#fde68a"
          fontFamily="serif"
        >
          LOGIN
        </SvgText>
      </Svg>
    </View>
  );
}

function GuestButtonPlaceholder({ top }: { top: number }) {
  return (
    <View style={[stylesPl.guestBtnPlaceholder, { top }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 300 50" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="btnDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#1f2937" />
            <Stop offset="50%" stopColor="#111827" />
            <Stop offset="100%" stopColor="#0b0f19" />
          </LinearGradient>
          <LinearGradient id="btnGoldFrameDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#92400e" />
            <Stop offset="50%" stopColor="#78350f" />
            <Stop offset="100%" stopColor="#451a03" />
          </LinearGradient>
        </Defs>
        <Path
          d="M 2 12 L 12 4 L 288 4 L 298 12 L 298 38 L 288 46 L 12 46 L 2 38 Z"
          fill="url(#btnDark)"
        />
        <Path
          d="M 5 14 L 14 6 L 286 6 L 295 14 L 295 36 L 286 44 L 14 44 L 5 36 Z"
          fill="none"
          stroke="url(#btnGoldFrameDark)"
          strokeWidth="1.5"
        />
        <SvgText
          x="150"
          y="32"
          textAnchor="middle"
          fontSize="24"
          fontWeight="700"
          letterSpacing="2"
          fill="#9ca3af"
          fontFamily="serif"
        >
          PLAY AS GUEST
        </SvgText>
      </Svg>
    </View>
  );
}

const CARD_TOP = SCREEN_HEIGHT * 0.32;
const CARD_LEFT = SCREEN_WIDTH * 0.09;
const CARD_RIGHT = SCREEN_WIDTH * 0.09;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.40;
const INPUT_TOP_USERNAME = CARD_TOP + CARD_HEIGHT * 0.15;
const INPUT_TOP_PASSWORD = CARD_TOP + CARD_HEIGHT * 0.40;
const INPUT_HEIGHT = SCREEN_HEIGHT * 0.06;
const BUTTON_HEIGHT = SCREEN_HEIGHT * 0.08;
const BUTTON_TOP = CARD_TOP + CARD_HEIGHT * 0.65;
const GUEST_BUTTON_HEIGHT = SCREEN_HEIGHT * 0.06;
const GUEST_BUTTON_TOP = BUTTON_TOP + BUTTON_HEIGHT + SCREEN_HEIGHT * 0.02;

function LoginBackground({
  showUsernameLabel,
  showPasswordLabel,
}: {
  showUsernameLabel: boolean;
  showPasswordLabel: boolean;
}) {
  return (
    <View style={bgStyles.container}>
      <View style={bgStyles.wallGradientTop} />

      <View style={bgStyles.titleArea}>
        <Text style={bgStyles.titleText}>MAFIA</Text>
        <Text style={bgStyles.subtitleText}>TRUST NO ONE • SUSPECT EVERYONE</Text>
      </View>

      <View style={bgStyles.charSlotLeft}>
        <Image
          source={charLeft}
          style={bgStyles.charImgLeft}
          resizeMode="contain"
        />
      </View>

      <View style={bgStyles.charSlotRight}>
        <Image
          source={charRight}
          style={bgStyles.charImgRight}
          resizeMode="contain"
        />
      </View>

      <View style={bgStyles.cardContainer}>
        <View style={bgStyles.cardShadow} />
        <View style={bgStyles.cardBody}>
          <View style={bgStyles.cardHighlight} />
          <View style={bgStyles.cardBevelTL} />
          <View style={bgStyles.cardBevelTR} />
          <View style={bgStyles.cardBevelBL} />
          <View style={bgStyles.cardBevelBR} />
        </View>
      </View>

      <View style={bgStyles.floorArea} />
      <View style={bgStyles.floorShadow} />

      <GoldBorderedInputPlaceholder
        label="USERNAME / EMAIL"
        icon="user"
        top={INPUT_TOP_USERNAME}
        showLabel={showUsernameLabel}
      />
      <GoldBorderedInputPlaceholder
        label="PASSWORD"
        icon="key"
        top={INPUT_TOP_PASSWORD}
        showLabel={showPasswordLabel}
      />
      <LoginButtonPlaceholder top={BUTTON_TOP} />
      <GuestButtonPlaceholder top={GUEST_BUTTON_TOP} />

      <View style={bgStyles.footerRow}>
        <View style={bgStyles.footerLeft}>
          <Text style={bgStyles.footerForgot}>Forgot Password?</Text>
        </View>
        <View style={bgStyles.footerRight}>
          <Text style={bgStyles.footerNeed}>Need an account?</Text>
          <Text style={bgStyles.footerSignUp}>SIGN UP</Text>
        </View>
      </View>
    </View>
  );
}

export default function LoginScreen({
  onNavigateToSignUp,
  onNavigateToForgotPassword,
  onLoginSuccess,
}: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    if (!username.trim()) {
      Alert.alert('Required', 'Please enter your username.');
      return;
    }
    if (!password) {
      Alert.alert('Required', 'Please enter your password.');
      return;
    }
    if (onLoginSuccess) {
      onLoginSuccess(username.trim());
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LoginBackground
        showUsernameLabel={username.length === 0}
        showPasswordLabel={password.length === 0}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[FILL, styles.overlay]}
        pointerEvents="box-none"
      >
        <View pointerEvents="auto" style={[styles.inputArea, { top: INPUT_TOP_USERNAME, height: INPUT_HEIGHT }]}>
          <TextInput
            style={styles.realInput}
            value={username}
            onChangeText={setUsername}
            placeholder=""
            placeholderTextColor="transparent"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View pointerEvents="auto" style={[styles.inputArea, { top: INPUT_TOP_PASSWORD, height: INPUT_HEIGHT }]}>
          <TextInput
            style={styles.realInput}
            value={password}
            onChangeText={setPassword}
            placeholder=""
            placeholderTextColor="transparent"
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity
          style={[styles.loginBtnArea, { top: BUTTON_TOP, height: BUTTON_HEIGHT }]}
          onPress={handleLogin}
          activeOpacity={0.75}
        />

        <TouchableOpacity
          style={[styles.guestBtnArea, { top: GUEST_BUTTON_TOP, height: GUEST_BUTTON_HEIGHT }]}
          onPress={() => onLoginSuccess?.('Guest')}
          activeOpacity={0.75}
        />

        <TouchableOpacity
          style={styles.forgotArea}
          onPress={onNavigateToForgotPassword}
          activeOpacity={0.7}
        />

        <TouchableOpacity
          style={styles.signUpArea}
          onPress={onNavigateToSignUp}
          activeOpacity={0.7}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const bgStyles = StyleSheet.create({
  container: {
    ...FILL,
    backgroundColor: '#0c1421',
    overflow: 'hidden',
  },
  wallGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.58,
    backgroundColor: '#0c1421',
  },
  titleArea: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.08,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    height: SCREEN_HEIGHT * 0.12,
  },
  titleText: {
    color: '#fde68a',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'serif',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    textAlign: 'center',
  },
  subtitleText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 4,
    textAlign: 'center',
  },
  charSlotLeft: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT - CARD_TOP - SCREEN_HEIGHT * 0.04,
    left: CARD_LEFT + SCREEN_WIDTH * 0.01,
    width: SCREEN_WIDTH * 0.15,
    height: SCREEN_HEIGHT * 0.15,
    zIndex: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  charImgLeft: {
    width: '100%',
    height: '100%',
  },
  charSlotRight: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT - CARD_TOP - SCREEN_HEIGHT * 0.02,
    right: CARD_RIGHT + SCREEN_WIDTH * 0.01,
    width: SCREEN_WIDTH * 0.15,
    height: SCREEN_HEIGHT * 0.15,
    zIndex: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  charImgRight: {
    width: '100%',
    height: '100%',
  },
  cardContainer: {
    position: 'absolute',
    top: CARD_TOP,
    left: CARD_LEFT,
    right: CARD_RIGHT,
    height: CARD_HEIGHT,
    zIndex: 3,
  },
  cardShadow: {
    ...FILL,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.9,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
    backgroundColor: 'transparent',
  },
  cardBody: {
    ...FILL,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.15)',
    overflow: 'hidden',
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  cardBevelTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 12,
    height: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: 'rgba(253,230,138,0.3)',
    borderLeftColor: 'rgba(253,230,138,0.3)',
    borderTopLeftRadius: 12,
  },
  cardBevelTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(253,230,138,0.3)',
    borderRightColor: 'rgba(253,230,138,0.3)',
    borderTopRightRadius: 12,
  },
  cardBevelBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 12,
    height: 12,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.4)',
    borderLeftColor: 'rgba(0,0,0,0.4)',
    borderBottomLeftRadius: 12,
  },
  cardBevelBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.4)',
    borderRightColor: 'rgba(0,0,0,0.4)',
    borderBottomRightRadius: 12,
  },
  floorArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.42,
    backgroundColor: '#0c1421',
  },
  floorShadow: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.58,
    left: 0,
    right: 0,
    height: 100,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 60,
  },
  footerRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: SCREEN_HEIGHT * 0.05,
    paddingHorizontal: SCREEN_WIDTH * 0.1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 10,
  },
  footerLeft: {
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  footerForgot: {
    color: '#fde68a',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  footerNeed: {
    color: '#fde68a',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  footerSignUp: {
    color: '#fde68a',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    lineHeight: 24,
  },
});

const stylesPl = StyleSheet.create({
  inputPlaceholder: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.14,
    right: SCREEN_WIDTH * 0.14,
    height: INPUT_HEIGHT,
    zIndex: 5,
  },
  iconWrap: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.05,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
  },
  labelWrap: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.05 + 42,
    right: SCREEN_WIDTH * 0.02,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  inputLabel: {
    color: '#fde68a',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  btnPlaceholder: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.14,
    right: SCREEN_WIDTH * 0.14,
    height: BUTTON_HEIGHT,
    zIndex: 5,
  },
  guestBtnPlaceholder: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.14,
    right: SCREEN_WIDTH * 0.14,
    height: GUEST_BUTTON_HEIGHT,
    zIndex: 5,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#143158',
  },
  overlay: {
    zIndex: 40,
  },
  inputArea: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.14 + SCREEN_WIDTH * 0.14,
    right: SCREEN_WIDTH * 0.14 + SCREEN_WIDTH * 0.03,
    justifyContent: 'center',
  },
  realInput: {
    width: '100%',
    height: '100%',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    paddingVertical: 0,
  },
  loginBtnArea: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.14,
    right: SCREEN_WIDTH * 0.14,
    borderRadius: 8,
  },
  guestBtnArea: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.14,
    right: SCREEN_WIDTH * 0.14,
    borderRadius: 8,
  },
  forgotArea: {
    position: 'absolute',
    left: SCREEN_WIDTH * 0.1,
    bottom: SCREEN_HEIGHT * 0.05,
    width: SCREEN_WIDTH * 0.42,
    height: 40,
  },
  signUpArea: {
    position: 'absolute',
    right: SCREEN_WIDTH * 0.1,
    bottom: SCREEN_HEIGHT * 0.05,
    width: SCREEN_WIDTH * 0.38,
    height: 72,
    alignItems: 'flex-end',
  },
});
