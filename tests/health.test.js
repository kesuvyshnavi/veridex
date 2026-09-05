// server/backend/tests/health.test.js
// Minimal smoke test confirming the Express app boots and responds. This
// is a starting skeleton — expand with auth/project flow tests as the
// app grows. Run with: npm test

const request = require('supertest');
const app = require('../app');

describe('GET /api/health', () => {
  it('responds with 200 and success: true', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});