import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { Call } from './RideForm';
import { Button, Card, Message, Pill, S } from './ui';

type Report = {
  id: string; reporterId: string; reportedId: string; reason: string; status: 'OPEN' | 'RESOLVED';
  createdAt: string; reportedName: string; reporterName: string; reportedSuspended: boolean;
};

export function Moderation({call}: {call: Call}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string>();
  const refresh = useCallback(async () => {
    const result = await call<{reports: Report[]}>('/reports');
    setReports(result.reports);
  }, [call]);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try {await action();}
    catch (failure) {setError(failure instanceof Error ? failure.message : 'Please try again.');}
    finally {setBusy(false);}
  }, []);
  useEffect(() => {void run(refresh);}, [refresh, run]);

  return <View style={{gap: 12}}>
    <Button title="Refresh reports" variant="outline" disabled={busy} onPress={() => void run(refresh)}/>
    {!!error && <Message error>{error}</Message>}
    {!reports.length && !busy && !error && <Text style={S.body}>There are no reports to review.</Text>}
    {reports.map(report => <Card key={report.id}>
      <View style={S.split}><Text style={S.title}>{report.reportedName}</Text><Pill label={report.status === 'OPEN' ? 'Open' : 'Resolved'}/></View>
      <Text style={S.body}>{report.reason}</Text>
      <Text style={S.body}>Filed by {report.reporterName} · {new Date(report.createdAt).toLocaleDateString()}</Text>
      {report.status === 'OPEN' && <Button title="Resolve report" disabled={busy} onPress={() => void run(async () => {
        await call('/reports/' + report.id + '/resolve', 'PUT');
        await refresh();
      })}/>}
      {confirm === report.id ? <>
        <Text style={S.label}>{report.reportedSuspended ? 'Restore' : 'Suspend'} access for {report.reportedName}?</Text>
        <Button title={report.reportedSuspended ? 'Restore access' : 'Suspend account'} variant="outline" disabled={busy} onPress={() => void run(async () => {
          await call('/reports/users/' + report.reportedId + '/suspend', 'PUT', {suspended: !report.reportedSuspended});
          setConfirm(undefined);
          await refresh();
        })}/>
        <Button title="Go back" variant="link" disabled={busy} onPress={() => setConfirm(undefined)}/>
      </> : <Button title={report.reportedSuspended ? 'Restore access' : 'Suspend account'} variant="link" disabled={busy} onPress={() => setConfirm(report.id)}/>}
    </Card>)}
  </View>;
}
