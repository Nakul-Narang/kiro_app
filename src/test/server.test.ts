import request from 'supertest';
import { app } from '../server';

// Mock the database connections for testing
jest.mock('../config/database');

describe('Server', () => {
  describe('Health Check', () => {
    test('GET /health should return server status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
    });
  });

  describe('API Info', () => {
    test('GET /api/v1 should return API information', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Multilingual Mandi API v1');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('translation', 'available');
      expect(response.body.services).toHaveProperty('priceDiscovery', 'available');
      expect(response.body.services).toHaveProperty('negotiation', 'available');
      expect(response.body.services).toHaveProperty('realTime', 'available');
    });
  });
});