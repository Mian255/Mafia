import React, { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

const MAX_FONT_SCALE = 1.3;

export type AuthTextInputVariant = 'gold' | 'slate';

export interface AuthTextInputProps
  extends Omit<TextInputProps, 'style' | 'onFocus' | 'onBlur' | 'placeholderTextColor'> {
  label: string;
  error?: string;
  invalid?: boolean;
  hint?: string;
  hintTone?: 'muted' | 'success';
  variant?: AuthTextInputVariant;
  renderIcon?: (focused: boolean) => React.ReactNode;
  rightAccessory?: React.ReactNode;
}

const AuthTextInputBase = forwardRef<TextInput, AuthTextInputProps>(function AuthTextInputBase(
  {
    label,
    error,
    invalid = false,
    hint,
    hintTone = 'muted',
    variant = 'slate',
    renderIcon,
    rightAccessory,
    ...inputProps
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const internalInputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => internalInputRef.current as TextInput, []);

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const hasError = !!error || invalid;

  const handleBoxPress = () => {
    internalInputRef.current?.focus();
  };

  if (variant === 'gold') {
    return (
      <View style={gold.inputGroup}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={gold.fieldLabel}>
          {label}
        </Text>
        <Pressable
          style={[gold.inputBox, focused && gold.inputBoxFocused, hasError && gold.inputBoxError]}
          onPress={handleBoxPress}
        >
          {renderIcon ? <View style={gold.iconContainer} pointerEvents="none">{renderIcon(focused)}</View> : null}
          <TextInput
            ref={internalInputRef}
            style={gold.textInput}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            placeholderTextColor="#64748b"
            accessibilityLabel={label}
            onFocus={handleFocus}
            onBlur={handleBlur}
            textAlignVertical="center"
            {...inputProps}
          />
          {rightAccessory}
        </Pressable>
        {error ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={gold.fieldErrorText}>
            {error}
          </Text>
        ) : hint ? (
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[gold.hintText, hintTone === 'success' && gold.hintSuccess]}
          >
            {hint}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={slate.inputGroup}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={slate.inputLabel}>
        {label}
      </Text>
      <Pressable
        style={[
          slate.inputWrap,
          focused && slate.inputFocused,
          hasError && slate.inputError,
        ]}
        onPress={handleBoxPress}
      >
        <TextInput
          ref={internalInputRef}
          style={[
            slate.input,
            !!rightAccessory && slate.inputWithAccessory,
          ]}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          placeholderTextColor="#475569"
          accessibilityLabel={label}
          onFocus={handleFocus}
          onBlur={handleBlur}
          textAlignVertical="center"
          {...inputProps}
        />
        {rightAccessory ? <View style={slate.accessory}>{rightAccessory}</View> : null}
      </Pressable>
      {error ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={slate.fieldErrorText}>
          {error}
        </Text>
      ) : hint ? (
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[slate.hintText, hintTone === 'success' && slate.hintSuccess]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

export const AuthTextInput = memo(AuthTextInputBase);

const gold = StyleSheet.create({
  inputGroup: {
    marginBottom: 14,
    width: '100%',
  },
  fieldLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#070d17',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(217, 119, 6, 0.45)',
    height: 52,
    paddingHorizontal: 14,
  },
  inputBoxFocused: {
    borderColor: '#f59e0b',
    backgroundColor: '#091220',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  inputBoxError: {
    borderColor: '#ef4444',
  },
  iconContainer: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    height: '100%',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: Platform.OS === 'android' ? 0 : 4,
    textAlignVertical: 'center',
  },
  fieldErrorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 4,
  },
  hintText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 4,
  },
  hintSuccess: {
    color: '#4ade80',
  },
});

const slate = StyleSheet.create({
  inputGroup: {
    marginBottom: 16,
    width: '100%',
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  inputFocused: {
    borderColor: '#38bdf8',
  },
  inputError: {
    borderColor: '#e11d48',
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#f8fafc',
    fontSize: 15,
    paddingVertical: Platform.OS === 'android' ? 0 : 4,
    textAlignVertical: 'center',
  },
  inputWithAccessory: {
    paddingRight: 40,
  },
  accessory: {
    position: 'absolute',
    right: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldErrorText: {
    color: '#ff4d6d',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 2,
  },
  hintText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 2,
  },
  hintSuccess: {
    color: '#4ade80',
  },
});
