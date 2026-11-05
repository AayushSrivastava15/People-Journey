import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ExitResponseDetail } from '@/types/api';

/**
 * Cleanly formats a question answer for export.
 */
function formatAnswer(q: any): { answer: string; scoreOrDetail: string } {
  if (q.type === 'declaration') {
    const raw = q.rawAnswer;
    if (typeof raw === 'object' && raw !== null) {
      return {
        answer: raw.agreed ? 'Agreed & Confirmed' : 'Not Confirmed',
        scoreOrDetail: `Signed: ${raw.signature || '—'}, Date: ${raw.date || '—'}`,
      };
    }
    return { answer: 'Confirmed', scoreOrDetail: 'Electronic sign-off' };
  }

  if (q.type === 'rating_matrix' && q.matrixRows && typeof q.rawAnswer === 'object' && q.rawAnswer !== null) {
    const lines = q.matrixRows.map((r: any) => `${r.label}: ${q.rawAnswer[r.id] ?? '—'}/5`);
    return {
      answer: lines.join('\n'),
      scoreOrDetail: 'Matrix Rating',
    };
  }

  if (q.type === 'rating') {
    const num = Number(q.rawAnswer);
    return {
      answer: q.displayAnswer || (isNaN(num) ? '—' : `${num} / 5`),
      scoreOrDetail: isNaN(num) ? '—' : `${num}/5`,
    };
  }

  if (Array.isArray(q.rawAnswer)) {
    return {
      answer: q.rawAnswer.join(', ') || 'None selected',
      scoreOrDetail: `${q.rawAnswer.length} selected`,
    };
  }

  return {
    answer: q.displayAnswer && q.displayAnswer !== '-' ? q.displayAnswer : 'No comment provided',
    scoreOrDetail: '—',
  };
}

/**
 * Generates and downloads a clean, beautifully formatted individual response Excel file.
 */
export function exportResponseToExcel(detail: ExitResponseDetail) {
  const wb = XLSX.utils.book_new();

  // 1. Sheet 1: Employee & Exit Summary
  const summaryData = [
    { Field: 'Company Name', Value: detail.company.name },
    { Field: 'Template Name', Value: `${detail.template.name} (v${detail.template.version})` },
    { Field: 'Submission Date', Value: detail.submissionDate ? new Date(detail.submissionDate).toLocaleString() : '—' },
    { Field: '', Value: '' }, // empty row
    { Field: 'Departing Employee', Value: detail.employee.name },
    { Field: 'Employee Code', Value: detail.employee.code },
    { Field: 'Department', Value: detail.employee.department },
    { Field: 'Designation', Value: detail.employee.designation },
    { Field: 'Joining Date', Value: detail.employee.hireDate || '—' },
    { Field: 'Last Working Day', Value: detail.employee.exitDate || '—' },
    { Field: 'Official Email', Value: detail.employee.workEmail || '—' },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Employee Summary');

  // 2. Sheet 2: Complete Responses (Sections A - I)
  const rows: Array<{
    Section: string;
    'Q#': number;
    Question: string;
    'Employee Response': string;
    'Details / Score': string;
  }> = [];

  detail.sections.forEach((sec, sIdx) => {
    sec.questions.forEach((q, qIdx) => {
      const formatted = formatAnswer(q);
      rows.push({
        Section: `Section ${sIdx + 1}: ${sec.title}`,
        'Q#': qIdx + 1,
        Question: q.label,
        'Employee Response': formatted.answer,
        'Details / Score': formatted.scoreOrDetail,
      });
    });
  });

  const wsResponses = XLSX.utils.json_to_sheet(rows);
  wsResponses['!cols'] = [
    { wch: 32 },
    { wch: 6 },
    { wch: 45 },
    { wch: 55 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsResponses, 'All Responses');

  const cleanName = detail.employee.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Exit_Interview_${cleanName}_${detail.employee.code}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Generates and downloads a clean, multi-page branded PDF report.
 */
export function exportResponseToPdf(detail: ExitResponseDetail) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Header accent banner
  doc.setFillColor(89, 66, 79); // #59424f
  doc.rect(0, 0, pageWidth, 5, 'F');

  // Title & Metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(61, 47, 56);
  doc.text(detail.company.name || 'Company Name', margin, 15);

  doc.setFontSize(11);
  doc.setTextColor(140, 83, 105);
  doc.text('EXIT INTERVIEW RESPONSE RECORD', margin, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(114, 97, 108);
  const submittedStr = detail.submissionDate
    ? `Submitted: ${new Date(detail.submissionDate).toLocaleDateString(undefined, { dateStyle: 'long' })}`
    : 'Pending submission';
  doc.text(`${detail.template.name} (v${detail.template.version}) · ${submittedStr}`, margin, 26);

  // Employee Information Box
  const boxY = 30;
  const boxHeight = 22;
  doc.setFillColor(252, 248, 246);
  doc.setDrawColor(235, 218, 218);
  doc.roundedRect(margin, boxY, pageWidth - margin * 2, boxHeight, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(120, 110, 115);
  doc.text('Departing Employee:', margin + 4, boxY + 6);
  doc.text('Department:', margin + 65, boxY + 6);
  doc.text('Hire Date:', margin + 125, boxY + 6);

  doc.text('Designation:', margin + 4, boxY + 16);
  doc.text('Official Email:', margin + 65, boxY + 16);
  doc.text('Exit Date:', margin + 125, boxY + 16);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 35, 38);
  doc.text(`${detail.employee.name} (${detail.employee.code})`, margin + 4, boxY + 10);
  doc.text(detail.employee.department || '—', margin + 65, boxY + 10);
  doc.text(detail.employee.hireDate || '—', margin + 125, boxY + 10);

  doc.text(detail.employee.designation || '—', margin + 4, boxY + 20);
  doc.text(detail.employee.workEmail || '—', margin + 65, boxY + 20);
  doc.text(detail.employee.exitDate || '—', margin + 125, boxY + 20);

  let startY = boxY + boxHeight + 8;

  // Build tables for each section
  detail.sections.forEach((sec, sIdx) => {
    const tableData = sec.questions.map((q, qIdx) => {
      const formatted = formatAnswer(q);
      return [
        `${qIdx + 1}`,
        q.label,
        formatted.answer,
      ];
    });

    autoTable(doc, {
      startY,
      margin: { left: margin, right: margin },
      head: [[`Section ${sIdx + 1}: ${sec.title}`, '', '']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [89, 66, 79],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: [120, 110, 115] },
        1: { cellWidth: 85, fontSize: 8.5, textColor: [50, 45, 48] },
        2: { cellWidth: 'auto', fontSize: 8.5, textColor: [30, 25, 28] },
      },
      styles: {
        overflow: 'linebreak',
        cellPadding: 3,
        lineColor: [235, 225, 228],
        lineWidth: 0.2,
      },
      alternateRowStyles: {
        fillColor: [255, 253, 251],
      },
      pageBreak: 'auto',
      didDrawPage: data => {
        // Footer on every page
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(150, 140, 145);
        doc.text(
          `People Journey Confidential Record · ${detail.employee.name} (${detail.employee.code})`,
          margin,
          pageHeight - 6
        );
        doc.text(
          `Page ${data.pageNumber}`,
          pageWidth - margin - 12,
          pageHeight - 6
        );
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY;
    startY = (finalY || startY) + 6;
  });

  const cleanName = detail.employee.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Exit_Interview_${cleanName}_${detail.employee.code}.pdf`;
  doc.save(filename);
}

