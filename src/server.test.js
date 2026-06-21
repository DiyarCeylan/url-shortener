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

  it('GET /api/links should return array', async () => {
    const res = await request
      .get('/api/links')
      .expect('Content-Type', /json/)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })
})
