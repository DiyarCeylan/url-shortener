# 🔗 URL Shortener

A lightweight URL shortening service built with Express.js and SQLite (sql.js). Converts long URLs into short codes, tracks click statistics, and provides a web interface for management.

## Features

- Shorten long URLs with 7-character unique codes
- Automatic 301 redirects
- Click tracking
- List all shortened links
- Dark-themed, mobile-friendly web UI
- One-click copy
- Persistent SQLite storage
- RESTful API

## Built With

| Technology   | Description                   |
| ------------ | ----------------------------- |
| Node.js      | Runtime environment           |
| Express.js   | Web framework                 |
| SQLite       | Embedded database (sql.js)    |
| sql.js       | JavaScript port of SQLite     |
| Vitest       | Test framework                |
| Supertest    | HTTP test helper              |

## Setup

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Server runs at **http://localhost:3000** by default.

## Usage

Open `http://localhost:3000` in your browser. Paste a long URL into the input field and click "Shorten". Copy and share the generated short link.

## API Documentation

### POST `/api/shorten`

Creates a new short link.

**Request:**

```json
{
  "url": "https://example.com/some-long-page"
}
```

**Success response (201):**

```json
{
  "shortUrl": "http://localhost:3000/abc1234",
  "code": "abc1234"
}
```

**Error responses:**

| Status | Description              |
| ------ | ------------------------ |
| 400    | Invalid or missing URL   |
| 500    | Internal server error    |

---

### GET `/:code`

Redirects a short code to the original URL.

| Status | Description         |
| ------ | ------------------- |
| 301    | Successful redirect |
| 404    | Code not found      |

---

### GET `/api/stats/:code`

Returns statistics for a short link.

**Success response (200):**

```json
{
  "url": "https://example.com/some-page",
  "clicks": 42,
  "created_at": "2026-06-21 12:00:00"
}
```

**Error responses:**

| Status | Description      |
| ------ | ---------------- |
| 404    | Code not found   |

---

### GET `/api/links`

Returns all short links (newest first).

**Success response (200):**

```json
[
  {
    "code": "abc1234",
    "url": "https://example.com/page",
    "clicks": 10,
    "created_at": "2026-06-21 12:00:00"
  }
]
```

## Docker

```bash
# Build the image
docker build -t url-shortener .

# Run the container
docker run -d -p 3000:3000 -v link-data:/app/data url-shortener
```

## Environment Variables

| Variable | Default | Description     |
| -------- | ------- | --------------- |
| `PORT`   | `3000`  | Server port     |

## Development

Tests are written with [Vitest](https://vitest.dev/) and [Supertest](https://github.com/ladjs/supertest).

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
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
