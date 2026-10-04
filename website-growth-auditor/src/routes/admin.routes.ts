import { Router } from 'express';
import { handleGetStats, handleGetUsers, handleGetAudits } from '../controllers/admin.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();

// Every route here requires BOTH a valid login AND an admin email.
router.use(requireAuth, requireAdmin);

router.get('/stats', handleGetStats);
router.get('/users', handleGetUsers);
router.get('/audits', handleGetAudits);

export default router;