import * as XLSX from 'xlsx';

export type SheetCategory =
  | 'REGULAR_EMPLOYEES'
  | 'THIRD_PARTY'
  | 'RESIGNATION_TRACKER'
  | 'RETENTION_TRACKER'
  | 'TRANSFER'
  | 'RECRUITMENT'
  | 'IGNORE';

export interface SheetAnalysis {
  sheetName: string;
  headerRowIndex: number; // 1-indexed row number in Excel
  confidence: number; // 0 to 1
  isLowConfidence: boolean;
  totalRows: number;
  estimatedDataRows: number;
  columnCount: number;
  detectedHeaders: string[];
  suggestedCategory: SheetCategory;
  categoryLabel: string;
  importable: boolean;
  sampleRows: Record<string, string>[];
  previewGrid: Array<{ rowIndex: number; cells: string[] }>;
}

export interface WorkbookAnalysis {
  fileName: string;
  totalSheets: number;
  importableSheetsCount: number;
  sheets: SheetAnalysis[];
}

const HEADER_KEYWORDS = [
  'code', 'id', 'name', 'role', 'title', 'designation', 'department', 'dept',
  'location', 'site', 'manager', 'doj', 'date', 'joining', 'start', 'hire',
  'email', 'phone', 'mobile', 'status', 'vendor', 'type', 'position', 'salary',
  'resignation', 'transfer', 'exit', 'notes', 'metric', 'value', 'candidate', 'req',
  'worker', 'lwd', 'withdrawal', 'reason', 'transferred', 'effective'
];

const INSTRUCTION_KEYWORDS = [
  'synthetic', 'purpose', 'suggested', 'workflow', 'important', 'instructions',
  'disclaimer', 'please note', 'test data', 'confidential', 'primary regular',
  'separate third-party', 'match existing', 'resignation withdrawals',
  'location changes', 'dashboard/reporting', 'recruitment pipeline',
  'closed recruitment', 'project planning'
];

export class ExcelSheetAnalyzer {
  /**
   * Intelligently scores each candidate row to find the true table header.
   */
  scoreHeaderRow(
    row: any[],
    nextRows: any[][]
  ): { score: number; keywordMatches: number; cellCount: number; avgLen: number; reason?: string } {
    const cells = row.map(c => String(c ?? '').trim()).filter(Boolean);

    // Rule 1: A valid table header must contain at least 2 distinct columns
    if (cells.length < 2) {
      return { score: -100, keywordMatches: 0, cellCount: cells.length, avgLen: 0, reason: 'Too few non-empty cells (title or empty)' };
    }

    const avgLen = cells.reduce((acc, c) => acc + c.length, 0) / cells.length;

    // Rule 2: Sentences/paragraphs (> 50 chars average) are instructions or descriptions
    if (avgLen > 45) {
      return { score: -100, keywordMatches: 0, cellCount: cells.length, avgLen, reason: 'Average text too long (instruction or description)' };
    }

    // Rule 3: Direct instruction / banner keyword penalty
    for (const c of cells) {
      const lower = c.toLowerCase();
      for (const ik of INSTRUCTION_KEYWORDS) {
        if (lower.includes(ik)) {
          return { score: -100, keywordMatches: 0, cellCount: cells.length, avgLen, reason: `Contains instruction phrase: "${ik}"` };
        }
      }
    }

    let score = 0;

    // Rule 4: Match recognizable business/HR header keywords
    let keywordMatches = 0;
    for (const c of cells) {
      const lower = c.toLowerCase();
      if (HEADER_KEYWORDS.some(hk => lower.includes(hk))) {
        keywordMatches++;
      }
    }
    score += keywordMatches * 25;

    // Rule 5: Headers must be unique strings
    const uniqueSet = new Set(cells.map(c => c.toLowerCase()));
    if (uniqueSet.size === cells.length) {
      score += 25;
    } else {
      score -= 30; // Deduct for duplicate headers
    }

    // Rule 6: Width bonus (tables usually have 3 to 20 columns)
    score += Math.min(cells.length, 15) * 5;

    // Rule 7: Data density in subsequent rows (a real header is followed by populated rows)
    if (nextRows && nextRows.length > 0) {
      const nextRowCells = (nextRows[0] || []).map(c => String(c ?? '').trim()).filter(Boolean);
      if (nextRowCells.length >= cells.length - 2 && nextRowCells.length > 0) {
        score += 30;
      }
      if (nextRows.length > 1) {
        const next2RowCells = (nextRows[1] || []).map(c => String(c ?? '').trim()).filter(Boolean);
        if (next2RowCells.length >= cells.length - 2 && next2RowCells.length > 0) {
          score += 20;
        }
      }
    }

    return { score, keywordMatches, cellCount: cells.length, avgLen };
  }

