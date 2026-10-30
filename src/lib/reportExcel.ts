// relatorio_op_tr_v1
import ExcelJS from 'exceljs';

export interface ExcelMonthlyStats {
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

export interface ExcelSacRow {
  protocol: string;
  contact_type: string;
  complaint_type?: string | null;
  problem_origin?: string | null;
  order_number?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  procedencia?: string | null;
  subject?: string | null;
  created_at: string;
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

const NAVY = 'FF0F2C52';
const LIGHT = 'FFEDF1F7';
const BORDER = 'FFB9C4D4';

function styleSheetBase(sheet: ExcelJS.Worksheet) {
  sheet.properties.defaultRowHeight = 18;
  sheet.views = [{ showGridLines: false }];
}

function titleBlock(sheet: ExcelJS.Worksheet, colSpan: number, title: string, subtitle: string) {
  sheet.mergeCells(1, 1, 1, colSpan);
  const t = sheet.getCell(1, 1);
  t.value = title;
  t.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 34;

  sheet.mergeCells(2, 1, 2, colSpan);
  const s = sheet.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF44526B' } };
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 20;
}

function sectionHeader(sheet: ExcelJS.Worksheet, row: number, colSpan: number, text: string) {
  sheet.mergeCells(row, 1, row, colSpan);
  const c = sheet.getCell(row, 1);
  c.value = text;
  c.font = { name: 'Arial', size: 11, bold: true, color: { argb: NAVY } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(row).height = 22;
}

function writeTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  headers: string[],
  rows: (string | number)[][],
  opts: { totalRow?: boolean; numericFrom?: number } = {},
): number {
  const numericFrom = opts.numericFrom ?? 1;
  const headerRow = sheet.getRow(startRow);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: i >= numericFrom ? 'center' : 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: BORDER } },
      left: { style: 'thin', color: { argb: BORDER } },
      bottom: { style: 'thin', color: { argb: BORDER } },
      right: { style: 'thin', color: { argb: BORDER } },
    };
  });
  headerRow.height = 24;

  rows.forEach((r, ri) => {
    const row = sheet.getRow(startRow + 1 + ri);
    const isTotal = opts.totalRow && ri === rows.length - 1;
    r.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { name: 'Arial', size: 10, bold: !!isTotal, color: { argb: 'FF1B1B1B' } };
      cell.alignment = { vertical: 'middle', horizontal: ci >= numericFrom ? 'center' : 'left', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: BORDER } },
        left: { style: 'thin', color: { argb: BORDER } },
        bottom: { style: 'thin', color: { argb: BORDER } },
        right: { style: 'thin', color: { argb: BORDER } },
      };
      if (isTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD8DFE9' } };
      } else if (ri % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
      }
    });
  });

  return startRow + rows.length + 2;
}

function autoWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

