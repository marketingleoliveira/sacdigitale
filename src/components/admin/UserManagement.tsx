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
import { Loader2, UserPlus, Trash2, Users, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

interface AdminUser {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
  created_at: string;
  email?: string;
}

const emailSchema = z.string().email('E-mail inválido').max(255, 'E-mail muito longo');

export default function UserManagement() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchAdminUsers();
  }, []);

  const fetchAdminUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('role', 'admin')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdminUsers(data || []);
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

    setIsSubmitting(true);
    try {
      // Create user via signUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
        },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          toast({
            title: 'Erro',
            description: 'Este e-mail já está cadastrado.',
            variant: 'destructive',
          });
          return;
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Usuário não foi criado');
      }

      // Add admin role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: authData.user.id, role: 'admin' });

      if (roleError) throw roleError;

      toast({
        title: 'Sucesso',
        description: 'Administrador adicionado com sucesso!',
      });

      setNewEmail('');
      setNewPassword('');
      setIsAddDialogOpen(false);
      fetchAdminUsers();
    } catch (error) {
      console.error('Error adding admin:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o administrador.',
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
                  <TableHead>ID do Usuário</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Data de Criação</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminUsers.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-mono text-sm">
                      {admin.user_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(admin.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setUserToDelete(admin);
                          setIsDeleteDialogOpen(true);
                        }}
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
