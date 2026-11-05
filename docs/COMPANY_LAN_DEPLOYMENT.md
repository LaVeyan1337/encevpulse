# ENCEV PULSE — Şirket İçi Ağ Yayını

**Durum (5 Kasım 2026):** Yayın mimarisi ve örnek dosyalar hazırlandı; gerçek şirket hostu, DNS kaydı, sertifika dağıtımı ve istemci kabulü henüz yapılmadı. Bu belge tek başına canlı adres oluşturmaz.

## 1. Hedef erişim

Çalışanların aynı kurum içi HTTPS adresini kullanması hedeflenir:

`https://<kurumun-belirleyeceği-ad>`

Adres, mevcut kurum içi DNS alanından BT/yetkili kişi tarafından seçilmelidir. Uygulama hostunun IP'si DHCP rezervasyonu veya sabit LAN IP ile korunmalıdır. Bu değerler belirlenmeden gerçek hostname/IP yazılmaz.

İlk yayın yalnızca şirket ağı içindir. Evden kullanım gerekiyorsa kurumun onaylı VPN erişimi ayrıca gerekir. AnyDesk, çalışanların uygulamaya erişim mimarisi değildir.

## 2. Bileşenler

- **Host:** Kesintisiz çalışabilecek, yedeklemesi ve fiziksel erişimi kontrol edilen şirket bilgisayarı/sunucusu.
- **Web:** `npm run build` sonrasında `apps/web/build/client` içindeki statik SPA.
- **API:** NestJS, host üzerinde yalnızca `127.0.0.1:3000` dinler.
- **PostgreSQL:** Hostta Docker ile çalışabilir; host portu yalnızca `127.0.0.1:5432` üzerinden yayımlanır. Veritabanı LAN'a açılmaz.
- **Reverse proxy:** Caddy, çalışanlara HTTPS/443 sunar; `/api/*` isteklerini yerel API'ye, diğer istekleri statik web dosyalarına yönlendirir.
- **DNS:** Kurum içi DNS, seçilen hostname'i uygulama hostunun LAN IP'sine çözer.
- **Sertifika:** Kurumun yönettiği güvenilir sertifika tercih edilir. Böyle bir sertifika yoksa Caddy'nin dahili CA'sı kullanılabilir; kök sertifika tüm istemci bilgisayarlara kurumun güvenli yazılım/ilke dağıtım yöntemiyle yüklenmeden kullanım başlatılmaz.

Örnekler:
- Reverse proxy: [Caddyfile.example](../deployment/Caddyfile.example)
- Production API/DB ortamı: [\.env.production.example](../deployment/.env.production.example)
- Hostta yalnız yerel DB portu açan Compose dosyası: [compose.production.yaml](../deployment/compose.production.yaml)

## 3. İlk kurulum sırası

1. Host bilgisayarını ve sorumlu kişiyi belirleyin. Makine uykuya geçmemeli; otomatik yeniden başlatma ve elektrik kesintisi senaryosu planlanmalıdır.
2. Host için sabit/reserve edilmiş LAN IP ve kurum içi DNS kaydı açın. DNS adının iki ayrı şirket istemcisinden aynı IP'ye çözüldüğünü doğrulayın.
3. Node.js `>=24.7.0`, npm, Docker Engine/Desktop ve Caddy kurun. Sürümler kurum BT tarafından sabitlenip güncelleme planına alınmalıdır.
4. Depoyu hostta `C:\Code\encev-pulse` altında alın. Gerçek kullanıcı verisi içeren bir klasörün üzerine kopyalama yapmayın; dağıtım öncesi ayrı yedek ve geri dönüş noktası oluşturun.
5. `deployment/.env.production.example` dosyasını inceleyip değerleri kurum ortamına göre doldurun ve kök dizinde `.env` adıyla saklayın. Gerçek gizli değerleri Git'e göndermeyin. Dosya erişimini yalnız uygulama işletim hesabı ve yetkili yöneticilerle sınırlandırın.
6. Production veritabanını başlatın:

   ```powershell
   docker compose --env-file .env -f deployment/compose.production.yaml up -d
   ```

   Bu Compose dosyasının DB portu yalnız host loopback adresine bağlıdır. Var olan geliştirme `compose.yaml` ve geliştirme veritabanı ayrı kalır; volume isimleri farklıdır.
