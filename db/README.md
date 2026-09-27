# db — çizim veritabanı

Proje çizimleri (sayfalar, bloklar, kablolar) burada JSON olarak saklanır.

| Dosya | Açıklama |
| --- | --- |
| `workbench.json` | Ana proje anlık görüntüsü |

Uygulama `npm run dev` veya `npm run preview` ile çalışırken otomatik olarak bu dosyayı okur ve günceller. GitHub’a aktarmak için `workbench.json` dosyasını commit edin; diğer bilgisayarda `git pull` yeterli.

Tarayıcıdaki `localStorage` yalnızca önbellek; asıl kaynak geliştirme sunucusu açıkken `db/` klasörüdür.
