import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, UserPlus, Trash2, Users, Shield, KeyRound, Briefcase } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

type StaffRole = 'admin' | 'desenvolvedor' | 'qualidade' | 'gerencia' | 'vendas';

interface AdminUser {
  id: string;
  user_id: string;
  role: StaffRole | 'user';
  created_at: string;
  email?: string | null;
  display_name?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Desenvolvedor',
  desenvolvedor: 'Desenvolvedor',
  qualidade: 'Qualidade',
  gerencia: 'Gerência',
  vendas: 'Vendas',
};

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  desenvolvedor: 'bg-purple-100 text-purple-700 border-purple-200',
  qualidade: 'bg-blue-100 text-blue-700 border-blue-200',
  gerencia: 'bg-amber-100 text-amber-700 border-amber-200',
  vendas: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const emailSchema = z.string().email('E-mail inválido').max(255, 'E-mail muito longo');

const getFreshAccessToken = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const expiresAt = sessionData.session?.expires_at ?? 0;
  const shouldRefresh = expiresAt * 1000 < Date.now() + 60_000;

  if (!sessionData.session || shouldRefresh) {
    const { data: refreshedData, error } = await supabase.auth.refreshSession();
    if (error || !refreshedData.session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    return refreshedData.session.access_token;
  }

  return sessionData.session.access_token;
};

export default function UserManagement() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('qualidade');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<AdminUser | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAdminUsers();
  }, []);

  const fetchAdminUsers = async () => {
    setIsLoading(true);
    try {
      const token = await getFreshAccessToken();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'list' }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao listar');
      const staff = (result.users as AdminUser[]).filter((u) =>
        ['admin', 'desenvolvedor', 'qualidade', 'gerencia', 'vendas'].includes(u.role)
      );
      setAdminUsers(staff);
    } catch (error) {
      console.error('Error fetching admin users:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os administradores.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async () => {
    setEmailError('');
    
    const emailValidation = emailSchema.safeParse(newEmail);
    if (!emailValidation.success) {
      setEmailError(emailValidation.error.errors[0].message);
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Erro',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    if (newRole === 'vendas' && !newDisplayName.trim()) {
      toast({
        title: 'Erro',
        description: 'Informe o nome do vendedor.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getFreshAccessToken();

      // Call edge function to create admin user (doesn't affect current session)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-admin-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: newEmail,
            password: newPassword,
            role: newRole,
            display_name: newDisplayName.trim() || null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar administrador');
      }

      toast({
        title: 'Sucesso',
        description: 'Administrador adicionado com sucesso!',
      });

      setNewEmail('');
      setNewPassword('');
      setNewRole('qualidade');
      setNewDisplayName('');
      setIsAddDialogOpen(false);
      fetchAdminUsers();
    } catch (error) {
      console.error('Error adding admin:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível adicionar o administrador.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', userToDelete.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Administrador removido com sucesso!',
      });

      setUserToDelete(null);
      setIsDeleteDialogOpen(false);
      fetchAdminUsers();
    } catch (error) {
      console.error('Error deleting admin:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o administrador.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!userToEdit) return;
    if (editPassword.length < 6) {
      toast({
        title: 'Erro',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const token = await getFreshAccessToken();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'update_password',
            user_id: userToEdit.user_id,
            password: editPassword,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao atualizar senha');

      toast({
        title: 'Sucesso',
        description: 'Senha atualizada com sucesso!',
      });
      setEditPassword('');
      setUserToEdit(null);
      setIsPasswordDialogOpen(false);
    } catch (error) {
      console.error('Error updating password:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar a senha.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeRole = async (admin: AdminUser, newRoleValue: StaffRole) => {
    if (admin.role === newRoleValue) return;
    if (newRoleValue === 'vendas' && !admin.display_name?.trim()) {
      const name = window.prompt('Informe o nome do vendedor:');
      if (!name || !name.trim()) {
        toast({ title: 'Cancelado', description: 'Nome é obrigatório para Vendas.' });
        return;
      }
      admin = { ...admin, display_name: name.trim() };
    }
    setUpdatingRoleFor(admin.user_id);
    try {
      const token = await getFreshAccessToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-admin-users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'update_role',
            user_id: admin.user_id,
            role: newRoleValue,
            display_name: admin.display_name ?? null,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao atualizar cargo');
      toast({ title: 'Sucesso', description: 'Cargo atualizado com sucesso!' });
      fetchAdminUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar o cargo.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRoleFor(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Administradores ({adminUsers.length})
          </CardTitle>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : adminUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum administrador cadastrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Data de Criação</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminUsers.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="text-sm">
                      {admin.email ?? (
                        <span className="font-mono text-muted-foreground">
                          {admin.user_id.slice(0, 8)}...
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {admin.display_name || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={admin.role}
                          disabled={updatingRoleFor === admin.user_id}
                          onValueChange={(v) => handleChangeRole(admin, v as StaffRole)}
                        >
                          <SelectTrigger className="w-[170px] h-8">
                            <SelectValue>
                              <Badge variant="outline" className={ROLE_STYLES[admin.role] || ''}>
                                <Shield className="h-3 w-3 mr-1" />
                                {ROLE_LABELS[admin.role] || admin.role}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="desenvolvedor">Desenvolvedor</SelectItem>
                            <SelectItem value="qualidade">Qualidade</SelectItem>
                            <SelectItem value="gerencia">Gerência</SelectItem>
                            <SelectItem value="vendas">Vendas</SelectItem>
                          </SelectContent>
                        </Select>
                        {updatingRoleFor === admin.user_id && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(admin.created_at)}
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => {
                          setUserToEdit(admin);
                          setEditPassword('');
                          setIsPasswordDialogOpen(true);
                        }}
                        title="Alterar senha"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setUserToDelete(admin);
                          setIsDeleteDialogOpen(true);
                        }}
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Administrador</DialogTitle>
            <DialogDescription>
              Crie uma nova conta de administrador para acessar o painel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@exemplo.com"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailError('');
                }}
              />
              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">
                <Briefcase className="h-3 w-3 inline mr-1" />
                Cargo
              </Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as StaffRole)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desenvolvedor">Desenvolvedor — acesso total</SelectItem>
                  <SelectItem value="qualidade">Qualidade — sem excluir e sem usuários</SelectItem>
                  <SelectItem value="gerencia">Gerência — sem excluir, com usuários</SelectItem>
                  <SelectItem value="vendas">Vendas — apenas solicitações e tickets internos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="display-name">
                Nome {newRole === 'vendas' && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="display-name"
                placeholder={newRole === 'vendas' ? 'Ex.: João Vendedor' : 'Opcional'}
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Aparece nos tickets internos para identificar quem escreveu.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleAddUser} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              {userToEdit?.email
                ? `Defina uma nova senha para ${userToEdit.email}.`
                : 'Defina uma nova senha para este administrador.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPasswordDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleChangePassword} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover administrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover o acesso administrativo deste usuário. Ele não poderá mais acessar o painel de administração.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
