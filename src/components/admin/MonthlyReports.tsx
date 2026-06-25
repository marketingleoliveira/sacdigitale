import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Clock, FileText, Download, BarChart3 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoWhite from '@/assets/logo-white.png';
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

// Estima a altura de uma tabela e garante que ela caiba inteira na página atual.
// Caso contrário, adiciona uma nova página e retorna o novo Y inicial.
function ensureTableFits(
  doc: jsPDF,
  startY: number,
  rowCount: number,
  options: { headerHeight?: number; rowHeight?: number; titleHeight?: number; topMargin?: number; bottomMargin?: number } = {}
): number {
  const headerHeight = options.headerHeight ?? 10;
  const rowHeight = options.rowHeight ?? 8;
  const titleHeight = options.titleHeight ?? 0;
  const topMargin = options.topMargin ?? 20;
  const bottomMargin = options.bottomMargin ?? 16;
  const pageHeight = doc.internal.pageSize.getHeight();
  const estimated = titleHeight + headerHeight + rowCount * rowHeight + 4;
  if (startY + estimated > pageHeight - bottomMargin) {
    doc.addPage();
    return topMargin;
  }
  return startY;
}

async function exportMonthPDF(monthKey: string, monthLabel: string, items: SACRequest[], stats: MonthlyStats) {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const blackColor: [number, number, number] = [0, 0, 0];
  const grayColor: [number, number, number] = [100, 100, 100];
  const lightGrayColor: [number, number, number] = [245, 245, 245];

  // Load logo
  const logoData = await loadImageAsBase64(logoWhite);

  // Header bar
  doc.setFillColor(...blackColor);
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
  y = ensureTableFits(doc, y, summaryData.length, { titleHeight: 14 });
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...blackColor);
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
    headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: blackColor },
    alternateRowStyles: { fillColor: lightGrayColor },
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
    tableWidth: pageWidth - 28,
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Status section
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...blackColor);
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
    headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: blackColor },
    alternateRowStyles: { fillColor: lightGrayColor },
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
    tableWidth: pageWidth - 28,
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Procedência (if reclamações exist)
  if (stats.reclamacoes > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...blackColor);
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
      headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 10, textColor: blackColor },
      alternateRowStyles: { fillColor: lightGrayColor },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
      tableWidth: pageWidth - 28,
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Detail table
  doc.addPage();

  // Mini header on new page
  doc.setFillColor(...blackColor);
  doc.rect(0, 0, pageWidth, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Detalhamento — ${monthLabel}`, 14, 10);

  const detailBody = items.map((r) => [
    r.protocol,
    contactTypeLabels[r.contact_type] || r.contact_type,
    r.contact_type === 'reclamacao' ? ((r as any).complaint_type || '—') : '—',
    r.order_number || '—',
    r.name,
    r.email,
    statusLabels[r.status] || r.status,
    r.procedencia || '—',
    new Date(r.created_at).toLocaleDateString('pt-BR'),
  ]);

  autoTable(doc, {
    startY: 20,
    head: [['Protocolo', 'Tipo', 'Tipo Reclamação', 'Pedido NF', 'Nome', 'E-mail', 'Status', 'Procedência', 'Data']],
    body: detailBody,
    theme: 'grid',
    headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: blackColor },
    alternateRowStyles: { fillColor: lightGrayColor },
    margin: { left: 10, right: 10 },
    styles: { cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 22 },
      2: { cellWidth: 36 },
      3: { cellWidth: 26 },
      4: { cellWidth: 38 },
      5: { cellWidth: 50 },
      6: { cellWidth: 24 },
      7: { cellWidth: 26 },
      8: { cellWidth: 22 },
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

function buildPeriodLabel(stats: MonthlyStats[]): string {
  const sorted = [...stats].sort((a, b) => a.month.localeCompare(b.month));
  if (sorted.length === 1) return sorted[0].monthLabel;
  return `${sorted[0].monthLabel} — ${sorted[sorted.length - 1].monthLabel}`;
}

async function exportConsolidatedPDF(selectedStats: MonthlyStats[], items: SACRequest[]) {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const blackColor: [number, number, number] = [0, 0, 0];
  const grayColor: [number, number, number] = [100, 100, 100];
  const lightGrayColor: [number, number, number] = [245, 245, 245];


  const periodLabel = buildPeriodLabel(selectedStats);
  const logoData = await loadImageAsBase64(logoWhite);

  // Header
  doc.setFillColor(...blackColor);
  doc.rect(0, 0, pageWidth, 36, 'F');
  if (logoData) doc.addImage(logoData, 'PNG', 14, 6, 40, 24);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório Consolidado SAC', pageWidth - 14, 16, { align: 'right' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(periodLabel, pageWidth - 14, 23, { align: 'right' });
  doc.setFontSize(8);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 30, { align: 'right' });

  let y = 46;

  // Totals
  const totals = selectedStats.reduce(
    (acc, s) => {
      acc.total += s.total;
      acc.reclamacoes += s.reclamacoes;
      acc.sugestoes += s.sugestoes;
      acc.elogios += s.elogios;
      acc.duvidas += s.duvidas;
      acc.pendentes += s.pendentes;
      acc.emAndamento += s.emAndamento;
      acc.resolvidos += s.resolvidos;
      acc.procedentes += s.procedentes;
      acc.improcedentes += s.improcedentes;
      acc.naoAvaliados += s.naoAvaliados;
      return acc;
    },
    { total: 0, reclamacoes: 0, sugestoes: 0, elogios: 0, duvidas: 0, pendentes: 0, emAndamento: 0, resolvidos: 0, procedentes: 0, improcedentes: 0, naoAvaliados: 0 }
  );

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...blackColor);
  doc.text('Visão Geral do Período', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Total', '%']],
    body: [
      ['Total de Solicitações', String(totals.total), '100%'],
      ['Reclamações', String(totals.reclamacoes), totals.total ? `${((totals.reclamacoes / totals.total) * 100).toFixed(1)}%` : '0%'],
      ['Sugestões', String(totals.sugestoes), totals.total ? `${((totals.sugestoes / totals.total) * 100).toFixed(1)}%` : '0%'],
      ['Elogios', String(totals.elogios), totals.total ? `${((totals.elogios / totals.total) * 100).toFixed(1)}%` : '0%'],
      ['Dúvidas', String(totals.duvidas), totals.total ? `${((totals.duvidas / totals.total) * 100).toFixed(1)}%` : '0%'],
    ],
    theme: 'grid',
    headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: blackColor },
    alternateRowStyles: { fillColor: lightGrayColor },
    columnStyles: { 1: { halign: 'center', fontStyle: 'bold' }, 2: { halign: 'center' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // === FOCO QUALIDADE: Ranking por tipo de reclamação ===
  const reclamacoes = items.filter((r) => r.contact_type === 'reclamacao');
  const typeCount: Record<string, { total: number; procedentes: number; improcedentes: number; pendentes: number }> = {};
  reclamacoes.forEach((r) => {
    const t = (r as any).complaint_type || 'Não classificada';
    if (!typeCount[t]) typeCount[t] = { total: 0, procedentes: 0, improcedentes: 0, pendentes: 0 };
    typeCount[t].total += 1;
    if (r.procedencia === 'procedente') typeCount[t].procedentes += 1;
    else if (r.procedencia === 'improcedente') typeCount[t].improcedentes += 1;
    else typeCount[t].pendentes += 1;
  });
  const ranking = Object.entries(typeCount).sort((a, b) => b[1].total - a[1].total);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...blackColor);
  doc.text('Reclamações por Frequência (foco Qualidade)', 14, y);
  y += 6;

  if (ranking.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...grayColor);
    doc.text('Nenhuma reclamação registrada no período selecionado.', 14, y);
    y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Tipo de Reclamação', 'Qtd', '% do total', 'Procedentes', 'Improcedentes', 'Não avaliadas']],
      body: ranking.map(([type, c], i) => [
        String(i + 1),
        type,
        String(c.total),
        totals.reclamacoes ? `${((c.total / totals.reclamacoes) * 100).toFixed(1)}%` : '0%',
        String(c.procedentes),
        String(c.improcedentes),
        String(c.pendentes),
      ]),
      theme: 'grid',
      headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: blackColor },
      alternateRowStyles: { fillColor: lightGrayColor },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
        2: { halign: 'center', fontStyle: 'bold' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Top 3 destaque
    const top3 = ranking.slice(0, 3);
    if (top3.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...blackColor);
      doc.text('Pontos de atenção:', 14, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      top3.forEach(([type, c]) => {
        const pct = totals.reclamacoes ? ((c.total / totals.reclamacoes) * 100).toFixed(1) : '0';
        const line = `• ${type}: ${c.total} ocorrência(s) (${pct}%) — ${c.procedentes} procedente(s).`;
        doc.text(line, 16, y);
        y += 5;
      });
      y += 3;
    }
  }

  // Evolução mensal (tipo x mês) — só se mais de 1 mês
  if (selectedStats.length > 1 && ranking.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...blackColor);
    doc.text('Evolução Mensal por Tipo de Reclamação', 14, y);
    y += 6;

    const sortedStats = [...selectedStats].sort((a, b) => a.month.localeCompare(b.month));
    const monthKeys = sortedStats.map((s) => s.month);
    const shortLabels = sortedStats.map((s) => s.monthLabel.replace(/(\w{3})\w*\s(\d{4})/, '$1/$2'));

    const matrix: Record<string, Record<string, number>> = {};
    reclamacoes.forEach((r) => {
      const t = (r as any).complaint_type || 'Não classificada';
      const d = new Date(r.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!matrix[t]) matrix[t] = {};
      matrix[t][k] = (matrix[t][k] || 0) + 1;
    });

    const evolutionBody = ranking.map(([type]) => {
      const row = [type];
      let total = 0;
      monthKeys.forEach((mk) => {
        const v = matrix[type]?.[mk] || 0;
        total += v;
        row.push(String(v));
      });
      row.push(String(total));
      return row;
    });

    const monthTotals = monthKeys.map((mk) =>
      ranking.reduce((sum, [type]) => sum + (matrix[type]?.[mk] || 0), 0)
    );
    const grandTotal = monthTotals.reduce((a, b) => a + b, 0);
    evolutionBody.push(['Total', ...monthTotals.map(String), String(grandTotal)]);

    autoTable(doc, {
      startY: y,
      head: [['Tipo', ...shortLabels, 'Total']],
      body: evolutionBody,
      theme: 'grid',
      headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: blackColor },
      alternateRowStyles: { fillColor: lightGrayColor },
      margin: { left: 14, right: 14 },
      styles: { halign: 'center' },
      columnStyles: { 0: { halign: 'left', cellWidth: 50 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === evolutionBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [220, 220, 220];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Status & Procedência
  if (y > 230) { doc.addPage(); y = 20; }
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...blackColor);
  doc.text('Status e Procedência', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Categoria', 'Quantidade']],
    body: [
      ['Pendentes', String(totals.pendentes)],
      ['Em Andamento', String(totals.emAndamento)],
      ['Resolvidos', String(totals.resolvidos)],
      ['Reclamações procedentes', String(totals.procedentes)],
      ['Reclamações improcedentes', String(totals.improcedentes)],
      ['Reclamações não avaliadas', String(totals.naoAvaliados)],
    ],
    theme: 'grid',
    headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: blackColor },
    alternateRowStyles: { fillColor: lightGrayColor },
    columnStyles: { 1: { halign: 'center', fontStyle: 'bold', cellWidth: 40 } },
    margin: { left: 14, right: 14 },
  });

  // Detalhe — apenas reclamações
  doc.addPage();
  doc.setFillColor(...blackColor);
  doc.rect(0, 0, pageWidth, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Detalhamento de Reclamações — ${periodLabel}`, 14, 10);

  const detailBody = reclamacoes
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((r) => [
      r.protocol,
      (r as any).complaint_type || 'Não classificada',
      r.order_number || '—',
      r.name,
      statusLabels[r.status] || r.status,
      r.procedencia || '—',
      new Date(r.created_at).toLocaleDateString('pt-BR'),
    ]);

  autoTable(doc, {
    startY: 20,
    head: [['Protocolo', 'Tipo de Reclamação', 'Pedido NF', 'Empresa', 'Status', 'Procedência', 'Data']],
    body: detailBody.length > 0 ? detailBody : [['—', 'Sem reclamações no período', '—', '—', '—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: blackColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: blackColor },
    alternateRowStyles: { fillColor: lightGrayColor },
    margin: { left: 10, right: 10 },
    styles: { cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 60 },
      2: { cellWidth: 30 },
      3: { cellWidth: 60 },
      4: { cellWidth: 30 },
      5: { cellWidth: 30 },
      6: { cellWidth: 24 },
    },
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text('SAC Digitale Têxtil — Relatório consolidado para análise de qualidade', 14, pageHeight - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  const fileLabel = selectedStats.length === 1
    ? selectedStats[0].monthLabel.replace(/\s/g, '-').toLowerCase()
    : `consolidado-${selectedStats.length}-meses`;
  doc.save(`relatorio-sac-${fileLabel}.pdf`);
  toast.success('Relatório consolidado exportado!');
}

export default function MonthlyReports() {
  const [requests, setRequests] = useState<SACRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [selectedMonths, setSelectedMonths] = useState<Record<string, boolean>>({});

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

  const toggleSelected = (month: string) => {
    setSelectedMonths((prev) => ({ ...prev, [month]: !prev[month] }));
  };

  const selectedKeys = Object.keys(selectedMonths).filter((k) => selectedMonths[k]);

  const selectAll = () => {
    const all: Record<string, boolean> = {};
    monthlyStats.forEach((s) => (all[s.month] = true));
    setSelectedMonths(all);
  };
  const clearSelection = () => setSelectedMonths({});

  const exportConsolidated = async () => {
    if (selectedKeys.length === 0) {
      toast.error('Selecione ao menos um mês.');
      return;
    }
    const sortedKeys = [...selectedKeys].sort();
    const selectedStats = monthlyStats.filter((s) => selectedMonths[s.month]);
    const items = sortedKeys.flatMap((k) => grouped[k] || []);
    await exportConsolidatedPDF(selectedStats, items);
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
      <Card className="border-primary/30">
        <CardContent className="py-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="font-medium">
              {selectedKeys.length === 0
                ? 'Selecione meses para gerar um relatório consolidado (anual ou personalizado).'
                : `${selectedKeys.length} ${selectedKeys.length === 1 ? 'mês selecionado' : 'meses selecionados'}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>Selecionar todos</Button>
            <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedKeys.length === 0}>Limpar</Button>
            <Button size="sm" onClick={exportConsolidated} disabled={selectedKeys.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar consolidado
            </Button>
          </div>
        </CardContent>
      </Card>

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
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleSelected(stats.month); }}
                      className="flex items-center"
                    >
                      <Checkbox checked={!!selectedMonths[stats.month]} />
                    </span>
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
