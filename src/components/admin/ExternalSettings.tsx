import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface EmailSettings {
  id: string;
  bcc_enabled: boolean;
  bcc_email: string;
  emails_enabled: boolean;
  self_copy_enabled: boolean;
}

export default function ExternalSettings() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('email_settings')
      .select('id, bcc_enabled, bcc_email, emails_enabled, self_copy_enabled')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) toast.error('Erro ao carregar configurações');
    setSettings(data as EmailSettings | null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!settings) return;
    if (settings.bcc_enabled && !/^\S+@\S+\.\S+$/.test(settings.bcc_email.trim())) {
      toast.error('Informe um e-mail de BCC válido');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('email_settings')
      .update({
        bcc_enabled: settings.bcc_enabled,
        bcc_email: settings.bcc_email.trim(),
        emails_enabled: settings.emails_enabled,
        self_copy_enabled: settings.self_copy_enabled,
      })
      .eq('id', settings.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success('Configurações salvas');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!settings) {
    return <p className="text-muted-foreground">Configurações indisponíveis.</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className={settings.emails_enabled ? 'border-primary/30' : 'border-destructive/50'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Status do envio de e-mails
          </CardTitle>
          <CardDescription>
            Liga/desliga globalmente todo o envio pela Comunicação Externa.
            Use OFF em caso de manutenção ou instabilidade do provedor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">
                {settings.emails_enabled ? '🟢 Sistema ONLINE' : '🔴 Sistema OFFLINE'}
              </Label>
              <p className="text-sm text-muted-foreground">
                {settings.emails_enabled
                  ? 'E-mails serão enviados normalmente aos clientes.'
                  : 'Nenhum e-mail será enviado enquanto estiver desativado.'}
              </p>
            </div>
            <Switch
              checked={settings.emails_enabled}
              onCheckedChange={(v) => setSettings({ ...settings, emails_enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Cópia oculta (BCC) automática
          </CardTitle>
          <CardDescription>
            Quando ativado, todo e-mail enviado pela Comunicação Externa enviará
            uma cópia oculta para o endereço configurado. O cliente não enxerga este destinatário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">Recibo no remetente (qualidade@)</Label>
              <p className="text-sm text-muted-foreground">
                Envia uma cópia oculta para o próprio <strong>qualidade@digitaletextil.com.br</strong>,
                servindo como comprovante do envio na caixa de entrada.
              </p>
            </div>
            <Switch
              checked={settings.self_copy_enabled}
              onCheckedChange={(v) => setSettings({ ...settings, self_copy_enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">BCC para o gerente</Label>
              <p className="text-sm text-muted-foreground">
                Inclui o endereço abaixo em todos os e-mails de saída.
              </p>
            </div>
            <Switch
              checked={settings.bcc_enabled}
              onCheckedChange={(v) => setSettings({ ...settings, bcc_enabled: v })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bcc-email">Endereço de BCC</Label>
            <Input
              id="bcc-email"
              type="email"
              value={settings.bcc_email}
              onChange={(e) => setSettings({ ...settings, bcc_email: e.target.value })}
              placeholder="gerente@digitaletextil.com.br"
              disabled={!settings.bcc_enabled}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar configurações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}