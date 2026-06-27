import { describe, it, expect, beforeAll } from 'vitest'
import supertest from 'supertest'
import { app, ready } from './server'

let request
let createdCode

beforeAll(async () => {
  await ready
  request = supertest(app)
})

describe('URL Shortener API', () => {
  it('POST /api/shorten with valid URL should return 201', async () => {
    const res = await request
      .post('/api/shorten')
      .send({ url: 'https://example.com' })
      .expect('Content-Type', /json/)

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('shortUrl')
    expect(res.body).toHaveProperty('code')
    expect(res.body.shortUrl).toMatch(/\/[a-zA-Z0-9_-]{7}$/)

    createdCode = res.body.code
  })

  it('POST /api/shorten with empty body should return 400', async () => {
    const res = await request
      .post('/api/shorten')
      .send({})
      .expect('Content-Type', /json/)

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /api/shorten with empty URL should return 400', async () => {
    const res = await request
      .post('/api/shorten')
      .send({ url: '' })
      .expect('Content-Type', /json/)

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('GET /:code with existing code should redirect', async () => {
    const res = await request
      .get(`/${createdCode}`)

    expect(res.status).toBe(301)
    expect(res.headers.location).toBe('https://example.com')
  })

  it('GET /:code with non-existent code should return 404', async () => {
    const res = await request
      .get('/_nonexistent_000_')
      .expect('Content-Type', /json/)

    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })

  it('GET /api/stats/:code with existing code should return stats', async () => {
    const res = await request
      .get(`/api/stats/${createdCode}`)
      .expect('Content-Type', /json/)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('url', 'https://example.com')
    expect(res.body).toHaveProperty('clicks')
    expect(res.body).toHaveProperty('created_at')
  })

  it('GET /api/stats/:code with non-existent code should return 404', async () => {
    const res = await request
      .get('/api/stats/_nonexistent_000_')
      .expect('Content-Type', /json/)

    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })

  it('GET /api/links should return paginated response', async () => {
    const res = await request
      .get('/api/links')
      .expect('Content-Type', /json/)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('links')
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('page')
    expect(res.body).toHaveProperty('total_pages')
    expect(Array.isArray(res.body.links)).toBe(true)
    expect(res.body.links.length).toBeGreaterThan(0)
  })

  it('GET /api/links?q= should filter results', async () => {
    const res = await request
      .get('/api/links?q=example')
      .expect('Content-Type', /json/)

    expect(res.status).toBe(200)
    expect(res.body.links.length).toBeGreaterThan(0)
    expect(res.body.total).toBeGreaterThan(0)
  })

  it('POST /api/shorten with custom slug should return 201', async () => {
    const res = await request
      .post('/api/shorten')
      .send({ url: 'https://example.com/custom', code: 'my-test-slug' })
      .expect('Content-Type', /json/)

    expect(res.status).toBe(201)
    expect(res.body.code).toBe('my-test-slug')
    expect(res.body.shortUrl).toMatch(/\/my-test-slug$/)
  })

  it('POST /api/shorten with duplicate custom slug should return 409', async () => {
    const res = await request
      .post('/api/shorten')
      .send({ url: 'https://example.com/dup', code: 'my-test-slug' })
      .expect('Content-Type', /json/)

    expect(res.status).toBe(409)
    expect(res.body).toHaveProperty('error')
  })

  it('PATCH /api/links/:code should update url', async () => {
    const res = await request
      .patch(`/api/links/my-test-slug`)
      .send({ url: 'https://example.com/updated' })
      .expect('Content-Type', /json/)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const stats = await request.get('/api/stats/my-test-slug')
    expect(stats.body.url).toBe('https://example.com/updated')
  })

  it('PATCH /api/links/:code with expiration should set expiry', async () => {
    // Set expiration to yesterday (should already be expired)
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const res = await request
      .patch(`/api/links/my-test-slug`)
      .send({ expires_at: yesterday })
      .expect('Content-Type', /json/)

    expect(res.status).toBe(200)

    // Redirect should now return 410 (expired)
    const redirect = await request.get('/my-test-slug')
    expect(redirect.status).toBe(410)
  })

  it('PATCH /api/links/:code with non-existent code should return 404', async () => {
    const res = await request
      .patch('/api/links/_nonexistent_000_')
      .send({ url: 'https://example.com' })
      .expect('Content-Type', /json/)

    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })

  it('DELETE /api/links/:code should delete link', async () => {
    const res = await request
      .delete('/api/links/my-test-slug')
      .expect('Content-Type', /json/)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const stats = await request.get('/api/stats/my-test-slug')
    expect(stats.status).toBe(404)
  })

  it('DELETE /api/links/:code with non-existent code should return 404', async () => {
    const res = await request
      .delete('/api/links/_nonexistent_000_')
      .expect('Content-Type', /json/)

    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })

  it('GET /api/stats/detailed/:code should return analytics', async () => {
    // First create a new link and click it to generate log data
    const create = await request
      .post('/api/shorten')
      .send({ url: 'https://example.com/analytics-test' })
    const code = create.body.code

    // Click the link a couple times
    await request.get('/' + code)
    await request.get('/' + code)

    const res = await request
      .get('/api/stats/detailed/' + code)
      .expect('Content-Type', /json/)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total_clicks')
    expect(res.body).toHaveProperty('timeline')
    expect(res.body).toHaveProperty('referrers')
    expect(res.body).toHaveProperty('devices')
    expect(res.body).toHaveProperty('browsers')
    expect(res.body.total_clicks).toBeGreaterThanOrEqual(2)
  })

  it('GET /api/stats/detailed/:code with non-existent code should return 404', async () => {
    const res = await request
      .get('/api/stats/detailed/_nonexistent_000_')
      .expect('Content-Type', /json/)

    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })
})
