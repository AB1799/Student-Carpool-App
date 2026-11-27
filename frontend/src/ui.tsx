import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const C = { green: '#00693E', dark: '#092E22', text: '#17342A', muted: '#53665E', paper: '#F4F7F3', white: '#FFFFFF', line: '#CAD7CF', mint: '#DCEFE3', error: '#A12620', amber: '#744B07' };
export type IconName = keyof typeof Ionicons.glyphMap;
export const Icon = ({name, size = 21, color = C.green}: {name: IconName; size?: number; color?: string}) => <Ionicons accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden name={name} size={size} color={color}/>;

export function Button({title, onPress, icon, variant = 'solid', disabled, busy}: {title: string; onPress: () => void; icon?: IconName; variant?: 'solid' | 'outline' | 'link'; disabled?: boolean; busy?: boolean}) {
  const color = variant === 'solid' ? C.white : C.green;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled: !!disabled || !!busy, busy}} disabled={disabled || busy} onPress={onPress} style={({pressed}) => [
    S.button, variant === 'solid' && S.solid, variant === 'outline' && S.outline, variant === 'link' && S.link,
    (pressed || disabled || busy) && {opacity: 0.62},
  ]}>
    {busy ? <ActivityIndicator color={color}/> : icon && <Icon name={icon} size={19} color={color}/>}
    <Text style={[S.buttonText, {color}, variant === 'link' && {textDecorationLine: 'underline'}]}>{title}</Text>
  </Pressable>;
}

export function Field({label, icon, password, error, ...props}: TextInputProps & {label: string; icon?: IconName; password?: boolean; error?: string}) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return <View style={{gap: 6}}>
    <Text style={S.label}>{label}</Text>
    <View style={[S.field, focused && {borderColor: C.green, borderWidth: 2}, !!error && {borderColor: C.error}]}>
      {icon && <Icon name={icon} size={19} color={C.muted}/>}
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={C.muted} onFocus={e => {setFocused(true); props.onFocus?.(e);}} onBlur={e => {setFocused(false); props.onBlur?.(e);}} secureTextEntry={password && !visible} style={[S.input, props.style]}/>
      {password && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} style={{minHeight: 44, justifyContent: 'center', paddingLeft: 8}}><Text style={S.action}>{visible ? 'Hide' : 'Show'}</Text></Pressable>}
    </View>
    {!!error && <Message error>{error}</Message>}
  </View>;
}
export const Card = ({children}: {children: ReactNode}) => <View style={S.card}>{children}</View>;
export const Message = ({children, error}: {children: ReactNode; error?: boolean}) => <View accessibilityLiveRegion={error ? 'assertive' : 'polite'} style={[S.message, error && {backgroundColor: '#FCEAE7'}]}><Icon name={error ? 'alert-circle-outline' : 'information-circle-outline'} color={error ? C.error : C.green} size={19}/><Text style={{flex: 1, color: error ? C.error : C.dark, lineHeight: 20}}>{children}</Text></View>;
export const Heading = ({title, subtitle}: {title: string; subtitle?: string}) => <View style={{gap: 5}}><Text accessibilityRole="header" style={S.heading}>{title}</Text>{subtitle && <Text style={S.body}>{subtitle}</Text>}</View>;
export function Pill({label, icon, pending = false}: {label: string; icon?: IconName; pending?: boolean}) {
  const color = pending ? C.amber : C.green;
  return <View style={[S.pill, pending && {backgroundColor: '#FFF1D7'}]}>{icon && <Icon name={icon} color={color} size={14}/>}<Text style={{color, fontSize: 12, fontWeight: '700'}}>{label}</Text></View>;
}
export const S = StyleSheet.create({
  heading: {fontSize: 34, fontWeight: '800', color: C.dark, letterSpacing: -1.05},
  title: {fontSize: 19, lineHeight: 25, fontWeight: '800', color: C.dark},
  body: {fontSize: 15, lineHeight: 22, color: C.muted},
  label: {fontSize: 14, fontWeight: '700', color: C.text},
  action: {color: C.green, fontWeight: '800'},
  button: {minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 10},
  solid: {backgroundColor: C.green},
  outline: {borderWidth: 1.5, borderColor: C.green, backgroundColor: C.white},
  link: {alignSelf: 'center'},
  buttonText: {fontWeight: '800', fontSize: 15, textAlign: 'center', flexShrink: 1},
  field: {minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 9},
  input: {flex: 1, minWidth: 0, color: C.text, fontSize: 16, paddingVertical: 12},
  card: {padding: 16, borderRadius: 17, backgroundColor: C.white, borderColor: C.line, borderWidth: 1, gap: 9},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  split: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8},
  pair: {flexDirection: 'row', alignItems: 'stretch', gap: 10},
  half: {flex: 1, minWidth: 0, gap: 6},
  message: {padding: 12, borderRadius: 12, backgroundColor: C.mint, flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  pill: {backgroundColor: C.mint, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 30, paddingHorizontal: 9, paddingVertical: 5},
});
