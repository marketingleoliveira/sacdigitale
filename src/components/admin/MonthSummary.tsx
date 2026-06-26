import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Loader2,
  AlertTriangle,
  MessageSquare,
  ThumbsUp,
  HelpCircle,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  BarChart3,
  CalendarDays,
  Crown,
  Briefcase,
  ShieldCheck,
  Users,
  Mail,
  User,
  Circle,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type SACRequest = Database['public']['Tables']['sac_requests']['Row'];

type StaffRole = 'admin' | 'desenvolvedor' | 'qualidade' | 'gerencia';

interface StaffUser {
  id: string;
  user_id: string;
  role: StaffRole;
  created_at: string;
  email: string | null;
}


const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ROLE_CONFIG: Record<StaffRole, { label: string; description: string; icon: React.ReactNode; badge: string; gradient: string; rank: number }> = {
  admin: {
    label: 'Desenvolvimento',
    description: 'Equipe de desenvolvimento e suporte técnico',
    icon: <Crown className="h-4 w-4" />,
    badge: 'Desenvolvedor',
    gradient: 'bg-gradient-to-r from-primary/20 to-primary/5 border-primary/30',
    rank: 1,
  },
  desenvolvedor: {
    label: 'Desenvolvimento',
    description: 'Equipe de desenvolvimento e suporte técnico',
    icon: <Crown className="h-4 w-4" />,
    badge: 'Desenvolvedor',
    gradient: 'bg-gradient-to-r from-primary/20 to-primary/5 border-primary/30',
    rank: 1,
  },
  gerencia: {
    label: 'Gerência',
    description: 'Gestão de usuários e supervisão geral',
    icon: <Briefcase className="h-4 w-4" />,
    badge: 'Gerência',
    gradient: 'bg-gradient-to-r from-amber-500/10 to-amber-500/5 border-amber-500/30',
    rank: 2,
  },
  qualidade: {
    label: 'Qualidade',
    description: 'Operação de atendimento e qualidade',
    icon: <ShieldCheck className="h-4 w-4" />,
    badge: 'Qualidade',
    gradient: 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border-emerald-500/30',
    rank: 3,
  },
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Desenvolvedor',
  desenvolvedor: 'Desenvolvedor',
  qualidade: 'Qualidade',
  gerencia: 'Gerência',
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  desenvolvedor: 'bg-purple-100 text-purple-700 border-purple-200',
  qualidade: 'bg-blue-100 text-blue-700 border-blue-200',
  gerencia: 'bg-amber-100 text-amber-700 border-amber-200',
};

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

