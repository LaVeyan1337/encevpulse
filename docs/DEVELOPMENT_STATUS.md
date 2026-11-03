# ENCEV PULSE — Geliştirme Durumu

**Son güncelleme:** 3 Kasım 2026 (İlk Büyük Ürün Geliştirme Sprinti)

## Gerçekten uygulananlar

### A. Gerçek kullanıcı ve kimlik yönetimi
- React Router/Vite istemcisi ve NestJS API same-origin geliştirme proxy'si üzerinden çalışır; ikisi de yalnız `127.0.0.1` üzerinde dinler.
- Giriş ekranı e-posta veya kısa kullanıcı adı kabul eder (`burak@encev.com.tr` veya `burak`).
- Argon2id parola hashleme (kullanıcı başına rastgele 16 bayt salt, OWASP parametreleri).
- PostgreSQL tabanlı kalıcı oturum (`auth_sessions`), 8 saat hareketsizlik ve 7 gün mutlak geçerlilik.
- HttpOnly cookie (`pulse_session` / `__Host-pulse_session`), strict Origin denetimi, SameSite=Lax.
- CSRF koruması: Oturuma bağlı synchronizer token ve pre-auth tek kullanımlık challenge (`auth_csrf_challenges`).
- Giriş denemelerine PostgreSQL tabanlı atomik rate limit (`auth_rate_limit_buckets`).
- Güvenli oturum kapatma (`/api/auth/logout`) oturumu veritabanında iptal eder.
- Sistem yöneticisi yetkisiyle kullanıcı oluşturma, devre dışı bırakma ve parola sıfırlama (`/api/auth/users/*`).
- Son etkin sistem yöneticisinin devre dışı bırakılması ve kendi kendini kapatma engellenmiştir.
- İlk yönetici için gizli terminal girişi kullanan tek seferlik interaktif kurulum komutu hazır (`npm run auth:bootstrap-admin`). Parola terminale ve geçmişe yazılmaz; advisory lock ile korunur.
- Oturum açmış her kullanıcı için profil menüsünden erişilebilen self-service parola değiştirme çekmecesi (`/api/auth/password`).
- Herkese açık kayıt sistemi ve sahte/varsayılan parola bulunmaz.

