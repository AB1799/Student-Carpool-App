import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, campus, query, session, type Notice, type Ride, type SeatRequest, type User, type Vehicle } from './src/api';
import { Chat } from './src/Chat';
import { Auth, type AuthPage } from './src/Auth';
import { demoUser, makeDemo } from './src/demo';
import { Moderation } from './src/Moderation';
import { Avatar, EditProfile, EditVehicle } from './src/Profile';
import { RideForm, RouteLine, rideDraft, when, type Call, type Trip } from './src/RideForm';
import { Button, Card, C, Field, Heading, Icon, Message, Pill, S, type IconName } from './src/ui';

type Page = AuthPage | 'role' | 'home' | 'rides' | 'profile' | 'editProfile' | 'vehicle' | 'offer' | 'find' | 'results' | 'posted' | 'details' | 'requested' | 'notifications' | 'favorites' | 'review' | 'inbox' | 'chat' | 'report' | 'moderation';
type Role = 'driver' | 'rider';
type Favorite = {id: string; name: string; rating?: number | string | null};
const prefsKey = (id: string) => 'unt-carpool-preferences:' + id;
const blank = {offers: [] as Ride[], requests: [] as Ride[], bookings: [] as Ride[]};
const tabs = [
  {page: 'home', label: 'Home', icon: 'home-outline'},
  {page: 'rides', label: 'My Rides', icon: 'car-outline'},
  {page: 'inbox', label: 'Chat', icon: 'chatbubble-outline'},
  {page: 'profile', label: 'Profile', icon: 'person-outline'},
] as const;
const past = (ride: Ride) => ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(ride.status);
const status = (ride: Ride): [string, IconName] => {
  if (ride.status === 'OPEN') return ride.driving ? ['You’re driving', 'car-outline'] : ['Open', 'people-outline'];
  if (ride.status === 'PENDING') return ['Pending', 'time-outline'];
  if (ride.status === 'CONFIRMED') return ['Confirmed', 'checkmark'];
  if (ride.status === 'COMPLETED') return ['Completed', 'flag-outline'];
  if (ride.status === 'REJECTED') return ['Declined', 'close-outline'];
  return ['Cancelled', 'close-outline'];
};
const explain = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function RideCard({ride, onPress}: {ride: Ride; onPress: () => void}) {
  const [label, icon] = status(ride);
  return <Card>
    <View style={S.split}><Text style={S.title}>{when(ride.departureTime)}</Text><Pill label={label} icon={icon} pending={ride.status === 'PENDING'}/></View>
    <RouteLine origin={ride.originLabel} destination={ride.destinationLabel}/>
    {!!ride.driverName && !ride.driving && <Text style={S.body}>Driver · {ride.driverName}</Text>}
    {ride.driving && <Text style={S.body}>{ride.seatsAvailable ?? 0} seats available</Text>}
    <Button title="View details" variant="outline" onPress={onPress} icon="arrow-forward-outline"/>
  </Card>;
}

