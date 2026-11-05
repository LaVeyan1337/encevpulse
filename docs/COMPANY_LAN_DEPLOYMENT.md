# ENCEV PULSE — Şirket İçi Ağ Yayını

**Durum:** Tasarım ve örnek yapılandırma. Şirket bilgisayarına kurulum ve ağ kabul testi henüz yapılmadı.  
**Maliyet ilkesi:** Yeni ücretli VPS, bulut veritabanı, lisanslı proxy veya ücretli TURN hizmeti zorunlu değildir. Mevcut ve sürekli açık kalabilecek bir şirket bilgisayarı/sunucusu ile ücretsiz yazılım kullanılması hedeflenir.

## 1. Bugünkü durum

Geliştirme yapılandırması:

- Web geliştirme sunucusu: `127.0.0.1:5173`
- API: `127.0.0.1:3000`
- PostgreSQL: `127.0.0.1:5432`
- Web uygulaması `ssr: false` SPA olarak derlenir; statik dosyalar `apps/web/build/client` altına çıkar.
- API production'da da loopback'e bağlanır. Şirket ağına doğrudan API veya PostgreSQL portu açılması hedeflenmez.

Bu nedenle `127.0.0.1` adresi başka çalışanların bilgisayarından erişim sağlamaz. Şu anki test paketi şirket ağına açılmış değildir.

## 2. Hedef ücretsiz mimari

1. Mevcut şirket bilgisayarlarından biri uygulama hostu olarak seçilir ve çalışma saatlerinde sürekli açık kalır.
2. PostgreSQL aynı bilgisayarda çalışır; veritabanı portu yalnızca `127.0.0.1` üzerinden erişilebilir.
3. NestJS API aynı bilgisayarda `127.0.0.1:3000` üzerinde çalışır.
4. Web uygulamasının üretim statik dosyaları `apps/web/build/client` klasöründen sunulur.
5. Ücretsiz Caddy reverse proxy, çalışanların bağlandığı tek HTTPS adresini sunar. `/api/*` isteklerini yerel API'ye aktarır; diğer isteklerde web statik dosyalarını ve SPA fallback'i sunar.
6. Şirket içi DNS, seçilen hostname'i uygulama hostunun sabit/reserve edilmiş LAN IP'sine yönlendirir.
7. Caddy'nin `tls internal` ile ürettiği kurum içi CA kök sertifikası çalışan bilgisayarların güvenilir sertifika deposuna dağıtılır. Böylece giriş cookie'si ve mikrofon/kamera izinleri için HTTPS sağlanır.

Örnek Caddy yapılandırması: [`deployment/Caddyfile.example`](../deployment/Caddyfile.example).  
Örnek production değişkenleri: [`deployment/.env.production.example`](../deployment/.env.production.example).

## 3. Yayın öncesi zorunlu kurum adımları

- Uygulama hostu seçilmeli; makine kapandığında veya ağdan ayrıldığında uygulamanın erişilemeyeceği kabul edilmelidir.
- Host için DHCP rezervasyonu veya sabit LAN IP belirlenmelidir.
- Kurum içi DNS adı belirlenmeli ve tüm çalışan bilgisayarlarından çözümlendiği doğrulanmalıdır.
- Caddy kurulmalı; iç CA kök sertifikası istemci bilgisayarlara güvenilir biçimde dağıtılmalıdır.
- Windows Firewall'da yalnızca şirketin özel/domain ağı için HTTPS 443 erişimine izin verilmelidir. Router üzerinde dış port yönlendirmesi yapılmamalıdır.
- `APP_ORIGIN`, tarayıcı adresinin tam origin değeri olmalıdır (şema + hostname).
- `TRUSTED_PROXY_IPS=127.0.0.1` yalnızca Caddy aynı hostta ve API'ye loopback üzerinden bağlanıyorsa kullanılmalıdır.
- `AUTH_COOKIE_SECURE=true` ve `NODE_ENV=production` ile başlatılmalıdır.
- İlk yönetici, kullanıcı açma ve rol/izin matrisi gerçek şirket süreçlerine göre gözden geçirilmelidir.
- PostgreSQL yedeği ve geri yükleme provası, güncelleme/geri dönüş prosedürü ve servis yeniden başlatma davranışı doğrulanmalıdır.
- Gerçek Chrome/Edge istemcilerinden oturum, API, SSE, dosya eki, e-ÇED eklentisi ve ses/video akışları ayrı ayrı kabul testinden geçirilmelidir.

## 4. Ağ sınırları

- PostgreSQL ve NestJS API LAN'a veya internete doğrudan açılmaz.
- Şirket dosya sunucusu, NAS, SMB veya DSM bu mimarinin parçası değildir; açık izin olmadan erişim kurulmaz.
- Şirket uygulamasını dış internete açmak bu belgenin kapsamı değildir. Evden erişim daha sonra kurum VPN'i veya ayrıca onaylanmış güvenli erişim modeliyle ele alınmalıdır.
- Caddy dahili CA'sı çalışan cihazlara dağıtılmadan tarayıcı sertifika uyarıları oluşur; bu uyarılar atlanarak kullanım başlatılmamalıdır.
- Tek host ilk aşama için düşük maliyetli olabilir; ancak bu bir yüksek erişilebilirlik tasarımı değildir. Host, elektrik, disk veya ağ kesintisinde servis durur.

## 5. Doğrulama ölçütleri

Yayın ancak aşağıdaki kontroller tümüyle tamamlandığında şirket ağına açılmış sayılır:

- En az iki ayrı şirket istemcisinden aynı HTTPS hostname'ine erişim.
- Farklı kullanıcı hesaplarıyla giriş, oturum yenileme ve çıkış.
- Yetkili/yetkisiz hesaplarla görev ve proje oluşturma, listeleme ve düzenleme; kayıt kapsamı kontrolleri.
- Bire bir ve grup sohbetinde mesaj gönderme, geçmişi yenileme, okundu bilgisi ve ek erişimi.
- Calendar etkinlik ve toplantı oluşturma/düzenleme.
- Modül bazında boş/yükleniyor/hata ve yetki durumları.
- e-ÇED eklentisinin her kullanıcı profiline ayrı kurulumu/eşleştirilmesi ve gerçek portal oturumu testi.
- Yedekten test geri yükleme.
- Firewall kontrolü: API ve PostgreSQL portları diğer istemcilerden erişilemez; yalnız HTTPS proxy erişilebilir.
- NAS/SMB'ye hiçbir ağ isteği gönderilmemiş olması.

Bu koşullar doğrulanmadan uygulama “şirket kullanımına hazır” veya “herkes erişebilir” diye tanımlanmaz.
