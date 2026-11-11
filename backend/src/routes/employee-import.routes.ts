import { Router, type IRouter } from 'express';
import {
  uploadExcelFile,
  updateSheetHeader,
  updateSheetConfig,
  validateMapping,
  validateMultiSheetMapping,
  getPreviewRows,
  updatePreviewRow,
  deletePreviewRow,
  revertPreviewRow,
  toggleRowApproval,
  bulkSetApproval,
  commitImport,
  exportSessionErrors,
  getStarterTemplate,
  getImportHistory,
} from '../controllers/employee-import.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { employeeLimiter, exportLimiter } from '../middleware/rate-limiter.js';

const router: IRouter = Router();

// Protect all import operations with authentication
router.use(authenticateToken);

// Template and History
router.get('/template', exportLimiter, getStarterTemplate);
router.get('/history', employeeLimiter, getImportHistory);

// Upload and Sheet Configuration
router.post('/upload', employeeLimiter, uploadExcelFile);
router.post('/sheet-header', employeeLimiter, updateSheetHeader);
router.post('/sheet-config', employeeLimiter, updateSheetConfig);
router.post('/validate-mapping', employeeLimiter, validateMapping);
router.post('/validate-multi-mapping', employeeLimiter, validateMultiSheetMapping);

// Paginated Preview & Row Operations
router.get('/preview/:sessionId', employeeLimiter, getPreviewRows);
router.patch('/preview/:sessionId/:rowIndex', employeeLimiter, updatePreviewRow);
router.post('/preview/:sessionId/:rowIndex/revert', employeeLimiter, revertPreviewRow);
router.post('/preview/:sessionId/:rowIndex/approve', employeeLimiter, toggleRowApproval);
router.post('/preview/:sessionId/bulk-approve', employeeLimiter, bulkSetApproval);
router.delete('/preview/:sessionId/:rowIndex', employeeLimiter, deletePreviewRow);

// Batch Commit & Error Export
router.post('/commit', employeeLimiter, commitImport);
router.get('/errors/:sessionId', exportLimiter, exportSessionErrors);

export default router;