async function download(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildDetailSheet(workbook: ExcelJS.Workbook, name: string, subtitle: string, items: ExcelSacRow[]) {
  const sheet = workbook.addWorksheet(name, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  styleSheetBase(sheet);
  const headers = [
    'Protocolo',
    'Origens dos Problemas',
    'Tipos de Reclamações',
    'Data',
    'Empresa',
    'E-mail',
    'Telefone',
    'Tipo de Contato',
    'Nota Fiscal',
    'Assunto',
    'Status',
    'Procedência',
  ];
  titleBlock(sheet, headers.length, 'Detalhamento de Solicitações', subtitle);

  const rows = [...items]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((r) => [
      r.protocol,
      r.problem_origin || '—',
      r.contact_type === 'reclamacao' ? r.complaint_type || 'Não classificada' : '—',
      new Date(r.created_at).toLocaleDateString('pt-BR'),
      r.name,
      r.email,
      r.phone || '—',
      contactTypeLabels[r.contact_type] || r.contact_type,
      r.order_number || '—',
      r.subject || '—',
      statusLabels[r.status] || r.status,
      r.procedencia ? r.procedencia.charAt(0).toUpperCase() + r.procedencia.slice(1) : 'Não avaliado',
    ]);

  const end = writeTable(sheet, 4, headers, rows.length ? rows : [headers.map(() => '—')], { numericFrom: 99 });
  autoWidths(sheet, [16, 25, 25, 12, 30, 30, 16, 16, 16, 34, 14, 16]);
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
  return end;
}

export async function exportMonthExcel(monthLabel: string, items: ExcelSacRow[], stats: ExcelMonthlyStats) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAC Digitale Têxtil';
  workbook.created = new Date();

  const resumo = workbook.addWorksheet('Resumo', {
    pageSetup: { orientation: 'portrait', fitToPage: true },
  });
  styleSheetBase(resumo);
  titleBlock(resumo, 3, `Relatório SAC — ${monthLabel}`, `Gerado em ${new Date().toLocaleString('pt-BR')}`);

  let row = 4;
  sectionHeader(resumo, row, 3, 'Resumo Geral');
  row += 1;
  row = writeTable(
    resumo,
    row,
    ['Indicador', 'Quantidade', '% do total'],
    [
      ['Total de Solicitações', stats.total, '100%'],
      ['Reclamações', stats.reclamacoes, pct(stats.reclamacoes, stats.total)],
      ['Sugestões', stats.sugestoes, pct(stats.sugestoes, stats.total)],
      ['Elogios', stats.elogios, pct(stats.elogios, stats.total)],
      ['Dúvidas', stats.duvidas, pct(stats.duvidas, stats.total)],
    ],
  );

  sectionHeader(resumo, row, 3, 'Status das Solicitações');
  row += 1;
  row = writeTable(
    resumo,
    row,
    ['Status', 'Quantidade', '% do total'],
    [
      ['Pendentes', stats.pendentes, pct(stats.pendentes, stats.total)],
      ['Em Andamento', stats.emAndamento, pct(stats.emAndamento, stats.total)],
      ['Resolvidos', stats.resolvidos, pct(stats.resolvidos, stats.total)],
    ],
  );

  if (stats.reclamacoes > 0) {
    sectionHeader(resumo, row, 3, 'Procedência das Reclamações');
    row += 1;
    row = writeTable(
      resumo,
      row,
      ['Procedência', 'Quantidade', '% das reclamações'],
      [
        ['Procedentes', stats.procedentes, pct(stats.procedentes, stats.reclamacoes)],
        ['Improcedentes', stats.improcedentes, pct(stats.improcedentes, stats.reclamacoes)],
        ['Não Avaliados', stats.naoAvaliados, pct(stats.naoAvaliados, stats.reclamacoes)],
      ],
    );
  }
  autoWidths(resumo, [34, 18, 20]);

  buildRankingSheet(workbook, monthLabel, items);
  buildOriginsRankingSheet(workbook, monthLabel, items);
  buildDetailSheet(workbook, 'Detalhamento', monthLabel, items);

  await download(workbook, `relatorio-sac-${monthLabel.replace(/\s/g, '-').toLowerCase()}.xlsx`);
}

function pct(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : '0%';
}

function rankingData(items: ExcelSacRow[]) {
  const reclamacoes = items.filter((r) => r.contact_type === 'reclamacao');
  const map: Record<string, { total: number; procedentes: number; improcedentes: number; pendentes: number }> = {};
  reclamacoes.forEach((r) => {
    const t = r.complaint_type || 'Não classificada';
    if (!map[t]) map[t] = { total: 0, procedentes: 0, improcedentes: 0, pendentes: 0 };
    map[t].total += 1;
    if (r.procedencia === 'procedente') map[t].procedentes += 1;
    else if (r.procedencia === 'improcedente') map[t].improcedentes += 1;
    else map[t].pendentes += 1;
  });
  return {
    reclamacoes,
    ranking: Object.entries(map).sort((a, b) => b[1].total - a[1].total),
  };
}


function buildOriginsRankingSheet(
  workbook: ExcelJS.Workbook,
  periodLabel: string,
  items: ExcelSacRow[]
) {
  const reclamacoes = items.filter(
    r => r.contact_type === 'reclamacao'
  );

  const totals = new Map<string, {
    total: number;
    procedentes: number;
    improcedentes: number;
    pendentes: number;
  }>();

  for (const r of reclamacoes) {
    const origin = (r.problem_origin || '').trim() || 'Não classificada';

    const counts = totals.get(origin) || {
      total: 0,
      procedentes: 0,
      improcedentes: 0,
      pendentes: 0
    };

    counts.total += 1;

    if (r.procedencia === 'procedente') {
      counts.procedentes += 1;
    } else if (r.procedencia === 'improcedente') {
      counts.improcedentes += 1;
    } else {
      counts.pendentes += 1;
    }

    totals.set(origin, counts);
  }

  const ranking = [...totals.entries()].sort(
    (a, b) => b[1].total - a[1].total ||
      a[0].localeCompare(b[0], 'pt-BR')
  );

  const sheet = workbook.addWorksheet('Origens dos Problemas', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1
    }
  });

  styleSheetBase(sheet);

  const headers = [
    '#',
    'Origens dos Problemas',
    'Quantidade',
    '% do total',
    'Procedentes',
    'Improcedentes',
    'Não avaliadas'
  ];

  titleBlock(
    sheet,
    headers.length,
    'Origens dos Problemas por Frequência',
    periodLabel
  );

  const body: (string | number)[][] = ranking.map(
    ([origin, counts], index) => [
      index + 1,
      origin,
      counts.total,
      pct(counts.total, reclamacoes.length),
      counts.procedentes,
      counts.improcedentes,
      counts.pendentes
    ]
  );

  if (body.length) {
    body.push([
      '',
      'Total',
      reclamacoes.length,
      '100%',
      ranking.reduce((n, [, c]) => n + c.procedentes, 0),
      ranking.reduce((n, [, c]) => n + c.improcedentes, 0),
      ranking.reduce((n, [, c]) => n + c.pendentes, 0)
    ]);
  } else {
    body.push([
      '—',
      'Sem reclamações no período',
      0, '0%', 0, 0, 0
    ]);
  }

  writeTable(sheet, 4, headers, body, {
    totalRow: ranking.length > 0,
    numericFrom: 2
  });

  autoWidths(sheet, [6, 44, 16, 16, 18, 18, 18]);
  sheet.getColumn(1).alignment = {
    horizontal: 'center'
  };
}

