# db — çizim veritabanı

Proje çizimleri (sayfalar, bloklar, kablolar) burada JSON olarak saklanır.

| Dosya | Açıklama |
| --- | --- |
| `workbench.json` | Ana proje anlık görüntüsü |

Uygulama `npm run dev` veya `npm run preview` ile çalışırken bu dosyayı okur. **Kaydet** ile diske yazılır; otomatik arka plan kaydı yoktur. Tarayıcıda çizim saklanmaz.
