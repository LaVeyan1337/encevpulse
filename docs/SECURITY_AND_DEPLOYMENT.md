# ENCEV PULSE — Güvenlik ve Dağıtım Tasarımı

**Durum:** Güvenlik/dağıtım tasarımı; yerel kimlik doğrulama altyapısı uygulanmıştır, production kimlik ve hosting ayarları henüz yapılmamıştır.
**Tarih:** 3 Kasım 2026  
**Öncelikli kural:** [AGENTS.md](../AGENTS.md) ve [DATA_PROTECTION_POLICY.md](DATA_PROTECTION_POLICY.md) bağlayıcıdır.

## 1. Kesin dosya sunucusu sınırı

Bu tasarımda şirket NAS'ına, `192.168.1.55` adresine, SMB paylaşımına veya DSM'ye hiçbir bağlantı kurulmaz. Tarama, sorgulama, dosya okuma, indeksleme, kopyalama, yazma ya da test yoktur. Gerçek entegrasyon yalnızca teorik bir sonraki-adım seçeneğidir ve kullanıcıdan ayrıca açık izin gerektirir.

İleride izin verilse dahi önerilen korumalar: dosyayı taşımadan mevcut yapıyı koruma, salt okunur varsayılan, SMB'yi internete açmama, backend/API üzerinden sınırlı erişim, kullanıcı kaynağındaki izinleri doğrulama, erişim denetimi ve içerik sunumunu kayıt altına alma. Kaynağın gerçek API ve yetki modelinin güvenli entegrasyona elverişli olup olmadığı henüz doğrulanamaz. Bu aşamada provider yalnızca soyut tasarım ve yerel sahte veridir.

## 2. Kimlik ve oturum

