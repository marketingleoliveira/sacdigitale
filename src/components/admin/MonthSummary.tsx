import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type SACRequest = Database['public']['Tables']['sac_requests']['Row'];

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function MonthSummary() {
  const [requests, setRequests] = useState<SACRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roleCounts, setRoleCounts] = useState<{ desenvolvedor: number; gerencia: number; qualidade: number }>({
    desenvolvedor: 0,
    gerencia: 0,
    qualidade: 0,
  });

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const [{ data: reqs }, { data: roles }] = await Promise.all([
        supabase.from('sac_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('role'),
      ]);
      setRequests(reqs || []);
      const counts = { desenvolvedor: 0, gerencia: 0, qualidade: 0 };
      (roles || []).forEach((r: any) => {
        if (r.role in counts) counts[r.role as keyof typeof counts]++;
      });
      setRoleCounts(counts);
      setIsLoading(false);
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

      {/* Hierarquia de cargos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hierarquia de cargos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <HierarchyNode
              rank={1}
              title="Desenvolvedor"
              count={roleCounts.desenvolvedor}
              icon={<Crown className="h-5 w-5" />}
              gradient="from-amber-500 to-amber-700"
              description="Super admin — acesso total"
            />
            <div className="w-px h-6 bg-border" />
            <HierarchyNode
              rank={2}
              title="Gerência"
              count={roleCounts.gerencia}
              icon={<Briefcase className="h-5 w-5" />}
              gradient="from-blue-500 to-blue-700"
              description="Acesso completo + gestão de usuários"
            />
            <div className="w-px h-6 bg-border" />
            <HierarchyNode
              rank={3}
              title="Qualidade"
              count={roleCounts.qualidade}
              icon={<ShieldCheck className="h-5 w-5" />}
              gradient="from-emerald-500 to-emerald-700"
              description="Operação sem exclusões"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HierarchyNode({
  rank,
  title,
  count,
  icon,
  gradient,
  description,
}: {
  rank: number;
  title: string;
  count: number;
  icon: React.ReactNode;
  gradient: string;
  description: string;
}) {
  return (
    <div className={`w-full max-w-md rounded-lg border bg-gradient-to-r ${gradient} text-white p-4 shadow-sm`}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
          {rank}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 font-semibold">
            {icon}
            {title}
          </div>
          <p className="text-xs text-white/80">{description}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold leading-none">{count}</p>
          <p className="text-[10px] text-white/80 uppercase tracking-wide">{count === 1 ? 'usuário' : 'usuários'}</p>
        </div>
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