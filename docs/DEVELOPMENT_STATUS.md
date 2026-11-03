# ENCEV PULSE — Geliştirme Durumu

**Son güncelleme:** 3 Kasım 2026 (SSE sohbeti ve modül bazlı rol/izin matrisi)

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
- Sistem yöneticisi yetkisiyle kullanıcı oluşturma, devre dışı bırakma, parola sıfırlama ve profil/rol düzenleme (`/api/auth/users/*`).
- Kullanıcı profili: meslek/unvan, birim, 12 seçenekli sistem avatarı ve birden fazla rol; mevcut hesaplara migration ile varsayılan profil ve kararlı avatar atanır.
- Çalışan rehberi: gerçek etkin kullanıcıları arama ve birim filtresiyle kartlarda gösterir; karttan doğrudan sohbet başlatılır.
- Roller: employee, team_lead, project_manager, process_owner, document_steward, auditor ve system_admin katalogda yer alır. Grup sohbetinin owner/admin/member rolleri ayrı ve etkili izinlerdir; sohbet sahibi yönetici/üye atamasını yapar.
- Modül bazlı izin matrisi uygulama koduna eklendi: PostgreSQL'de rol/modül/eylem izinleri (view/create/update/delete/manage) saklanır; görev, proje, sohbet, rehber ve bildirim API uçları her istekte kontrol eder. Birden fazla rolün izinleri birleşir. Bu matris kayıt kapsamı değildir; proje üyeliği, görev ataması/oluşturan ve aktif sohbet üyeliği ayrıca denetlenir. Başlangıç izinleri süreç sahipleriyle doğrulanmalıdır.
- Erişim denetimi: modül başına view/create/update/delete/manage eylemleri; manage tek başına tüm eylemleri kapsar. İzinler PostgreSQL'de saklanır ve API her istekte doğrular.
- system_admin için kullanıcı, izin matrisi ve sistem yönetimi emniyet yetkisi kaldırılamaz; bu rol tüm proje/görev/özel sohbet kayıtlarına otomatik erişim sağlamaz.
- Önceki sürümde otomatik eklenmiş employee ataması, başka rolü bulunan mevcut hesaplardan migration ile temizlenir. Yeni hesapta employee varsayılanı korunur; başka rol seçimi employee rolünü otomatik eklemez.
- Son etkin sistem yöneticisinin devre dışı bırakılması ve kendi kendini kapatma engellenmiştir.
- İlk yönetici için gizli terminal girişi kullanan tek seferlik interaktif kurulum komutu hazır (`npm run auth:bootstrap-admin`). Parola terminale ve geçmişe yazılmaz; advisory lock ile korunur.
- Oturum açmış her kullanıcı için profil menüsünden erişilebilen self-service parola değiştirme çekmecesi (`/api/auth/password`).
- Herkese açık kayıt sistemi ve sahte/varsayılan parola bulunmaz.

