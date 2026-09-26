import React, { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

/**
 * Shared text field for the auth screens.
 *
 * - `gold`: the noir Login style (icon on the left, gold border, focus glow).
 * - `slate`: the plain card style used by Sign Up / Forgot Password / Profile Setup.
 *
 * Focus state lives inside this component and it is wrapped in React.memo, so focusing a field
 * or typing in it only re-renders this field, never the whole screen (and its heavy artwork).
 * Parents should pass stable callbacks (useCallback / useStableCallback) to keep the memo effective.
 */
export type AuthTextInputVariant = 'gold' | 'slate';

export interface AuthTextInputProps extends Omit<
  TextInputProps,
  'style' | 'onFocus' | 'onBlur' | 'placeholderTextColor'
> {
  label: string;
  /** Inline error text shown under the field (also turns the border red). */
  error?: string;
  /** Red border without inline text, e.g. when the error is shown in a banner. */
  invalid?: boolean;
  /** Helper text shown under the field when there is no error. */
  hint?: string;
  hintTone?: 'muted' | 'success';
  variant?: AuthTextInputVariant;
  /** Must be a stable function (module-level or memoized). */
  renderIcon?: (focused: boolean) => React.ReactNode;
  /** E.g. a show/hide password toggle. Memoize it in the parent. */
  rightAccessory?: React.ReactNode;
  ref?: React.Ref<TextInput>;
}

function AuthTextInputBase({
  label,
  error,
  invalid = false,
  hint,
  hintTone = 'muted',
  variant = 'slate',
  renderIcon,
  rightAccessory,
  ref,
  ...inputProps
}: AuthTextInputProps) {
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const hasError = !!error || invalid;

  if (variant === 'gold') {
    return (
      <View style={gold.inputGroup}>
        <Text style={gold.fieldLabel}>{label}</Text>
        <View
          style={[gold.inputBox, focused && gold.inputBoxFocused, hasError && gold.inputBoxError]}
        >
          {renderIcon ? <View style={gold.iconContainer}>{renderIcon(focused)}</View> : null}
          <TextInput
            ref={ref}
            style={gold.textInput}
            placeholderTextColor="#64748b"
            accessibilityLabel={label}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...inputProps}
          />
          {rightAccessory}
        </View>
        {error ? (
          <Text style={gold.fieldErrorText}>{error}</Text>
        ) : hint ? (
          <Text style={[gold.hintText, hintTone === 'success' && gold.hintSuccess]}>{hint}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={slate.inputGroup}>
      <Text style={slate.inputLabel}>{label}</Text>
      <View style={slate.inputWrap}>
        <TextInput
          ref={ref}
          style={[
            slate.input,
            focused && slate.inputFocused,
            hasError && slate.inputError,
            !!rightAccessory && slate.inputWithAccessory,
          ]}
          placeholderTextColor="#475569"
          accessibilityLabel={label}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...inputProps}
        />
        {rightAccessory ? <View style={slate.accessory}>{rightAccessory}</View> : null}
      </View>
      {error ? (
        <Text style={slate.fieldErrorText}>{error}</Text>
      ) : hint ? (
        <Text style={[slate.hintText, hintTone === 'success' && slate.hintSuccess]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export const AuthTextInput = memo(AuthTextInputBase);

const gold = StyleSheet.create({
  inputGroup: {
    marginBottom: 14,
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
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
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
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrap: {
    justifyContent: 'center',
  },
  input: {
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 15,
  },
  inputFocused: {
    borderColor: '#334155',
  },
  inputError: {
    borderColor: '#e11d48',
  },
  inputWithAccessory: {
    paddingRight: 64,
  },
  accessory: {
    position: 'absolute',
    right: 14,
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
