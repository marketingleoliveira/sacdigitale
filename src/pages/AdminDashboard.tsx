import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useInactivityLogout } from '@/hooks/useInactivityLogout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  LogOut,
  Search,
  Filter,
  Eye,
  AlertTriangle,
  MessageSquare,
  ThumbsUp,
  HelpCircle,
  X,
  Inbox,
  Users,
  CheckCircle,
  XCircle,
  Paperclip,
  FileText,
  Image,
  Video,
  ExternalLink,
} from 'lucide-react';
import UserManagement from '@/components/admin/UserManagement';
import TicketSystem from '@/components/admin/TicketSystem';
import LaudosUpload from '@/components/admin/LaudosUpload';
import InactivityWarning from '@/components/admin/InactivityWarning';
import MonthlyReports from '@/components/admin/MonthlyReports';
import logoBlue from '@/assets/logo-blue.png';
import type { Database } from '@/integrations/supabase/types';

type SACRequest = Database['public']['Tables']['sac_requests']['Row'];
type ContactType = Database['public']['Enums']['contact_type'];

const contactTypeConfig: Record<ContactType, { label: string; icon: typeof AlertTriangle; color: string }> = {
  reclamacao: { label: 'Reclamação', icon: AlertTriangle, color: 'bg-red-100 text-red-700 border-red-200' },
  sugestao: { label: 'Sugestão', icon: MessageSquare, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  elogio: { label: 'Elogio', icon: ThumbsUp, color: 'bg-green-100 text-green-700 border-green-200' },
  duvida: { label: 'Dúvida', icon: HelpCircle, color: 'bg-blue-100 text-blue-700 border-blue-200' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  em_andamento: { label: 'Em Andamento', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  resolvido: { label: 'Resolvido', color: 'bg-green-100 text-green-700 border-green-200' },
};

export default function AdminDashboard() {
  const { user, isLoading: authLoading, isAdmin, signOut } = useAuth();
  const { showWarning, remainingSeconds, dismissWarning, logout } = useInactivityLogout({
    timeoutMinutes: 10,
    warningMinutes: 5,
  });
  const [requests, setRequests] = useState<SACRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<SACRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<SACRequest | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingProcedencia, setIsUpdatingProcedencia] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [procedenciaFilter, setProcedenciaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (user && isAdmin) {
      fetchRequests();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    let filtered = [...requests];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.email.toLowerCase().includes(term) ||
          r.protocol.toLowerCase().includes(term) ||
          r.message.toLowerCase().includes(term) ||
          (r.order_number && r.order_number.toLowerCase().includes(term))
      );
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter((r) => r.contact_type === typeFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    if (procedenciaFilter !== 'all') {
      if (procedenciaFilter === 'nao_avaliado') {
        filtered = filtered.filter((r) => r.contact_type === 'reclamacao' && !r.procedencia);
      } else {
        filtered = filtered.filter((r) => r.procedencia === procedenciaFilter);
      }
    }

    setFilteredRequests(filtered);
  }, [requests, searchTerm, typeFilter, statusFilter, procedenciaFilter]);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('sac_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
    setProcedenciaFilter('all');
  };

  const updateRequestStatus = async (requestId: string, newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('sac_requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (error) throw error;

      // Update local state
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: newStatus } : r))
      );
      
      if (selectedRequest?.id === requestId) {
        setSelectedRequest((prev) => prev ? { ...prev, status: newStatus } : null);
      }

      toast.success('Status atualizado com sucesso');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Erro ao atualizar status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const updateRequestProcedencia = async (requestId: string, procedencia: string | null) => {
    setIsUpdatingProcedencia(true);
    try {
      const { error } = await supabase
        .from('sac_requests')
        .update({ procedencia })
        .eq('id', requestId);

      if (error) throw error;

      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, procedencia } : r))
      );

      if (selectedRequest?.id === requestId) {
        setSelectedRequest((prev) => prev ? { ...prev, procedencia } : null);
      }

      toast.success('Procedência atualizada com sucesso');
    } catch (error) {
      console.error('Error updating procedencia:', error);
      toast.error('Erro ao atualizar procedência');
    } finally {
      setIsUpdatingProcedencia(false);
    }
  };

  const updateRequestLaudos = (requestId: string, laudos: string[]) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, laudos } : r))
    );

    if (selectedRequest?.id === requestId) {
      setSelectedRequest((prev) => prev ? { ...prev, laudos } : null);
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  const stats = {
    total: requests.length,
    pendente: requests.filter((r) => r.status === 'pendente').length,
    reclamacao: requests.filter((r) => r.contact_type === 'reclamacao').length,
    hoje: requests.filter((r) => {
      const today = new Date().toDateString();
      return new Date(r.created_at).toDateString() === today;
    }).length,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logoBlue} alt="Digitale Têxtil" className="h-10 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Painel SAC</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="requests" className="space-y-6">
          <TabsList>
            <TabsTrigger value="requests" className="gap-2">
              <Inbox className="h-4 w-4" />
              Solicitações
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.pendente}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Reclamações</p>
                  <p className="text-2xl font-bold text-red-600">{stats.reclamacao}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Hoje</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.hoje}</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="search" className="sr-only">Buscar</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Buscar por nome, e-mail, protocolo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="type-filter" className="sr-only">Tipo</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger id="type-filter">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os tipos</SelectItem>
                        <SelectItem value="reclamacao">Reclamação</SelectItem>
                        <SelectItem value="sugestao">Sugestão</SelectItem>
                        <SelectItem value="elogio">Elogio</SelectItem>
                        <SelectItem value="duvida">Dúvida</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="status-filter" className="sr-only">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger id="status-filter">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="resolvido">Resolvido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Select value={procedenciaFilter} onValueChange={setProcedenciaFilter}>
                      <SelectTrigger id="procedencia-filter" className="flex-1">
                        <SelectValue placeholder="Procedência" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas procedências</SelectItem>
                        <SelectItem value="procedente">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Procedente
                          </div>
                        </SelectItem>
                        <SelectItem value="improcedente">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            Improcedente
                          </div>
                        </SelectItem>
                        <SelectItem value="nao_avaliado">Não avaliado</SelectItem>
                      </SelectContent>
                    </Select>
                    {(searchTerm || typeFilter !== 'all' || statusFilter !== 'all' || procedenciaFilter !== 'all') && (
                      <Button variant="ghost" size="icon" onClick={clearFilters}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">
                  Solicitações ({filteredRequests.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredRequests.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {requests.length === 0
                      ? 'Nenhuma solicitação recebida ainda.'
                      : 'Nenhuma solicitação encontrada com os filtros aplicados.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                              <TableHead>Protocolo</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Empresa</TableHead>
                              <TableHead>E-mail</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Procedência</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead className="w-[80px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRequests.map((request) => {
                          const typeConf = contactTypeConfig[request.contact_type];
                          const statConf = statusConfig[request.status] || statusConfig.pendente;
                          const TypeIcon = typeConf.icon;

                          return (
                            <TableRow key={request.id}>
                              <TableCell className="font-mono text-sm">
                                {request.protocol}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={typeConf.color}>
                                  <TypeIcon className="h-3 w-3 mr-1" />
                                  {typeConf.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{request.name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {request.email}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statConf.color}>
                                  {statConf.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {request.contact_type === 'reclamacao' ? (
                                  request.procedencia === 'procedente' ? (
                                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Procedente
                                    </Badge>
                                  ) : request.procedencia === 'improcedente' ? (
                                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Improcedente
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )
                                ) : (
                                  <span className="text-muted-foreground text-sm">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {formatDate(request.created_at)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedRequest(request)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>
        </Tabs>
      </main>

      {/* Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedRequest && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={contactTypeConfig[selectedRequest.contact_type].color}
                  >
                    {contactTypeConfig[selectedRequest.contact_type].label}
                  </Badge>
                  <span className="font-mono text-sm text-muted-foreground">
                    {selectedRequest.protocol}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Recebido em {formatDate(selectedRequest.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Empresa</Label>
                    <p className="font-medium">{selectedRequest.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">E-mail</Label>
                    <p className="font-medium">{selectedRequest.email}</p>
                  </div>
                  {selectedRequest.phone && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Telefone</Label>
                      <p className="font-medium">{selectedRequest.phone}</p>
                    </div>
                  )}
                  {selectedRequest.order_number && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Nº do Pedido</Label>
                      <p className="font-medium">{selectedRequest.order_number}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Alterar Status</Label>
                    <div className="mt-1">
                      <Select
                        value={selectedRequest.status}
                        onValueChange={(value) => updateRequestStatus(selectedRequest.id, value)}
                        disabled={isUpdatingStatus}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-yellow-500" />
                              Pendente
                            </div>
                          </SelectItem>
                          <SelectItem value="em_andamento">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-500" />
                              Em Andamento
                            </div>
                          </SelectItem>
                          <SelectItem value="resolvido">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              Resolvido
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedRequest.contact_type === 'reclamacao' && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Alterar Procedência</Label>
                      <div className="mt-1">
                        <Select
                          value={selectedRequest.procedencia || ''}
                          onValueChange={(value) => updateRequestProcedencia(selectedRequest.id, value)}
                          disabled={isUpdatingProcedencia}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Selecionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="procedente">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                Procedente
                              </div>
                            </SelectItem>
                            <SelectItem value="improcedente">
                              <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-500" />
                                Improcedente
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Mensagem</Label>
                  <div className="mt-1 p-4 bg-muted rounded-lg">
                    <p className="whitespace-pre-wrap">{selectedRequest.message}</p>
                  </div>
                </div>

                {/* Attachments Preview */}
                {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      Anexos ({selectedRequest.attachments.length})
                    </Label>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                      {selectedRequest.attachments.map((url, index) => {
                        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
                        const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
                        const isPdf = /\.pdf$/i.test(url);
                        const fileName = url.split('/').pop() || `Arquivo ${index + 1}`;

                        return (
                          <div
                            key={index}
                            className="relative group border rounded-lg overflow-hidden bg-card"
                          >
                            {isImage ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                <div className="aspect-square">
                                  <img
                                    src={url}
                                    alt={`Anexo ${index + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ExternalLink className="h-6 w-6 text-white" />
                                </div>
                              </a>
                            ) : isVideo ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                <div className="aspect-square bg-muted flex flex-col items-center justify-center p-2">
                                  <Video className="h-8 w-8 text-muted-foreground mb-2" />
                                  <span className="text-xs text-muted-foreground text-center truncate w-full px-2">
                                    {fileName}
                                  </span>
                                </div>
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ExternalLink className="h-6 w-6 text-white" />
                                </div>
                              </a>
                            ) : isPdf ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                <div className="aspect-square bg-muted flex flex-col items-center justify-center p-2">
                                  <FileText className="h-8 w-8 text-red-500 mb-2" />
                                  <span className="text-xs text-muted-foreground text-center truncate w-full px-2">
                                    {fileName}
                                  </span>
                                </div>
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ExternalLink className="h-6 w-6 text-white" />
                                </div>
                              </a>
                            ) : (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                <div className="aspect-square bg-muted flex flex-col items-center justify-center p-2">
                                  <Image className="h-8 w-8 text-muted-foreground mb-2" />
                                  <span className="text-xs text-muted-foreground text-center truncate w-full px-2">
                                    {fileName}
                                  </span>
                                </div>
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ExternalLink className="h-6 w-6 text-white" />
                                </div>
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Laudos Section - Only for reclamacao */}
                {selectedRequest.contact_type === 'reclamacao' && (
                  <div className="pt-4 border-t">
                    <Label className="text-muted-foreground text-xs mb-2 block">
                      Laudos de Perícia
                    </Label>
                    <LaudosUpload
                      sacRequestId={selectedRequest.id}
                      existingLaudos={selectedRequest.laudos}
                      onLaudosChange={(laudos) => updateRequestLaudos(selectedRequest.id, laudos)}
                    />
                  </div>
                )}

                {/* Ticket System */}
                <div className="pt-4 border-t">
                  <TicketSystem
                    sacRequestId={selectedRequest.id}
                    currentUserId={user.id}
                    currentUserEmail={user.email}
                  />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <InactivityWarning
        open={showWarning}
        remainingSeconds={remainingSeconds}
        onDismiss={dismissWarning}
        onLogout={logout}
      />
    </div>
  );
}
