# 🔗 Link Kısaltıcı

Express.js ve SQLite (sql.js) tabanlı, hafif ve hızlı bir URL kısaltma servisi. Uzun URL'leri kısa kodlara dönüştürür, tıklanma istatistiklerini tutar ve web arayüzü üzerinden yönetim imkânı sunar.

## Özellikler

- Uzun URL'leri 7 karakterli benzersiz kodlarla kısaltma
- Otomatik 301 yönlendirme
- Tıklanma sayısı takibi
- Tüm linklerin listelenmesi
- Koyu temalı, mobil uyumlu web arayüzü
- Tek tıkla kopyalama
- SQLite ile kalıcı veri depolama
- RESTful API

## Kullanılan Teknolojiler

| Teknoloji  | Açıklama                     |
| ---------- | ---------------------------- |
| Node.js    | Çalışma zamanı               |
| Express.js | Web sunucu çatısı            |
| SQLite     | Gömülü veritabanı (sql.js)   |
| sql.js     | SQLite'in JavaScript portu   |
| Vitest     | Test çatısı                  |
| Supertest  | HTTP test yardımcısı         |

## Kurulum

```bash
# Bağımlılıkları yükleyin
npm install

# Uygulamayı başlatın
npm start
```

Sunucu varsayılan olarak **http://localhost:3000** adresinde çalışır.

## Kullanım

Tarayıcınızda `http://localhost:3000` adresine giderek web arayüzünü kullanabilirsiniz. Uzun URL'yi forma yapıştırıp "Kısalt" butonuna tıklayın. Oluşan kısa linki kopyalayıp paylaşabilirsiniz.

## API Dokümantasyonu

### POST `/api/shorten`

Yeni bir kısa link oluşturur.

**İstek:**

```json
{
  "url": "https://ornek.com/cok-uzun-bir-sayfa"
}
```

**Başarılı yanıt (201):**

```json
{
  "shortUrl": "http://localhost:3000/abc1234",
  "code": "abc1234"
}
```

**Hata yanıtları:**

| Durum | Açıklama              |
| ----- | --------------------- |
| 400   | Geçersiz veya eksik URL |
| 500   | Sunucu hatası          |

---

### GET `/:code`

Kısa kodu orijinal URL'ye yönlendirir.

| Durum | Açıklama        |
| ----- | --------------- |
| 301   | Başarılı yönlendirme |
| 404   | Kod bulunamadı  |

---

### GET `/api/stats/:code`

Kısa linkin istatistiklerini döndürür.

**Başarılı yanıt (200):**

```json
{
  "url": "https://ornek.com/cok-uzun-bir-sayfa",
  "clicks": 42,
  "created_at": "2026-06-21 12:00:00"
}
```

**Hata yanıtları:**

| Durum | Açıklama        |
| ----- | --------------- |
| 404   | Kod bulunamadı  |

---

### GET `/api/links`

Tüm kısa linkleri liste halinde döndürür (en yeni en üstte).

**Başarılı yanıt (200):**

```json
[
  {
    "code": "abc1234",
    "url": "https://ornek.com/sayfa",
    "clicks": 10,
    "created_at": "2026-06-21 12:00:00"
  }
]
```

## Docker

```bash
# İmajı oluşturun
docker build -t link-kisaltici .

# Konteynerı çalıştırın
docker run -d -p 3000:3000 -v link-data:/app/data link-kisaltici
```

## Ortam Değişkenleri

| Değişken | Varsayılan | Açıklama    |
| -------- | ---------- | ----------- |
| `PORT`   | `3000`     | Sunucu portu |

## Geliştirme

Testler [Vitest](https://vitest.dev/) ve [Supertest](https://github.com/ladjs/supertest) ile yazılmıştır.

```bash
# Testleri çalıştır
npm test

# Testleri izleme modunda çalıştır
npm run test:watch
```

## Proje Yapısı

```
link-kisaltici/
├── data/               # SQLite veritabanı dosyası (çalışma zamanında oluşur)
├── public/
│   └── index.html      # Web arayüzü
├── src/
│   ├── server.js       # Sunucu ve API mantığı
│   └── server.test.js  # Birim testleri
├── Dockerfile
├── .dockerignore
├── package.json
└── README.md
```
