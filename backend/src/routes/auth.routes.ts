import { Router, type IRouter } from 'express';
import { verifyAuth } from '../controllers/auth.controller';

const router: IRouter = Router();

// Endpoint to verify Firebase ID tokens and authorize HR access
router.post('/verify', verifyAuth);
router.get('/verify', verifyAuth);

export default router;