  /**
   * Scans the first 15-20 rows of a worksheet to detect the most likely header row.
   */
  detectHeaderRow(grid: any[][]): {
    headerRowIndex: number; // 1-indexed
    confidence: number;
    detectedHeaders: string[];
    isLowConfidence: boolean;
  } {
    if (!grid || grid.length === 0) {
      return { headerRowIndex: 1, confidence: 0, detectedHeaders: [], isLowConfidence: true };
    }

    let bestRowIndex = 0;
    let bestScore = -999;
    const maxScan = Math.min(20, grid.length);

    for (let r = 0; r < maxScan; r++) {
      const row = grid[r] || [];
      const nextRows = grid.slice(r + 1, r + 4);
      const res = this.scoreHeaderRow(row, nextRows);
      if (res.score > bestScore) {
        bestScore = res.score;
        bestRowIndex = r;
      }
    }

    const headerCells = (grid[bestRowIndex] || []).map((c, idx) => {
      const val = String(c ?? '').trim();
      return val || `Column_${idx + 1}`;
    });

    // Remove trailing empty column placeholders
    let lastValidIdx = headerCells.length - 1;
    while (lastValidIdx >= 0 && headerCells[lastValidIdx].startsWith('Column_')) {
      lastValidIdx--;
    }
    const detectedHeaders = headerCells.slice(0, lastValidIdx + 1);

    const isLowConfidence = bestScore < 100 || detectedHeaders.length < 2;
    const confidence = isLowConfidence
      ? Math.max(0.2, Math.min(0.6, bestScore / 200))
      : Math.min(0.99, Math.max(0.88, bestScore / 250));

    return {
      headerRowIndex: bestRowIndex + 1, // 1-indexed
      confidence,
      detectedHeaders,
      isLowConfidence,
    };
  }

  /**
   * Classifies worksheet category according to business purpose.
   */
  classifySheet(sheetName: string, headers: string[]): {
    category: SheetCategory;
    label: string;
    confidence: number;
    importable: boolean;
  } {
    const normName = sheetName.toLowerCase().trim();
    const headerText = headers.join(' ').toLowerCase();

    // 1. Explicit Ignored sheets
    const ignoreNames = [
      'read me', 'readme', 'instruction', 'instructions', 'guide',
      'dashboard', 'projects', 'project', 'summary', 'budget', 'notes',
      'closed position'
    ];
    if (ignoreNames.some(k => normName.includes(k))) {
      return {
        category: 'IGNORE',
        label: 'Ignored',
        confidence: 0.98,
        importable: false,
      };
    }

    // 2. Recruitment Pipeline (genuine offer/selected candidates for onboarding)
    if (
      normName.includes('recruitment') ||
      normName.includes('candidate') ||
      normName.includes('hiring') ||
      normName.includes('pipeline') ||
      (headerText.includes('candidate') && headerText.includes('stage')) ||
      (headerText.includes('req id') && headerText.includes('position'))
    ) {
      return {
        category: 'RECRUITMENT',
        label: 'Recruitment Onboarding',
        confidence: 0.95,
        importable: true,
      };
    }

    // 2. Retention Tracker (resignation withdrawals & employee restoration)
    if (
      normName.includes('retention') ||
      headerText.includes('withdrawal date') ||
      headerText.includes('resignation status') ||
      headerText.includes('withdrawn')
    ) {
      return {
        category: 'RETENTION_TRACKER',
        label: 'Employee Restoration',
        confidence: 0.95,
        importable: true,
      };
    }

    // 3. Transfer (location/department updates)
    if (
      normName.includes('transfer') ||
      normName.includes('relocation') ||
      normName.includes('movement') ||
      headerText.includes('transferred to') ||
      headerText.includes('transfer letter')
    ) {
      return {
        category: 'TRANSFER',
        label: 'Employee Location Updates',
        confidence: 0.95,
        importable: true,
      };
    }

    // 4. Third Party MIS (contractors, vendor workforce)
    if (
      normName.includes('third party') ||
      normName.includes('contractor') ||
      normName.includes('vendor') ||
      normName.includes('external') ||
      normName.includes('temporary') ||
      headerText.includes('worker ref')
    ) {
      return {
        category: 'THIRD_PARTY',
        label: 'Third Party Workforce',
        confidence: 0.95,
        importable: true,
      };
    }

    // 5. Regular Employees (primary employee roster) - Prioritize roster matching
    if (
      normName.includes('employee') ||
      normName.includes('staff') ||
      normName.includes('mis') ||
      normName.includes('workforce') ||
      normName.includes('headcount') ||
      normName.includes('roster') ||
      headerText.includes('employee code') ||
      headerText.includes('staff id') ||
      headerText.includes('date of joining')
    ) {
      return {
        category: 'REGULAR_EMPLOYEES',
        label: 'Regular Employees',
        confidence: 0.95,
        importable: true,
      };
    }

    // 6. Resignation Tracker (lifecycle updates / historical departures)
    if (
      normName.includes('resignation') ||
      normName.includes('exit') ||
      normName.includes('attrition') ||
      normName.includes('separation') ||
      headerText.includes('resignation date')
    ) {
      return {
        category: 'RESIGNATION_TRACKER',
        label: 'Lifecycle Updates / Historical Employees',
        confidence: 0.95,
        importable: true,
      };
    }

    // Default to Regular Employees if contains basic emp headers
    if (headerText.includes('emp code') || headerText.includes('doj')) {
      return {
        category: 'REGULAR_EMPLOYEES',
        label: 'Regular Employees',
        confidence: 0.90,
        importable: true,
      };
    }

    // Default to ignored if no pattern matches
    return {
      category: 'IGNORE',
      label: 'Ignored',
      confidence: 0.5,
      importable: false,
    };
  }