### B. Profesyonel ana uygulama arayüzü
- Modern, Bitrix24 kullanım kolaylığına yakın, ENCEV PULSE'a özgü kurumsal tasarım sistemi.
- Sol navigasyon: Genel Bakış, Görevler, Çalışanlar, Sohbet ve Projeler modül izinlerine göre gösterilir; Kullanıcılar ve Rol/Modül İzinleri yalnız yetkili sistem yöneticisine açılır. Yetki snapshot'ı olmayan hesaplarda gezinme fail-closed davranır.
- Üst bar (topbar):
  - Üst arama alanı (topbar-search): Görev filtreleme ve anlık arama ile tam senkronize.
  - Bildirim menüsü: Görev ve sohbet bildirimleri; API görev başlıklarını/sohbet önizlemelerini ilgili modül görüntüleme iznine göre ayrı filtreler.
  - Kullanıcı profil menüsü: Kullanıcı adı, e-posta, rol etiketi (Sistem Yöneticisi / Çalışan), parola değiştirme ve çıkış.
  - Açık ve koyu tema geçişi (`localStorage` kalıcı, semantik CSS token'ları).
  - Mobil uyumlu gezinme: Dar ekranlar ve mobil cihazlar için optimize edilmiş düzen.
- Yalnızca gerçekten çalışan modüller navigasyonda yer alır.
- Ortak hareket sistemi: daha yavaş, yumuşak sayfa/panel geçişleri; drawer ve açılır menü hareketleri; kart/sütun giriş gecikmeleri; `prefers-reduced-motion` desteği. Görsel tema sıcak antrasit, kil/terracotta ve adaçayı paletine geçirildi.
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

### E. Çalışan rehberi ve profiller
- Kişi listesi gerçek etkin kullanıcı verisini kullanır; isim, kullanıcı adı, meslek/unvan, birim, e-posta ve roller görünür.
- Arama; isim, kullanıcı adı, e-posta, meslek ve birimde yapılır. Birim filtresi gerçek kayıtlardan türetilir.
- 12 yerleşik, şirin hayvan avatarı vardır. Yeni hesapta avatar seçilmezse sunucu rastgele avatar anahtarı üretir; aynı kişi için sonraki oturumlarda aynı avatar görünür.
- Sistem yöneticisi hesap açarken meslek/unvan, birim, avatar ve birden fazla rol seçebilir; daha sonra profili/rolleri düzenleyebilir. Kullanıcı adı ve e-posta düzenleme ekranında kilitlidir.
- Gerçek fotoğraf yükleme henüz açılmadı; dosya türü/boyutu, antivirüs taraması, saklama ve erişim politikası karara bağlanmadan kullanıcı dosyası kabul edilmez.

### F. Kalıcı üç panelli sohbet
- Bire bir ve grup konuşmaları PostgreSQL'de saklanır; aynı iki kullanıcı için yinelenen aktif bire bir konuşma oluşturulmaz.
- Mesajlar 4.000 karaktere kadar; idempotent istek kimliği, yanıt, emoji tepkileri, yazarın düzenleme/silmesi, sürüm çakışma kontrolü ve silinen mesaj için metin içermeyen tombstone kullanılır.
- Konuşma arama, son 50 mesaj ve daha eski mesajları imleçle sayfalama, okundu imleçleri, okunmamış sayacı ve sabitlenmiş mesajlar yer alır.
- Grup sahibi yönetici/üye atayabilir ve sahipliği devredebilir; devirde eski sahip yönetici olur, yeni sahip owner rolünü alır. Owner/admin/member izinleri API'de doğrulanır. Üye ekleme, çıkarma, ayrılma ve rol değişiklikleri değiştirilemez olay tablosunda kaydedilir. Aktif konuşmada tek owner veritabanı indeksiyle korunur.
- Mesajdan görev oluşturma formu; başlık, sorumlu ve proje seçimini destekler. Mesaj açıklama olarak kaynak kaydına bağlanır; yinelenen görev üretimini önleyen tekillik kuralı vardır. Bağlı görev yeniden üretim yerine açılır.
- Sohbet mesaj bildirimleri görev bildirimleriyle aynı üst menüde toplanır; bildirime tıklama hedef konuşmayı açar, okundu durumu ve genel okunmamış sayacı güncellenir.
- Sohbet listesinde, doğrudan konuşma başlığında, üye listesinde ve mesajlarda aynı çalışan avatarı kullanılır. Arama sonucu seçildiğinde mesajın kendisi bulunana kadar geçmiş sayfaları yüklenir ve mesaj ekranda ortalanır.
- Sohbet canlı güncellemeleri same-origin SSE (`/api/chat/events`) ve PostgreSQL `LISTEN/NOTIFY` ile iletilir. Bildirim payload'ları mesaj metni veya dosya bilgisi taşımaz; istemci konuşma kimliğini aldıktan sonra mevcut üyelik kontrollü REST uçlarından veriyi yeniler. Aktif üyelik bazlı fan-out, üyeliği kaldırılan kullanıcıya erişim iptali sinyali, 60 saniyede session yenidoğrulaması ve SSE kesintisinde 15 saniyelik yedek yenileme uygulanır.
- Sohbet eki yükleme kapalıdır. Eklerin izinli MIME türleri, boyut sınırı, zararlı yazılım taraması ve saklama süresi karara bağlanmamıştır. Sesli/görüntülü görüşme düğmesi eklenmemiştir.
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

- Önceki kaynak sürümünde API/Web build, TypeScript ve görev/proje/yorum testleri CI'da başarılıydı. Bu sonuç yeni çalışan/sohbet kodunun test edildiği anlamına gelmez.
- Yeni çalışan profili testleri; alanlar, avatar, roller, rehber API'si ve profil güncellemesini kapsayacak şekilde genişletildi.
- Yeni sohbet entegrasyon testi; doğrudan/grup konuşması, üyelik, rol, idempotent mesaj gönderimi, yanıt, düzenleme/silme, tepki, sabitleme, arama, okundu bilgisi, birleşik bildirim akışı ve mesajdan görev oluşturmayı kapsar.
- Web testleri kişi kartı/rol/avatar akışını, üç panelli sohbeti, ortak bildirim yönlendirmesini ve API uçlarının UI'dan çağrılmasını kontrol eder.
- Yeni testlerin ilk CI denemesinde PostgreSQL bildirim INSERT sorgusunda aynı parametrenin UUID/metin olarak çıkarımlanması hatası yakalandı. Parametreler açık UUID cast'iyle düzeltildi; mesaj düzenleme ve denetim kaydı aynı transaction içine alındı.
- **SSE için son başarılı CI:** 3d3b425e6b6a45492fe50e970a5652f0cba49f28 / 41674472637. Migration, web 12/12, API 25/25, TypeScript ve API/Web üretim derlemeleri başarılı oldu.
- **Rol/modül RBAC:** 0009_module_permissions.sql ve 0010_module_permission_defaults.sql, API erişim kontrolleri, bildirim kapsamı, yönetici matrisi ve UI eylem kapıları geliştirme dalına hazırlanıyor. Bu yeni değişiklik kümesinin CI doğrulaması henüz tamamlanmadı.
- RBAC sonrası Windows tarayıcı görsel kabulü, gerçek reverse-proxy SSE testi, gerçek şirket ağı ve üretim dağıtımı henüz test edilmedi.- **Güvenlik sınırı:** Bu geliştirme/incelemede şirket dosya sunucusuna veya ofis ağına istek gönderilmedi; `.env` içeriği okunmadı/değiştirilmedi.

## Bilinen durumlar ve sonraki büyük görev

- Yerel ilk yönetici hesabı kullanıcı tarafından oluşturuldu; parola ve kimlik bilgileri bu belgeye yazılmaz.
- **Sıradaki geliştirme alanları:**
  - Görev dosya ekleri için yerel uygulama deposu, karantina/indirme yetkisi ve hata telafisi tasarımı. Gerçek yükleme; izin verilen tür/boyut, zararlı yazılım taraması ve saklama süresi karara bağlanana kadar açılmaz.
  - Yerel Windows ortamında kontrollü uygulama ve gerçek tarayıcı görsel kabul testlerini tamamlama.
  - Başlangıç rol/modül izinlerini, ekip hiyerarşisini ve kayıt kapsamını süreç sahipleriyle onaylama; ardından Windows tarayıcı ve reverse-proxy kabul testlerini tamamlama.
  - Mesaj saklama/düzenleme/silme süre politikası ve SSE bağlantısının gerçek Windows/reverse-proxy kabul testi.
  - Takvim ve yasal operasyon modülleri, süreç sahiplerince doğrulanmış süre kuralları ve tatil kaynağıyla aşamalı olarak eklenir.
