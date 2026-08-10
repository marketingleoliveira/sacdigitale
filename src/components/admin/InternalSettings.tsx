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
import { Loader2, ShieldCheck, ShieldAlert, History } from 'lucide-react';
import { toast } from 'sonner';

interface InternalLog {
  id: string;
  ticket_id: string;
  status: 'success' | 'failure';
  error_message: string | null;
  recipient_email: string;
  created_at: string;
  tickets: {
    message: string;
    sac_requests: {
      protocol: string;
      name: string;
    } | null;
  } | null;
}

export default function InternalSettings() {
  const [logs, setLogs] = useState<InternalLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('internal_ticket_logs')
        .select(`
          *,
          tickets (
            message,
            sac_requests (
              protocol,
              name
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs((data as any) || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Erro ao carregar logs de envio');
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
            Logs de Notificação de Tickets Internos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum log de envio registrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Protocolo / Empresa</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhes</TableHead>
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
                            {log.tickets?.sac_requests?.protocol || '—'}
                          </span>
                          <span className="font-medium text-sm">
                            {log.tickets?.sac_requests?.name || 'Sistema'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.recipient_email}
                      </TableCell>
                      <TableCell>
                        {log.status === 'success' ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Sucesso
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                            <ShieldAlert className="h-3 w-3 mr-1" />
                            Falha
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                        {log.error_message || 'Notificação enviada com sucesso'}
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
