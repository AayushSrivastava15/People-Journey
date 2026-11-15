import type { Request, Response } from 'express';
import { smartImportService, CANONICAL_IMPORT_FIELDS } from '../services/smart-import.service.js';
import { importSessionStore } from '../services/import-session.store.js';
import { logger } from '../utils/logger.js';

export async function uploadExcelFile(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const { fileBase64, fileName } = req.body || {};
  if (!fileBase64 || !fileName) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAYLOAD', message: 'Excel file content (base64) and fileName are required.' },
    });
    return;
  }

  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > 10 * 1024 * 1024) {
      res.status(400).json({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'The uploaded file exceeds the 10MB limit. Please upload a smaller file.' },
      });
      return;
    }

    const result = await smartImportService.parseAndDetectColumns(buffer, fileName, userId);

    res.status(200).json({
      success: true,
      sessionId: result.session.sessionId,
      fileName: result.session.fileName,
      totalRows: result.session.validatedRows.length || result.session.rawRows.length,
      canonicalFields: CANONICAL_IMPORT_FIELDS,
      detection: result.detection,
      sheets: result.sheets,
      sheetOrder: result.sheetOrder,
      summary: result.session.summary,
      previewRows: result.session.validatedRows.slice(0, 10),
    });
  } catch (err) {
    const error = err as Error;
    logger.warn({ message: error.message, userId, fileName }, 'Failed to parse uploaded Excel file');
    res.status(400).json({
      success: false,
      error: { code: 'IMPORT_PARSE_ERROR', message: error.message },
    });
  }
}

export async function updateSheetHeader(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const { sessionId, sheetName, headerRowIndex } = req.body || {};
  if (!sessionId || !sheetName || typeof headerRowIndex !== 'number') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAYLOAD', message: 'sessionId, sheetName, and numeric headerRowIndex are required.' },
    });
    return;
  }

  try {
    const sheet = await smartImportService.updateSheetHeader(sessionId, userId, sheetName, headerRowIndex);
    res.status(200).json({ success: true, sheet });
  } catch (err) {
    const error = err as Error;
    res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
}

export async function updateSheetConfig(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const { sessionId, sheetName, category, importable } = req.body || {};
  if (!sessionId || !sheetName || !category) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAYLOAD', message: 'sessionId, sheetName, and category are required.' },
    });
    return;
  }

  try {
    const sheet = await smartImportService.updateSheetConfig(sessionId, userId, sheetName, category, Boolean(importable));
    res.status(200).json({ success: true, sheet });
  } catch (err) {
    const error = err as Error;
    res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
}

export async function selectSheets(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const sessionId = String(req.params.sessionId);
  const { selectedSheets } = req.body || {};

  if (!sessionId || !Array.isArray(selectedSheets)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAYLOAD', message: 'sessionId and selectedSheets array are required.' },
    });
    return;
  }

  try {
    const session = await smartImportService.selectSheetsForImport(sessionId, userId, selectedSheets);
    res.status(200).json({
      success: true,
      sessionId: session.sessionId,
      summary: session.summary,
      totalRows: session.validatedRows.length,
      sheets: Object.values(session.sheets),
      sheetOrder: session.sheetOrder,
      previewRows: session.validatedRows.slice(0, 10),
    });
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('expired')) {
      res.status(410).json({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: error.message },
      });
      return;
    }
    logger.error({ message: error.message, sessionId, userId }, 'Failed to apply sheet selection');
    res.status(500).json({
      success: false,
      error: { code: 'SHEET_SELECTION_FAILED', message: error.message },
    });
  }
}

export async function validateMultiSheetMapping(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const { sessionId, sheetMappings, saveMappingForWorkspace } = req.body || {};
  if (!sessionId || typeof sheetMappings !== 'object') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAYLOAD', message: 'sessionId and sheetMappings object are required.' },
    });
    return;
  }

  try {
    const session = await smartImportService.validateMultiSheetMapping(
      sessionId,
      userId,
      sheetMappings,
      Boolean(saveMappingForWorkspace)
    );

    res.status(200).json({
      success: true,
      sessionId: session.sessionId,
      summary: session.summary,
      previewRows: session.validatedRows.slice(0, 10),
      totalRows: session.validatedRows.length,
    });
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('expired')) {
      res.status(410).json({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: error.message },
      });
      return;
    }
    logger.error({ message: error.message, sessionId, userId }, 'Failed to validate multi-sheet import mapping');
    res.status(500).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: error.message },
    });
  }
}

