import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Trash2, Tag } from 'lucide-react';

interface ComplaintType {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export default function ComplaintTypesManagement() {
  const [types, setTypes] = useState<ComplaintType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchTypes = async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from('complaint_types')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error(error);
      toast.error('Erro ao carregar tipos de reclamação');
    } else {
      setTypes((data as ComplaintType[]) || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const addType = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setIsAdding(true);
    const { error } = await (supabase as any)
      .from('complaint_types')
      .insert({ name });
    setIsAdding(false);
    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Este tipo já existe' : 'Erro ao adicionar tipo');
      return;
    }
    setNewName('');
    toast.success('Tipo adicionado');
    fetchTypes();
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await (supabase as any)
      .from('complaint_types')
      .update({ active })
      .eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar');
      return;
    }
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, active } : t)));
  };

  const removeType = async (id: string) => {
    if (!confirm('Remover este tipo de reclamação?')) return;
    const { error } = await (supabase as any)
      .from('complaint_types')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Erro ao remover');
      return;
    }
    setTypes((prev) => prev.filter((t) => t.id !== id));
    toast.success('Tipo removido');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Tag className="h-5 w-5" />
          Tipos de Reclamação
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Cadastre as opções que aparecerão ao usuário após selecionar "Reclamação" no formulário.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={addType} className="flex gap-2">
          <Input
            placeholder="Ex: Produto com defeito"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
          />
          <Button type="submit" disabled={isAdding || !newName.trim()}>
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Adicionar
          </Button>
        </form>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : types.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Nenhum tipo cadastrado ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-[120px]">Ativo</TableHead>
                <TableHead className="w-[80px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={t.active}
                      onCheckedChange={(checked) => toggleActive(t.id, checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeType(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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