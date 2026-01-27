/**
 * Profile management routes
 * Defines API endpoints for user and vendor profile management
 */

import { Router } from 'express';
import { ProfileController } from '../controllers/ProfileController';
import { authenticate, requireVerified, requireVendor } from '../middleware/auth';

const router = Router();
const profileController = new ProfileController();

// Protected routes (authentication required)
router.put('/update', authenticate, requireVerified, profileController.updateProfile);
router.put('/vendor/update', authenticate, requireVerified, requireVendor, profileController.updateVendorProfile);
router.delete('/delete', authenticate, profileController.deleteAccount);

// Public routes
router.get('/:userId', profileController.getPublicProfile);

export default router;