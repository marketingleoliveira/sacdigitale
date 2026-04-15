import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Clock, FileText, Download } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type SACRequest = Database['public']['Tables']['sac_requests']['Row'];

interface MonthlyStats {
  month: string;
  monthLabel: string;
  total: number;
  reclamacoes: number;
  sugestoes: number;
  elogios: number;
  duvidas: number;
  pendentes: number;
  emAndamento: number;
  resolvidos: number;
  procedentes: number;
  improcedentes: number;
  naoAvaliados: number;
}

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function groupByMonth(requests: SACRequest[]): Record<string, SACRequest[]> {
  const grouped: Record<string, SACRequest[]> = {};
  requests.forEach((r) => {
    const date = new Date(r.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });
  return grouped;
}

function getMonthlyStats(grouped: Record<string, SACRequest[]>): MonthlyStats[] {
  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => {
      const [year, month] = key.split('-');
      const monthIndex = parseInt(month) - 1;
      const reclamacoes = items.filter((r) => r.contact_type === 'reclamacao');

      return {
        month: key,
        monthLabel: `${monthNames[monthIndex]} ${year}`,
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
      };
    });
}

const contactTypeLabels: Record<string, string> = {
  reclamacao: 'Reclamação',
  sugestao: 'Sugestão',
  elogio: 'Elogio',
  duvida: 'Dúvida',
};

const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  resolvido: 'Resolvido',
};

function exportMonthCSV(monthKey: string, monthLabel: string, items: SACRequest[], stats: MonthlyStats) {
  const lines: string[] = [];
  
  // Header summary
  lines.push(`Relatório SAC - ${monthLabel}`);
  lines.push('');
  lines.push('RESUMO');
  lines.push(`Total de Solicitações;${stats.total}`);
  lines.push(`Reclamações;${stats.reclamacoes}`);
  lines.push(`Sugestões;${stats.sugestoes}`);
  lines.push(`Elogios;${stats.elogios}`);
  lines.push(`Dúvidas;${stats.duvidas}`);
  lines.push('');
  lines.push('STATUS');
  lines.push(`Pendentes;${stats.pendentes}`);
  lines.push(`Em Andamento;${stats.emAndamento}`);
  lines.push(`Resolvidos;${stats.resolvidos}`);
  lines.push('');
  if (stats.reclamacoes > 0) {
    lines.push('PROCEDÊNCIA DAS RECLAMAÇÕES');
    lines.push(`Procedentes;${stats.procedentes}`);
    lines.push(`Improcedentes;${stats.improcedentes}`);
    lines.push(`Não Avaliados;${stats.naoAvaliados}`);
    lines.push('');
  }
  
  // Detail table
  lines.push('DETALHAMENTO');
  lines.push('Protocolo;Tipo;Nome;E-mail;Telefone;Nº Pedido;Assunto;Mensagem;Status;Procedência;Data');
  
  items.forEach((r) => {
    const escape = (v: string | null) => {
      if (!v) return '';
      return `"${v.replace(/"/g, '""')}"`;
    };
    lines.push([
      r.protocol,
      contactTypeLabels[r.contact_type] || r.contact_type,
      escape(r.name),
      r.email,
      r.phone || '',
      r.order_number || '',
      escape(r.subject),
      escape(r.message),
      statusLabels[r.status] || r.status,
      r.procedencia || '',
      new Date(r.created_at).toLocaleString('pt-BR'),
    ].join(';'));
  });

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-sac-${monthLabel.replace(/\s/g, '-').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Relatório de ${monthLabel} exportado!`);
}

export default function MonthlyReports() {
  const [requests, setRequests] = useState<SACRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchRequests();
  }, []);

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

  const grouped = groupByMonth(requests);
  const monthlyStats = getMonthlyStats(grouped);

  // Auto-open the first (most recent) month
  useEffect(() => {
    if (monthlyStats.length > 0 && Object.keys(openMonths).length === 0) {
      setOpenMonths({ [monthlyStats[0].month]: true });
    }
  }, [monthlyStats.length]);

  const toggleMonth = (month: string) => {
    setOpenMonths((prev) => ({ ...prev, [month]: !prev[month] }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (monthlyStats.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhuma solicitação encontrada para gerar relatórios.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {monthlyStats.map((stats) => (
        <Collapsible
          key={stats.month}
          open={openMonths[stats.month] || false}
          onOpenChange={() => toggleMonth(stats.month)}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{stats.monthLabel}</CardTitle>
                    <Badge variant="secondary">{stats.total} solicitações</Badge>
                  </div>
                  {openMonths[stats.month] ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-0 space-y-6">
                {/* Por Tipo */}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    Por Tipo de Contato
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Reclamações" value={stats.reclamacoes} color="text-red-600" icon={<AlertTriangle className="h-4 w-4" />} />
                    <StatCard label="Sugestões" value={stats.sugestoes} color="text-amber-600" />
                    <StatCard label="Elogios" value={stats.elogios} color="text-green-600" />
                    <StatCard label="Dúvidas" value={stats.duvidas} color="text-blue-600" />
                  </div>
                </div>

                {/* Por Status */}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    Por Status
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Pendentes" value={stats.pendentes} color="text-yellow-600" icon={<Clock className="h-4 w-4" />} />
                    <StatCard label="Em Andamento" value={stats.emAndamento} color="text-blue-600" />
                    <StatCard label="Resolvidos" value={stats.resolvidos} color="text-green-600" icon={<CheckCircle className="h-4 w-4" />} />
                  </div>
                </div>

                {/* Procedência (apenas reclamações) */}
                {stats.reclamacoes > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                      Procedência das Reclamações
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <StatCard label="Procedentes" value={stats.procedentes} color="text-green-600" icon={<CheckCircle className="h-4 w-4" />} />
                      <StatCard label="Improcedentes" value={stats.improcedentes} color="text-red-600" icon={<XCircle className="h-4 w-4" />} />
                      <StatCard label="Não Avaliados" value={stats.naoAvaliados} color="text-muted-foreground" />
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className={color}>{icon}</span>}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