function buildRankingSheet(workbook: ExcelJS.Workbook, periodLabel: string, items: ExcelSacRow[]) {
  const { reclamacoes, ranking } = rankingData(items);
  const sheet = workbook.addWorksheet('Reclamações por Tipo', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  });
  styleSheetBase(sheet);
  const headers = ['#', 'Tipo de Reclamação', 'Quantidade', '% do total', 'Procedentes', 'Improcedentes', 'Não avaliadas'];
  titleBlock(sheet, headers.length, 'Reclamações por Frequência', periodLabel);

  const body: (string | number)[][] = ranking.map(([type, c], i) => [
    i + 1,
    type,
    c.total,
    pct(c.total, reclamacoes.length),
    c.procedentes,
    c.improcedentes,
    c.pendentes,
  ]);
  if (body.length) {
    body.push([
      '',
      'Total',
      reclamacoes.length,
      '100%',
      ranking.reduce((s, [, c]) => s + c.procedentes, 0),
      ranking.reduce((s, [, c]) => s + c.improcedentes, 0),
      ranking.reduce((s, [, c]) => s + c.pendentes, 0),
    ]);
  } else {
    body.push(['—', 'Sem reclamações no período', 0, '0%', 0, 0, 0]);
  }

  writeTable(sheet, 4, headers, body, { totalRow: ranking.length > 0, numericFrom: 2 });
  autoWidths(sheet, [6, 40, 14, 14, 16, 16, 16]);
  sheet.getColumn(1).alignment = { horizontal: 'center' };
}

