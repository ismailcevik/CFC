# CFC

Siemens PCS 7 CFC tarzı sinyal / blok çalışma tezgahı.

```
frontend/   React + Vite (arayüz)
backend/    Go (API + exe)
db/         geliştirme verisi (workbench.json)
release/    müşteri paketi (build sonrası)
```

## Geliştirme

```bash
npm install --prefix frontend
npm run server    # terminal 1 — Go API :8787
npm run dev       # terminal 2 — React :5173
```

## Müşteriye verilecek paket (Windows)

```bash
npm run release:win
```

`release/` klasörünün tamamını zipleyip verin:

| Dosya | Açıklama |
| --- | --- |
| `CFC.exe` | Sunucu + tarayıcı açar |
| `dist/` | React arayüzü (exe ile aynı klasörde kalmalı) |

İlk çalıştırmada exe yanında `data/workbench.json` oluşur (Kaydet ile).

Kullanım: `CFC.exe` çift tık — ek parametre gerekmez (`dist/` ve `data/` exe’nin yanında).

## macOS (geliştirici build)

```bash
npm run release:mac
# release/CFC + release/dist/
```
