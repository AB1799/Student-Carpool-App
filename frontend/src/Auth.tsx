import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { api, ApiError, type User } from './api';
import { Button, C, Field, Heading, Icon, Message, S } from './ui';

const passwordBytes = (value: string) => Array.from(value).reduce((total, character) => {
  const point = character.codePointAt(0)!;
  return total + (point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4);
}, 0);

export type AuthPage = 'welcome' | 'login' | 'signup' | 'verify' | 'forgot' | 'reset';

export function Auth({page, go, signedIn, preview}: {page: AuthPage; go: (page: AuthPage, replace?: boolean) => void; signedIn: (user: User, token: string) => Promise<void>; preview: () => void}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [changed, setChanged] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [guidelines, setGuidelines] = useState(false);
  const cleanEmail = email.trim().toLowerCase();
  const validEmail = /^[^@\s]+@my\.unt\.edu$/.test(cleanEmail);
  const mixed = /[a-z]/i.test(password) && /\d/.test(password);
  const signup = page === 'signup';
  useEffect(() => {setError(''); setInfo(''); setSubmitted(false);}, [page]);
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [resendAt]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setInfo('');
    try {await action();}
    catch (failure) {setError(failure instanceof Error ? failure.message : 'Please try again.');}
    finally {setBusy(false);}
  }

  async function login() {
    const result = await api<{user: User; token: string}>('/auth/login', undefined, 'POST', {email: cleanEmail, password});
    if (result.user.emailVerified) await signedIn(result.user, result.token);
    else {setCode(''); go('verify');}
  }

  function submit() {
    setSubmitted(true);
    if (!validEmail) return;
    if (!password || (signup && (!mixed || password.length < 8 || passwordBytes(password) > 72 || name.trim().length < 2 || !agreed))) {
      setError(signup ? 'Enter your name, use 8 or more characters with letters and numbers (up to 72 bytes), and accept the guidelines.' : 'Enter your password.');
      return;
    }
    void run(async () => {
      if (!signup) {await login(); return;}
      try {await api('/auth/register', undefined, 'POST', {fullName: name.trim(), email: cleanEmail, password});}
      catch (failure) {
        if (!(failure instanceof ApiError) || failure.code !== 'EMAIL_UNAVAILABLE') throw failure;
        setResendAt(0); setCode(''); go('verify'); return;
      }
      setResendAt(Date.now() + 60000);
      setCode('');
      go('verify');
    });
  }

  const demoOnly = process.env.EXPO_PUBLIC_DEMO_ONLY === 'true';
  if (page === 'welcome') return <View style={{flex: 1, justifyContent: 'space-between', gap: 32}}>
    <View style={{alignItems: 'center', justifyContent: 'center', flex: 1, gap: 15, paddingVertical: 42}}>
      <View style={{width: 104, height: 104, borderRadius: 36, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center'}}><Icon name="car-sport-outline" color={C.white} size={53}/></View>
      <View style={{alignItems: 'center', gap: 3}}><Heading title="UNT Carpool"/><Text style={S.body}>Mean Green Ridesharing</Text></View>
    </View>
    <View style={{gap: 10}}>
      {!demoOnly && <Button title="Log in" onPress={() => go('login')}/>}
      {!demoOnly && <Button title="Create account" variant="outline" onPress={() => go('signup')}/>}
      <Text style={[S.body, {textAlign: 'center'}]}>{demoOnly ? 'Preview UNT Carpool using sample rides.' : 'For UNT students. You’ll need your UNT email.'}</Text>
      {(demoOnly || process.env.EXPO_PUBLIC_ENABLE_DEMO !== 'false') && <Button title="Explore the demo" variant={demoOnly ? 'solid' : 'link'} onPress={preview}/>}
    </View>
  </View>;

  if (page === 'forgot' || page === 'reset') {
    const resetting = page === 'reset';
    const validPassword = mixed && password.length >= 8 && passwordBytes(password) <= 72;
    return <View style={{gap: 15}}>
      <Text style={S.body}>{resetting ? 'If your verified account is eligible, look for a reset code in your UNT inbox. Paste it here within 20 minutes.' : 'Enter the UNT email you registered with to request a password reset code.'}</Text>
      <Field label="UNT email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="euid@my.unt.edu"/>
      {resetting && <>
        <Field label="Reset code" value={resetCode} onChangeText={setResetCode} autoCapitalize="none" autoCorrect={false} placeholder="Paste the code from your email"/>
        <Field label="New password" icon="lock-closed-outline" password value={password} onChangeText={setPassword} autoComplete="new-password" maxLength={128}/>
        <Text style={S.body}>Use at least 8 characters with letters and numbers, up to 72 bytes.</Text>
      </>}
      {!!error && <Message error>{error}</Message>}
      <Button title={resetting ? 'Set new password' : 'Send reset code'} busy={busy} disabled={!validEmail || (resetting && (!/^[0-9a-f]{64}$/i.test(resetCode.trim()) || !validPassword))} onPress={() => void run(async () => {
        if (resetting) {
          await api('/auth/reset-password', undefined, 'POST', {email: cleanEmail, code: resetCode.trim(), password});
          setPassword(''); setResetCode(''); setChanged(true); go('login', true);
        } else {
          await api('/auth/forgot-password', undefined, 'POST', {email: cleanEmail});
          setResetCode(''); setPassword(''); go('reset', true);
        }
      })}/>
      {resetting && <Button title="Request another code" variant="link" disabled={busy} onPress={() => go('forgot', true)}/>}
    </View>;
  }

  if (page === 'verify') return <View style={{gap: 15}}>
    <View style={{alignItems: 'center', paddingVertical: 14, gap: 9}}>
      <View style={{backgroundColor: C.mint, borderRadius: 36, width: 66, height: 66, alignItems: 'center', justifyContent: 'center'}}><Icon name="mail-outline" size={30}/></View>
      <Text style={S.title}>Check your email</Text>
      <Text style={[S.body, {textAlign: 'center'}]}>Enter the six-digit verification code for{'\n'}<Text style={S.label}>{cleanEmail}</Text></Text>
    </View>
    <View style={{position: 'relative'}}>
      <View pointerEvents="none" style={[S.pair, {gap: 6}]}>{Array.from({length: 6}, (_, i) => <View key={i} style={[S.field, {flex: 1, justifyContent: 'center', paddingHorizontal: 0}, i === code.length && {borderColor: C.green, borderWidth: 2}]}><Text style={S.title}>{code[i] || '·'}</Text></View>)}</View>
      <TextInput accessibilityLabel="Six-digit verification code" autoFocus value={code} onChangeText={text => setCode(text.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" style={{position: 'absolute', width: '100%', height: '100%', opacity: 0.03, color: 'transparent'}}/>
    </View>
    {!!error && <Message error>{error}</Message>}{!!info && <Message>{info}</Message>}
    <Button title="Verify email" disabled={code.length !== 6} busy={busy} onPress={() => void run(async () => {
      await api('/auth/verify-email', undefined, 'POST', {email: cleanEmail, code});
      if (password) await login(); else go('login');
    })}/>
    <Button title={seconds ? 'Resend code in 0:' + String(seconds).padStart(2, '0') : 'Resend code'} variant="link" disabled={!!seconds || busy} onPress={() => void run(async () => {
      await api('/auth/resend-verification', undefined, 'POST', {email: cleanEmail});
      setResendAt(Date.now() + 60000); setInfo('If your account needs verification, a new code will be sent.');
    })}/>
    <Button title="Wrong email? Change it" variant="link" disabled={busy} onPress={() => go('signup')}/>
  </View>;

  return <View style={{flex: 1, gap: 14}}>
    {signup && <Field label="Full name" icon="person-outline" value={name} onChangeText={setName} autoComplete="name" maxLength={120} placeholder="Jordan Lee"/>}
    <Field label="UNT email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={254} placeholder="euid@my.unt.edu" error={(submitted || email.includes('@') && signup) && !validEmail ? 'Use your UNT email ending in @my.unt.edu.' : undefined}/>
    {page === 'login' && changed && <Message>Password updated. Log in with your new password.</Message>}
    <Field label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} maxLength={128} password autoComplete={signup ? 'new-password' : 'current-password'} placeholder="Enter password"/>
    {signup ? <>
      {[[mixed, 'Letters and numbers'], [password.length >= 8, 'At least 8 characters']].map(([met, label]) => <View key={String(label)} style={S.row}><Icon name={met ? 'checkmark-circle' : 'ellipse-outline'} color={met ? C.green : C.muted} size={17}/><Text style={S.body}>{label}{met ? ' ✓' : ''}</Text></View>)}
      <Pressable accessibilityRole="checkbox" accessibilityState={{checked: agreed}} onPress={() => setAgreed(!agreed)} style={[S.row, {minHeight: 44}]}><Icon name={agreed ? 'checkbox' : 'square-outline'}/><Text style={S.body}>I agree to the community guidelines</Text></Pressable>
      <Button title="Read the guidelines" variant="link" onPress={() => setGuidelines(!guidelines)}/>
      {guidelines && <Message>Use your own UNT account, respect your carpool partners, and share only the information needed to coordinate your ride.</Message>}
    </> : <View style={{alignSelf: 'flex-end'}}><Button title="Forgot password?" variant="link" onPress={() => {setChanged(false); go('forgot');}}/></View>}
    {!!error && <Message error>{error}</Message>}{!!info && <Message>{info}</Message>}
    {signup && <View style={{flex: 1}}/>}
    <Button title={signup ? 'Create account' : 'Log in'} busy={busy} onPress={submit}/>
    {!signup && <Button title="New here? Create account" variant="link" disabled={busy} onPress={() => go('signup')}/>}
  </View>;
}
