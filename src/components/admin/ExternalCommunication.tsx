import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Mail, MailOpen, Send, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';

interface EmailItem {
  id: string;
  direction: 'outbound' | 'inbound';
  from_email: string;
  to_email: string;
  subject: string | null;
  body: string;
  status: string;
  sent_by_email: string | null;
  error_message: string | null;
  created_at: string;
}

interface Props {
  sacRequestId: string;
  recipientEmail: string;
  protocol: string;
}

export default function ExternalCommunication({ sacRequestId, recipientEmail, protocol }: Props) {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState(`[${protocol}] Atualização sobre sua solicitação`);
  const [body, setBody] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('email_communications')
      .select('*')
      .eq('sac_request_id', sacRequestId)
      .order('created_at', { ascending: true });
    if (error) toast.error('Erro ao carregar e-mails');
    setEmails((data as EmailItem[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`emails-${sacRequestId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'email_communications',
        filter: `sac_request_id=eq.${sacRequestId}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sacRequestId]);

  const send = async () => {
    if (!body.trim() || !subject.trim()) {
      toast.error('Preencha assunto e mensagem');
      return;
    }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('send-customer-email', {
        body: { sac_request_id: sacRequestId, to: recipientEmail, subject, body },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Falha ao enviar');
      }
      toast.success('E-mail enviado ao cliente');
      setBody('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Comunicação Externa (E-mail)</h3>
        <Badge variant="secondary">{emails.length}</Badge>
      </div>

      <ScrollArea className="h-[320px] rounded-lg border bg-muted/30 p-4">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MailOpen className="h-8 w-8 mb-2" />
            <p className="text-sm">Nenhum e-mail trocado ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {emails.map((e) => (
              <Card key={e.id} className={e.direction === 'outbound' ? 'border-blue-200' : 'border-green-200'}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    {e.direction === 'outbound' ? (
                      <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300"><ArrowUpRight className="h-3 w-3" />Enviado</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-green-700 border-green-300"><ArrowDownLeft className="h-3 w-3" />Recebido</Badge>
                    )}
                    <span className="text-muted-foreground">{fmt(e.created_at)}</span>
                    {e.status === 'failed' && <Badge variant="destructive">Falhou</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <strong>De:</strong> {e.from_email} • <strong>Para:</strong> {e.to_email}
                    {e.sent_by_email && <> • <strong>Por:</strong> {e.sent_by_email.split('@')[0]}</>}
                  </div>
                  {e.subject && <div className="text-sm font-medium">{e.subject}</div>}
                  <p className="text-sm whitespace-pre-wrap">{e.body}</p>
                  {e.error_message && <p className="text-xs text-destructive">{e.error_message}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="space-y-2 border-t pt-4">
        <Label className="text-sm">Enviar novo e-mail para <span className="font-mono text-primary">{recipientEmail}</span></Label>
        <Input
          placeholder="Assunto"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
        />
        <Textarea
          placeholder="Mensagem para o cliente..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[120px]"
          maxLength={5000}
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{body.length}/5000</span>
          <Button onClick={send} disabled={sending || !body.trim()} size="sm">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar e-mail
          </Button>
        </div>
      </div>
    </div>
  );
}