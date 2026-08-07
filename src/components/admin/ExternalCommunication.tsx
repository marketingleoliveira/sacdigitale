import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Mail, MailOpen, Send, ArrowDownLeft, ArrowUpRight, Paperclip, X, FileIcon, RefreshCw } from 'lucide-react';
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
  raw_payload?: { type?: string; source?: string; is_internal?: boolean } | null;
  attachments?: { filename: string; url: string; size?: number; content_type?: string }[];
  sac_request_id: string | null;
  _historical?: boolean;
}

const isTechnicalEmptyEvent = (email: EmailItem) =>
  email.body === '(sem conteúdo)' && email.raw_payload?.type?.startsWith('email.');

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
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [emailsEnabled, setEmailsEnabled] = useState<boolean | null>(null);

  const load = async () => {
    setLoading(true);
    const normalized = (recipientEmail || '').trim().toLowerCase();
    const { data, error } = await supabase
      .from('email_communications')
      .select('*')
      .or(
        `sac_request_id.eq.${sacRequestId}` +
          (normalized ? `,from_email.ilike.${normalized},to_email.ilike.${normalized}` : '')
      )
      .order('created_at', { ascending: true });
    if (error) toast.error('Erro ao carregar e-mails');
    const rows = ((data as unknown) as EmailItem[]) || [];
    const seen = new Set<string>();
    const DOMAIN = 'digitaletextil.com.br';
    const visibleEmails = rows
      .filter((email) => !isTechnicalEmptyEvent(email))
      .filter((email) => {
        // filter out internal Digitale-to-Digitale communications that aren't linked to this specific SAC
        const from = (email.from_email || '').toLowerCase();
        const to = (email.to_email || '').toLowerCase();
        const isInternal = from.endsWith(`@${DOMAIN}`) && to.endsWith(`@${DOMAIN}`);
        if (isInternal && email.sac_request_id !== sacRequestId) return false;
        
        if (seen.has(email.id)) return false;
        seen.add(email.id);
        return true;
      })
      .map((email) => ({
        ...email,
        _historical: email.sac_request_id !== sacRequestId,
      }));
    setEmails(visibleEmails);
    setLoading(false);
  };

  const syncInbox = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('imap-poll-inbox', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Falha ao sincronizar');
      }
      const r = data as { linked?: number; unlinked?: number; processed?: number; repaired?: number };
      toast.success(`Sincronizado: ${r.processed ?? 0} lidos • ${r.linked ?? 0} vinculados • ${r.repaired ?? 0} reparados`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
    const loadStatus = async () => {
      const { data } = await supabase
        .from('email_settings')
        .select('emails_enabled')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      setEmailsEnabled((data as { emails_enabled?: boolean } | null)?.emails_enabled ?? true);
    };
    loadStatus();
    const channel = supabase
      .channel(`emails-${sacRequestId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'email_communications',
        filter: `sac_request_id=eq.${sacRequestId}`,
      }, () => load())
      .subscribe();
    const settingsChannel = supabase
      .channel(`email-settings-${sacRequestId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_settings' }, loadStatus)
      .subscribe();
    return () => { supabase.removeChannel(channel); supabase.removeChannel(settingsChannel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sacRequestId]);

  const send = async () => {
    if (!body.trim() || !subject.trim()) {
      toast.error('Preencha assunto e mensagem');
      return;
    }
    setSending(true);
    try {
      // Upload attachments to storage first
      const uploaded: { filename: string; url: string; size: number; content_type: string }[] = [];
      if (files.length > 0) {
        setUploading(true);
        for (const f of files) {
          const path = `email-attachments/${sacRequestId}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { error: upErr } = await supabase.storage.from('sac-attachments').upload(path, f, {
            contentType: f.type || 'application/octet-stream',
            upsert: false,
          });
          if (upErr) throw new Error(`Falha ao enviar ${f.name}: ${upErr.message}`);
          const { data: signed } = await supabase.storage.from('sac-attachments').createSignedUrl(path, 60 * 60);
          if (!signed?.signedUrl) throw new Error(`Falha ao gerar URL para ${f.name}`);
          uploaded.push({ filename: f.name, url: signed.signedUrl, size: f.size, content_type: f.type || 'application/octet-stream' });
        }
        setUploading(false);
      }
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('send-customer-email', {
        body: { sac_request_id: sacRequestId, to: recipientEmail, subject, body, attachments: uploaded },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Falha ao enviar');
      }
      toast.success('E-mail enviado ao cliente');
      setBody('');
      setFiles([]);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar');
    } finally {
      setSending(false);
      setUploading(false);
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
        {emailsEnabled !== null && (
          <Badge
            variant="outline"
            className={
              emailsEnabled
                ? 'gap-1 border-green-300 text-green-700 bg-green-50'
                : 'gap-1 border-red-300 text-red-700 bg-red-50'
            }
            title={emailsEnabled ? 'Envio de e-mails ativo' : 'Envio de e-mails desativado nas configurações'}
          >
            <span className={`h-2 w-2 rounded-full ${emailsEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
            Sistema {emailsEnabled ? 'ONLINE' : 'OFFLINE'}
          </Badge>
        )}
        <Button onClick={syncInbox} disabled={syncing} size="sm" variant="ghost" className="ml-auto h-7 gap-1 text-xs">
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Sincronizar respostas
        </Button>
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
              <Card key={e.id} className={`${e.direction === 'outbound' ? 'border-blue-200' : 'border-green-200'} ${e._historical ? 'opacity-90 bg-muted/30' : ''}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    {e.direction === 'outbound' ? (
                      <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300"><ArrowUpRight className="h-3 w-3" />Enviado</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-green-700 border-green-300"><ArrowDownLeft className="h-3 w-3" />Recebido</Badge>
                    )}
                    <span className="text-muted-foreground">{fmt(e.created_at)}</span>
                    {e.status === 'failed' && <Badge variant="destructive">Falhou</Badge>}
                    {e._historical && (
                      <Badge variant="secondary" className="gap-1" title="E-mail de outra solicitação com o mesmo cliente">
                        Histórico
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <strong>De:</strong> {e.from_email} • <strong>Para:</strong> {e.to_email}
                    {e.sent_by_email && <> • <strong>Por:</strong> {e.sent_by_email.split('@')[0]}</>}
                  </div>
                  {e.subject && e.direction === 'outbound' && (
                    <div className="text-sm font-medium">{e.subject}</div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{e.body}</p>
                  {e.attachments && e.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {e.attachments.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border bg-background hover:bg-muted">
                          <FileIcon className="h-3 w-3" />{a.filename}
                        </a>
                      ))}
                    </div>
                  )}
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
        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                <span className="flex items-center gap-2 truncate"><FileIcon className="h-3 w-3" />{f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span></span>
                <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer hover:underline">
              <Paperclip className="h-3 w-3" /> Anexar arquivos
              <input type="file" multiple className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files || []);
                  setFiles((prev) => [...prev, ...list]);
                  e.target.value = '';
                }} />
            </label>
            <span className="text-xs text-muted-foreground">{body.length}/5000</span>
          </div>
          <Button onClick={send} disabled={sending || uploading || !body.trim()} size="sm">
            {sending || uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            {uploading ? 'Enviando anexos...' : 'Enviar e-mail'}
          </Button>
        </div>
      </div>
    </div>
  );
}