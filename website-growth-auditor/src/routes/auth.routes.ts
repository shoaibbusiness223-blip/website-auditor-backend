import { Router } from 'express';
import { handleSignup, handleLogin, handleMe } from '../controllers/auth.controller';
import { validateSignup, validateLogin } from '../validators';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/signup', validateSignup, handleSignup);
router.post('/login', validateLogin, handleLogin);
router.get('/me', requireAuth, handleMe);

export default router;