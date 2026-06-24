import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Clock, FileText, Download } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoBlue from '@/assets/logo-blue.png';
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

async function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

async function exportMonthPDF(monthKey: string, monthLabel: string, items: SACRequest[], stats: MonthlyStats) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryColor: [number, number, number] = [30, 64, 175]; // blue-700
  const darkColor: [number, number, number] = [15, 23, 42]; // slate-900
  const grayColor: [number, number, number] = [100, 116, 139]; // slate-500

  // Load logo
  const logoData = await loadImageAsBase64(logoBlue);

  // Header bar
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 36, 'F');

  // Logo
  if (logoData) {
    doc.addImage(logoData, 'PNG', 14, 6, 40, 24);
  }

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório SAC', pageWidth - 14, 16, { align: 'right' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(monthLabel, pageWidth - 14, 24, { align: 'right' });

  // Date generated
  doc.setFontSize(8);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 30, { align: 'right' });

  let y = 46;

  // Summary cards
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text('Resumo Geral', 14, y);
  y += 8;

  const summaryData = [
    ['Total de Solicitações', String(stats.total)],
    ['Reclamações', String(stats.reclamacoes)],
    ['Sugestões', String(stats.sugestoes)],
    ['Elogios', String(stats.elogios)],
    ['Dúvidas', String(stats.duvidas)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Quantidade']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: darkColor },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
    tableWidth: pageWidth - 28,
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Status section
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text('Status das Solicitações', 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['Status', 'Quantidade']],
    body: [
      ['Pendentes', String(stats.pendentes)],
      ['Em Andamento', String(stats.emAndamento)],
      ['Resolvidos', String(stats.resolvidos)],
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: darkColor },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
    tableWidth: pageWidth - 28,
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Procedência (if reclamações exist)
  if (stats.reclamacoes > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text('Procedência das Reclamações', 14, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Procedência', 'Quantidade']],
      body: [
        ['Procedentes', String(stats.procedentes)],
        ['Improcedentes', String(stats.improcedentes)],
        ['Não Avaliados', String(stats.naoAvaliados)],
      ],
      theme: 'grid',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 10, textColor: darkColor },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
      tableWidth: pageWidth - 28,
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Detail table
  doc.addPage();

  // Mini header on new page
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Detalhamento — ${monthLabel}`, 14, 10);

  const detailBody = items.map((r) => [
    r.protocol,
    contactTypeLabels[r.contact_type] || r.contact_type,
    r.contact_type === 'reclamacao' ? ((r as any).complaint_type || '—') : '—',
    r.name,
    r.email,
    statusLabels[r.status] || r.status,
    r.procedencia || '—',
    new Date(r.created_at).toLocaleDateString('pt-BR'),
  ]);

  autoTable(doc, {
    startY: 20,
    head: [['Protocolo', 'Tipo', 'Tipo Reclamação', 'Nome', 'E-mail', 'Status', 'Procedência', 'Data']],
    body: detailBody,
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: darkColor },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 10, right: 10 },
    styles: { cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 20 },
      2: { cellWidth: 26 },
      3: { cellWidth: 26 },
      4: { cellWidth: 34 },
      5: { cellWidth: 20 },
      6: { cellWidth: 22 },
      7: { cellWidth: 20 },
    },
  });

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text('SAC Digitale Têxtil — Documento gerado automaticamente', 14, pageHeight - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  doc.save(`relatorio-sac-${monthLabel.replace(/\s/g, '-').toLowerCase()}.pdf`);
  toast.success(`Relatório PDF de ${monthLabel} exportado!`);
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

                {/* Export Button */}
                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportMonthPDF(stats.month, stats.monthLabel, grouped[stats.month] || [], stats);
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Relatório PDF
                  </Button>
                </div>
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