- **Hesap kaydı:** herkese açık kayıt yoktur. Sistem yöneticisi çalışan hesabı oluşturur; benzersiz kullanıcı adı ve `@encev.com.tr` e-posta aynı hesaba bağlanır. Giriş alanı “E-posta veya kullanıcı adı”dır; iki değer aynı parolayı kullanır. Kullanıcı adı ve e-posta boşluklardan arındırılıp küçük harfe normalize edilir; DB unique constraint son güvence, uygulama ön kontrolü yalnız kullanıcıya anlaşılır çakışma hatası verir.
- **Parola saklama:** Node.js yerleşik Argon2id uygulaması her parola için rastgele 16 bayt salt ve `m=19456 KiB, t=2, p=1` kullanır; PHC biçimindeki hash algoritma/sürüm/parametreleri taşır. Bu, OWASP minimumudur; üretim donanımında ölçülüp yükseltilmelidir. Node.js `>=24.7.0` gerekir. Parola, hash veya geçici parola loglara/telemetriye yazılmaz. Başarısız girişte mevcut olmayan kullanıcıyla yanlış parola aynı genel yanıtı verir; kullanıcı varlığını ifşa etmez.
- **Rate limit:** girişte hem normalize edilmiş hesap kimliği hem istemci IP'si için atomik PostgreSQL sayaçları kullanılır. Mevcut başlangıç limiti hesap başına 15 dakikada 5, IP başına 15 dakikada 30 istektir. Ham kimlik ve IP yerine `AUTH_RATE_LIMIT_SECRET` ile HMAC özeti saklanır. Üretimde istemci IP'si yalnız `TRUSTED_PROXY_IPS` içindeki proxy'lerden gelen forwarded zinciri üzerinden alınır; proxy listesi olmadan production API başlamaz. Limit `429` döndürür; kalıcı hesap kilidi uygulanmaz. Eşikler production kapasitesinde onaylanmalıdır.
- **Oturum:** girişte kriptografik rastgele opaque session token üretilir; PostgreSQL `auth_sessions` tablosunda yalnız token hash'i ve CSRF token hash'i tutulur. Uygulama varsayılanı 8 saat hareketsizlik ve 7 gün mutlak süre; production değerleri ayrıca onaylanmalıdır. Her istekte DB üzerinden geçerlilik ve hesap durumu denetlenir; DB erişilemiyorsa fail-closed davranılır. Logout, hesap kapatma, yönetici parola reseti, kullanıcının parola değişimi ve ayrıcalık değişimi geçerli oturumları iptal eder.
- **Cookie:** üretimde `__Host-pulse_session; Secure; HttpOnly; SameSite=Lax; Path=/` ve `Domain` olmadan host-only cookie kullanılır. Loopback geliştirmede HTTPS yoksa `pulse_session` ayrı cookie adı ve yalnız development konfigürasyonunda `Secure=false` kullanılabilir; üretimde `NODE_ENV=production` Secure zorunludur. Token `localStorage` veya `sessionStorage` içine konmaz.
- **CSRF:** oturum açmış kullanıcının state-changing istekleri oturuma bağlı synchronizer token'ı özel header'da sunar; sunucu token hash'ini doğrular ve ayrıca kesin `Origin` kontrolü yapar. SameSite ek savunmadır, tek başına çözüm değildir. Login ve pre-auth token uçları da Origin kontrolü ve kısa ömürlü, tek kullanımlı PostgreSQL challenge ile korunur. Challenge tüketimi atomik olmalıdır. GET/HEAD/OPTIONS değişiklik yapmaz.
- **İlk yönetici kurulumu:** tek seferlik yerel CLI yalnız interaktif TTY'de çalışır; parolayı gizli ve onaylı alır, komut satırı argümanına/env'e koymaz ve hiçbir loga yazmaz. DB transaction/advisory lock ile `auth_bootstrap_state` ve mevcut yönetici durumunu birlikte kontrol eder; ilk yönetici ve tamamlandı işareti atomik kaydedilir. Tekrar çalıştırma, bootstrap tamamlanmışsa veya yönetici varsa reddedilir. Varsayılan kullanıcı/parola yoktur. Komut ancak şema migration'ları sonrası, yetkili operatörce çalıştırılır.
- **Yönetici parola yenilemesi:** SMTP olmadığı için parola sıfırlama e-postası/linki gösterilmez. Yönetici doğrulanmış bir işlemle 24 saat geçerli tek kullanımlı geçici parola üretir; yalnız Argon2id hash'i kaydedilir, `must_change_password` işaretlenir ve eski oturumlar iptal edilir. Yönetici parolayı bir kez görür ve güvenli yoldan iletir. Kullanıcı parolayı değiştirince bu işaret kalkar.
- **Gelecekte SSO:** Entra ID / Microsoft 365 bağlantısı sonradan OIDC Authorization Code + PKCE, `state`/`nonce`, issuer/audience, imza, tenant ve callback allowlist doğrulamasıyla eklenebilir. Provider kimliği ayrı `external_identities` kaydında `(provider, issuer, tenant, subject)` ile eşlenir. Aynı e-posta otomatik hesap birleştirme sebebi değildir. Harici sağlayıcı şu an etkin değildir ve uygulama mevcut oturum modelini bozmayacak provider sınırı bırakır.
- Kimlik doğrulama ve yetkilendirme ayrı denetlenir; geçerli oturum tüm ürün kayıtlarına erişim hakkı vermez. [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet), [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet), [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet)
- WebSocket handshake aynı session cookie'si ve izinli Origin ile doğrulanır. Token URL/query string'e konmaz; her bağlantıda ve yetki gerektiren olayda session, kullanıcı durumu ve kaynak üyeliği doğrulanır.

### Geliştirme ve üretim origin'i

- Yerel geliştirmede Vite yalnız `127.0.0.1:5173`, NestJS yalnız `127.0.0.1:3000` üzerinde dinler; Vite `/api/*` yolunu aynı origin'de API'ye proxy eder. Giriş ve oturum uçları `/api/auth/*` altındadır. Test kullanıcıları ve verileri sentetiktir, test bitince temizlenir. Yerel HTTP cookie istisnası ayrı `pulse_session` cookie'siyle sınırlanır.
- Üretimde tek HTTPS hostu/reverse proxy SPA varlıklarını sunar ve `/api/*`, WebSocket yolunu NestJS'e geçirir. Böylece API ve UI same-origin kalır, CORS gerekmez. Cookie `Secure` zorunlu ve host-only'dir; `SameSite=Lax`, `HttpOnly`, `Path=/` uygulanır. Forwarded IP bilgisi yalnız yapılandırılmış `TRUSTED_PROXY_IPS` adreslerinden kabul edilir.
- Reverse proxy yalnız güvenilen proxy'den gelen forwarded header'lara güvenir; WebSocket upgrade aktarımını destekler. API başka origin'e taşınacaksa CORS, credential, CSRF ve cookie alanı yeniden tasarlanıp incelenir; credential'lı wildcard kullanılmaz.