  /**
   * Analyze entire workbook and all sheets.
   */
  analyzeWorkbook(buffer: Buffer, fileName: string): WorkbookAnalysis {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new Error('Failed to read Excel workbook. Please ensure the file is a valid .xlsx or .xls document.');
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('The uploaded Excel document does not contain any sheets.');
    }

    const sheets: SheetAnalysis[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const grid = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
      const totalRows = grid.length;

      // Detect header row
      const headerDetection = this.detectHeaderRow(grid);
      const headerRowIndex = headerDetection.headerRowIndex;
      const detectedHeaders = headerDetection.detectedHeaders;

      // Classify sheet
      const classification = this.classifySheet(sheetName, detectedHeaders);

      // Estimated data rows (rows after detected header that have values)
      let dataRowsCount = 0;
      const sampleRows: Record<string, string>[] = [];
      const sampleLimit = 5;

      for (let r = headerRowIndex; r < grid.length; r++) {
        const row = grid[r] || [];
        const hasData = row.some(c => c !== '' && c !== null && c !== undefined);
        if (hasData) {
          dataRowsCount++;
          if (sampleRows.length < sampleLimit) {
            const rowObj: Record<string, string> = {};
            detectedHeaders.forEach((header, colIdx) => {
              const val = row[colIdx];
              rowObj[header] = val !== undefined && val !== null ? String(val).trim() : '';
            });
            sampleRows.push(rowObj);
          }
        }
      }

      // Preview grid around the header row (first 10 rows) for manual inspection
      const previewGrid: Array<{ rowIndex: number; cells: string[] }> = [];
      const maxPreview = Math.min(10, grid.length);
      for (let r = 0; r < maxPreview; r++) {
        const rawRow = grid[r] || [];
        previewGrid.push({
          rowIndex: r + 1,
          cells: rawRow.slice(0, Math.max(8, detectedHeaders.length)).map(c => String(c ?? '').trim()),
        });
      }

      sheets.push({
        sheetName,
        headerRowIndex,
        confidence: Math.round(headerDetection.confidence * 100) / 100,
        isLowConfidence: headerDetection.isLowConfidence,
        totalRows,
        estimatedDataRows: dataRowsCount,
        columnCount: detectedHeaders.length,
        detectedHeaders,
        suggestedCategory: classification.category,
        categoryLabel: classification.label,
        importable: classification.importable,
        sampleRows,
        previewGrid,
      });
    }

    const importableSheetsCount = sheets.filter(s => s.importable).length;

    return {
      fileName,
      totalSheets: sheets.length,
      importableSheetsCount,
      sheets,
    };
  }
}

export const excelSheetAnalyzer = new ExcelSheetAnalyzer();