export async function validateMapping(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const { sessionId, columnMapping, saveMappingForWorkspace } = req.body || {};
  if (!sessionId || !columnMapping || typeof columnMapping !== 'object') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAYLOAD', message: 'sessionId and columnMapping object are required.' },
    });
    return;
  }

  try {
    const session = await smartImportService.validateSessionRows(
      sessionId,
      userId,
      columnMapping,
      Boolean(saveMappingForWorkspace)
    );

    res.status(200).json({
      success: true,
      sessionId: session.sessionId,
      summary: session.summary,
      previewRows: session.validatedRows.slice(0, 10),
      totalRows: session.validatedRows.length,
    });
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('expired')) {
      res.status(410).json({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: error.message },
      });
      return;
    }
    logger.error({ message: error.message, sessionId, userId }, 'Failed to validate import column mapping');
    res.status(500).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: error.message },
    });
  }
}

export async function getPreviewRows(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const sessionId = String(req.params.sessionId);
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 10));
  const filter = (req.query.filter as string) || 'all'; // 'all', 'needs_attention', 'valid', 'duplicates'
  const search = (req.query.search as string || '').toLowerCase().trim();

  const session = importSessionStore.getSession(sessionId, userId);
  if (!session) {
    res.status(410).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your import session has expired. Please upload the Excel file again.' },
    });
    return;
  }

  let filtered = session.validatedRows;

  // Filter by validation status tab
  if (filter === 'needs_attention') {
    filtered = filtered.filter(r => r.validationStatus === 'NEEDS_ATTENTION');
  } else if (filter === 'valid') {
    filtered = filtered.filter(r => r.validationStatus === 'VALID');
  } else if (filter === 'duplicates') {
    filtered = filtered.filter(r => r.validationStatus === 'DUPLICATE');
  } else if (filter === 'existing_updates') {
    filtered = filtered.filter(r => r.isExistingEmployee === true);
  } else if (filter === 'third_party') {
    filtered = filtered.filter(r => r.isThirdParty === true);
  } else if (filter === 'historical_exits') {
    filtered = filtered.filter(r => r.reconciliationType === 'HISTORICAL_EXIT' || r.isHistorical === true);
  }

  // Filter by search text
  if (search) {
    filtered = filtered.filter(r => {
      const d = r.mappedData;
      return (
        d.employeeCode.toLowerCase().includes(search) ||
        d.fullName.toLowerCase().includes(search) ||
        (d.workEmail && d.workEmail.toLowerCase().includes(search)) ||
        (d.department && d.department.toLowerCase().includes(search)) ||
        (d.designation && d.designation.toLowerCase().includes(search)) ||
        (d.workLocation && d.workLocation.toLowerCase().includes(search)) ||
        (r.vendor && r.vendor.toLowerCase().includes(search)) ||
        String(r.rowIndex).includes(search)
      );
    });
  }

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const offset = (page - 1) * limit;
  const pageRows = filtered.slice(offset, offset + limit);

  res.status(200).json({
    success: true,
    page,
    limit,
    totalPages,
    totalFiltered,
    totalRecords: session.validatedRows.length,
    summary: session.summary,
    rows: pageRows,
  });
}

export async function updatePreviewRow(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const sessionId = String(req.params.sessionId);
  const rowParam = String(req.params.rowIndex);
  const updatedFields = req.body || {};

  const session = importSessionStore.getSession(sessionId, userId);
  if (!session) {
    res.status(410).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your import session has expired. Please upload the Excel file again.' },
    });
    return;
  }

  const updated = importSessionStore.updateRow(sessionId, userId, rowParam, updatedFields);
  if (!updated) {
    res.status(404).json({ success: false, error: { code: 'ROW_NOT_FOUND', message: `Row ${rowParam} not found in preview.` } });
    return;
  }

  // Fast in-memory revalidation without re-extracting from raw sheets
  try {
    smartImportService.revalidateActiveSessionRows(session);
    const refreshed = importSessionStore.getSession(sessionId, userId)!;
    const numIndex = parseInt(rowParam, 10);
    const refreshedRow = refreshed.validatedRows.find(
      r => (r.rowId && r.rowId === rowParam) || (!isNaN(numIndex) && r.rowIndex === numIndex)
    );

    res.status(200).json({
      success: true,
      row: refreshedRow,
      summary: refreshed.summary,
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: { code: 'REVALIDATION_ERROR', message: error.message } });
  }
}

export async function revertPreviewRow(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const sessionId = String(req.params.sessionId);
  const rowParam = String(req.params.rowIndex);

  const session = importSessionStore.getSession(sessionId, userId);
  if (!session) {
    res.status(410).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your import session has expired. Please upload the Excel file again.' },
    });
    return;
  }

  const reverted = importSessionStore.revertRow(sessionId, userId, rowParam);
  if (!reverted) {
    res.status(404).json({ success: false, error: { code: 'ROW_NOT_FOUND', message: `Row ${rowParam} not found or cannot be reverted.` } });
    return;
  }

  try {
    smartImportService.revalidateActiveSessionRows(session);
    const refreshed = importSessionStore.getSession(sessionId, userId)!;
    const numIndex = parseInt(rowParam, 10);
    const refreshedRow = refreshed.validatedRows.find(
      r => (r.rowId && r.rowId === rowParam) || (!isNaN(numIndex) && r.rowIndex === numIndex)
    );

    res.status(200).json({
      success: true,
      row: refreshedRow,
      summary: refreshed.summary,
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: { code: 'REVERT_ERROR', message: error.message } });
  }
}

