import * as XLSX from 'xlsx';

export interface ExportResponseItem {
  interviewId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  designation: string;
  hireDate: string;
  exitDate: string;
  submissionDate: string;
  status: string;
  overallSatisfaction?: number | string;
  primaryReason?: string;
  reasonsForLeaving?: string;
  recommendEmployer?: string;
  rejoiningConsideration?: string;
  sections: Array<{
    sectionTitle: string;
    questions: Array<{
      questionLabel: string;
      answerText: string;
    }>;
  }>;
}

/**
 * Builds wide rows where each employee response is 1 comprehensive row.
 */
function buildWideResponseRows(items: ExportResponseItem[]): Array<Record<string, string | number>> {
  return items.map(item => {
    const row: Record<string, string | number> = {
      'Employee ID': item.employeeCode,
      'Employee Name': item.employeeName,
      'Department': item.department,
      'Designation': item.designation,
      'Joining Date': item.hireDate || '—',
      'Exit Date': item.exitDate || '—',
      'Submission Date': item.submissionDate || '—',
      'Status': item.status,
      'Primary Reason for Leaving': item.primaryReason || '—',
      'Overall Satisfaction (1-5)': item.overallSatisfaction || '—',
      'Recommend Employer': item.recommendEmployer || '—',
      'Open to Rejoining': item.rejoiningConsideration || '—',
    };

    // Dynamically append all section questions as distinct columns
    for (const sec of item.sections) {
      for (const q of sec.questions) {
        // Clean and descriptive header e.g. "Section B: Reason(s) for Leaving - Question..."
        const colHeader = `${sec.sectionTitle} | ${q.questionLabel}`;
        row[colHeader] = q.answerText || '—';
      }
    }

    return row;
  });
}

export function generateResponsesExcel(
  companyName: string,
  items: ExportResponseItem[]
): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Sheet 1: Responses Overview (Clean 1 Row Per Employee)
  const wideRows = buildWideResponseRows(items);
  const wsResponses = XLSX.utils.json_to_sheet(wideRows);

  // Set comfortable column widths for readability
  if (wideRows.length > 0) {
    const keys = Object.keys(wideRows[0]);
    wsResponses['!cols'] = keys.map(k => {
      if (k === 'Employee ID') return { wch: 14 };
      if (k === 'Employee Name') return { wch: 22 };
      if (k === 'Department' || k === 'Designation') return { wch: 18 };
      if (k.includes('Date')) return { wch: 14 };
      if (k.length > 40) return { wch: 35 };
      return { wch: Math.max(k.length + 3, 15) };
    });
  }
  XLSX.utils.book_append_sheet(wb, wsResponses, 'Responses Overview');

  // 2. Sheet 2: Detailed Questions Log
  const qaRows: Array<{
    'Employee ID': string;
    'Employee Name': string;
    'Department': string;
    'Section': string;
    'Question': string;
    'Response / Rating': string;
  }> = [];

  for (const item of items) {
    for (const sec of item.sections) {
      for (const q of sec.questions) {
        qaRows.push({
          'Employee ID': item.employeeCode,
          'Employee Name': item.employeeName,
          'Department': item.department,
          'Section': sec.sectionTitle,
          'Question': q.questionLabel,
          'Response / Rating': q.answerText,
        });
      }
    }
  }

  const wsQA = XLSX.utils.json_to_sheet(qaRows);
  wsQA['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 30 },
    { wch: 45 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, wsQA, 'Detailed Q&A Log');

  // 3. Sheet 3: Executive Metrics & Summary
  const totalCompleted = items.filter(i => i.status === 'COMPLETED').length;
  const ratingNumbers = items
    .map(i => Number(i.overallSatisfaction))
    .filter(n => !isNaN(n) && n > 0);
  const avgSatisfaction = ratingNumbers.length > 0
    ? (ratingNumbers.reduce((a, b) => a + b, 0) / ratingNumbers.length).toFixed(2)
    : 'N/A';

  // Department counts
  const deptCounts: Record<string, number> = {};
  for (const item of items) {
    deptCounts[item.department] = (deptCounts[item.department] || 0) + 1;
  }
  const deptSummaryStr = Object.entries(deptCounts)
    .map(([dept, count]) => `${dept}: ${count}`)
    .join(', ') || 'None';

  const summaryRows = [
    { Metric: 'Company Name', Value: companyName },
    { Metric: 'Report Generated At', Value: new Date().toISOString() },
    { Metric: 'Total Completed Exit Responses', Value: totalCompleted },
    { Metric: 'Average Overall Satisfaction (1-5)', Value: avgSatisfaction },
    { Metric: 'Departures by Department', Value: deptSummaryStr },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 35 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary & Metrics');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function generateResponsesCsv(
  items: ExportResponseItem[]
): string {
  // Generates clean 1-row-per-employee CSV export so opening in Excel is clean and understandable
  const wideRows = buildWideResponseRows(items);
  const ws = XLSX.utils.json_to_sheet(wideRows);
  return XLSX.utils.sheet_to_csv(ws);
}
