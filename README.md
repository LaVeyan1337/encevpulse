# ENCEV PULSE

EnÇev çalışanlarının görev, proje, takvim, sohbet ve süreç kayıtlarını yönetmesi için geliştirilen şirket içi çalışma uygulaması.

> **Durum (5 Kasım 2026):** Entegre geliştirme/test sürümüdür. Şirket ağına yayınlanmış değildir. Yerel geliştirme adresi `127.0.0.1` olduğu için diğer bilgisayarlar bu adresten erişemez.

## Teknoloji ve servisler

- Web: React Router 7 SPA (üretim derlemesi `apps/web/build/client`)
- API: NestJS, Node.js `>=24.7.0`
- Veritabanı: PostgreSQL
- Tarayıcı eklentisi: Chrome / Edge e-ÇED gözlem eklentisi
- Üretim erişimi hedefi: tek HTTPS adresi, web statik dosyaları ve `/api/*` isteklerini aynı origin altında sunan reverse proxy

## Yerel test ortamı

Aşağıdaki işlemler yalnızca test/geliştirme bilgisayarında çalışır; şirket dosya sunucusuna bağlanmaz.

1. Node.js `>=24.7.0`, npm ve Docker Compose kurulu olmalı.
2. Kök dizinde `.env.example` dosyasını `.env` olarak kopyalayıp yerel test parolası ve en az 32 baytlık özel `AUTH_RATE_LIMIT_SECRET` üretin.
3. PostgreSQL'i başlatın: `docker compose up -d postgres`.
4. Bağımlılıkları yükleyin: `npm ci`.
5. Migration'ları uygulayın: `npm run db:migrate --workspace @encev-pulse/api`.
6. İlk sistem yöneticisini oluşturun: `npm run auth:bootstrap-admin --workspace @encev-pulse/api`.
7. Uygulamayı açın: `npm run dev`.

Yerel adres: `http://127.0.0.1:5173`. API, `127.0.0.1:3000` üzerinde kalır. Bu adresler yalnız aynı bilgisayarda geliştirme/test içindir.

## Kontroller

- Testler: `npm test`
- Tip denetimi: `npm run typecheck`
- Üretim derlemesi: `npm run build`
- Tarayıcı eklentisi paketi: `npm run extension:build`

CI başarısı API/web testleri, tip denetimi, migration ve derlemeyi doğrular; tek başına şirket ağı, gerçek e-ÇED portalı veya farklı ağlardaki ses/video görüşmesini doğrulamaz.

## Şirket ağına yayın

Şirket içi yayın için ücretsiz yerel mimari ve tamamlanması gereken ağ/sertifika adımları [Şirket İçi Ağ Yayın Kılavuzu](docs/COMPANY_LAN_DEPLOYMENT.md) içindedir. Henüz sunucu adı/IP, iç DNS kaydı, HTTPS sertifikası ve Windows Firewall kapsamı belirlenmediği için bu adımlar tamamlanmış değildir.

## Modül kapsamı ve bilinen sınırlar

Güncel uygulama/test durumu [Geliştirme Durumu](docs/DEVELOPMENT_STATUS.md) ve modül kabul koşulları [MODULE_REQUIREMENTS.md](docs/MODULE_REQUIREMENTS.md) içindedir. Modülün açık olması tüm kabul kriterlerinin tamamlandığı anlamına gelmez.

## Veri koruma

- `AGENTS.md` ve [Veri Koruma Politikası](docs/DATA_PROTECTION_POLICY.md) bağlayıcıdır.
- `\\192.168.1.55\Genel Evrak` veya başka şirket paylaşımına izin olmadan erişilmez.
- Ortak Drive şu aşamada kapalıdır; NAS, SMB veya DSM erişimi kurulmaz.
- Testlerde sahte/yerel veri kullanılır; üretim DB'sine test uygulanmaz.