export async function toggleRowApproval(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const sessionId = String(req.params.sessionId);
  const rowParam = String(req.params.rowIndex);
  const approved = req.body?.approved;

  const session = importSessionStore.getSession(sessionId, userId);
  if (!session) {
    res.status(410).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your import session has expired. Please upload the Excel file again.' },
    });
    return;
  }

  const updated = importSessionStore.toggleRowApproval(sessionId, userId, rowParam, approved);
  if (!updated) {
    res.status(404).json({ success: false, error: { code: 'ROW_NOT_FOUND', message: `Row ${rowParam} not found.` } });
    return;
  }

  res.status(200).json({
    success: true,
    row: updated,
    summary: session.summary,
  });
}

export async function bulkSetApproval(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const sessionId = String(req.params.sessionId);
  const { filterType, approved } = req.body || {};

  const ok = importSessionStore.bulkSetApproval(sessionId, userId, filterType || 'valid_only', Boolean(approved));
  if (!ok) {
    res.status(404).json({ success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Import session not found.' } });
    return;
  }

  const session = importSessionStore.getSession(sessionId, userId)!;
  res.status(200).json({
    success: true,
    summary: session.summary,
  });
}

export async function deletePreviewRow(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const sessionId = String(req.params.sessionId);
  const rowParam = String(req.params.rowIndex);

  const session = importSessionStore.getSession(sessionId, userId);
  if (!session) {
    res.status(410).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your import session has expired. Please upload the Excel file again.' },
    });
    return;
  }

  const deletedRow = importSessionStore.deleteRow(sessionId, userId, rowParam);
  if (!deletedRow) {
    res.status(404).json({ success: false, error: { code: 'ROW_NOT_FOUND', message: `Row ${rowParam} not found in preview.` } });
    return;
  }

  // Re-run in-memory validation across remaining active rows
  smartImportService.revalidateActiveSessionRows(session);
  const refreshed = importSessionStore.getSession(sessionId, userId)!;

  res.status(200).json({
    success: true,
    message: `Row ${deletedRow.sourceRowNumber || deletedRow.rowIndex} (${deletedRow.mappedData?.fullName || deletedRow.mappedData?.employeeCode || 'Record'}) removed from import.`,
    deletedRow: {
      rowId: deletedRow.rowId,
      rowIndex: deletedRow.rowIndex,
      sourceRowNumber: deletedRow.sourceRowNumber || deletedRow.rowIndex,
      employeeName: deletedRow.mappedData?.fullName || '',
      employeeCode: deletedRow.mappedData?.employeeCode || '',
    },
    summary: refreshed.summary,
  });
}

export async function commitImport(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const { sessionId, mode } = req.body || {};
  if (!sessionId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'sessionId is required.' } });
    return;
  }

  try {
    const result = await smartImportService.executeImport(sessionId, userId, mode || 'valid_only');

    res.status(200).json({
      success: true,
      message: `Employee import completed successfully. ${result.importedCount} employees were added.`,
      result,
    });
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message, sessionId, userId }, 'Failed to commit employee import');
    res.status(500).json({
      success: false,
      error: {
        code: 'IMPORT_EXECUTION_FAILED',
        message: "We couldn't complete the import because of a server/database issue. Your employee records were not confirmed as imported. Please check the import result before retrying.",
        technicalDetails: error.message,
      },
    });
  }
}

export async function exportSessionErrors(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const sessionId = String(req.params.sessionId);
  const session = importSessionStore.getSession(sessionId, userId);
  if (!session) {
    res.status(410).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your import session has expired. Please upload the Excel file again.' },
    });
    return;
  }

  try {
    const buffer = smartImportService.generateErrorReport(session);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Import_Errors_${Date.now()}.xlsx"`);
    res.status(200).send(buffer);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: error.message } });
  }
}

export async function getStarterTemplate(req: Request, res: Response): Promise<void> {
  try {
    const buffer = smartImportService.generateStarterTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="People_Journey_Employee_Template.xlsx"');
    res.status(200).send(buffer);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: { code: 'TEMPLATE_FAILED', message: error.message } });
  }
}

export async function getImportHistory(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  try {
    const history = await smartImportService.listImportHistory(userId);
    res.status(200).json({
      success: true,
      history,
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: { code: 'HISTORY_FETCH_FAILED', message: error.message } });
  }
}