İlk görev API'si session cookie ve sunucu tarafı proje/atanan/oluşturan kapsamını birlikte denetler; kimliği tahmin edilen fakat erişilemeyen görev 404 verir. POST/PATCH işlemleri strict Origin, JSON içerik türü ve oturuma bağlı CSRF token'ı ister. Görev alanları allowlist ve uzunluk/tarih/status/priority kurallarıyla doğrulanır. Güncellemede beklenen satır sürümü uyuşmazsa 409 döner; arşivleme fiziksel silme değildir. Görev atama bildirimi görevle aynı transaction'da yazılır; listeleme ve okundu işaretleme alıcı yetkisini ve görev erişimini yeniden kontrol eder. Bu ilk sürümde yorum, takipçi ve dosya işlemleri kapsam dışıdır.

## 3. Yetkilendirme ve veri izolasyonu

- Başlangıçta RBAC (rol/izin) ile ekip, proje ve konuşma üyeliği gibi kaynak kapsamı birlikte kullanılır. Tek başına rol adı kayıt erişimini belirlemez.
- Her API isteği ve WebSocket olayı için sunucu kullanıcı kimliğini doğrular; hedef kayda erişimi veri katmanındaki üyelik/scope ile kontrol eder. İstemci tarafından gönderilen `user_id`, `team_id`, `project_id` yetki kanıtı değildir.
- Varsayılan erişim en az yetkidir. Yönetici olmak tüm sohbet içeriğini veya hassas süreç belgelerini otomatik görme hakkı anlamına gelmemelidir; rol matrisi ürün sahibince netleştirilmelidir.
- PostgreSQL RLS ek savunma olabilir; uygulama izin kontrolünün yerine geçmez. DB bağlantı rolleri en az yetkili olmalı, migration/admin hesabı çalışma zamanı hesabından ayrılmalıdır.
- Erişim reddi, kayıt varlığını da sızdırmamalı; hata yanıtları uygun şekilde 403/404 ayrımını ve bilgi sızıntısını değerlendirir.

## 4. API, sohbet ve uygulama güvenliği

- HTTPS zorunlu; tarayıcı statik varlıkları ve API aynı origin/reverse proxy altında sunulması tercih edilir. Veritabanı ve yönetim arayüzleri genel internete açılmaz.
- REST uçları sürümlü, şema doğrulamalı ve boyut/filtre sınırlarına sahip olmalıdır. CORS yalnızca bilinen uygulama origin'lerine izin verir; mümkünse aynı origin ile sade tutulur.
- Form ve API girdisi doğrulanır; ORM kullanımı tek başına SQL injection, yetki açığı veya iş kuralı ihlalini engellemez. HTML/Markdown çıktısı güvenli şekilde encode/sanitize edilir.
- Oturum açma, CSRF challenge üretimi, mesaj gönderme, arama, dosya yükleme ve pahalı liste uçlarına uygun hız/istek limiti uygulanır. Giriş denemeleri ham parola veya ham kimlik bilgisi loglanmadan ölçülü izlenir; başarısız giriş ile kullanıcı bulunamadı yanıtları ayırt edilemez olmalıdır.
- Güvenlik başlıkları: CSP, `X-Content-Type-Options`, uygun frame/referrer politikası; HTTPS HSTS dağıtım modeli doğrulandıktan sonra etkinleştirilir.
- WebSocket bağlantısı oturumla doğrulanır; her join/send/read/reaction/ack olayı yeniden kapsam denetiminden geçer. Kanal/room kimliğini tahmin etmek erişim sağlamaz.
- Mesaj kalıcı veritabanına yazılmadan “gönderildi” gösterilmez. İdempotency, reconnect cursor, üyelik bazlı fan-out ve içerik sızıntısı kontrolleri gerekir.

## 5. Dosya ve ek güvenliği

