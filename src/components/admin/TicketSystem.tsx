import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, MessageSquare, User, Mail, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  sac_request_id: string;
  created_by: string;
  assigned_to: string | null;
  message: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
  author_email: string | null;
  author_name: string | null;
}

interface TicketSystemProps {
  sacRequestId: string;
  currentUserId: string;
  currentUserEmail?: string;
  currentUserDisplayName?: string | null;
  canDelete?: boolean;
}

export default function TicketSystem({ sacRequestId, currentUserId, currentUserEmail, currentUserDisplayName, canDelete = false }: TicketSystemProps) {
  const { isVendas } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getAuthorLabel = (ticket: Ticket): string => {
    if (ticket.author_name && ticket.author_name.trim()) return ticket.author_name.trim();
    if (!ticket.author_email) return 'Admin';
    const prefix = ticket.author_email.split('@')[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  };

  useEffect(() => {
    fetchTickets();
  }, [sacRequestId]);

  const fetchTickets = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('sac_request_id', sacRequestId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast.error('Erro ao carregar tickets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setIsSending(true);
    try {
      const { data: newTicket, error } = await supabase.from('tickets').insert({
        sac_request_id: sacRequestId,
        created_by: currentUserId,
        message: newMessage.trim(),
        is_internal: true,
        author_email: currentUserEmail || null,
        author_name: currentUserDisplayName || null,
      }).select().single();

      if (error) throw error;
      
      console.log('Ticket inserted, fetching request data for notification...', sacRequestId);
      
      // Fetch full request context to ensure the Edge Function has everything it needs
      const { data: sacData } = await supabase
        .from('sac_requests')
        .select('protocol, company_name, complaint_type, complaint_subtype')
        .eq('id', sacRequestId)
        .maybeSingle();

      // Trigger internal notification if enabled
      try {
        await supabase.functions.invoke('notify-internal-ticket', {
          body: { 
            ticket: newTicket,
            sac_request: sacData // Pass the full data directly to avoid potential Edge Function RLS issues
          }
        });
      } catch (notifyError) {
        console.error('Notification failed:', notifyError);
      }


      setNewMessage('');
      toast.success('Mensagem enviada');
      fetchTickets();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Erro ao enviar mensagem');
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (ticketId: string) => {
    setDeletingId(ticketId);
    try {
      const { error } = await supabase.from('tickets').delete().eq('id', ticketId);
      if (error) throw error;
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      toast.success('Mensagem excluída');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir mensagem');
    } finally {
      setDeletingId(null);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Tickets Internos</h3>
          <Badge variant="secondary">{tickets.length}</Badge>
        </div>
        <div className="bg-primary/10 border border-primary/20 rounded-md p-2 flex items-start gap-2">
          <div className="bg-primary/20 p-1 rounded-full mt-0.5">
            <Mail className="h-3 w-3 text-primary" />
          </div>
          <p className="text-[11px] text-primary leading-tight font-medium">
            AVISO: Ao enviar um novo ticket interno, a Diretoria e a Gerência serão informadas via e-mail.
          </p>
        </div>
      </div>

      {/* Messages List */}
      <ScrollArea className="h-[300px] rounded-lg border bg-muted/30 p-4">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2" />
            <p className="text-sm">Nenhum ticket ainda</p>
            <p className="text-xs">Adicione uma anotação interna</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <Card key={ticket.id} className="bg-card">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {getAuthorLabel(ticket)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(ticket.created_at)}
                        </span>
                        {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
                              disabled={deletingId === ticket.id}
                            >
                              {deletingId === ticket.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(ticket.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{ticket.message}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* New Message Input */}
      {!isVendas && (
      <div className="space-y-2">
        <Label htmlFor="new-ticket-message" className="text-sm text-muted-foreground">
          Nova anotação interna
        </Label>
        <div className="flex gap-2">
          <Textarea
            id="new-ticket-message"
            placeholder="Escreva uma anotação interna sobre esta solicitação..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="min-h-[80px] resize-none"
            maxLength={1000}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {newMessage.length}/1000 caracteres
          </span>
          <Button
            onClick={handleSendMessage}
            disabled={isSending || !newMessage.trim()}
            size="sm"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
