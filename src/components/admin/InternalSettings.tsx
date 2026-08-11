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
import { Loader2, ShieldCheck, ShieldAlert, History, Eye } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LogEntry {
  id: string;
  ticket_id?: string;
  sac_request_id?: string;
  status: 'success' | 'failure' | 'sent' | 'failed' | 'inbound';
  error_message?: string | null;
  recipient_email?: string;
  from_email?: string;
  to_email?: string;
  created_at: string;
  email_body?: string;
  subject?: string;
  direction?: 'inbound' | 'outbound';
  tickets?: {
    message: string;
    sac_requests: {
      protocol: string;
      name: string;
    } | null;
  } | null;
  sac_requests?: {
    protocol: string;
    name: string;
  } | null;
}

export default function InternalSettings() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'internal' | 'external'>('internal');

  useEffect(() => {
    fetchLogs();
  }, [activeTab]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'internal') {
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
      } else {
        const { data, error } = await supabase
          .from('email_communications')
          .select(`
            *,
            sac_requests (
              protocol,
              name
            )
          `)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setLogs((data as any) || []);
      }
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Logs de Notificação
          </CardTitle>
          <div className="flex bg-muted p-1 rounded-md">
            <Button 
              variant={activeTab === 'internal' ? 'secondary' : 'ghost'} 
              size="sm" 
              className="text-xs h-7"
              onClick={() => setActiveTab('internal')}
            >
              Interno
            </Button>
            <Button 
              variant={activeTab === 'external' ? 'secondary' : 'ghost'} 
              size="sm" 
              className="text-xs h-7"
              onClick={() => setActiveTab('external')}
            >
              Externo
            </Button>
          </div>
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
                    <TableHead>{activeTab === 'internal' ? 'Destinatário' : 'Fluxo'}</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhes</TableHead>
                    <TableHead className="w-[80px]">Ver</TableHead>
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
                            {log.tickets?.sac_requests?.protocol || log.sac_requests?.protocol || '—'}
                          </span>
                          <span className="font-medium text-sm">
                            {log.tickets?.sac_requests?.name || log.sac_requests?.name || 'Sistema'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {activeTab === 'internal' ? (
                          log.recipient_email
                        ) : (
                          <div className="flex flex-col text-xs">
                            <span className="text-muted-foreground">De: {log.from_email}</span>
                            <span className="text-muted-foreground">Para: {log.to_email}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.status === 'success' || log.status === 'sent' ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            {log.direction === 'inbound' ? 'Recebido' : 'Sucesso'}
                          </Badge>
                        ) : log.status === 'inbound' ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Recebido
                          </Badge>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                              <ShieldAlert className="h-3 w-3 mr-1" />
                              Falha
                            </Badge>
                            {log.error_message && (
                              <span className="text-[10px] text-red-600 font-medium truncate max-w-[120px]" title={log.error_message}>
                                {log.error_message}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                        {log.error_message || (activeTab === 'internal' ? 'Notificação enviada com sucesso' : log.subject)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 border-b">
            <DialogTitle className="text-lg">Conteúdo da Notificação</DialogTitle>
            <div className="flex flex-col gap-1 mt-2 text-sm text-muted-foreground">
              <p><strong>Assunto:</strong> {selectedLog?.subject || 'N/A'}</p>
              <p><strong>{activeTab === 'internal' ? 'Destinatário:' : 'Fluxo:'}</strong> {selectedLog?.recipient_email || `${selectedLog?.from_email} → ${selectedLog?.to_email}`}</p>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 p-6">
            {selectedLog?.email_body ? (
              <div 
                className="bg-white border rounded p-4 text-sm overflow-auto text-black"
                dangerouslySetInnerHTML={{ __html: selectedLog.email_body }} 
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Conteúdo do e-mail não registrado para este log.
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