- Şirket dosya sunucusuna aktif entegrasyon yoktur. Backend doğrudan yol veya SMB adresi almaz; kullanıcıya ait gerçek dosya kimliği/erişim bilgisi yapılandırmaya konmaz.
- Sohbet ekleri şirket NAS'ından tamamen bağımsız, özel uygulama blob deposunda tutulur. Üretim sağlayıcısı seçilmemiştir ve bu görevde adapter/gerçek provider oluşturulmaz. Yerel geliştirme/test yalnız proje içindeki sentetik yerel test deposunu kullanır; ağ tabanlı fallback veya NAS yolu yoktur.
- DB attachment kaydı `pending` → `quarantined` → `ready`/`rejected` durumlarıyla ilerler. Dosyaya sunucu tarafından üretilen opak ID verilir; kullanıcı dosya adı path olarak kullanılmaz. Gerçek MIME/içerik doğrulaması, boyut/tür/kota sınırı ve zararlı yazılım taraması yapılmadan indirme açılmaz.
- Blob deposu ile PostgreSQL transaction'ı ortak olmadığından önce pending metadata, sonra karantina yüklemesi ve kontroller, son olarak DB'de ready/message link commit modeli kullanılır. Yarım yük veya commit hatası idempotent cleanup/reconciliation olayıyla tamamlanır. DB'de checksum, içerik türü, boyut, tarama state'i ve opaque object id bulunur; binary gövde bulunmaz.
- Nesneler private ve şifreli tutulur. Her indirmede session, conversation üyeliği ve ready state doğrulanır. İlk seçenekte API üzerinden akış; üretim sağlayıcısı seçilince gerekirse dar kapsamlı kısa ömürlü imzalı URL değerlendirilebilir. Kalıcı public URL, NAS yolu veya depoya genel erişim yoktur. `Content-Disposition: attachment`, güvenli dosya adı ve `nosniff` kullanılır.
- Kota, azami boyut/tür, tarama sağlayıcısı, saklama/silme ve maliyet karara bağlanana kadar gerçek dosya ekleme özelliği açılmaz. Dosya erişim audit'i içerik byte'ı veya hassas kaynak yolu taşımaz.

## 6. Audit kayıtlarının korunması, log ve hata yönetimi

- Audit izi kullanıcı, zaman, işlem, kayıt ve korelasyon kimliğini tutar; mesaj metni, dosya gövdesi, parola ve token'ı tutmaz.
- Audit event iş değişikliğiyle aynı DB transaction'ında yazılır; audit insert başarısızsa korunması gereken iş değişikliği commit edilmez. Şema/kayda yalnız alan allowlist'li, gerekli değişiklik metadata'sı eklenir.
- Audit şemasının owner rolü API runtime ve worker kimliğinden ayrıdır. Runtime role tablo sahibi değildir; yalnız INSERT ve iş için gereken sınırlı SELECT alır. UPDATE, DELETE, TRUNCATE, DDL, owner/grant yetkisi verilmez. UPDATE/DELETE'i reddeden trigger ek savunmadır; TRUNCATE için ayrıca privilege kapatılır.
- Uygulama kullanıcısı audit kaydını UI/API üzerinden düzenleyemez/silemez. Düzeltme yeni bir audit olayıyla ilişkilendirilir; geçmiş satır değiştirilmez. Runtime DB rolü doğrudan DML kullanabilse bile veritabanı privilege'i bunu reddeder.
- PostgreSQL superuser/DB owner/altyapı yöneticisi bu sınırı teknik olarak aşabilir. Bu ayrıcalıklar çok kısıtlı tutulur; yönetici erişimi uygulama audit'inden bağımsız, erişimi kontrollü altyapı kayıtlarında izlenir. Yedekleme ve audit arşivine erişim de sınırlanır. Hash chain veya harici WORM deposu ek koruma olarak ancak ihtiyaç/bütçe sonrası değerlendirilir.
- Uygulama logları yapılandırılmış ve erişimi kısıtlıdır; log erişimi ve saklama süresi belirlenir. Güvenlik olayı ile ürün audit geçmişi farklı amaçlarla yönetilir.
- API hatası kullanıcıya güvenli ve anlaşılır `code` verir; beklenmeyen hata ayrıntısı, stack trace veya altyapı sırrı göstermez. Korelasyon ID destek incelemesini sağlar.
- Worker/outbox işlemleri idempotenttir; tekrar deneme ve başarısız olay gözlemlenebilir. Sağlık endpoint'i sır veya kişisel veri döndürmez.
- Hassas veriye erişim, rol değişimi, başarısız yönetici işlemi ve yetki reddi için ölçülü güvenlik olayları tanımlanır; aşırı loglama kişisel veri riskini büyütmemelidir.

### Transactional outbox ve worker

