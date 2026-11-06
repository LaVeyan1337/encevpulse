# ENCEV PULSE — Geliştirme Durumu

**Son güncelleme:** 5 Kasım 2026

> **Güncel yayın durumu:** Bu bölüm kaynak alınmalıdır; aşağıdaki bazı eski teknik maddeler önceki geliştirme adımlarının tarihsel kaydıdır ve bu güncel özetle çelişen ifadeler geçerli kabul edilmez.

## 6 Kasım 2026 — Doğrudan modül geliştirme

- **Aktif çalışma dalı:** `work/encev-pulse-modules-2026-11-06`. Bu dal, PR birleştirme zincirinden bağımsız olarak modülleri doğrudan geliştirmek için açılmıştır. `main` ve `release/company-internal-2026-11-05` değiştirilmemiştir; bu dal şirket ortamına dağıtılmamıştır.
- **Bu oturumda ele alınan modül:** e-ÇED Eklenti İzleme. Eşleştirme paneline kurulum adımları ve cihaz başına sinyal sağlığı (güncel/eski/henüz yok) eklendi. Ekran, cihazın en son raporunu esas alır.
- **Tarayıcı eklentisi:** Manifest V3 sürümü 1.0.3. Kullanıcı resmî portal izin düğmesine bastığında ilk PULSE sinyali otomatik gönderilir ve API'nin gerçek kabul sonucu gösterilir. Kurulum dokümanı bu akışla güncellendi.
- **Doğruluk sınırı:** “Sinyal güncel” yalnızca PULSE API'sinin son 90 saniyede rapor almasıdır; e-ÇED portal oturumunun resmî olarak açık veya doğrulanmış olduğu anlamına gelmez. Portal profil DOM seçicileri canlı oturumda henüz saha doğrulamasından geçmemiştir.
- **ÇED test uyumu:** Manuel son tarih düzenleme isteği gerçek arayüz payload'ıyla hizalandı. Sonraki kontrol, süre kuralı örneği ve iki doğrudan kurum görüşü bulunan sentetik projede 11 kaydı beklemelidir.
- **CI durumu:** Son doğrulama çalışması [42224999664](https://github.com/LaVeyan1337/encevpulse/actions/runs/42224999664) bu belge düzenlenirken çalışıyordu; test, TypeScript ve üretim derlemesi sonucu henüz onaylanmış değildir.
- **Dağıtım:** Şirket çalışanlarının ortak erişimi henüz hazır değildir. HTTPS/LAN sunucusu ve gerçek Windows/Chrome/Edge çok kullanıcılı kabulü ayrıca yapılmalıdır.

## 5 Kasım 2026 — Güncel ürün ve yayın özeti

- **Kaynak dal:** `feature/chat-conversation-isolation-20261105`. Bu dal, güncel web uygulamasının bütünleşik geliştirme dalıdır. `main` veya ayrı Git geçmişindeki eski masaüstü yayın dalı, bu web sürümüyle otomatik olarak aynı kabul edilmez.
- **Canlı yayın yok:** `127.0.0.1` yalnızca geliştirme yapılan bilgisayardan erişilir. Şirket içinde ortak HTTPS adresi, sabit/reserve edilmiş host IP'si, iç DNS, güvenilir TLS sertifikası, servis otomatik başlatma ve iki istemci kabul testi henüz kurulmadı.
- **Yayın hazırlığı:** `docs/COMPANY_LAN_DEPLOYMENT.md`, `deployment/Caddyfile.example`, `deployment/.env.production.example` ve `deployment/compose.production.yaml` eklendi. Bunlar kurulum şablonudur; gerçek hostname/IP veya şirket sertifikası içermez ve host üzerinde çalıştırılmış değildir.
- **Marka ve ürün dili:** Sol navigasyon altı ve giriş ekranı `ENÇEV ENERJİ` kullanır. Slogan/AI pazarlama dili ve normal kullanıcıya teknik geliştirme bilgisi gösterilmemesi ürün kabul kuralıdır.
- **Tasarım sistemi:** Koyu `#08182d` / mavi `#65baff`, açık `#eaf2fb` / mavi `#237bd5` token'ları; cam yüzeyler ve mavi/camgöbeği arka plan katmanları geçerlidir. Eski sıcak antrasit/terracotta/adaçayı notu geçersizdir.
- **Kullanılabilir modüller:** Genel Bakış, Görevler, Projeler, Çalışanlar, Sohbet, Takvim, Kurum Rehberi, Kurum Görüşleri, Dilekçeler, e-ÇED Eklenti İzleme, Notlarım ve Sistem Yönetimi mevcut uygulama akışlarıyla bulunur. Kullanıcı erişimi yine modül/rol/kayıt kapsamı kontrollerine tabidir.
- **Kasıtlı olarak kapalı modül:** Ortak Drive. Kaynak dosya yetkisi ve güvenli depolama API'si, şirket NAS koruma politikası ve ayrıca verilecek açık izin olmadan etkinleştirilmez. Dilekçeler `0024_petition_docx_workflow.sql` ile etkinleştirildi.
- **Kurum Rehberi:** Bağımsız kurum/iletişim kaydı ekleme, arama, düzenleme, arşivleme; kaynak etiketi/referansı ve kullanıcı tarafından girilen teyit tarihi; sürüm kontrolü ve append-only denetim geçmişi vardır. Çalışanlar görüntüler; süreç sahibi ve belge sorumlusu yazar. Resmî kurum sistemleriyle otomatik veri eşitleme yoktur. Proje yazışmalarındaki kişiler otomatik olarak ortak rehbere yayımlanmaz.
- **Kurum Görüşleri:** Proje kapsamlı kurum görüşü CRUD'u, gelen/giden referans, manuel son tarih, durum, arşiv ve denetim akışı vardır. Mevzuat iş günü/resmî tatil hesabı ve otomatik yasal süre hatırlatmaları yoktur.
- **e-ÇED:** Tarayıcı eklentisi eşleştirme ve tarayıcıda gözlenen sekme/hesap etiketleri vardır. Bunlar e-ÇED sunucusundan doğrulanmış kullanıcı oturumu veya resmî portal verisi değildir; bu ayrım arayüz metinlerinde açıkça belirtilir.
- **Sohbet:** Kalıcı bire bir/grup mesajlaşma, SSE güncelleme ve dosya eki yükleme akışları vardır. Eki saklama/antivirüs ve kurum veri saklama politikasının onayı gerekir. 1:1 WebRTC çağrı kodu bulunur; gerçek şirket ağında NAT/TURN/cihaz kabul testi tamamlanmadı. Grup çağrısı ve ekran paylaşımı hazır kabul edilmez.
- **Dilekçeler:** Onaylı DOCX şablonu yükleme ve sürümleme, tanımlı `{{ALAN_ADI}}` işaretleyicilerini proje/kullanıcı verisiyle doldurma, gerçek DOCX oluşturma, metin önizlemesi/indirme, proje ilişkisi, taslak-incelemede-onaylandı-gönderildi durumları, SHA-256 ve denetim geçmişi vardır. Şablon ve çıktı içeriği PULSE PostgreSQL'de saklanır; NAS kullanılmaz. EnÇev'in gerçek onaylı şablonları henüz yüklenmedi; hukuki metin ve zorunlu alan kabulü ürün sahibindedir. Elektronik imza ve otomatik dış gönderim yoktur.
- **Dilekçe CI kabulü:** Kaynak commit `579f4022d430ff9391e9315e799a4aed1b11a1c5`, Actions `42037718908` başarılı. Web testleri **24/24**, API testleri **42/42**; Web/API TypeScript kontrolleri, iki üretim derlemesi ve e-ÇED eklenti paketi üretimi geçti. API testlerine sentetik DOCX ZIP bütünlüğü/alan doldurma testleri ile şablon yükleme, proje kapsamı, rol, durum geçişi, sürüm ve indirme entegrasyonu eklendi. Bu CI koşusu gerçek EnÇev Word şablonlarını veya Windows/ofis ağını test etmez.
- **Eksik temel işler:** Gerçek onaylı şirket dilekçe şablonlarının sisteme yüklenip kullanıcı kabulünden geçirilmesi, kurum hiyerarşisi ve yetkili resmî kaynaktan rehber eşitlemesi, yasal süre motoru ve resmî tatil kaynağı, e-ÇED portal doğrulaması, kalıcı bildirim tercihleri/zamanlanmış hatırlatmalar, NAS dışındaki güvenli ortak belge deposu, Windows servisleştirme ve üretim kabulü.
- **Dosya güvenliği:** Şirket NAS/SMB/DSM paylaşımına bu geliştirmede bağlanılmaz. Ortak Drive, kaynak yetkilendirme modeli onaylanana kadar kapalıdır.



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
- Sol navigasyon: Genel Bakış, Görevler, Çalışanlar, Sohbet, Projeler, Takvim, Kurum Görüşleri, e-ÇED Eklenti İzleme ve Notlarım modül izinleri ile modül etkinlik durumuna göre gösterilir. Kullanıcılar ve Sistem Yönetimi yalnız yetkili sistem yöneticisine açılır. Yetki snapshot'ı olmayan hesaplarda gezinme fail-closed davranır.
- Üst bar (topbar):
  - Üst arama alanı (topbar-search): Görev filtreleme ve anlık arama ile tam senkronize.
  - Bildirim menüsü: Görev ve sohbet bildirimleri; API görev başlıklarını/sohbet önizlemelerini ilgili modül görüntüleme iznine göre ayrı filtreler.
  - Kullanıcı profil menüsü: Kullanıcı adı, e-posta, rol etiketi (Sistem Yöneticisi / Çalışan), parola değiştirme ve çıkış.
  - Açık ve koyu tema geçişi (`localStorage` kalıcı, semantik CSS token'ları).
  - Mobil uyumlu gezinme: Dar ekranlar ve mobil cihazlar için optimize edilmiş düzen.
- Yalnızca gerçekten çalışan modüller navigasyonda yer alır.
- Ortak hareket sistemi: daha yavaş, yumuşak sayfa/panel geçişleri; drawer ve açılır menü hareketleri; kart/sütun giriş gecikmeleri; `prefers-reduced-motion` desteği. Görsel tema `DESIGN_SYSTEM.md` ile aynı koyu lacivert/cam yüzey, mavi ve camgöbeği vurgulara göre hizalanmıştır.
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
- Sohbet dosya ekleri arayüz/API üzerinden yüklenebilir; izinli MIME ve dosya imza kontrolleri, dosya başına ve mesaj toplamı boyut sınırları ile kullanıcı kotası uygulanır. İçerik PostgreSQL'de saklanır. Antivirüs/karantina, saklama süresi ve kurum veri politikası henüz onaylanmadığından üretim kabulünün açık maddesidir.
- 1:1 WebRTC ses/video çağrı sinyalleşmesi ve arayüzü vardır. Gerçek cihazlar, şirket NAT/firewall koşulları ve TURN relay ile kabul testi yapılmadı; grup çağrısı ve ekran paylaşımı yoktur.
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

### G. Takvim temeli
- `calendar` modülü migration ile etkinleştirildi; gezinme görünürlüğü ve API işlemleri rol/modül izin matrisi üzerinden denetlenir.
- Aylık, haftalık, günlük ve ajanda görünümleri; ay/hafta/gün gezinmesi ve Türkiye saat diliminde tarih/saat gösterimi vardır.
- Kişisel, ortak ve proje bağlantılı etkinlikler; toplantı, etkinlik, hatırlatma ve teslim/son tarih türleri desteklenir. Etkinliklerde tüm gün veya saat aralığı, konum, açıklama ve katılımcı alanları bulunur.
- Proje etkinliği oluştururken aktörün etkin proje üyeliği; proje katılımcılarının da etkin proje üyeliği sunucuda doğrulanır. Kişisel etkinlik katılımcısızdır. Ortak etkinlik, takvim görüntüleme izni bulunan kullanıcılarca görülebilir.
- Etkinlik düzenleme sürüm kontrolüyle yapılır. Silme yerine arşivleme uygulanır; oluşturma, güncelleme ve arşivleme olayları append-only denetim tablosuna yazılır. Etkinliği oluşturan veya bağlı projenin sahibi yönetebilir.
- Görev başlangıç/teslim tarihleri ve proje başlangıç/hedef tarihleri takvimde mevcut kayıtlardan salt okunur kilometre taşı olarak hesaplanır; ikinci bir kopya kayıt oluşturulmaz. Kayıtlar yalnız ilgili görev/proje erişim kapsamı ve modül izinleri varsa gösterilir.
- Takvim liste API'si tarih aralığını doğrular, en fazla 93 günlük pencere kabul eder ve tüm gün/saatli kayıtların kesişimini `Europe/Istanbul` saat dilimine göre hesaplar.
- **Henüz bu aşamada yok:** otomatik hatırlatma bildirimi/arka plan zamanlayıcısı, kurum tatil takvimi ve yasal süre kural motoru. Kurum Görüşleri'nin proje kapsamlı temel CRUD akışı vardır; mevzuat iş günü hesabı, yasal hatırlatma ve İDK süreç onayı yoktur. Windows/reverse-proxy kabul testi de yapılmamıştır.

## Doğrulama ve test sonuçları

- Önceki kaynak sürümünde API/Web build, TypeScript ve görev/proje/yorum testleri CI'da başarılıydı. Bu sonuç yeni çalışan/sohbet kodunun test edildiği anlamına gelmez.
- **5 Kasım 2026 — güncel web çalışma dalı CI doğrulaması:** Kaynak commit `bc60d65f88a8615528f9615302ebe551dfb008f0`, GitHub Actions `42030203203` başarıyla tamamlandı. Temiz CI PostgreSQL ortamında migration'lar uygulandı; Web testleri **24/24**, API testleri **35/35**, iki workspace TypeScript kontrolleri, API + Web üretim derlemeleri ve e-ÇED tarayıcı eklentisi derlemesi başarılı oldu. `encev-pulse-validated-source.zip` artifact'i oluşturulup CI'a yüklendi (489.537 bayt).
- Bu koşu Linux CI kabulüdür. Windows hostta servis başlatma, gerçek Chrome/Edge profilleri, şirket LAN DNS/TLS, iki ayrı istemci, WebRTC NAT/TURN, yedek geri yükleme ve şirket çalışanlarıyla kullanıcı kabulü bu koşuda test edilmedi.
- Yeni çalışan profili testleri; alanlar, avatar, roller, rehber API'si ve profil güncellemesini kapsayacak şekilde genişletildi.
- Yeni sohbet entegrasyon testi; doğrudan/grup konuşması, üyelik, rol, idempotent mesaj gönderimi, yanıt, düzenleme/silme, tepki, sabitleme, arama, okundu bilgisi, birleşik bildirim akışı ve mesajdan görev oluşturmayı kapsar.
- Web testleri kişi kartı/rol/avatar akışını, üç panelli sohbeti, ortak bildirim yönlendirmesini ve API uçlarının UI'dan çağrılmasını kontrol eder.
- Yeni testlerin ilk CI denemesinde PostgreSQL bildirim INSERT sorgusunda aynı parametrenin UUID/metin olarak çıkarımlanması hatası yakalandı. Parametreler açık UUID cast'iyle düzeltildi; mesaj düzenleme ve denetim kaydı aynı transaction içine alındı.
- **SSE için son başarılı CI:** 3d3b425e6b6a45492fe50e970a5652f0cba49f28 / 41674472637. Migration, web 12/12, API 25/25, TypeScript ve API/Web üretim derlemeleri başarılı oldu.
- **RBAC güvenlik düzeltmesi:** 39ed1829c956366e154f7cea6c7abc8810fd5424 commit'inde ilk CI, ortak SQL parametre katmanındaki dizi parametresi hatasını buldu. Düzeltme sonrası API 25/25 ve Web 12/12 test geçti; TypeScript ve üretim derlemelerinde daha sonra iki UI tip/JSX sorunu bulundu ve giderildi.
- **Son doğrulanan RBAC kaynak:** 3f4d5250e75dfabbe86e739a0767a88c93e779c2 commit'i, GitHub Actions koşusu 41696281561 ile doğrulandı. Temiz PostgreSQL 18.6 üzerinde migration'lar uygulandı; API 25/25, Web 12/12, iki workspace TypeScript kontrolleri ve API/Web üretim derlemeleri başarılı oldu. Kaynak ZIP'i oluşturuldu ve encev-pulse-validated-source artifact'i olarak yüklendi.
- Bu doğrulama izole Linux CI ortamına aittir. Windows yerel kurulum, gerçek tarayıcı görsel kabulü, ofis ağı/NAS, gerçek reverse proxy/SSE ve üretim dağıtımı test edilmedi.
- **Güvenlik sınırı:** Bu geliştirme/incelemede şirket dosya sunucusuna veya ofis ağına istek gönderilmedi; `.env` içeriği okunmadı/değiştirilmedi.

## Bilinen durumlar ve sonraki büyük görev

- Yerel ilk yönetici hesabı kullanıcı tarafından oluşturuldu; parola ve kimlik bilgileri bu belgeye yazılmaz.
- **Sıradaki geliştirme alanları:**
  - Görev dosya ekleri için yerel uygulama deposu, karantina/indirme yetkisi ve hata telafisi tasarımı. Gerçek yükleme; izin verilen tür/boyut, zararlı yazılım taraması ve saklama süresi karara bağlanana kadar açılmaz.
  - Yerel Windows ortamında kontrollü uygulama ve gerçek tarayıcı görsel kabul testlerini tamamlama.
  - Başlangıç rol/modül izinlerini, ekip hiyerarşisini ve kayıt kapsamını süreç sahipleriyle onaylama; ardından Windows tarayıcı ve reverse-proxy kabul testlerini tamamlama.
  - Mesaj saklama/düzenleme/silme süre politikası ve SSE bağlantısının gerçek Windows/reverse-proxy kabul testi.
  - Mevcut Kurum Görüşleri ve e-ÇED eklenti gözlem akışlarına süreç sahibi onayı, resmî iş günü/tatil kaynağı ve portal tarafı doğrulaması eklenir; doğrulanmayan yasal hesap veya portal durumu otomatik üretilmez.
  - Takvim etkinlikleri için arka plan hatırlatma/uyarı işleri, bildirim idempotency ve teslimat kayıtlarıyla tasarlanır.
