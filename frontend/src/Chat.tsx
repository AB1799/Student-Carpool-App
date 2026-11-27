import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { apiOrigin } from './api';
import type { Call } from './RideForm';
import { Button, Card, Field, Message, S } from './ui';

type ChatMessage = {id: string; senderId: string; body: string; createdAt: string};
type Ack = {ok: true; message?: ChatMessage} | {ok: false; error: string};

export function Chat({bookingId, token, userId, call}: {bookingId: string; token: string; userId: string; call: Call}) {
  const connection = useRef<Socket>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  function merge(incoming: ChatMessage[]) {
    setMessages(current => [...new Map([...current, ...incoming].map(message => [message.id, message])).values()]
      .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt)));
  }

  useEffect(() => {
    let active = true;
    const socket = io(apiOrigin, {auth: {token}});
    connection.current = socket;
    socket.on('chat:closed', () => {
      if (!active) return;
      setConnected(false);
      setError('This ride was cancelled. Chat is closed.');
      socket.disconnect();
    });
    socket.on('chat:message', (message: ChatMessage) => {if (active) merge([message]);});
    socket.on('disconnect', reason => {
      if (!active) return;
      setConnected(false);
      if (reason === 'io server disconnect') {
        void call('/users/me').then(() => {if (active) socket.connect();}).catch(() => {});
      }
    });
    socket.on('connect_error', () => {
      if (!active) return;
      setError('Could not connect to chat. Checking your session…');
      void call('/users/me').then(() => {
        if (active) setError('Chat is temporarily unavailable. Try opening it again.');
      }).catch(() => {});
    });
    socket.on('connect', async () => {
      try {
        const result: Ack = await socket.timeout(5000).emitWithAck('chat:join', {bookingId});
        if (!result.ok) throw new Error(result.error);
        if (!active) return;
        setConnected(true);
        setError('');
        const history = await call<{messages: ChatMessage[]}>('/bookings/' + bookingId + '/messages');
        if (active) merge(history.messages);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Could not load chat.');
      }
    });
    return () => {active = false; socket.disconnect(); connection.current = null;};
  }, [bookingId, call, token]);

  async function send(message: string) {
    const socket = connection.current;
    if (!socket?.connected || !connected || sending || !message.trim()) return;
    setError('');
    setSending(true);
    try {
      const result: Ack = await socket.timeout(5000).emitWithAck('chat:send', {bookingId, body: message.trim()});
      if (!result.ok) throw new Error(result.error);
      if (result.message) merge([result.message]);
      setBody(current => current === message ? '' : current);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not send the message.');
    } finally {setSending(false);}
  }

  return <View style={{gap: 12}}>
    {!connected && !error && <Text style={S.body}>Connecting to chat…</Text>}
    {messages.map(message => <Card key={message.id}>
      <Text style={S.label}>{message.senderId === userId ? 'You' : 'Ride partner'}</Text>
      <Text style={S.body}>{message.body}</Text>
      <Text style={S.body}>{new Date(message.createdAt).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}</Text>
    </Card>)}
    {!messages.length && connected && <Text style={S.body}>Send a message to coordinate pickup.</Text>}
    {error && <Message error>{error}</Message>}
    <View style={S.pair}>{['On my way', 'Running late', 'I’m here'].map(message => <View key={message} style={S.half}>
      <Button title={message} variant="outline" disabled={!connected || sending} onPress={() => void send(message)}/>
    </View>)}</View>
    <Field label="Message" placeholder="Type a message" value={body} onChangeText={setBody} multiline maxLength={2000}/>
    <Button title="Send message" disabled={!connected || !body.trim()} busy={sending} onPress={() => void send(body)}/>
  </View>;
}
