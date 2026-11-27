import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as ExpoLocation from 'expo-location';
import { ApiError, campus, query, type Location, type Ride, type Vehicle } from './api';
import { Button, Card, C, Field, Heading, Icon, Message, S } from './ui';

export type Call = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
const datePart = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value, i) => String(value).padStart(i === 0 ? 4 : 2, '0')).join('-');
const timePart = (date: Date) => [date.getHours(), date.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
function dateTime(day: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const instant = new Date(day + 'T' + time + ':00');
  return Number.isFinite(+instant) && datePart(instant) === day && timePart(instant) === time ? instant : null;
}
export const when = (date: string) => new Date(date).toLocaleString('en-US', {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
export function RouteLine({origin, destination}: {origin: string; destination: string}) {
  return <View style={{gap: 7}}>
    <View style={S.row}><Icon name="location-outline" size={18}/><Text style={[S.body, {flexShrink: 1}]}>From <Text style={S.label}>{origin}</Text></Text></View>
    <View style={S.row}><Icon name="navigate-outline" size={18}/><Text style={[S.body, {flexShrink: 1}]}>To <Text style={S.label}>{destination}</Text></Text></View>
  </View>;
}

function Place({label, value, change, call, current}: {label: string; value: Location | null; change: (value: Location | null) => void; call: Call; current?: boolean}) {
  const [text, setText] = useState(value?.label ?? '');
  const [suggestions, setSuggestions] = useState<{placeId: string; description: string}[]>([]);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {if (value) setText(value.label);}, [value]);
  useEffect(() => {
    let stale = false;
    if (value || text.trim().length < 3) {setSuggestions([]); return;}
    const timer = setTimeout(() => {
      void call<{suggestions: typeof suggestions}>('/maps/autocomplete?' + query({text: text.trim()}))
        .then(result => {if (!stale) setSuggestions(result.suggestions);})
        .catch(failure => {if (!stale && failure instanceof ApiError && (failure.status === 404 || failure.code === 'MAPS_NOT_SET_UP')) setFallback(true);});
    }, 320);
    return () => {stale = true; clearTimeout(timer);};
  }, [call, value, text]);
  async function resolve(action: () => Promise<Location>) {
    setBusy(true); setError('');
    try {change(await action());}
    catch (failure) {setError(failure instanceof Error ? failure.message : 'Could not find this location.');}
    finally {setBusy(false);}
  }
  return <View style={{gap: 7}}>
    <Field label={label} icon={current ? 'location-outline' : 'navigate-outline'} value={text} maxLength={200} onChangeText={next => {setText(next); change(null); setError('');}} placeholder={current ? 'Enter a pickup location' : 'Enter a destination'}/>
    {!value && <>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
        {campus.filter(place => !text.trim() || place.label.toLowerCase().includes(text.trim().toLowerCase())).map(place => <Pressable accessibilityRole="button" key={place.label} onPress={() => change(place)} style={[S.pill, {minHeight: 37}]}><Text style={S.action}>{place.label}</Text></Pressable>)}
      </View>
      {suggestions.map(place => <Button key={place.placeId} variant="outline" title={place.description} disabled={busy} onPress={() => void resolve(async () => (await call<{location: Location}>('/maps/geocode?' + query({placeId: place.placeId}))).location)}/>)}
      {text.trim().length >= 3 && !fallback && <Button title="Look up address" variant="link" disabled={busy} onPress={() => void resolve(async () => (await call<{location: Location}>('/maps/geocode?' + query({address: text.trim()}))).location)}/>}
      {current && <Button title="Use my location" icon="locate-outline" variant="link" disabled={busy} onPress={() => void resolve(async () => {
        const permission = await ExpoLocation.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Allow location access to use your current position.');
        const {coords} = await ExpoLocation.getCurrentPositionAsync({});
        return {label: text.trim().length >= 2 ? text.trim() : 'Current location', lat: coords.latitude, lng: coords.longitude};
      })}/>}
      <Button title="Enter coordinates" variant="link" onPress={() => setFallback(!fallback)}/>
      {fallback && <>
        <View style={S.pair}><View style={S.half}><Field label="Latitude" value={lat} onChangeText={setLat} placeholder="33.2107"/></View><View style={S.half}><Field label="Longitude" value={lng} onChangeText={setLng} placeholder="-97.1503"/></View></View>
        <Button title="Use these coordinates" variant="outline" disabled={!lat.trim() || !lng.trim() || !Number.isFinite(+lat) || !Number.isFinite(+lng) || Math.abs(+lat) > 90 || Math.abs(+lng) > 180 || text.trim().length < 2} onPress={() => change({label: text.trim(), lat: +lat, lng: +lng})}/>
      </>}
    </>}
    {!!error && <Message error>{error}</Message>}
  </View>;
}

export type Trip = {origin: Location; destination: Location; departureTime: string; seats: number; timeWindowMinutes?: number; earliest?: string; latest?: string; repeatDepartures?: string[]};

export function RideForm({mode, initial, vehicle, call, submit, changeVehicle, error, busy, allowRepeats = false}: {
  mode: 'offer' | 'find'; initial?: Partial<Trip>; vehicle: Vehicle | null; call: Call;
  submit: (data: Trip) => void; changeVehicle: (draft: Partial<Trip>) => void; error?: string; busy?: boolean; allowRepeats?: boolean;
}) {
  const offer = mode === 'offer';
  const defaultDate = initial?.departureTime ? new Date(initial.departureTime) : new Date();
  if (!initial?.departureTime) {defaultDate.setDate(defaultDate.getDate() + 1); defaultDate.setHours(8, 0, 0, 0);}
  const [origin, setOrigin] = useState<Location | null>(initial?.origin ?? null);
  const [destination, setDestination] = useState<Location | null>(initial?.destination ?? null);
  const [day, setDay] = useState(datePart(defaultDate));
  const [start, setStart] = useState(initial?.earliest ? timePart(new Date(initial.earliest)) : timePart(defaultDate));
  const [end, setEnd] = useState(initial?.latest ? timePart(new Date(initial.latest)) : '09:00');
  const [repeatDays, setRepeatDays] = useState(() => [...new Set((initial?.repeatDepartures ?? []).map(time => new Date(time).getDay()))]);
  const [seats, setSeats] = useState(initial?.seats ?? 1);
  const startTime = dateTime(day, start);
  const endTime = dateTime(day, end);
  const repeatDepartures = offer && startTime && repeatDays.length ? Array.from({length: 28}, (_, index) => {
    const date = new Date(startTime);
    date.setDate(date.getDate() + index + 1);
    return date;
  }).filter(date => repeatDays.includes(date.getDay())).map(date => date.toISOString()) : [];
  const difference = startTime && endTime ? (+endTime - +startTime) / 60000 : 0;
  const valid = !!origin && !!destination && !!startTime && (offer
    ? !!vehicle && seats <= vehicle.seatCapacity && +startTime > Date.now()
    : difference >= 5 && difference <= 360 && !!endTime && +endTime > Date.now());

  return <View style={{gap: 15}}>
    <Heading title={offer ? 'Offer a ride' : 'Find a ride'} subtitle={offer ? 'Share a seat on your commute.' : 'Find a UNT student headed your way.'}/>
    <Place label="Pickup location" value={origin} change={setOrigin} current call={call}/>
    <Place label="Drop-off location" value={destination} change={setDestination} call={call}/>
    <Field label="Ride date (YYYY-MM-DD)" icon="calendar-outline" value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" maxLength={10} error={!startTime && day.length === 10 && start.length === 5 ? 'Enter a valid date and time.' : undefined}/>
    <View style={S.pair}>
      <View style={S.half}><Field label={offer ? 'Departure (24-hour)' : 'Leave after (24-hour)'} icon="time-outline" value={start} onChangeText={setStart} maxLength={5} placeholder="08:00"/></View>
      {!offer && <View style={S.half}><Field label="Leave before (24-hour)" value={end} onChangeText={setEnd} maxLength={5} placeholder="09:00"/></View>}
    </View>
    {!offer && startTime && endTime && (difference < 5 || difference > 360) && <Message error>Choose an end time 5 minutes to 6 hours after the start.</Message>}
    {startTime && (offer ? +startTime <= Date.now() : !!endTime && +endTime <= Date.now()) && <Message error>Choose a time in the future.</Message>}
    <View style={S.split}><Text style={S.label}>{offer ? 'Seats available' : 'Seats needed'}</Text><View style={S.row}><Button title="−" variant="outline" disabled={seats <= 1} onPress={() => setSeats(seats - 1)}/><Text style={S.label}>{seats}</Text><Button title="+" variant="outline" disabled={seats >= (offer ? vehicle?.seatCapacity ?? 1 : 8)} onPress={() => setSeats(seats + 1)}/></View></View>
    {offer && allowRepeats && <View style={{gap: 7}}>
      <Text style={S.label}>Repeat on</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, index) => {
          const selected = repeatDays.includes(index);
          return <Pressable key={label} accessibilityRole="checkbox" accessibilityState={{checked: selected}}
            onPress={() => setRepeatDays(days => selected ? days.filter(day => day !== index) : [...days, index])}
            style={[S.pill, {minHeight: 44, backgroundColor: selected ? C.green : C.white}]}>
            {selected && <Icon name="checkmark" size={14} color={C.white}/>}
            <Text style={[S.label, selected && {color: C.white}]}>{label}</Text>
          </Pressable>;
        })}
      </View>
      <Text style={S.body}>{repeatDepartures.length ? `Posts this ride plus ${repeatDepartures.length} additional rides over the next four weeks. Edit or cancel dates individually.` : 'Choose days to post additional rides over the next four weeks.'}</Text>
    </View>}
    {offer && <Card><View style={S.split}><View style={{flex: 1}}><Text style={S.body}>Vehicle</Text><Text style={S.title}>{vehicle ? [vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ') : 'Add your vehicle'}</Text></View><Button title={vehicle ? 'Change' : 'Add'} variant="link" onPress={() => changeVehicle({origin: origin ?? undefined, destination: destination ?? undefined, departureTime: startTime?.toISOString(), seats, repeatDepartures})}/></View></Card>}
    {!!error && <Message error>{error}</Message>}
    <Button title={offer ? 'Post ride' : 'Find matches'} busy={busy} disabled={!valid} icon={offer ? 'car-outline' : 'search-outline'} onPress={() => {
      if (!valid || !origin || !destination || !startTime) return;
      const midpoint = !offer && endTime ? new Date((+startTime + +endTime) / 2) : startTime;
      submit({origin, destination, departureTime: midpoint.toISOString(), seats, ...(repeatDepartures.length > 0 && {repeatDepartures}), ...(!offer && endTime ? {
        timeWindowMinutes: Math.max(5, Math.ceil(difference / 2)), earliest: startTime.toISOString(), latest: endTime.toISOString(),
      } : {})});
    }}/>
  </View>;
}

export function rideDraft(ride?: Ride): Partial<Trip> | undefined {
  if (!ride) return;
  return {
    origin: ride.originLat != null && ride.originLng != null ? {label: ride.originLabel, lat: ride.originLat, lng: ride.originLng} : undefined,
    destination: ride.destinationLat != null && ride.destinationLng != null ? {label: ride.destinationLabel, lat: ride.destinationLat, lng: ride.destinationLng} : undefined,
    departureTime: ride.departureTime,
    seats: ride.seatsTotal,
  };
}