- Her kalıcı iş değişikliğiyle oluşan olay, business row ve audit ile aynı transaction'da `outbox_events` tablosuna yazılır. Rollback durumunda yayımlanacak olay kalmaz.
- İlk aşamada tek NestJS API process'i REST, WebSocket gateway ve outbox polling/worker görevini çalıştırır; Redis veya mikroservis eklenmez. Worker kısa transaction'da `FOR UPDATE SKIP LOCKED` ile uygun satırı lease'leyip alır, işi transaction dışında yapar, sonra ayrı transaction'da sonucu işaretler. Süre aşımında lease geri alınabilir.
- Retry exponential backoff ve deneme sayısıyla idempotent yapılır; kalıcı hata dead-letter durumuna düşer ve operasyon görünürlüğü/uyarısı üretir. Outbox için `(available_at,id)` sorgu indeksi ve tamamlanmış kayıt saklama/temizleme politikası gerekir.
- WebSocket publish DB commit sonrasında yapılır. Publish başarılı olup `published_at` yazılmadan süreç çökerse olay tekrar gönderilebilir; bu nedenle event ID ile at-least-once ve client dedup uygulanır. Mesajın kesin kaynağı DB'dir; reconnect son cursor'dan geçmişi çeker. Push, alıcının mesajı okuduğu garantisi değildir.
- Tek API instance başlangıç varsayımıdır. Birden çok instance'a geçişte DB outbox tek başına farklı instance'larda bağlı soketlere dağıtım yapmaz; ortak broker/paylaşımlı fan-out çözümü bu ölçek kararıyla birlikte seçilmelidir.

## 7. Dağıtım ve uzaktan erişim

Önerilen ilk dağıtım sade bir internet uygulamasıdır: kullanıcı evden/ofisten HTTPS üzerinden uygulamaya erişir; kimlik, API, veritabanı ve dosya erişimi sunucu tarafında yönetilir. Ev/ofis cihazının şirket NAS'ına doğrudan erişmesi gerekmez ve önerilmez.

