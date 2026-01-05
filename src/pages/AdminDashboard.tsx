import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
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
} from 'lucide-react';
import UserManagement from '@/components/admin/UserManagement';
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
  const [requests, setRequests] = useState<SACRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<SACRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<SACRequest | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
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

    setFilteredRequests(filtered);
  }, [requests, searchTerm, typeFilter, statusFilter]);

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
          <div>
            <h1 className="text-xl font-bold text-foreground">Painel SAC</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

                  <div className="flex gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger id="status-filter" className="flex-1">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="resolvido">Resolvido</SelectItem>
                      </SelectContent>
                    </Select>
                    {(searchTerm || typeFilter !== 'all' || statusFilter !== 'all') && (
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
                          <TableHead>Nome</TableHead>
                          <TableHead>E-mail</TableHead>
                          <TableHead>Status</TableHead>
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
                    <Label className="text-muted-foreground text-xs">Nome</Label>
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

                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={
                        (statusConfig[selectedRequest.status] || statusConfig.pendente).color
                      }
                    >
                      {(statusConfig[selectedRequest.status] || statusConfig.pendente).label}
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Mensagem</Label>
                  <div className="mt-1 p-4 bg-muted rounded-lg">
                    <p className="whitespace-pre-wrap">{selectedRequest.message}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