### B. Profesyonel ana uygulama arayüzü
- Modern, Bitrix24 kullanım kolaylığına yakın, ENCEV PULSE'a özgü kurumsal tasarım sistemi.
- Sabit sol navigasyon: Genel Bakış, Görevler ve sistem yöneticisine özel Kullanıcılar.
- Üst bar (topbar):
  - Üst arama alanı (topbar-search): Görev filtreleme ve anlık arama ile tam senkronize.
  - Bildirim menüsü: Görev atama bildirimleri, okunmamış rozeti ve bildirime tıklandığında görevi sağ çekmecede açma.
  - Kullanıcı profil menüsü: Kullanıcı adı, e-posta, rol etiketi (Sistem Yöneticisi / Çalışan), parola değiştirme ve çıkış.
  - Açık ve koyu tema geçişi (`localStorage` kalıcı, semantik CSS token'ları).
  - Mobil uyumlu gezinme: Dar ekranlar ve mobil cihazlar için optimize edilmiş düzen.
- Yalnızca gerçekten çalışan modüller navigasyonda yer alır.

### C. Görev yönetimi
- Gerçek PostgreSQL verisiyle çalışan görev modülü (`tasks`, `projects`, `task_audit_events`).
- Görev oluşturma, düzenleme, sorumlu atama, öncelik belirleme (Düşük, Normal, Yüksek, Acil).
- Başlangıç ve son teslim tarihi (tarih sırası doğrulaması ile).
- Kanban görünümü: 4 sütun (Açık, Devam ediyor, Bekliyor, Tamamlandı), sütun sayaçları, sürükle-bırak ile durum değiştirme ve görsel sürükleme geri bildirimi.
- Liste görünümü: Veri tablosu, sorumlu avatarı, son tarih, durum seçimi ve öncelik rozetleri.
- Sorumlu ve projeye göre arama ve filtreleme (Bana atananlar, Oluşturduklarım, Erişebildiklerim, Arşiv).
- Sağdan açılan detay paneli (Slide-over drawer):
  - Görev başlığı, açıklama, sorumlu, oluşturan, proje, tarihler ve hızlı durum geçiş düğmeleri.
  - **Temel görev geçmişi (Task audit trail)**: `/api/tasks/:id/activity` uç noktası üzerinden göreve ait tüm hareketleri (oluşturulma, alan güncellemeleri, arşivleme, geri yükleme) aktör ve zaman bilgisiyle listeler.
- Görev arşivleme ve arşivden geri yükleme (iyimser eşzamanlılık ve sürüm doğrulaması ile).
- Proje oluşturma ve üyeleri atama çekmecesi.

### D. Gerçek Genel Bakış
- Veriler doğrudan PostgreSQL üzerinden hesaplanır:
  - **Bana atanan görevler:** `summary.assignedTotal`
  - **Açık görevler:** `summary.open`
  - **Geciken görevler:** `summary.overdue` (uyarı vurgusu ile)
  - **7 gün içinde teslim:** `summary.upcoming`
  - **Tamamlanan görevler:** `summary.completed`
- Kartlara tıklandığında ilgili görev filtreleri otomatik uygulanır.
- **Yaklaşan görevler:** Son teslim tarihi yaklaşan görevleri ve gecikme durumunu gösterir.
- **Son hareketler:** Erişilebilen görevlerdeki gerçek audit olaylarını listeler; tıklanan görev detay panelinde açılır.
- Veri bulunmadığında sade, dürüst Türkçe boş durum (empty state) gösterilir; sahte sayaç veya örnek veri üretilmez.

## Doğrulama ve test sonuçları

- **API Build:** `@encev-pulse/api` `nest build` hatasız geçti.
- **Web Build:** `@encev-pulse/web` `react-router build` SPA çıktısı hatasız geçti.
- **TypeScript Typecheck:** İki workspace'te de `tsc --noEmit` hatasız geçti (0 hata).
- **API Entegrasyon Testleri:** 17 geçti:
  - Yerel auth akışı: Origin, CSRF challenge, yanlış parola doğrulaması, oturum süresi, çıkış, yönetici kullanıcı oluşturma, geçici parola ve rate limit.
  - Argon2id parola hashi doğrulaması ve kullanıcı başına farklı salt.
  - Health/readiness kontrolleri (PostgreSQL canlı kontrolü).
  - Görev CRUD, sürüm kontrolü (version conflict 409), arşivleme, geri yükleme, proje üyeliği, bildirimler, genel özet ve göreve özel audit geçmişi (`GET /tasks/:id/activity`).
- **Web Testleri:** 5 geçti:
  - Same-origin API istemcisi doğrulaması.
  - Tema kalıcılığı ve yerel depolama bağımsızlığı.
  - Doğal kurumsal ürün dili ve pazarlama sloganı/tanılama sızıntısı yokluğu.
  - Workspace Genel Bakış metrikleri, Görev Geçmişi, Kanban sürükle-bırak ve arama kontrolleri.
- **Güvenlik Sınırı:** Testler ve geliştirme yalnızca izole yerel PostgreSQL (`127.0.0.1:5432`) ve fixture verileriyle yürütüldü; şirket dosya sunucusuna (`\\192.168.1.55\Genel Evrak`) hiçbir ağ isteği gönderilmedi.

## Bilinen durumlar ve sonraki büyük görev

- İlk yönetici hesabı henüz interaktif terminalden oluşturulmadı. Yerel kurulum için:
  `npm run auth:bootstrap-admin --workspace @encev-pulse/api`
  komutu çalıştırılarak ad soyad, kullanıcı adı, kurumsal e-posta ve gizli parola belirlenebilir.
- **Geliştirmeye devam edilecek sonraki büyük görev:**
  - Görev detayında yorumlar ve dosya ekleri tasarımı (yerel test deposu üzerinden).
  - Üç panelli şirket içi sohbet (Chat) modülü ve WebSocket gateway entegrasyonu (mimariye uygun olarak aynı NestJS süreci ve PostgreSQL outbox ile).