7. Önceki production verisi varsa yedek/geri yükleme planını doğrulamadan migration çalıştırmayın. İlk kurulumda migration'ları uygulayın:

   ```powershell
   npm ci
   npm run db:migrate --workspace @encev-pulse/api
   npm run build
   ```

8. İlk sistem yöneticisini bir defa, etkileşimli ve parola girişi gizli terminalde oluşturun:

   ```powershell
   npm run auth:bootstrap-admin --workspace @encev-pulse/api
   ```

   Varsayılan hesap/parola yoktur. İlk yönetici parolası komut satırına, dosyaya veya loga yazılmamalıdır.
9. API'yi production ortamıyla hostta başlatın:

   ```powershell
   npm run start --workspace @encev-pulse/api
   ```

   Bu komut test amaçlıdır; kalıcı kullanım için API, PostgreSQL ve Caddy'nin Windows açılışında otomatik başlaması, çökmede yeniden başlatılması ve ayrı düşük yetkili işletim hesabıyla çalışması gerekir. Servis yöneticisi/kurulum yöntemi kurum BT tarafından seçilip doğrulanmalıdır.
10. Caddy'ye `deployment/Caddyfile.example` içeriğini yükleyin. `PULSE_HOSTNAME` ve `PULSE_WEB_ROOT` ortam değişkenlerini Caddy servisinin kendi ortamında tanımlayın; örnek dosyadaki yerel yolu gerçek yayın klasörüne göre doğrulayın.
11. TLS sertifikasını yapılandırın. `tls internal` kullanılıyorsa Caddy'nin CA kök sertifikasını güvenilir kanaldan çıkarın ve şirket bilgisayarlarının güvenilir kök sertifika deposuna kurum BT tarafından dağıtın. Sertifika uyarısını atlayarak kullanıma başlamayın.
12. Windows Firewall'da yalnızca uygun **Domain/Private** profilinden gelen TCP 443 erişimine izin verin. TCP 3000 ve 5432 için LAN inbound kuralı açmayın. Router üzerinde dış port yönlendirmesi yapmayın.

## 4. Production değişkenleri

- `NODE_ENV=production`
- `APP_ORIGIN`: Tarayıcıda açılan HTTPS adresinin tam origin değeri; sondaki yol veya slash olmamalı.
- `AUTH_COOKIE_SECURE=true`: Production'da zorunludur.
- `TRUSTED_PROXY_IPS=127.0.0.1`: Caddy API'ye aynı host üzerinden loopback ile bağlanıyorsa doğrudur. Proxy başka hosta taşınırsa gerçek proxy IP'si ve ağ sınırı yeniden incelenmelidir.
- `AUTH_RATE_LIMIT_SECRET`: En az 32 bayt rastgele, yalnız bu kurulum için üretilmiş gizli değer.
- `POSTGRES_PASSWORD`: DB kullanıcı parolasıdır; API ve Compose aynı değeri kullanır. Gerçek parola örnek dosyada bulunmaz.
- `DB_HOST=127.0.0.1`: API host üzerinde çalıştığı ve Docker portu loopback'e yayımlandığı içindir.

API ve PostgreSQL portlarını LAN'a açmak, `AUTH_COOKIE_SECURE=false` yapmak veya proxy güvenini tüm IP'lere vermek kabul edilen yayın yöntemi değildir.

## 5. İlk yönetici ve kullanıcı erişimi