- Web statik varlıkları ve API güvenli HTTPS reverse proxy arkasında sunulur. Proxy WebSocket upgrade ve uzun bağlantıları destekler.
- Uygulama servisi ile DB özel ağda konuşur. DB yalnızca uygulama/operasyon bağlantılarına açıktır. Yönetim erişimi MFA ve sınırlı yönetim ağı/kanalıyla yapılır.
- İlk aşamada bir API örneği yeterli olabilir; kesintisiz çalışma veya yük gereksinimi belirlendiğinde yedek örnek, sağlık kontrolü ve ortak realtime broker planlanır. Birden çok API örneğine geçince her kullanıcının WebSocket olayı örnekler arasında paylaştırılmalıdır.
- Node.js dağıtımında uygulama kurulurken desteklenen Active/Maintenance LTS hattı seçilip sürüm sabitlenir; yaşam döngüsü dağıtım öncesi tekrar kontrol edilir. [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- Uygulama güncellemeleri sürüm kontrollü, gözden geçirilmiş build ve geri dönüş/roll-forward planıyla yayımlanır. Veritabanı schema değişikliği geriye uyumlu aşamalara bölünür; yedekleme ve geri yükleme planı doğrulanmadan yıkıcı migration yapılmaz.
- Staging ve test tamamen sentetik yerel veriyle veya şirketçe onaylanmış izole ortamda yürütülür; şirket dosya sunucusuna hiçbir şekilde erişilmez.

## 8. Yedekleme, kesinti ve felaket kurtarma

- Yedek kapsamı uygulama DB'si ve ileride onaylanmış uygulama eki deposudur. Şirket NAS dosyaları bu sistem tarafından yedeklenmez ve yedek testi için kullanılmaz.
- Şifreleme, anahtar yönetimi, hedef bölge, saklama ve erişim rolleri belirlenir. Yedek hedefi üretim hesabından ayrılır; değiştirilemez/izole kopya seçeneği incelenir.
- RPO (kabul edilen veri kaybı süresi) ve RTO (geri dönme hedefi) bilinmediğinden yedek sıklığı veya kesinti taahhüdü verilemez. İş sahibi ve altyapı sorumlusu belirlemelidir.
- Yedeklerin test restore'u belirlenen takvimde yapılır; geri dönüş prosedürü, kimlerin uygulayacağı ve kullanıcıya iletişim adımı dokümante edilir.
- Yönetilen Supabase kısa liste adayıysa resmî sayfasında Pro plan başlangıcı $25/ay, günlük backup 7 gün ve ek PITR maliyeti listelenmektedir; bölge, kota ve plan koşulları satın alma öncesi tekrar doğrulanmalı. [Supabase pricing](https://supabase.com/pricing). Hizmet sağlayıcı yedeği uygulamanın RPO/RTO ve geri dönüş testi yerine geçmez.

## 9. Kişisel veriler, saklama ve KVKK incelemesi

Bu bölüm mühendislik gereksinimlerini belirler; ürünün KVKK'ya veya başka bir mevzuata uygun olduğunu ileri sürmez. İşleme amaçları ve hukuki dayanak, veri sorumlusu/veri işleyen rolleri ve uygulama yükümlülükleri Türk hukukçusu/KVKK uzmanı tarafından güncel mevzuat ve gerçek kullanım akışı üzerinden doğrulanmalıdır.

- **Veri envanteri/sınıflandırma:** çalışan hesabı/ekip ilişkisi, görev ve mesaj içeriği, dış kurum iletişim kişileri, yasal süreç belgeleri ve erişim logları farklı veri sınıfları olarak kaydedilir. Gerekli olmayan kimlik/iletişim alanı toplanmaz. Özel nitelikli kişisel veri ortaya çıkıp çıkmayacağı bilinmiyor; işlenmesi gerekirse ayrı hukuki ve güvenlik değerlendirmesi yapılmadan ürün akışına alınmaz.
- **Amaç ve şeffaflık:** her veri grubu için belirli iş amacı, hukuki dayanak, erişen rol, kullanıcıya verilecek aydınlatma ve veri sahibine yanıt süreci iş sahibi/hukuk danışmanıyla belgelenir. Çalışan mesajlarının yönetsel gözetimde kullanılma sınırı açıkça kararlaştırılır.
- **Saklama:** sohbet, görev geçmişi, kurum görüşü, dilekçe ve ekler, audit ve güvenlik logları için ayrı saklama sınıfları ve süreleri gerekir. Bu süreler bilinmediği için burada sayı uydurulmaz. Süre bitiminde arşivleme/silme/anonimleştirme, yasal hold ve yedeklerden temizlenme davranışı tanımlanır; silme talebi audit/backup/ilişkili kayıtlara etkisiyle hukuk tarafından doğrulanır.
- **Veri sahibi işlemleri:** erişim/düzeltme/silme/itiraz benzeri başvuruların kime ulaşacağı, kimlik doğrulama ve yasal istisna süreci tanımlanır. Çalışan hesabı kapatılması, proje/audit geçmişini sessizce yok etmemeli; kimliksizleştirme ve saklama dengesi belirlenmelidir.
- **Veri yerleşimi ve hizmet sağlayıcılar:** uygulama DB'si, attachment deposu, log/monitoring, destek erişimi, yedek ve disaster recovery kopyalarının tüm bölgeleri ve alt işleyenleri envanterlenir. Türkiye dışına aktarım veya yurt dışından erişim doğup doğmadığı ve gerekli güncel mekanizma, veri sorumlusu/hukuk danışmanıyla doğrulanır. Barındırma bölgesi bugün seçilmemiştir.
- **Erişim kaydı:** hassas süreç/dilekçe/kurum görüşü kaydını görüntüleme, dışa aktarma, paylaşma ve izin değişikliği; aktör, hedef, zaman, işlem ve sonuç ile ölçülü şekilde audit edilir. Mesaj veya dosya içeriği audit/log'a kopyalanmaz. Yetki matrisi, erişim gözden geçirmesi ve işten ayrılan hesap iptali tanımlanır.
- **Olay yönetimi:** kişisel veri ihlali şüphesi için tespit, sınırlama, delil koruma, sorumlu/hukuk bilgilendirmesi ve yasal bildirim gerekip gerekmediğinin belirlenmesi süreci hazırlanır. Süre/zorunluluk konusunda varsayım yapılmaz; güncel yasal değerlendirme uzman sorumluluğundadır.
- **Kontroller:** TLS ve depoda şifreleme, en az yetki, admin MFA, erişim logları, anahtar rotasyonu, yedek erişim kısıtı ve düzenli erişim gözden geçirmesi sağlanır. Şifreleme anahtarı/hosting bölgesiyle aynı erişim çevresinde kontrolsüz tutulmaz.

## 10. İlk tehdit modeli ve azaltımlar

| Tehdit | Önerilen azaltım |
|---|---|
| Kullanıcı başka projeye ait görevi tahmin ederek açar | Her kayıtta sunucu tarafı scope/üyelik kontrolü; negatif yetki testleri. |
| Çalışan hesabı işten ayrıldıktan sonra açık kalır | Kurumsal IdP yaşam döngüsü eşlemesi, oturum iptali, periyodik erişim gözden geçirmesi. |
| WebSocket room üzerinden mesaj sızıntısı | Oda üyeliğini sunucu belirler; her bağlantı/olayda auth ve üyelik doğrulaması; reconnect sonrası tekrar yetki. |
| Dosya URL'si yetkisiz kişiye iletilir | Public kalıcı URL yok; her indirmede yetki veya kısa ömürlü imza; erişim audit'i. |
| Kimlik bilgisi kaynak koda/istemciye sızar | Secret manager/erişim kontrollü secret store; CI ve frontend bundle'a sır koymama; rotasyon planı. |
| Hatalı dağıtım veri kaybı yaratır | Gözden geçirilen sürüm ve migration, yedek, geri yükleme provası, kademeli/geriye uyumlu deployment. |
| Loglar kişisel veya hassas içerik açığa çıkarır | Log alan allowlist'i, redaksiyon, erişim/saklama sınırı, log örnekleme incelemesi. |
| NAS'ı uygulama üzerinden tehlikeye atma | Aktif bağlantı yok; kesin yerel geliştirme sınırı; SMB/public ağ yolu yok; ayrı açık izin olmadan erişim yok. |

## 11. Açık güvenlik ve operasyon kararları

1. Entra ID/SSO geçişi ve yerel parola ile SSO'nun birlikte/ayrı kullanım politikası; MFA ve çalışan hesabı yaşam döngüsü.
2. Kullanıcı adı karakter/uzunluk sınırları, parola asgari uzunluğu ve geçmiş/yeniden kullanım politikası; production rate limit eşiği ve oturum sürelerinin onayı.
3. Yönetici tarafından gösterilen 24 saatlik geçici parolanın kullanıcıya güvenli iletim yöntemi.
4. Uygulama/veritabanı/attachment hosting yeri, veri yerleşimi, alt işleyenler ve bulut politikası.
5. Yetki matrisi: ekip yöneticisi, proje sahibi, sistem yöneticisi ve hassas süreç erişimi; erişim gözden geçirme sıklığı.
6. RPO/RTO, yedek saklama, restore sıklığı ve olay müdahale sorumlusu.
7. Sohbet/dilekçe/yasal süreç, attachment, audit ve güvenlik logları için saklama/silme kuralları.
8. Chat eki özel deposu sağlayıcısı, tarama, kota, şifreleme ve maliyet.
9. Amaç/hukuki dayanak, aydınlatma, veri sorumlusu/veri işleyen rolleri, veri sahibi başvuruları ve KVKK uzman incelemesi.
10. Türkiye dışı depolama/erişim/alt işleyen ve olası yurt dışı aktarımı için hukuk onayı.
11. Kişisel veri ihlali ve güvenlik olayında operasyon/hukuk irtibat ve müdahale süreci.
12. Üretim izleme, hata bildirimi, güvenlik yaması ve destek sorumluluğu.

Bu başlıklar netleşmeden belirli hosting sağlayıcısı, güvenlik sertifikasyonu, SLA veya yasal uygunluk iddiası verilmemelidir.



## WebRTC arama altyapısı

Bire bir sohbet aramaları sesli/görüntülü oturum ve REST/SSE sinyalleşmesi kullanır. Kabul edilmiş çağrıda iki katılımcı heartbeat'i ayrı izlenir; bir taraf 120 saniye yanıt vermezse oturum kapatılır ve geçici SDP/ICE payloadları silinir. Production'da HTTPS, STUN ve özellikle ev/ofis NAT'ı için TURN hizmeti gerekir. TURN paylaşımlı gizli anahtarı yalnızca API sunucusunda tutulur; API kullanıcıya süreli HMAC tabanlı TURN kimliği üretir. TURN yapılandırması olmadan her ağda çağrı kurulacağı garanti edilmez. Grup araması ve E2EE henüz uygulanmamıştır. Kurulum ayrıntıları için [WEBRTC_CALLS.md](WEBRTC_CALLS.md) belgesine bakın.