export default function MonthSummary() {
  const [requests, setRequests] = useState<SACRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const { data: reqs } = await supabase
        .from('sac_requests')
        .select('*')
        .order('created_at', { ascending: false });
      setRequests(reqs || []);
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoadingUsers(true);
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
        const staff = (result.users as StaffUser[]).filter((u) =>
          ['desenvolvedor', 'qualidade', 'gerencia'].includes(u.role)
        );
        setStaffUsers(staff);
      } catch (error) {
        console.error('Error fetching staff users:', error);
      } finally {
        setIsLoadingUsers(false);
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthLabel = `${monthNames[month]} ${year}`;
    const items = requests.filter((r) => {
      const d = new Date(r.created_at);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const reclamacoes = items.filter((r) => r.contact_type === 'reclamacao');
    const typeCount: Record<string, number> = {};
    reclamacoes.forEach((r) => {
      const t = (r as any).complaint_type || 'Não classificada';
      typeCount[t] = (typeCount[t] || 0) + 1;
    });
    const ranking = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);

    const today = new Date().toDateString();
    const hoje = items.filter((r) => new Date(r.created_at).toDateString() === today).length;

    return {
      monthLabel,
      total: items.length,
      reclamacoes: reclamacoes.length,
      sugestoes: items.filter((r) => r.contact_type === 'sugestao').length,
      elogios: items.filter((r) => r.contact_type === 'elogio').length,
      duvidas: items.filter((r) => r.contact_type === 'duvida').length,
      pendentes: items.filter((r) => r.status === 'pendente').length,
      emAndamento: items.filter((r) => r.status === 'em_andamento').length,
      resolvidos: items.filter((r) => r.status === 'resolvido').length,
      procedentes: reclamacoes.filter((r) => r.procedencia === 'procedente').length,
      improcedentes: reclamacoes.filter((r) => r.procedencia === 'improcedente').length,
      naoAvaliados: reclamacoes.filter((r) => !r.procedencia).length,
      ranking,
      hoje,
    };
  }, [requests]);

  const usersByRole = useMemo(() => {
    const groups: Record<StaffRole, StaffUser[]> = {
      admin: [],
      desenvolvedor: [],
      qualidade: [],
      gerencia: [],
    };
    staffUsers.forEach((u) => {
      if (u.role in groups) groups[u.role].push(u);
    });
    return groups;
  }, [staffUsers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const resolutionRate = summary.total
    ? ((summary.resolvidos / summary.total) * 100).toFixed(0)
    : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold capitalize">{summary.monthLabel}</h2>
            <p className="text-sm text-muted-foreground">Resumo do mês atual em tempo real</p>
          </div>
        </div>
        <Badge variant="secondary" className="text-sm">
          {summary.hoje} {summary.hoje === 1 ? 'nova solicitação hoje' : 'novas solicitações hoje'}
        </Badge>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total no mês" value={summary.total} accent="text-primary" icon={<BarChart3 className="h-4 w-4" />} />
        <KPI label="Pendentes" value={summary.pendentes} accent="text-yellow-600" icon={<Clock className="h-4 w-4" />} />
        <KPI label="Em andamento" value={summary.emAndamento} accent="text-blue-600" icon={<TrendingUp className="h-4 w-4" />} />
        <KPI label="Resolvidos" value={summary.resolvidos} accent="text-green-600" icon={<CheckCircle className="h-4 w-4" />} sub={`${resolutionRate}% do total`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por tipo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por tipo de contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TypeBar label="Reclamações" value={summary.reclamacoes} total={summary.total} color="bg-red-500" icon={<AlertTriangle className="h-4 w-4 text-red-600" />} />
            <TypeBar label="Sugestões" value={summary.sugestoes} total={summary.total} color="bg-amber-500" icon={<MessageSquare className="h-4 w-4 text-amber-600" />} />
            <TypeBar label="Elogios" value={summary.elogios} total={summary.total} color="bg-green-500" icon={<ThumbsUp className="h-4 w-4 text-green-600" />} />
            <TypeBar label="Dúvidas" value={summary.duvidas} total={summary.total} color="bg-blue-500" icon={<HelpCircle className="h-4 w-4 text-blue-600" />} />
          </CardContent>
        </Card>

        {/* Procedência */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Procedência das reclamações</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.reclamacoes === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma reclamação registrada neste mês.</p>
            ) : (
              <div className="space-y-3">
                <TypeBar label="Procedentes" value={summary.procedentes} total={summary.reclamacoes} color="bg-green-500" icon={<CheckCircle className="h-4 w-4 text-green-600" />} />
                <TypeBar label="Improcedentes" value={summary.improcedentes} total={summary.reclamacoes} color="bg-red-500" icon={<XCircle className="h-4 w-4 text-red-600" />} />
                <TypeBar label="Não avaliadas" value={summary.naoAvaliados} total={summary.reclamacoes} color="bg-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top reclamações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Reclamações mais frequentes no mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem reclamações classificadas neste mês.</p>
          ) : (
            <div className="space-y-2">
              {summary.ranking.slice(0, 5).map(([type, count], i) => {
                const pct = summary.reclamacoes ? (count / summary.reclamacoes) * 100 : 0;
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        <span className="text-muted-foreground mr-2">#{i + 1}</span>
                        {type}
                      </span>
                      <span className="text-muted-foreground">
                        <strong className="text-foreground">{count}</strong> ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contas no sistema */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Contas no sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : staffUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma conta cadastrada.</p>
          ) : (
            <>
              <RoleSection role="desenvolvedor" users={[...usersByRole.admin, ...usersByRole.desenvolvedor]} />
              <RoleSection role="gerencia" users={usersByRole.gerencia} />
              <RoleSection role="qualidade" users={usersByRole.qualidade} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RoleSection({ role, users }: { role: StaffRole; users: StaffUser[] }) {
  const config = ROLE_CONFIG[role];
  return (
    <div className={`rounded-xl border p-5 ${config.gradient}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary">{config.icon}</span>
        <h3 className="font-semibold text-foreground">{config.label}</h3>
        <Badge variant="outline" className="text-xs ml-2">
          {users.length}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{config.description}</p>
      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário neste cargo.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({ user }: { user: StaffUser }) {
  const email = user.email || '';
  const name = email.split('@')[0] || 'Usuário';
  const initials = name
    .split(/[._-]/)
    .map((part) => part[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col items-center text-center gap-3 shadow-sm">
      <Avatar className="h-14 w-14 border-2 border-background">
        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
          {initials || <User className="h-5 w-5" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 w-full">
        <p className="font-medium text-sm truncate" title={name}>{name}</p>
        <p className="text-xs text-muted-foreground truncate" title={email}>{email}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-xs ${ROLE_BADGE_STYLES[user.role] || ''}`}>
          {ROLE_LABELS[user.role] || user.role}
        </Badge>
        <div className="flex items-center gap-1 text-muted-foreground" title="Ativo">
          <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
        </div>
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <Mail className="h-4 w-4" />
        <User className="h-4 w-4" />
      </div>
    </div>
  );
}

function KPI({ label, value, accent, icon, sub }: { label: string; value: number; accent: string; icon?: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          {icon && <span className={accent}>{icon}</span>}
          {label}
        </div>
        <p className={`text-3xl font-bold ${accent}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function TypeBar({ label, value, total, color, icon }: { label: string; value: number; total: number; color: string; icon?: React.ReactNode }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          {icon}
          {label}
        </span>
        <span className="text-muted-foreground">
          <strong className="text-foreground">{value}</strong> ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-muted rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
