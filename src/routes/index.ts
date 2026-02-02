/**
 * Main routes index
 * Combines all route modules
 */

import { Router } from 'express';
import authRoutes from './auth';
import profileRoutes from './profile';
import translationRoutes from './translation';
import productRoutes from './products';
import vendorRoutes from './vendor';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/translation', translationRoutes);
router.use('/products', productRoutes);
router.use('/vendors', vendorRoutes);

// Health check endpoint
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0'
    },
    timestamp: new Date()
  });
});

export default router;