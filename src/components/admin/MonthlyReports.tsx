import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

function getMonthlyStats(requests: SACRequest[]): MonthlyStats[] {
  const grouped: Record<string, SACRequest[]> = {};

  requests.forEach((r) => {
    const date = new Date(r.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

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

  const monthlyStats = getMonthlyStats(requests);

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
