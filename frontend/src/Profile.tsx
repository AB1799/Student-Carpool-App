import { useState } from 'react';
import { Text, View } from 'react-native';
import type { User, Vehicle } from './api';
import { Button, C, Field, Icon, Message, S } from './ui';

export function Avatar({name, large = false}: {name: string; large?: boolean}) {
  return <View style={{width: large ? 64 : 45, height: large ? 64 : 45, flexShrink: 0, borderRadius: 25, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center'}}>
    <Text style={{fontWeight: '800', fontSize: large ? 23 : 16, color: C.green}}>{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')}</Text>
  </View>;
}

export function EditProfile({user, save, error, busy}: {user: User; save: (value: {fullName: string; photoUrl: string | null}) => void; error: string; busy: boolean}) {
  const [name, setName] = useState(user.fullName);
  const [photo, setPhoto] = useState(user.photoUrl ?? '');
  const validPhoto = !photo.trim() || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(photo.trim());
  return <View style={{gap: 14}}>
    <Field label="Full name" icon="person-outline" value={name} onChangeText={setName} maxLength={120}/>
    <Field label="Profile photo URL (optional)" value={photo} onChangeText={setPhoto} keyboardType="url" autoCapitalize="none" maxLength={2000} error={!validPhoto ? 'Enter a valid photo URL beginning with https://.' : undefined}/>
    {!!error && <Message error>{error}</Message>}
    <Button title="Save profile" busy={busy} disabled={name.trim().length < 2 || !validPhoto} onPress={() => save({fullName: name.trim(), photoUrl: photo.trim() || null})}/>
  </View>;
}

export function EditVehicle({vehicle, save, error, busy}: {vehicle: Vehicle | null; save: (value: Vehicle) => void; error: string; busy: boolean}) {
  const [make, setMake] = useState(vehicle?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [year, setYear] = useState(vehicle?.modelYear?.toString() ?? '');
  const [color, setColor] = useState(vehicle?.color ?? '');
  const [plate, setPlate] = useState(vehicle?.licensePlate ?? '');
  const [seats, setSeats] = useState(String(vehicle?.seatCapacity ?? 3));
  const validYear = !year || /^\d{4}$/.test(year) && +year >= 1980 && +year <= 2100;

  return <View style={{gap: 14}}>
    <View style={S.pair}><View style={S.half}><Field label="Make" value={make} onChangeText={setMake} placeholder="Honda" maxLength={60}/></View><View style={S.half}><Field label="Model" value={model} onChangeText={setModel} placeholder="Civic" maxLength={60}/></View></View>
    <Field label="Model year (optional)" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} error={!validYear ? 'Enter a year from 1980 to 2100.' : undefined}/>
    <Field label="Color (optional)" value={color} onChangeText={setColor} placeholder="Silver" maxLength={40}/>
    <Field label="License plate (optional)" value={plate} onChangeText={setPlate} autoCapitalize="characters" maxLength={20}/>
    <Field label="Seats for riders (1–8)" icon="people-outline" value={seats} onChangeText={setSeats} keyboardType="number-pad" maxLength={1}/>
    <View style={S.row}><Icon name="shield-checkmark-outline"/><Text style={[S.body, {flex: 1}]}>Your vehicle details help riders find you. Your plate is visible to riders with a confirmed or completed booking.</Text></View>
    {!!error && <Message error>{error}</Message>}
    <Button title="Save vehicle" busy={busy} disabled={!make.trim() || !model.trim() || !validYear || !/^[1-8]$/.test(seats)} onPress={() => save({make: make.trim(), model: model.trim(), color: color.trim() || null, licensePlate: plate.trim() || null, modelYear: year ? Number(year) : null, seatCapacity: Number(seats)})}/>
  </View>;
}