export async function exportConsolidatedExcel(selectedStats: ExcelMonthlyStats[], items: ExcelSacRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAC Digitale Têxtil';
  workbook.created = new Date();

  const sorted = [...selectedStats].sort((a, b) => a.month.localeCompare(b.month));
  const periodLabel =
    sorted.length === 1 ? sorted[0].monthLabel : `${sorted[0].monthLabel} — ${sorted[sorted.length - 1].monthLabel}`;

  const totals = sorted.reduce(
    (acc, s) => {
      (Object.keys(acc) as (keyof typeof acc)[]).forEach((k) => {
        acc[k] += (s as unknown as Record<string, number>)[k as string] || 0;
      });
      return acc;
    },
    {
      total: 0,
      reclamacoes: 0,
      sugestoes: 0,
      elogios: 0,
      duvidas: 0,
      pendentes: 0,
      emAndamento: 0,
      resolvidos: 0,
      procedentes: 0,
      improcedentes: 0,
      naoAvaliados: 0,
    },
  );

  const resumo = workbook.addWorksheet('Resumo', { pageSetup: { orientation: 'portrait', fitToPage: true } });
  styleSheetBase(resumo);
  titleBlock(resumo, 3, 'Relatório Consolidado SAC', `${periodLabel} • Gerado em ${new Date().toLocaleString('pt-BR')}`);

  let row = 4;
  sectionHeader(resumo, row, 3, 'Visão Geral do Período');
  row += 1;
  row = writeTable(resumo, row, ['Indicador', 'Total', '% do total'], [
    ['Total de Solicitações', totals.total, '100%'],
    ['Reclamações', totals.reclamacoes, pct(totals.reclamacoes, totals.total)],
    ['Sugestões', totals.sugestoes, pct(totals.sugestoes, totals.total)],
    ['Elogios', totals.elogios, pct(totals.elogios, totals.total)],
    ['Dúvidas', totals.duvidas, pct(totals.duvidas, totals.total)],
  ]);

  sectionHeader(resumo, row, 3, 'Status e Procedência');
  row += 1;
  row = writeTable(resumo, row, ['Categoria', 'Quantidade', '% do total'], [
    ['Pendentes', totals.pendentes, pct(totals.pendentes, totals.total)],
    ['Em Andamento', totals.emAndamento, pct(totals.emAndamento, totals.total)],
    ['Resolvidos', totals.resolvidos, pct(totals.resolvidos, totals.total)],
    ['Reclamações procedentes', totals.procedentes, pct(totals.procedentes, totals.reclamacoes)],
    ['Reclamações improcedentes', totals.improcedentes, pct(totals.improcedentes, totals.reclamacoes)],
    ['Reclamações não avaliadas', totals.naoAvaliados, pct(totals.naoAvaliados, totals.reclamacoes)],
  ]);
  autoWidths(resumo, [34, 18, 20]);

  // Comparativo mensal
  const mensal = workbook.addWorksheet('Comparativo Mensal', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  });
  styleSheetBase(mensal);
  const mensalHeaders = ['Mês', 'Total', 'Reclamações', 'Sugestões', 'Elogios', 'Dúvidas', 'Pendentes', 'Em Andamento', 'Resolvidos', 'Procedentes', 'Improcedentes'];
  titleBlock(mensal, mensalHeaders.length, 'Comparativo Mensal', periodLabel);
  const mensalBody: (string | number)[][] = sorted.map((s) => [
    s.monthLabel,
    s.total,
    s.reclamacoes,
    s.sugestoes,
    s.elogios,
    s.duvidas,
    s.pendentes,
    s.emAndamento,
    s.resolvidos,
    s.procedentes,
    s.improcedentes,
  ]);
  mensalBody.push([
    'Total',
    totals.total,
    totals.reclamacoes,
    totals.sugestoes,
    totals.elogios,
    totals.duvidas,
    totals.pendentes,
    totals.emAndamento,
    totals.resolvidos,
    totals.procedentes,
    totals.improcedentes,
  ]);
  writeTable(mensal, 4, mensalHeaders, mensalBody, { totalRow: true, numericFrom: 1 });
  autoWidths(mensal, [22, 10, 14, 12, 10, 10, 12, 14, 12, 14, 15]);

  buildRankingSheet(workbook, periodLabel, items);
  buildOriginsRankingSheet(workbook, periodLabel, items);

  // Evolução mensal por tipo
  if (sorted.length > 1) {
    const { reclamacoes, ranking } = rankingData(items);
    if (ranking.length > 0) {
      const evo = workbook.addWorksheet('Evolução por Tipo', {
        pageSetup: { orientation: 'landscape', fitToPage: true },
      });
      styleSheetBase(evo);
      const monthKeys = sorted.map((s) => s.month);
      const headers = ['Tipo de Reclamação', ...sorted.map((s) => s.monthLabel), 'Total'];
      titleBlock(evo, headers.length, 'Evolução Mensal por Tipo de Reclamação', periodLabel);

      const matrix: Record<string, Record<string, number>> = {};
      reclamacoes.forEach((r) => {
        const t = r.complaint_type || 'Não classificada';
        const d = new Date(r.created_at);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!matrix[t]) matrix[t] = {};
        matrix[t][k] = (matrix[t][k] || 0) + 1;
      });

      const body: (string | number)[][] = ranking.map(([type]) => {
        const values = monthKeys.map((k) => matrix[type]?.[k] || 0);
        return [type, ...values, values.reduce((a, b) => a + b, 0)];
      });
      const monthTotals = monthKeys.map((k) => ranking.reduce((s, [type]) => s + (matrix[type]?.[k] || 0), 0));
      body.push(['Total', ...monthTotals, monthTotals.reduce((a, b) => a + b, 0)]);

      writeTable(evo, 4, headers, body, { totalRow: true, numericFrom: 1 });
      autoWidths(evo, [38, ...monthKeys.map(() => 14), 12]);
    }
  }

  buildDetailSheet(workbook, 'Detalhamento', periodLabel, items);

  const fileLabel =
    sorted.length === 1 ? sorted[0].monthLabel.replace(/\s/g, '-').toLowerCase() : `consolidado-${sorted.length}-meses`;
  await download(workbook, `relatorio-sac-${fileLabel}.xlsx`);
}