- Her çalışan için ayrı kullanıcı hesabı açılır; ortak hesap kullanılmaz.
- Kullanıcılar sistem yöneticisi tarafından oluşturulur. Herkese açık kayıt ekranı yoktur.
- Rol ve modül izinleri gerçek görev dağılımına göre atanır. Başlangıç rolleri ürün taslağıdır; şirket organizasyon şeması/onaylı görev tanımı yerine geçmez.
- Sistem yöneticisi rolü bütün özel görev/proje/sohbet kayıtlarını otomatik görmez; kayıt kapsamı ayrıca korunur.
- İlk kullanıcı kabulünde en az iki farklı çalışan hesabıyla oturum, yetkisiz kayıt erişimi, oturum kapatma ve parola değişikliği denenmelidir.

## 6. Yayın kabul kontrolü

Aşağıdaki kontroller tamamlanmadan sistem şirket kullanımına hazır sayılmaz:

- [ ] İki ayrı şirket bilgisayarında DNS adı doğru çözülüyor.
- [ ] İki istemci de aynı HTTPS adresini sertifika uyarısı olmadan açıyor.
- [ ] Farklı hesaplarla giriş, çıkış, parola değişimi ve oturum süresi doğrulanıyor.
- [ ] Yetkili/yetkisiz kullanıcıyla görev ve proje işlemleri ile kayıt kapsamı doğrulanıyor.
- [ ] Takvim etkinliği ve toplantı oluşturma/düzenleme akışları deneniyor.
- [ ] Sohbet mesajı, okundu bilgisi, arama ve SSE canlı güncellemesi iki istemcide deneniyor.
- [ ] e-ÇED eklentisi her çalışanın kendi Chrome/Edge profiline kurulup ayrı cihaz eşleştirmesiyle deneniyor. Gerçek portal verisinin doğruluğu ayrıca onaylanıyor.
- [ ] Yedek alınıyor ve ayrı test ortamına geri yükleme provası başarılı.
- [ ] Başka istemciden TCP 3000 ve 5432 erişimi başarısız; yalnız 443 erişilebilir.
- [ ] Caddy, API ve PostgreSQL yeniden başlatma/host yeniden açılma senaryoları deneniyor.
- [ ] Şirket dosya sunucusu/NAS/SMB'ye hiçbir erişim veya test yapılmıyor.

## 7. İşletim ve geri dönüş

- Veritabanı yedeği düzenli alınmalı; yalnız yedek dosyasının oluşması yeterli değildir, ayrı ortamda geri yükleme provası yapılmalıdır.
- Her sürümde çalışan kod, migration ve `.env` sürümünün gizli değerleri içermeyen yapılandırma envanteri tutulmalıdır.
- Migration öncesi yedek, yayın sonrası health kontrolü ve başarısızlıkta önceki uygulama sürümüne dönüş prosedürü olmalıdır. Migration geri dönüşü otomatik varsayılmamalıdır.
- Tek host ilk aşamada düşük maliyetlidir fakat yüksek erişilebilirlik sağlamaz; host, disk, elektrik veya ağ arızasında servis durur.
- Günlük operasyon, yama, Node/PostgreSQL/Caddy güncellemeleri, yedek ve erişim gözden geçirmesi için sorumlu belirlenmelidir.

## 8. Kapsam dışı ve güvenlik sınırları

- Bu belge şirket uygulamasını internete açmaz. Evden erişim için kurum VPN'i veya ayrıca onaylanmış erişim modeli gerekir.
- PostgreSQL ve NestJS API doğrudan LAN'a/internete açılmaz; yalnız Caddy'nin HTTPS ucu istemcilere açıktır.
- Şirket dosya sunucusuna, NAS'a, DSM'ye veya SMB paylaşımına bu kurulumda bağlanılmaz. Ortak Drive kapalı kalır; kaynak dosyalar taşınmaz veya çoğaltılmaz.
- Sohbet dosya ekleri ve WebRTC medya kalitesi için ayrı güvenlik/gerçek cihaz-ağ kabulü gerekir. STUN varsayılanı her NAT/firewall kombinasyonunda çağrı başarısı garanti etmez; TURN olmadan bazı ağlarda bağlantı kurulamaz.
- Bu kurulum bir internet sitesi veya bulut SaaS yayını değildir; şirket içi ağda tek hosta dayalı ilk dağıtım tasarımıdır.
