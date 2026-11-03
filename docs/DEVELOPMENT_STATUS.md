# ENCEV PULSE — Geliştirme Durumu

**Son güncelleme:** 3 Kasım 2026 (Ghost loading ve sayfa geçiş sistemi)

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
- Sabit sol navigasyon: Genel Bakış, Görevler, Projeler ve sistem yöneticisine özel Kullanıcılar.
- Üst bar (topbar):
  - Üst arama alanı (topbar-search): Görev filtreleme ve anlık arama ile tam senkronize.
  - Bildirim menüsü: Görev atama bildirimleri, okunmamış rozeti ve bildirime tıklandığında görevi sağ çekmecede açma.
  - Kullanıcı profil menüsü: Kullanıcı adı, e-posta, rol etiketi (Sistem Yöneticisi / Çalışan), parola değiştirme ve çıkış.
  - Açık ve koyu tema geçişi (`localStorage` kalıcı, semantik CSS token'ları).
  - Mobil uyumlu gezinme: Dar ekranlar ve mobil cihazlar için optimize edilmiş düzen.
- Yalnızca gerçekten çalışan modüller navigasyonda yer alır.
- Ortak hareket sistemi: sayfa geçişinde hafif büyüklükten doğal boyuta oturan giriş animasyonu; drawer ve açılır menü geçişleri; kart/sütun giriş gecikmeleri; `prefers-reduced-motion` desteği.
- Gerçek veri istekleri sürerken Genel Bakış, Kanban/liste, görev geçmişi ve yorum alanlarında yerleşimi koruyan ghost skeleton kullanılır; örnek kayıt veya sahte metrik gösterilmez.

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
- **Projeler çalışma alanı:** erişilebilen projeleri aktif/arşiv görünümünde listeleme; gerçek görev sayısı/tamamlanma oranı, sahip, üye sayısı ve tarihleri gösteren kartlar.
- **Proje detayı:** genel bakış, bağlı görevler ve üyeler sekmeleri; görevden mevcut görev detayına geçiş; proje audit hareketleri.
- **Proje yönetimi:** proje adı/açıklaması, hazırlık/aktif/beklemede/tamamlandı durumu, sahip, başlangıç/hedef tarihleri ve üyelik düzenleme; sürüm çakışması kontrolü; arşivleme ve arşivden geri yükleme.
- Proje erişimi API'de doğrulanır; sahip ve oluşturan düzenleme/arşiv yetkisine sahiptir, üyeler proje bağlamını okuyabilir. Proje arşivi bağlı görevleri silmez.
- Görev içi yorumlar: görev erişim kuralına bağlı listeleme/ekleme; yalnız yorum yazarının düzenleme ve silme yetkisi; 4.000 karakter sınırı; iyimser sürüm kontrolü.
- Yorum silme metni boşaltır; yorum kaydı ve metin içermeyen, eklemeli yorum olay geçmişi korunur.
- Yorum eklendiğinde görev kaydına erişebilen diğer etkin kullanıcılara aynı transaction içinde tekil uygulama içi bildirim yazılır.

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
- **API Entegrasyon Testleri:** 19 geçti:
  - Yerel auth akışı: Origin, CSRF challenge, yanlış parola doğrulaması, oturum süresi, çıkış, yönetici kullanıcı oluşturma, geçici parola ve rate limit.
  - Argon2id parola hashi doğrulaması ve kullanıcı başına farklı salt.
  - Health/readiness kontrolleri (PostgreSQL canlı kontrolü).
  - Görev CRUD, sürüm kontrolü (version conflict 409), arşivleme, geri yükleme, proje üyeliği, bildirimler, genel özet ve göreve özel audit geçmişi (`GET /tasks/:id/activity`).
  - Görev yorumları: erişim sınırı, yalnız yazarın düzenleme/silme yetkisi, sürüm çakışması, silinen metnin boşaltılması ve yorum bildirimi.
  - Proje çalışma alanı: sahip/üye erişimi, detay, durum/tarih, üye değişikliği, sürüm çakışması, arşiv/geri yükleme ve önceki durumu bilinmeyen eski arşiv kaydında açık durum seçimi.
- **Web Testleri:** 8 geçti:
  - Same-origin API istemcisi doğrulaması.
  - Tema kalıcılığı ve yerel depolama bağımsızlığı.
  - Doğal kurumsal ürün dili ve pazarlama sloganı/tanılama sızıntısı yokluğu.
  - Workspace Genel Bakış metrikleri, Görev Geçmişi, Kanban sürükle-bırak, arama ve görev yorum arayüzü kontrolleri.
  - Cam görsel katmanının kök uygulamaya bağlanması.
  - Ghost skeleton, sayfa/drawer animasyonları ve hareket azaltma tercihinin kontrolü.
  - Proje listesi, proje detay sekmeleri, edit/üyelik, arşiv/geri yükleme ve eski arşiv durum seçimi.
- **Güvenlik Sınırı:** Testler ve geliştirme yalnızca izole yerel PostgreSQL (`127.0.0.1:5432`) ve fixture verileriyle yürütüldü; şirket dosya sunucusuna (`\\192.168.1.55\Genel Evrak`) hiçbir ağ isteği gönderilmedi.

## Bilinen durumlar ve sonraki büyük görev

- Yerel ilk yönetici hesabı kullanıcı tarafından oluşturuldu; parola ve kimlik bilgileri bu belgeye yazılmaz.
- **Sıradaki geliştirme alanları:**
  - Görev dosya ekleri için yerel uygulama deposu, karantina/indirme yetkisi ve hata telafisi tasarımı. Gerçek yükleme; izin verilen tür/boyut, zararlı yazılım taraması ve saklama süresi karara bağlanana kadar açılmaz.
  - Sohbet: üç panelli, kalıcı mesajlaşma; yanıt, reaksiyon, düzenleme/silme, okundu bilgisi, arama ve mesajdan görev oluşturma.
  - Sohbetin gönderim/okunma ve gerçek zamanlı teslim politikası için outbox akışının uygulanması; tek instance çalışma sınırları doğrulanmadan Redis/mikroservis eklenmez.
  - Takvim ve yasal operasyon modülleri, süreç sahiplerince doğrulanmış süre kuralları ve tatil kaynağıyla aşamalı olarak eklenir.
