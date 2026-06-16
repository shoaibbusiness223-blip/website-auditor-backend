import { Router } from 'express';
import { handleSignup, handleLogin, handleMe } from '../controllers/auth.controller';
import { validateSignup, validateLogin } from '../validators';
import { requireAuth } from '../middleware/auth';

const router = Router();

// POST /api/auth/signup
router.post('/signup', validateSignup, handleSignup);

// POST /api/auth/login
router.post('/login', validateLogin, handleLogin);

// GET /api/auth/me  (protected)
router.get('/me', requireAuth, handleMe);

export default router;
