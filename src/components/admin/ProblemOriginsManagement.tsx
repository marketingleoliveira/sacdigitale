import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Check, X, GitBranch } from 'lucide-react';

type Origin = { id: string; name: string; active: boolean | number };

export default function ProblemOriginsManagement() {
  const { session } = useAuth();
  const [items, setItems] = useState<Origin[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);


  const api = async (
    method: string,
    query = '',
    body?: unknown
  ): Promise<Origin[]> => {
    const table = (supabase as any).from('problem_origins');
    let result: any;

    if (method === 'GET') {
      result = await table
        .select('*')
        .order('created_at', { ascending: true });

    } else if (method === 'POST') {
      result = await table.insert(body);

    } else {
      const id = new URLSearchParams(
        query.replace(/^\\?/, '')
      ).get('id');

      if (!id || !id.startsWith('eq.')) {
        throw new Error('Identificador invalido');
      }

      const value = id.substring(3);

      if (method === 'PATCH') {
        result = await table.update(body).eq('id', value);
      } else if (method === 'DELETE') {
        result = await table.delete().eq('id', value);
      } else {
        throw new Error('Operacao desconhecida');
      }
    }

    if (result.error) {
      throw result.error;
    }

    return Array.isArray(result.data)
      ? result.data as Origin[]
      : result.data
        ? [result.data as Origin]
        : [];
  };

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api('GET', '?select=*&order=created_at.asc'));
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar origens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [session?.access_token]);

  // SAC_ORIGINS_AUTO_SYNC_V1
  // Atualiza os dados sem recarregar a pagina ou apagar formularios.
  useEffect(() => {
    if (!session?.access_token) return;

    let disposed = false;
    let running = false;

    const refresh = async () => {
      if (
        disposed ||
        running ||
        document.visibilityState === 'hidden'
      ) return;

      running = true;

      try {
        const table = (supabase as any).from('problem_origins');
        const { data, error } = await table
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (!disposed) {
          const incoming = (data || []) as Origin[];

          setItems(previous =>
            JSON.stringify(previous) === JSON.stringify(incoming)
              ? previous
              : incoming
          );
        }
      } catch (error) {
        // Uma falha temporaria nao interrompe a interface.
        console.warn('Sincronizacao de origens:', error);
      } finally {
        running = false;
      }
    };

    const onReturn = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };

    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [session?.access_token]);


  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = (editing ? draft : name).trim();
    if (!value || busy) return;
    setBusy(true);

    try {
      if (editing) {
        await api('PATCH', '?id=eq.' + encodeURIComponent(editing), { name: value });
      } else {
        await api('POST', '', { name: value, id: crypto.randomUUID(), active: true });
      }
      setEditing(null);
      setName('');
      toast.success('Origem salva');
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar origem: ' + (e instanceof Error ? e.message : 'erro desconhecido'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: Origin, active: boolean) => {
    try {
      await api('PATCH', '?id=eq.' + encodeURIComponent(item.id), { active });
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao atualizar status');
    }
  };

  const remove = async (item: Origin) => {
    if (!confirm('Excluir esta origem de problema?')) return;
    try {
      await api('DELETE', '?id=eq.' + encodeURIComponent(item.id));
      toast.success('Origem excluída');
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir origem');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Origens de Problemas
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Cadastre, edite, ative, desative e exclua origens de problemas.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="flex gap-2" onSubmit={save}>
          <Input value={name} onChange={e => setName(e.target.value)}
            placeholder="Ex: Falha na separação" maxLength={100} />
          <Button disabled={busy || !name.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </form>

        {loading ? <p>Carregando...</p> : items.length === 0
          ? <p className="text-muted-foreground">Nenhuma origem cadastrada.</p>
          : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id}>
                  <TableCell>
                    {editing === item.id ? (
                      <Input autoFocus value={draft} maxLength={100}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void save();
                          }
                        }} />
                    ) : item.name}
                  </TableCell>
                  <TableCell>
                    <Switch checked={Boolean(item.active)}
                      onCheckedChange={checked => void toggle(item, checked)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {editing === item.id ? (
                      <>
                        <Button variant="ghost" size="icon" disabled={busy}
                          title="Salvar" onClick={() => void save()}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Cancelar"
                          onClick={() => setEditing(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon" title="Editar"
                          onClick={() => {
                            setEditing(item.id);
                            setDraft(item.name);
                          }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Excluir"
                          onClick={() => void remove(item)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