function Carpool() {
  const [page, setPage] = useState<Page>('welcome');
  const trail = useRef<Page[]>([]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {scroll.current?.scrollTo({y: 0, animated: false});}, [page]);
  const [token, setToken] = useState<string>();
  const [user, setUser] = useState<User>();
  const [role, setRole] = useState<Role>();
  const [demo, setDemo] = useState<ReturnType<typeof makeDemo>>();
  const [restoring, setRestoring] = useState(true);
  const [bootError, setBootError] = useState('');
  const [networkError, setNetworkError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [inventory, setInventory] = useState(blank);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [offerDraft, setOfferDraft] = useState<Partial<Trip>>();
  const [searchDraft, setSearchDraft] = useState<Trip>();
  const [postedCount, setPostedCount] = useState(1);
  const [matches, setMatches] = useState<Ride[]>([]);
  const [filter, setFilter] = useState<'best' | 'soonest'>('best');
  const [selected, setSelected] = useState<Ride>();
  const [requests, setRequests] = useState<SeatRequest[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editId, setEditId] = useState<string>();
  const [history, setHistory] = useState(false);
  const [conversation, setConversation] = useState<{id: string; name: string}>();
  const [reason, setReason] = useState('');
  const [reportTarget, setReportTarget] = useState<{id: string; name: string}>();
  const [reportSent, setReportSent] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [profileRating, setProfileRating] = useState<number | null>(null);
  const searchVersion = useRef(0);
  const actionLock = useRef(false);
  const generation = useRef(0);

  function go(next: Page, replace = false) {
    if (next === page) return;
    if (!replace) trail.current.push(page);
    setError(''); setConfirmCancel(false); setPage(next);
  }
  function back() {
    if (actionLock.current) return;
    searchVersion.current++;
    if (page === 'results') setSearching(false);
    setError(''); setConfirmCancel(false);
    setPage(trail.current.pop() ?? (user ? 'home' : 'welcome'));
  }
  function tab(next: Page) {
    if (actionLock.current) return;
    searchVersion.current++;
    if (page === 'results') setSearching(false);
    trail.current = [];
    setError(''); setConfirmCancel(false); setPage(next);
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!trail.current.length) return false;
      back();
      return true;
    });
    return () => subscription.remove();
  });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (process.env.EXPO_PUBLIC_DEMO_ONLY === 'true') return;
        const saved = await session.read();
        if (!saved) return;
        const result = await api<{user: User}>('/users/me', saved);
        if (active && result.user.emailVerified) {setToken(saved); setUser(result.user); setPage('role');}
      } catch (failure) {
        if (failure instanceof ApiError && [401, 403].includes(failure.status)) await session.clear().catch(() => {});
        else if (active) setBootError(explain(failure));
      } finally {if (active) setRestoring(false);}
    })();
    return () => {active = false;};
  }, []);

  const activeToken = useRef(token);
  activeToken.current = token;
  const call: Call = useCallback(async (path, method, body) => {
    if (demo) return demo(path, method, body);
    try {return await api(path, token, method, body);}
    catch (failure) {
      if (token && activeToken.current === token && failure instanceof ApiError &&
        ['INVALID_TOKEN', 'ACCOUNT_UNAVAILABLE'].includes(failure.code)) {
        activeToken.current = undefined;
        await session.clear().catch(() => {});
        resetLocalSession();
        setBootError(failure.code === 'INVALID_TOKEN' ? 'Your session ended. Log in to continue.' : 'Your account is unavailable.');
      }
      throw failure;
    }
  }, [demo, token]);

  useEffect(() => {
    if (!user?.id || demo) return;
    let active = true;
    setPreferencesReady(false);
    setPreferenceError('');
    void AsyncStorage.getItem(prefsKey(user.id)).then(raw => {
      if (!active || !raw) return;
      const saved = JSON.parse(raw) as {role?: Role; favorites?: Favorite[]};
      if (saved.role === 'driver' || saved.role === 'rider') setRole(saved.role);
      if (Array.isArray(saved.favorites)) setFavorites(saved.favorites);
    }).catch(() => {if (active) setPreferenceError('Could not load saved preferences on this device.');})
      .finally(() => {if (active) setPreferencesReady(true);});
    return () => {active = false;};
  }, [demo, user?.id]);

  useEffect(() => {
    if (!user?.id || demo || !preferencesReady) return;
    void AsyncStorage.setItem(prefsKey(user.id), JSON.stringify({role, favorites}))
      .catch(() => setPreferenceError('Could not save preferences on this device.'));
  }, [demo, user?.id, preferencesReady, role, favorites]);

  const refresh = useCallback(async () => {
    const version = generation.current;
    setLoading(true); setNetworkError('');
    try {
      const [mine, outgoing, booked] = await Promise.all([
        call<{rides: Ride[]}>('/rides/mine'),
        call<{requests: Ride[]}>('/requests/mine'),
        call<{bookings: Ride[]}>('/bookings'),
      ]);
      if (version === generation.current) setInventory({offers: mine.rides, requests: outgoing.requests, bookings: booked.bookings});
    } catch (failure) {
      if (version === generation.current) setNetworkError(explain(failure));
    } finally {if (version === generation.current) setLoading(false);}
  }, [call]);

  const refreshNotices = useCallback(async () => {
    const version = generation.current;
    try {
      const result = await call<{notifications: Notice[]}>('/users/me/notifications');
      if (version === generation.current) setNotices([...result.notifications]);
    } catch (failure) {
      if (version === generation.current && page === 'notifications') setError(explain(failure));
    }
  }, [call, page]);

  useEffect(() => {
    if (!user?.id) return;
    const version = generation.current;
    setVehicleLoading(true);
    void refresh();
    void call<{vehicle: Vehicle | null}>('/vehicles/me')
      .then(result => {if (version === generation.current) setVehicle(result.vehicle);})
      .catch(failure => {if (version === generation.current) setNetworkError(explain(failure));})
      .finally(() => {if (version === generation.current) setVehicleLoading(false);});
  }, [user?.id, call, refresh]);
  useEffect(() => {if (user && ['home', 'notifications'].includes(page)) void refreshNotices();}, [user, page, refreshNotices]);
  useEffect(() => {
    if (page !== 'profile' || !user) return;
    let active = true;
    void call<{averageRating: number | null}>('/ratings/' + user.id).then(result => {
      if (active) setProfileRating(result.averageRating);
    }).catch(() => {});
    return () => {active = false;};
  }, [call, page, user]);

  async function run(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setError(''); setBusy(true);
    try {await action();}
    catch (failure) {
      setError(failure instanceof ApiError && failure.code === 'INVALID_TOKEN' ? 'Your session expired. Log out from Profile and sign in again.' : explain(failure));
    } finally {actionLock.current = false; setBusy(false);}
  }

  async function enter(account: User, credential: string) {
    await session.save(credential);
    generation.current++;
    setUser(account); setToken(credential); setBootError(''); trail.current = []; setPage('role');
  }
  function preview() {
    generation.current++;
    setDemo(() => makeDemo()); setUser(demoUser); setBootError(''); setPage('role'); trail.current = [];
  }
  async function logout() {
    if (!demo) await session.clear();
    resetLocalSession();
  }
  function resetLocalSession() {
    generation.current++;
    setUser(undefined); setToken(undefined); setRole(undefined); setDemo(undefined);
    setConversation(undefined); setReportTarget(undefined); setReason(''); setReportSent(false);
    setVehicle(null); setInventory(blank); setNotices([]); setFavorites([]); setReviewed([]);
    setOfferDraft(undefined); setSearchDraft(undefined); setMatches([]); setSelected(undefined); setRequests([]);
    setLoading(false); setNetworkError(''); setEditId(undefined); setHistory(false); setProfileRating(null);
    setPreferencesReady(false); setPreferenceError('');
    setSearching(false); setPage('welcome'); setError('');
    trail.current = [];
  }

  const rideList: Ride[] = [
    ...inventory.offers.map(ride => ({...ride, driving: true})),
    ...inventory.bookings.filter(ride => ride.driverId !== user?.id).map(ride => ({...ride, bookingId: ride.id})),
    ...inventory.requests.filter(ride => ride.status !== 'ACCEPTED' && !inventory.bookings.some(booking => booking.requestId === ride.id)),
  ];
  const shown = rideList.filter(ride => past(ride) === history).sort((a, b) => (history ? -1 : 1) * (Date.parse(a.departureTime) - Date.parse(b.departureTime)));
  const nextRide = rideList.filter(ride => !past(ride) && Date.parse(ride.departureTime) > Date.now()).sort((a, b) => Date.parse(a.departureTime) - Date.parse(b.departureTime))[0];
  const unread = notices.filter(notice => !notice.readAt);
  const ids = new Set(favorites.map(favorite => favorite.id));

  function offer() {
    const recent = [...inventory.offers].sort((a, b) => Date.parse(b.departureTime) - Date.parse(a.departureTime))[0];
    setOfferDraft(demo ? {origin: campus[0], destination: campus[1]} : {...rideDraft(recent), departureTime: undefined});
    setEditId(undefined); go('offer');
  }
  function find() {
    if (!searchDraft && demo) {
      const start = new Date(); start.setDate(start.getDate() + 2); start.setHours(7, 45, 0, 0);
      const end = new Date(+start + 45 * 60000);
      setSearchDraft({origin: campus[0], destination: campus[1], departureTime: start.toISOString(), earliest: start.toISOString(), latest: end.toISOString(), seats: 1});
    }
    go('find');
  }
  async function search(trip: Trip, wider = false) {
    const version = ++searchVersion.current;
    setError(''); setMatches([]); setSearchDraft(trip); setFilter('best'); setSearching(true);
    if (!wider) go('results');
    try {
      const result = await call<{rides: Ride[]}>('/rides/search?' + query({
        pickupLat: trip.origin.lat, pickupLng: trip.origin.lng, destinationLat: trip.destination.lat,
        destinationLng: trip.destination.lng, departureTime: trip.departureTime, seats: trip.seats,
        timeWindowMinutes: wider ? Math.min(180, (trip.timeWindowMinutes ?? 60) + 30) : trip.timeWindowMinutes ?? 60,
      }));
      if (version !== searchVersion.current) return;
      let found = result.rides;
      if (!wider && trip.earliest && trip.latest) {
        const earliest = Date.parse(trip.earliest);
        const latest = Date.parse(trip.latest);
        found = found.filter(ride => Date.parse(ride.departureTime) >= earliest && Date.parse(ride.departureTime) <= latest);
      }
      setMatches(found);
    } catch (failure) {if (version === searchVersion.current) setError(explain(failure));}
    finally {if (version === searchVersion.current) setSearching(false);}
  }

  function details(ride: Ride) {
    setSelected(ride); setRequests([]); go('details');
  }
  useEffect(() => {
    if (page !== 'details' || !selected) return;
    let active = true;
    const id = selected.rideId ?? selected.id;
    const identity = selected.id;
    void call<{ride: Ride}>('/rides/' + id).then(result => {
      if (!active) return;
      setSelected(current => current?.id === identity ? {...result.ride, ...current, licensePlate: result.ride.licensePlate} : current);
    }).catch(failure => {if (active) setError(explain(failure));});
    if (selected.driving) void call<{requests: SeatRequest[]}>('/rides/' + id + '/requests')
      .then(result => {if (active) setRequests(result.requests);})
      .catch(failure => {if (active) setError(explain(failure));});
    return () => {active = false;};
  }, [call, page, selected?.id, selected?.rideId, selected?.driving]);

  const retry = networkError ? <><Message error>{networkError}</Message><Button title="Refresh rides" variant="link" onPress={() => void refresh()}/></> : null;
  const errorView = error ? <Message error>{error}</Message> : null;
  const screenTitle: Partial<Record<Page, string>> = {login: 'Log in', signup: 'Create account', verify: 'Verify email', forgot: 'Forgot password', reset: 'Reset password',
    editProfile: 'Edit profile', vehicle: 'My vehicle', notifications: 'Notifications', details: 'Ride details', favorites: 'Favorite drivers', review: 'Rate your ride', chat: conversation?.name ?? 'Ride chat', report: 'Report a problem', moderation: 'Moderation'};
  const backOnly = ['offer', 'find', 'results'].includes(page);
  const tabPage = ['offer', 'find', 'results', 'posted', 'requested', 'details', 'rides'].includes(page) ? 'rides'
    : ['profile', 'editProfile', 'vehicle', 'favorites', 'moderation'].includes(page) ? 'profile' : ['chat', 'inbox'].includes(page) ? 'inbox' : 'home';
  const conversations = inventory.bookings.filter(item => ['CONFIRMED', 'COMPLETED'].includes(item.status));
  function partner(booking: Ride) {
    return booking.driverId === user?.id
      ? {id: booking.riderId, name: booking.riderName ?? 'Rider'}
      : {id: booking.driverId, name: booking.driverName ?? 'Driver'};
  }
  function openChat(booking: Ride) {
    setConversation({id: booking.id, name: partner(booking).name});
    go('chat');
  }
  function openReport(id: string, name: string) {
    setReportTarget({id, name}); setReason(''); setReportSent(false); go('report');
  }
  let content: ReactNode;

  switch (page) {
    case 'welcome': case 'login': case 'signup': case 'verify': case 'forgot': case 'reset':
      content = <>{bootError && page === 'welcome' ? <Message error>{bootError}</Message> : null}<Auth page={page} go={go} signedIn={enter} preview={preview}/></>;
      break;
    case 'role':
      content = <>
        <Heading title="Welcome!" subtitle="How would you like to travel today?"/>
        <Pressable accessibilityRole="button" onPress={() => {setRole('driver'); tab('home');}} style={[styles.choice, {backgroundColor: C.green, borderColor: C.green}]}>
          <View style={[styles.circle, {backgroundColor: C.white}]}><Icon name="car-outline"/></View><View style={{flex: 1}}><Text style={[S.title, {color: C.white}]}>I’m driving</Text><Text style={{color: C.white}}>Offer seats on your commute</Text></View><Icon name="chevron-forward" color={C.white}/>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => {setRole('rider'); tab('home');}} style={[styles.choice, {backgroundColor: C.white, borderColor: C.green}]}>
          <View style={styles.circle}><Icon name="person-outline"/></View><View style={{flex: 1}}><Text style={S.title}>I need a ride</Text><Text style={S.body}>Find a driver heading to campus</Text></View><Icon name="chevron-forward"/>
        </Pressable>
        <View style={{flex: 1}}/><Text style={[S.body, {textAlign: 'center'}]}>You can switch roles any time in Profile.</Text>
      </>;
      break;
    case 'home':
      content = <>
        <View style={S.split}><View style={{flex: 1}}><Text style={S.body}>{user?.fullName ? 'Hi, ' + user.fullName.split(' ')[0] : 'UNT Carpool'}</Text><Heading title="Where to today?"/></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread.length} unread`} onPress={() => go('notifications')} style={styles.circle}><Icon name="notifications-outline"/>{unread.length > 0 && <Text style={styles.badge}>{unread.length}</Text>}</Pressable>
        </View>
        <Text style={S.title}>Next ride</Text>
        {nextRide ? <RideCard ride={nextRide} onPress={() => details(nextRide)}/> : <Card><Text style={S.body}>{loading ? 'Loading rides…' : 'Your next ride will appear here.'}</Text></Card>}
        {retry}
        <View style={S.pair}><View style={S.half}><Button title="Offer a ride" icon="add" variant={role === 'driver' ? 'solid' : 'outline'} onPress={offer}/></View><View style={S.half}><Button title="Find a ride" icon="search-outline" variant={role === 'driver' ? 'outline' : 'solid'} onPress={find}/></View></View>
        <View style={S.split}><Text style={S.title}>Favorite drivers</Text><Button title="See all" variant="link" onPress={() => go('favorites')}/></View>
        {favorites.length ? <View style={[S.row, {flexWrap: 'wrap', gap: 16}]}>{favorites.map(favorite => <View key={favorite.id} style={{alignItems: 'center', gap: 5}}><Avatar name={favorite.name}/><Text style={S.label}>{favorite.name.split(' ')[0]}</Text></View>)}</View> : <Text style={S.body}>Save a driver from ride details to find them here.</Text>}
      </>;
      break;
    case 'rides':
      content = <>
        <View style={S.split}><Heading title="My rides"/><Button title="Refresh" variant="link" disabled={loading} onPress={() => void refresh()}/></View>
        <View style={S.pair}>{[false, true].map(value => <Pressable key={String(value)} accessibilityRole="tab" accessibilityState={{selected: history === value}} onPress={() => setHistory(value)} style={[S.half, styles.segment, history === value && styles.activeSegment]}><Text style={history === value ? S.action : S.label}>{value ? 'Past' : 'Upcoming'}</Text></Pressable>)}</View>
        {retry}
        {shown.map(ride => <RideCard key={ride.id} ride={ride} onPress={() => details(ride)}/>)}
        {!shown.length && <Card><Text style={S.body}>{loading ? 'Loading your rides…' : history ? 'Completed, cancelled, and declined rides will appear here.' : 'You don’t have any upcoming rides or pending requests.'}</Text></Card>}
        <View style={{flex: 1}}/><Button title="Offer or find a ride" icon="add" onPress={() => tab('home')}/>
      </>;
      break;
    case 'offer': case 'find':
      content = <RideForm key={page + (editId ?? '')} mode={page} allowRepeats={!editId && !demo} initial={page === 'offer' ? offerDraft : searchDraft} call={call} vehicle={vehicle} error={error} busy={busy || (page === 'offer' && vehicleLoading)}
        changeVehicle={draft => {setOfferDraft(draft); go('vehicle');}}
        submit={trip => {
          if (page === 'find') {void search(trip); return;}
          void run(async () => {
            const path = editId ? '/rides/' + editId : '/rides';
            const result = await call<{ride: Ride; rides?: Ride[]}>(path, editId ? 'PUT' : 'POST', trip);
            setPostedCount(result.rides?.length ?? 1);
            setSelected({...result.ride, driving: true, departureTime: trip.departureTime, originLabel: trip.origin.label, destinationLabel: trip.destination.label, seatsAvailable: trip.seats});
            setEditId(undefined);
            void refresh(); go('posted', true);
          });
        }}/>;
      break;
    case 'results': {
      const sorted = [...matches].sort((a, b) => Number(ids.has(b.driverId ?? '')) - Number(ids.has(a.driverId ?? '')) ||
        (filter === 'soonest' ? Date.parse(a.departureTime) - Date.parse(b.departureTime) : (b.matchScore ?? 0) - (a.matchScore ?? 0)));
      content = searching ? <>
        <Heading title="Finding matches" subtitle={'Looking for drivers heading to ' + searchDraft?.destination.label + '.'}/>
        <ActivityIndicator color={C.green} size="large"/><Button title="Cancel search" variant="outline" onPress={back}/>
      </> : <>
        <Heading title={error ? 'Couldn’t find matches' : sorted.length ? 'Matches for you' : 'No matches yet'} subtitle={sorted.length ? (favorites.length ? 'Favorite drivers first' : filter === 'best' ? 'Sorted by best match' : 'Sorted by departure time') : 'Try a wider time window or edit your trip.'}/>
        {errorView}
        {sorted.length > 0 && <View style={S.split}><Button title={filter === 'best' ? 'Sort by departure' : 'Sort by best match'} icon="options-outline" variant="link" onPress={() => setFilter(filter === 'best' ? 'soonest' : 'best')}/><Button title="Edit search" variant="link" onPress={back}/></View>}
        {sorted.map(ride => <Card key={ride.id}>
          <View style={S.split}><View style={S.row}><Avatar name={ride.driverName ?? 'Driver'}/><View><Text style={S.title}>{ride.driverName}</Text>{ride.driverRating != null && <Text style={S.body}>★ {ride.driverRating}</Text>}</View></View><Pill label={`${ride.seatsAvailable} seats open`} icon="people-outline"/></View>
          <RouteLine origin={ride.originLabel} destination={ride.destinationLabel}/><Text style={S.label}>{when(ride.departureTime)}</Text>
          <Button title="View ride" variant="outline" onPress={() => details(ride)}/>
        </Card>)}
        {!sorted.length && <><Button title="Widen time window" onPress={() => searchDraft && void search(searchDraft, true)}/><Button title="Edit request" variant="outline" onPress={back}/></>}
      </>;
      break;
    }
    case 'details': {
      if (!selected) break;
      const ride = selected;
      const [label, icon] = status(ride);
      const id = ride.rideId ?? ride.id;
      const canRequest = !ride.driving && ride.status === 'OPEN' && !ride.bookingId && Date.parse(ride.departureTime) > Date.now();
      const favoriteId = ride.driverId;
      const isFavorite = !!favoriteId && ids.has(favoriteId);
      const bookings = inventory.bookings.filter(item => item.rideId === id && item.status === 'COMPLETED');
      content = <>
        <Card>
          <View style={S.split}><Text style={S.title}>{when(ride.departureTime)}</Text><Pill label={label} icon={icon} pending={ride.status === 'PENDING'}/></View>
          <RouteLine origin={ride.originLabel} destination={ride.destinationLabel}/>
          <Text style={S.body}>{ride.passengers ? ride.passengers + ' requested seats' : (ride.seatsAvailable ?? 0) + ' seats available'}</Text>
        </Card>
        {!ride.driving && ride.driverName && <Card><View style={S.row}><Avatar name={ride.driverName}/><View style={{flex: 1}}><Text style={S.title}>{ride.driverName}</Text><Text style={S.body}>{ride.driverRating == null ? 'Driver' : '★ ' + ride.driverRating + ' · Driver'}</Text></View></View>
          {ride.vehicleMake && <Text style={S.body}>{[ride.vehicleColor, ride.vehicleMake, ride.vehicleModel, ride.licensePlate].filter(Boolean).join(' · ')}</Text>}
        </Card>}
        {errorView}
        {!demo && conversations.filter(booking => ride.status !== 'CANCELLED' && (ride.driving ? booking.rideId === id : booking.id === ride.bookingId)).map(booking =>
          <Button key={booking.id} title={'Message ' + partner(booking).name} icon="chatbubble-outline" variant="outline" onPress={() => openChat(booking)}/>)}
        {!demo && !ride.driving && ride.driverId && <Button title="Report a problem" variant="link" onPress={() => openReport(ride.driverId!, ride.driverName ?? 'the driver')}/>}
        {canRequest && <Button title="Request a seat" icon="people-outline" busy={busy} disabled={(ride.seatsAvailable ?? 0) < (searchDraft?.seats ?? 1)} onPress={() => void run(async () => {
          await call('/rides/' + id + '/requests', 'POST', {passengers: searchDraft?.seats ?? 1, ...(searchDraft && {pickup: searchDraft.origin})});
          setSelected({...ride, status: 'PENDING'}); void refresh(); go('requested', true);
        })}/>}
        {!ride.driving && favoriteId && <Button title={isFavorite ? 'Remove from favorites' : 'Add to favorite drivers'} icon={isFavorite ? 'heart' : 'heart-outline'} variant="outline" onPress={() => setFavorites(current => isFavorite ? current.filter(item => item.id !== favoriteId) : [...current, {id: favoriteId, name: ride.driverName ?? 'Driver', rating: ride.driverRating}])}/>}
        {!demo && !ride.driving && ['PENDING', 'CONFIRMED'].includes(ride.status) && Date.parse(ride.departureTime) > Date.now() && (
          confirmCancel ? <Card><Text style={S.title}>Cancel your seat?</Text><Text style={S.body}>The driver will be notified.</Text>
            <Button title="Keep my seat" disabled={busy} onPress={() => setConfirmCancel(false)}/>
            <Button title="Cancel my seat" variant="outline" busy={busy} onPress={() => void run(async () => {
              const requestId = ride.requestId ?? ride.id;
              await call('/requests/' + requestId + '/cancel', 'PUT');
              setSelected({...ride, status: 'CANCELLED'}); setConfirmCancel(false); void refresh();
            })}/>
          </Card> : <Button title="Cancel my seat" variant="link" onPress={() => setConfirmCancel(true)}/>
        )}
        {ride.driving && ride.status === 'OPEN' && <>
          <Text style={S.title}>Seat requests</Text>
          {!requests.length && <Text style={S.body}>No seat requests yet.</Text>}
          {requests.map(request => <Card key={request.id}>
            <View style={S.split}><Text style={S.title}>{request.riderName}</Text><Pill label={request.status === 'PENDING' ? 'Pending' : request.status.toLowerCase()} pending={request.status === 'PENDING'}/></View>
            <Text style={S.body}>{request.passengers} seat(s){request.pickupLabel ? ' · ' + request.pickupLabel : ''}</Text>
            {request.status === 'PENDING' && <View style={S.pair}>{(['accept', 'reject'] as const).map(action => <View key={action} style={S.half}><Button title={action === 'accept' ? 'Accept' : 'Decline'} variant={action === 'accept' ? 'solid' : 'outline'} disabled={busy} onPress={() => void run(async () => {
              await call('/requests/' + request.id + '/' + action, 'PUT');
              setRequests(current => current.map(item => item.id === request.id ? {...item, status: action === 'accept' ? 'ACCEPTED' : 'REJECTED'} : item));
              if (action === 'accept') setSelected(current => current ? {...current, seatsAvailable: Math.max(0, (current.seatsAvailable ?? 0) - request.passengers)} : current);
              void refresh();
            })}/></View>)}</View>}
          </Card>)}
          {Date.parse(ride.departureTime) > Date.now() && !requests.some(item => item.status === 'ACCEPTED') &&
            <Button title="Edit ride" variant="outline" disabled={busy} onPress={() => {setOfferDraft(rideDraft(ride)); setEditId(id); go('offer');}}/>}
          {Date.parse(ride.departureTime) <= Date.now() && <Button title="Mark ride complete" disabled={busy} onPress={() => void run(async () => {
            await call('/rides/' + id + '/complete', 'POST'); setSelected({...ride, status: 'COMPLETED'}); void refresh();
          })}/>}
          {confirmCancel ? <Card><Text style={S.title}>Cancel this ride?</Text><Text style={S.body}>Riders with requests or bookings will be notified.</Text>
            <Button title="Keep ride" disabled={busy} onPress={() => setConfirmCancel(false)}/>
            <Button title="Cancel ride" variant="outline" busy={busy} onPress={() => void run(async () => {
              await call('/rides/' + id + '/cancel', 'POST'); setSelected({...ride, status: 'CANCELLED'}); setConfirmCancel(false); void refresh();
            })}/>
          </Card> : <Button title="Cancel ride" variant="link" disabled={busy} onPress={() => setConfirmCancel(true)}/>}
        </>}
        {ride.status === 'COMPLETED' && (ride.driving ? bookings.map(booking => ({id: booking.id, name: (booking as Ride & {riderName?: string}).riderName ?? 'rider'})) : ride.bookingId ? [{id: ride.bookingId, name: ride.driverName ?? 'driver'}] : []).map(booking =>
          <Button key={booking.id} title={reviewed.includes(booking.id) ? 'Rating submitted' : 'Rate ' + booking.name} variant="outline" disabled={reviewed.includes(booking.id)} onPress={() => {
            setSelected({...ride, bookingId: booking.id}); setRating(0); setComment(''); go('review');
          }}/>)}
      </>;
      break;
    }
    case 'posted': case 'requested':
      content = selected && <>
        <View style={{alignItems: 'center', gap: 11, paddingVertical: 18}}>
          <View style={[styles.circle, {backgroundColor: C.green, width: 76, height: 76}]}><Icon name={page === 'posted' ? 'checkmark' : 'time-outline'} size={40} color={C.white}/></View>
          <Heading title={page === 'posted' ? (postedCount > 1 ? 'Rides posted' : 'Ride posted') : 'Request sent'}/>
          <Text style={[S.body, {textAlign: 'center'}]}>{page === 'posted' ? (postedCount > 1 ? `${postedCount} ride dates are now available in My Rides.` : 'Riders heading your way can now request a seat.') : 'Your request is pending until the driver accepts it.'}</Text>
        </View>
        <Card><Text style={S.title}>{when(selected.departureTime)}</Text><RouteLine origin={selected.originLabel} destination={selected.destinationLabel}/></Card>
        <View style={{flex: 1}}/><Button title="View my rides" onPress={() => {setHistory(false); tab('rides');}}/>
        <Button title={page === 'posted' ? 'Post another ride' : 'Back to home'} variant="outline" onPress={page === 'posted' ? offer : () => tab('home')}/>
      </>;
      break;
    case 'profile':
      content = user && <>
        <Heading title="Profile"/>
        {!!preferenceError && <Message error>{preferenceError}</Message>}
        <Card>
          <View style={S.row}>{user.photoUrl ? <Image accessibilityLabel="Profile photo" source={{uri: user.photoUrl}} style={styles.photo}/> : <Avatar name={user.fullName} large/>}<View style={{flex: 1, gap: 3}}><Text style={S.title}>{user.fullName}</Text><Text style={S.body}>{user.email}</Text><Pill label="UNT email verified" icon="shield-checkmark-outline"/></View></View>
          <View style={[S.pair, {marginTop: 7}]}><View style={S.half}><Text style={S.title}>{profileRating ?? (demo ? '4.8' : '—')}</Text><Text style={S.body}>Rating</Text></View><View style={S.half}><Text style={S.title}>{rideList.filter(ride => ride.status === 'COMPLETED').length}</Text><Text style={S.body}>Completed rides</Text></View></View>
        </Card>
        <Card><Text style={S.title}>Current role</Text><View style={S.pair}>{(['rider', 'driver'] as Role[]).map(item => <View style={S.half} key={item}><Button title={item === 'rider' ? 'Rider' : 'Driver'} icon={role === item ? 'checkmark' : undefined} variant={role === item ? 'solid' : 'outline'} onPress={() => setRole(item)}/></View>)}</View></Card>
        <Button title="Edit profile" icon="create-outline" variant="outline" onPress={() => go('editProfile')}/>
        <Button title="My vehicle" icon="car-outline" variant="outline" disabled={vehicleLoading} onPress={() => go('vehicle')}/>
        {user.role === 'ADMIN' && <Button title="Moderation" icon="shield-checkmark-outline" variant="outline" onPress={() => go('moderation')}/>}
        <Button title="Favorite drivers" icon="heart-outline" variant="outline" onPress={() => go('favorites')}/>
        {errorView}
        <Button title={demo ? 'Exit demo' : 'Log out'} variant="link" icon="log-out-outline" busy={busy} onPress={() => void run(logout)}/>
      </>;
      break;
    case 'editProfile':
      content = user && <EditProfile user={user} busy={busy} error={error} save={body => void run(async () => {
        const result = await call<{user: User}>('/users/me', 'PUT', body); setUser(result.user); go('profile', true); trail.current.pop();
      })}/>;
      break;
    case 'vehicle':
      content = <EditVehicle vehicle={vehicle} busy={busy || vehicleLoading} error={error} save={body => void run(async () => {
        const result = await call<{vehicle: Vehicle}>('/vehicles/me', 'PUT', body); setVehicle(result.vehicle);
        setPage(trail.current.pop() ?? 'profile');
      })}/>;
      break;
    case 'notifications':
      content = <>
        {errorView}
        <Button title="Mark all as read" variant="link" disabled={!unread.length} busy={busy} onPress={() => void run(async () => {
          try {for (const item of unread) await call('/users/me/notifications/' + item.id + '/read', 'PATCH');}
          finally {await refreshNotices();}
        })}/>
        {notices.map(item => <Card key={item.id}><View style={S.split}><Text style={[S.title, {flexShrink: 1}]}>{item.title}</Text>{!item.readAt && <Pill label="New" icon="notifications-outline"/>}</View><Text style={S.body}>{item.body}</Text><Text style={S.body}>{when(item.createdAt)}</Text>
          {!item.readAt && <Button title="Mark as read" variant="link" disabled={busy} onPress={() => void run(async () => {await call('/users/me/notifications/' + item.id + '/read', 'PATCH'); await refreshNotices();})}/>}
        </Card>)}
        {!notices.length && <Card><Text style={S.body}>You’re all caught up.</Text></Card>}
      </>;
      break;
    case 'favorites':
      content = <>
        {!!preferenceError && <Message error>{preferenceError}</Message>}
        <Text style={S.body}>Favorite drivers appear first in matches and are saved on this device.</Text>
        {favorites.map(favorite => <Card key={favorite.id}><View style={S.split}><View style={[S.row, {flex: 1}]}><Avatar name={favorite.name}/><View style={{flex: 1}}><Text style={S.title}>{favorite.name}</Text>{favorite.rating != null && <Text style={S.body}>★ {favorite.rating}</Text>}</View></View><Button title="Remove" variant="link" onPress={() => setFavorites(items => items.filter(item => item.id !== favorite.id))}/></View></Card>)}
        {!favorites.length && <Card><Text style={S.body}>You haven’t saved any drivers yet.</Text></Card>}
        <Button title="Find a ride" onPress={find}/>
      </>;
      break;
    case 'inbox':
      content = <>
        <Heading title="Chat" subtitle="Coordinate pickup with your ride partners."/>
        {demo ? <Message>Sign in with a verified UNT account to use live chat.</Message> : <>
          {retry}
          {!conversations.length && <Card><Text style={S.body}>Chats appear after a driver accepts a seat request.</Text></Card>}
          {conversations.map(booking => <Card key={booking.id}>
            <Text style={S.title}>{partner(booking).name}</Text>
            <Text style={S.body}>{booking.destinationLabel} · {when(booking.departureTime)}</Text>
            <Button title="Open chat" variant="outline" onPress={() => openChat(booking)}/>
          </Card>)}
        </>}
      </>;
      break;
    case 'chat':
      content = conversation && user && token && <>
        <Chat key={conversation.id} bookingId={conversation.id} userId={user.id} token={token} call={call}/>
        {(() => {
          const booking = conversations.find(item => item.id === conversation.id);
          const contact = booking && partner(booking);
          return contact?.id && <Button title="Report a problem" variant="link" onPress={() => openReport(contact.id!, contact.name)}/>;
        })()}
      </>;
      break;
    case 'moderation':
      content = user?.role === 'ADMIN' && <Moderation call={call}/>;
      break;
    case 'report':
      content = reportTarget && <View style={{gap: 14}}>
        {reportSent ? <Message>Report submitted for review.</Message> : <>
          <Text style={S.body}>Report a safety concern involving {reportTarget.name}.</Text>
          <Field label="What happened?" value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Describe the issue in at least 10 characters"/>
          {errorView}
          <Button title="Submit report" busy={busy} disabled={reason.trim().length < 10} onPress={() => void run(async () => {
            await call('/reports', 'POST', {reportedUserId: reportTarget.id, reason: reason.trim()}); setReportSent(true);
          })}/>
        </>}
      </View>;
      break;
    case 'review':
      content = selected?.bookingId && <>
        <Heading title="How was your ride?"/>
        <View style={S.row}>{[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value + ' of 5 stars'} accessibilityState={{selected: rating === value}} style={styles.iconButton} onPress={() => setRating(value)}><Icon name={value <= rating ? 'star' : 'star-outline'} size={28}/></Pressable>)}</View>
        <Text style={S.body}>{rating ? rating + ' of 5 stars' : 'Select a star rating'}</Text>
        <Field label="Comment (optional)" value={comment} onChangeText={setComment} multiline maxLength={1000} placeholder="Share how the ride went"/>
        {errorView}
        <Button title="Submit rating" disabled={!rating} busy={busy} onPress={() => void run(async () => {
          const bookingId = selected.bookingId!;
          await call('/reviews', 'POST', {bookingId, rating, ...(comment.trim() && {comment: comment.trim()})});
          setReviewed(current => [...current, bookingId]); setPage(trail.current.pop() ?? 'rides');
        })}/>
        <Button title="Skip for now" variant="link" disabled={busy} onPress={back}/>
      </>;
      break;
  }

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content"/>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.device}>
      {restoring ? <View style={styles.loading}><ActivityIndicator color={C.green} size="large"/></View> : <>
        {demo && <View style={styles.demo}><Icon name="flask-outline" size={16}/><Text style={S.label}>Demo mode · Sample data</Text></View>}
        {(screenTitle[page] || backOnly) && <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={styles.iconButton}><Icon name="chevron-back" color={C.dark}/></Pressable>
          {!!screenTitle[page] && <Text accessibilityRole="header" style={S.title}>{screenTitle[page]}</Text>}
        </View>}
        <ScrollView ref={scroll} style={{flex: 1}} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{content}</ScrollView>
        {!!user && page !== 'review' && <View accessibilityRole="tablist" style={styles.tabs}>{tabs.map(item => {
          const active = item.page === tabPage;
          return <Pressable key={item.page} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected: active}} onPress={() => tab(item.page)} style={styles.tab}>
            <View style={[styles.tabIcon, active && {backgroundColor: C.mint}]}><Icon name={item.icon} color={active ? C.green : C.muted}/></View><Text style={[styles.tabText, active && S.action]}>{item.label}</Text>
          </Pressable>;
        })}</View>}
      </>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider style={{backgroundColor: '#E6EEE7'}}><Carpool/></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, alignItems: 'center'},
  device: {flex: 1, width: '100%', maxWidth: 510, backgroundColor: C.paper},
  loading: {flex: 1, justifyContent: 'center'},
  content: {flexGrow: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 23, gap: 15},
  header: {flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, minHeight: 50, borderBottomWidth: 1, borderColor: C.line},
  iconButton: {minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center'},
  tabs: {flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingVertical: 6},
  tab: {flex: 1, alignItems: 'center', minHeight: 47, gap: 3},
  tabIcon: {width: 52, minHeight: 29, borderRadius: 20, alignItems: 'center', justifyContent: 'center'},
  tabText: {fontSize: 12, color: C.muted, fontWeight: '600'},
  choice: {borderWidth: 1.5, borderRadius: 17, padding: 15, minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 12},
  circle: {width: 46, height: 46, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: C.mint},
  badge: {position: 'absolute', top: -3, right: -3, borderRadius: 10, paddingHorizontal: 5, backgroundColor: C.error, color: C.white, fontSize: 11, fontWeight: '800'},
  segment: {alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, minHeight: 45, borderColor: C.line},
  activeSegment: {borderColor: C.green, borderBottomWidth: 3},
  demo: {alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, minHeight: 34, backgroundColor: C.mint},
  photo: {width: 64, height: 64, borderRadius: 23},
});
