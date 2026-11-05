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

export function generateResponsesExcel(
  companyName: string,
  items: ExportResponseItem[]
): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Sheet 1: Summary Sheet
  const totalCompleted = items.filter(i => i.status === 'COMPLETED').length;
  const ratingNumbers = items
    .map(i => Number(i.overallSatisfaction))
    .filter(n => !isNaN(n) && n > 0);
  const avgSatisfaction = ratingNumbers.length > 0
    ? (ratingNumbers.reduce((a, b) => a + b, 0) / ratingNumbers.length).toFixed(2)
    : 'N/A';

  const summaryRows = [
    { Metric: 'Company', Value: companyName },
    { Metric: 'Report Generated At', Value: new Date().toISOString() },
    { Metric: 'Total Completed Responses', Value: totalCompleted },
    { Metric: 'Average Overall Satisfaction (1-5)', Value: avgSatisfaction },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Response Summary');

  // 2. Sheet 2: Employee Details
  const employeeRows = items.map(item => ({
    'Employee ID': item.employeeCode,
    'Employee Name': item.employeeName,
    'Department': item.department,
    'Designation': item.designation,
    'Joining Date': item.hireDate || '—',
    'Exit Date': item.exitDate || '—',
    'Submission Date': item.submissionDate || '—',
    'Primary Reason for Leaving': item.primaryReason || '—',
    'Overall Satisfaction (1-5)': item.overallSatisfaction || '—',
    'Recommend Employer': item.recommendEmployer || '—',
    'Open to Rejoining': item.rejoiningConsideration || '—',
  }));
  const wsEmployees = XLSX.utils.json_to_sheet(employeeRows);
  XLSX.utils.book_append_sheet(wb, wsEmployees, 'Employee Directory');

  // 3. Sheet 3: Detailed Questions & Answers (Normalized)
  const qaRows: Array<{
    'Employee ID': string;
    'Employee Name': string;
    'Section': string;
    'Question': string;
    'Answer': string;
  }> = [];

  for (const item of items) {
    for (const sec of item.sections) {
      for (const q of sec.questions) {
        qaRows.push({
          'Employee ID': item.employeeCode,
          'Employee Name': item.employeeName,
          'Section': sec.sectionTitle,
          'Question': q.questionLabel,
          'Answer': q.answerText,
        });
      }
    }
  }

  const wsQA = XLSX.utils.json_to_sheet(qaRows);
  XLSX.utils.book_append_sheet(wb, wsQA, 'Detailed Q&A');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function generateResponsesCsv(
  items: ExportResponseItem[]
): string {
  const qaRows: Array<{
    'Employee ID': string;
    'Employee Name': string;
    'Department': string;
    'Designation': string;
    'Submission Date': string;
    'Section': string;
    'Question': string;
    'Answer': string;
  }> = [];

  for (const item of items) {
    for (const sec of item.sections) {
      for (const q of sec.questions) {
        qaRows.push({
          'Employee ID': item.employeeCode,
          'Employee Name': item.employeeName,
          'Department': item.department,
          'Designation': item.designation,
          'Submission Date': item.submissionDate,
          'Section': sec.sectionTitle,
          'Question': q.questionLabel,
          'Answer': q.answerText,
        });
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(qaRows);
  return XLSX.utils.sheet_to_csv(ws);
}

