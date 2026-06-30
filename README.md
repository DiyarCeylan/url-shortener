# URL Shortener

[![MIT](https://img.shields.io/badge/license-MIT-teal)](LICENSE)

A lightweight URL shortening service built with Express.js and SQLite (sql.js). Converts long URLs into short codes, tracks click statistics, and provides a web interface for management.

> **Live site:** [s.whetkit.me](https://s.whetkit.me/)

## Quick Start

```bash
git clone https://github.com/DiyarCeylan/link-kisaltici.git
cd link-kisaltici
npm install
npm start
```

Server runs at **http://localhost:3000**.

## Features

- Shorten long URLs with 7-character unique codes
- Automatic 301 redirects
- Click tracking per link
- List all shortened links
- Dark-themed, mobile-friendly web UI
- One-click copy
- Persistent SQLite storage
- RESTful API

## API

### POST `/api/shorten`

```json
// Request
{ "url": "https://example.com/some-long-page" }

// Response (201)
{ "shortUrl": "https://s.whetkit.me/abc1234", "code": "abc1234" }
```

| Status | Description |
| ------ | ----------- |
| 201    | Short link created |
| 400    | Invalid or missing URL |
| 500    | Internal server error |

### GET `/:code`

| Status | Description |
| ------ | ----------- |
| 301    | Redirects to original URL |
| 404    | Code not found |

### GET `/api/stats/:code`

```json
// Response (200)
{ "url": "https://example.com/some-page", "clicks": 42, "created_at": "2026-06-21 12:00:00" }
```

| Status | Description |
| ------ | ----------- |
| 200    | Stats returned |
| 404    | Code not found |

### GET `/api/links`

```json
// Response (200)
[
  { "code": "abc1234", "url": "https://example.com/page", "clicks": 10, "created_at": "2026-06-21 12:00:00" }
]
```

## Docker

```bash
docker build -t url-shortener .
docker run -d -p 3000:3000 -v link-data:/app/data url-shortener
```

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT`   | `3000`  | Server port |

## Tech Stack

| Technology | Description |
| ---------- | ----------- |
| Node.js | Runtime environment |
| Express.js | Web framework |
| SQLite | Embedded database (sql.js) |
| sql.js | JavaScript port of SQLite |
| Vitest | Test framework |
| Supertest | HTTP test helper |

## Development

```bash
npm test          # Run tests
npm run test:watch # Watch mode
```

## Project Structure

```
link-kisaltici/
├── data/               # SQLite database file (created at runtime)
├── public/
│   └── index.html      # Web UI
├── src/
│   ├── server.js       # Server and API logic
│   └── server.test.js  # Tests
├── Dockerfile
├── .dockerignore
├── package.json
└── README.md
```
