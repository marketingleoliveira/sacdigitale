import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, User } from 'lucide-react';
import { toast } from 'sonner';

interface EditLog {
  id: string;
  sac_request_id: string;
  edited_by: string;
  edited_by_email: string;
  field_edited: string;
  old_value: string;
  new_value: string;
  created_at: string;
  sac_requests: {
    protocol: string;
    name: string;
  } | null;
}

export default function EditLogs() {
  const [logs, setLogs] = useState<EditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('sac_edit_logs')
        .select(`
          *,
          sac_requests (
            protocol,
            name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data as any) || []);
    } catch (error) {
      console.error('Error fetching edit logs:', error);
      toast.error('Erro ao carregar logs de edição');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Logs de Edição (Vendas)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum log de edição registrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Protocolo / Empresa</TableHead>
                    <TableHead>Editor</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead>Valor Anterior</TableHead>
                    <TableHead>Novo Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-muted-foreground">
                            {log.sac_requests?.protocol || '—'}
                          </span>
                          <span className="font-medium text-sm">
                            {log.sac_requests?.name || '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{log.edited_by_email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.field_edited}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate text-muted-foreground" title={log.old_value}>
                        {log.old_value || '(vazio)'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate font-medium" title={log.new_value}>
                        {log.new_value || '(vazio)'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
