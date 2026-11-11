import { Router, type IRouter } from 'express';
import {
  uploadExcelFile,
  validateMapping,
  getPreviewRows,
  updatePreviewRow,
  deletePreviewRow,
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

// Upload and Column Validation
router.post('/upload', employeeLimiter, uploadExcelFile);
router.post('/validate-mapping', employeeLimiter, validateMapping);

// Paginated Preview & Row Operations
router.get('/preview/:sessionId', employeeLimiter, getPreviewRows);
router.patch('/preview/:sessionId/:rowIndex', employeeLimiter, updatePreviewRow);
router.delete('/preview/:sessionId/:rowIndex', employeeLimiter, deletePreviewRow);

// Batch Commit & Error Export
router.post('/commit', employeeLimiter, commitImport);
router.get('/errors/:sessionId', exportLimiter, exportSessionErrors);

export default router;
