# ENCEV PULSE — Teknoloji Karşılaştırması ve Öneri

**Durum:** 3 Kasım 2026 tarihinde resmî dokümanlar üzerinden hazırlanmış öneri. Teknoloji kurulmamış ve seçimi uygulamaya geçirilmemiştir.  
**İlke:** Önceki replica yığını karar için kanıt sayılmaz; veri ve kimlik gereksinimleri doğrulanmalıdır.

## 1. Kısa öneri

| Alan | Öneri | Neden |
|---|---|---|
| UI | React + React Router Framework Mode + Vite, ilk dağıtımda SPA | SEO gerektirmeyen iç uygulama; bağımsız backend ve WebSocket yapısıyla sade dağıtım. Gerekirse ileride SSR yolu açık. |
| API / iş kuralları | NestJS, TypeScript, modüler monolit | Task/project, chat, süreç ve yetki sınırlarını aynı backend düzeninde toplar; WebSocket desteği vardır. |
| Veri | PostgreSQL | Birbirine bağlı görev/proje/üyelik, mesaj ve yasal süreç verileri için transaction, foreign key, indeks ve güçlü raporlama. |
| ORM | Drizzle ORM + Drizzle Kit tarafından üretilen ve gözden geçirilen SQL migration'ları | SQL'e yakın ve TypeScript tür denetimli; iş kuralları için SQL görünürlüğünü korur. `push` üretim değişikliği yöntemi olarak kullanılmaz. |
| Kimlik | Mevcut kurumsal OIDC/SSO varsa onu kullan; yoksa sağlayıcıyı keşiften sonra seç | Çalışan hesapları ve işten ayrılma yönetimini kopyalamamak için. |
| Gerçek zaman | NestJS WebSocket gateway (ilk değerlendirme Socket.IO) + kalıcı PostgreSQL mesajları | Mesaj kaynağı veritabanıdır; WebSocket yalnızca hızlı dağıtım ve anlık bildirimdir. |
| Hosting | Sağlayıcıdan bağımsız; HTTPS giriş noktası, özel DB ağı, yönetilen PostgreSQL kısa listede | Ev/ofis erişimi ve DB işletim riskini dengeler. Veri lokasyonu ve kurum politikası seçimi bekletiyor. |

Bu tablo mevcut önerinin tercih yönünü korur; hosting/IdP/ek dosya sağlayıcısı satın alma ve kurum incelemesi olmadan seçilmiş değildir.

## 2. Frontend seçenekleri

React, bileşen tabanlı UI için uygun; fakat React'ın kendi yeni uygulama rehberi framework ile başlamayı öneriyor. React Router Framework Mode, Vite eklentisiyle SPA, SSR ve statik render seçenekleri sunar. İç PULSE ekranlarında SEO gereksiz olduğu için ilk aşamada **SPA modu** öneriyorum. Kaynaklar: [React Creating a React App](https://react.dev/learn/creating-a-react-app), [React Router modes](https://reactrouter.com/start/modes), [React Router SPA](https://reactrouter.com/how-to/spa).

### Somut geliştirme ve same-origin dağıtım

- Geliştirmede Vite geliştirme sunucusu SPA'yı sağlar ve `/api/v1`, `/auth/*` ile WebSocket gateway path'ini yerel NestJS API'ye proxy eder. Tarayıcı tek origin kullanır; gerçek üretim IdP/secret'ları ve gerçek şirket verisi geliştirmeye kopyalanmaz. Sentetik kimlik/veriyle sınırlandırılır.
- Üretimde reverse proxy tek HTTPS hostunda SPA statik dosyalarını sunar; `/api/v1`, `/auth/*` ve WebSocket path'ini NestJS'e yönlendirir. Bu sayede same-origin istek, kapalı CORS ve tek cookie kapsamı sağlanır. Bu dağıtım tasarımı uygulamaya henüz geçirilmemiştir.
- NestJS OIDC Authorization Code + PKCE callback'inde `state`, `nonce`, issuer/audience, imza ve callback allowlist'ini doğrular; sonra production `__Host-pulse_session` cookie'si kurar (`Secure`, `HttpOnly`, `SameSite=Lax`, host-only, `Path=/`). Session hash'i/süresi/iptali PostgreSQL'de tutulur; token tarayıcı storage'ına konmaz. State-changing cookie isteklerinde CSRF token ve Origin doğrulanır; WebSocket handshake de oturum/Origin kontrolünden geçer.
- PostgreSQL oturum tablosu erişilemiyorsa fail-closed davranır. Başlangıçta Redis session store gerekmez. Session idle/absolute TTL, MFA ve OIDC sağlayıcısı henüz karar değildir. Ayrı-origin deployment bu öneriyi değiştirir ve yeniden güvenlik incelemesi gerektirir.

| Seçenek | Avantaj | Dezavantaj / güvenlik | Maliyet ve bakım | PULSE kararı |
|---|---|---|---|---|
| React Router Framework + Vite SPA | React ekosistemi; type-safe route modülleri ve kod bölme; statik çıktı ile basit ve ucuz sunum; API sınırı belirgin. İleride SSR'ye geçiş yolu var. | Başlangıç verisi istemci API çağrısıyla gelir; backend ayrı olduğu için oturum ve izin akışı düzgün tasarlanmalı. SEO/ilk HTML zenginliği avantajı kullanılmaz. | Araçların lisans maliyeti yok; hosting statik dosya sunumu kadar. Bileşen/tema kararları ekip tarafından bakılır. | **Önerilen.** İç görev/kanban uygulamasına en uygun sorumluluk ayrımı. |
| Next.js App Router | Route/layout düzeni; React Server Components, rendering ve image/caching araçları tek çatı. Node veya Docker destekleyen sunucuda self-host edilebilir. | Ayrı NestJS API ile server actions/route handlers ikinci API katmanına dönüşebilir. Cache ve çok örnek davranışını yönetmek gerekir; websocket'i yine API servisi taşıyacaktır. | Framework lisansı yok; self-hosted Node/Docker compute ve bakım gerekir. Vercel opsiyonel ücretli hizmettir, zorunlu değildir. | Geçerli alternatif; takımın Next deneyimi veya SSR ihtiyacı ağır basarsa seçilebilir. Başlangıçta ek server katmanı gereksiz. |
| React + yalnızca Vite | En az soyutlama, basit statik build. | Router, code-splitting, data loading, error boundaries ve route conventions ayrı kurgulanır; React yeni uygulama rehberi framework seçimini öneriyor. | Lisans ücretsiz; kısa vadede kolay görünse de ortak altyapı kararları ek bakım yükü doğurabilir. | React Router Framework Mode daha dengeli. |

### Bileşen ve performans kütüphaneleri

- **TanStack Table + TanStack Virtual:** Headless tabloda görünüm bizde kalır; virtualizer sadece ekranda görünen satırları işler. Lisans ücreti yoktur, fakat tasarım ve klavye/erişilebilirlik işini biz yapar. Kaynaklar: [TanStack Table](https://tanstack.com/table/latest/docs/overview), [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction).
- **Ücretli hazır grid (ör. Enterprise özellikli ürün):** Daha fazla hazır tablo etkileşimi sunabilir; lisans ve sürüm kilidi ekler. İlk aşamada ihtiyaç doğrulanmadığı için önerilmiyor.
- Başlangıçta ağır global state kütüphanesi gerekmez. API verisi için küçük bir cache/data-fetch katmanı tercih edilir; lokal UI durumu (drawer, filtre paneli) React'te kalır.

## 3. Backend seçenekleri

| Seçenek | Avantaj | Dezavantaj / güvenlik | Maliyet ve bakım | PULSE kararı |
|---|---|---|---|---|
| NestJS modüler monolit | Modül, dependency injection, guard, pipe ve exception filter yapıları; aynı uygulamada REST ve WebSocket gateway. Nest WebSocket gateway'leri Socket.IO veya `ws` ile çalıştırabiliyor. Kaynaklar: [NestJS modules](https://docs.nestjs.com/modules), [NestJS gateways](https://docs.nestjs.com/websockets/gateways). | Daha fazla başlangıç yapısı/decorator öğrenimi; kuralları doğru modül sınırına koymak gerekir. Framework, kötü yetkilendirmeyi otomatik düzeltmez. | Lisans ücreti yok; ilk dağıtımda tek API process'inde gateway ve outbox worker çalışır. Hacim gerekçelendirirse ayrı worker compute eklenir. | **Önerilen.** Orta/uzun ömürlü, modül sayısı yüksek ürün için ek düzen haklı. |
| Fastify çıplak API | Hafif, az soyutlama ve yüksek performans olanağı. | Yetki, modülerlik, arka plan işlemleri ve websocket örgüsünü daha fazla kendimiz kurarız. Ekipte güçlü mimari disiplini gerekir. | Lisans ücreti yok; aynı hosting maliyeti; başlangıçta daha az framework, daha çok uygulama kararı. | Küçük tek modüllü API'de iyi; bu kapsamda fazla el yapımı kalabilir. |
| Next.js Route Handlers / Server Actions | UI ile aynı projede API; SSR akışlarıyla yakın entegrasyon. | İş kurallarını Next içinde, uzun yaşayan WebSocket ve worker gereksinimlerini başka yerde çözmek API sınırlarını böler. | İki ayrı backend yerine başta daha az parça; büyüdükçe karmaşık ayrışma maliyeti oluşabilir. | Web UI tercihinden bağımsız olarak NestJS API önerisi daha temiz. |

Gerçek zamanlı chat için Nest gateway'in ilk prototipinde Socket.IO (ack, reconnect, room modeli) ve `ws` (daha küçük, daha düşük seviyeli) karşılaştırılabilir. Oda üyeliği tek başına yetki değildir; her bağlanma ve olayda backend üyeliği denetler. Kesin adapter, yük testi sonrası seçilir.

## 4. Veri platformu ve PostgreSQL hizmeti

| Seçenek | Avantaj | Dezavantaj / güvenlik | Maliyet ve bakım | PULSE kararı |
|---|---|---|---|---|
| PostgreSQL'i kurumun yönettiği sunucuda çalıştırmak | Yazılım lisans bedeli yok; veri ve konum üzerinde tam kontrol; vendor lock-in düşük. | Patch, yüksek erişilebilirlik, monitoring, şifreleme, yedekleme ve restore denemeleri kurum sorumluluğunda. Dış erişim yanlış yapılandırılırsa kritik risk. | Doğrudan lisans $0; sunucu, yedek alanı, izleme ve yönetici zamanı maliyeti var. | Yalnızca kurumsal işletim kapasitesi varsa. |
| Supabase yönetilen Postgres (yalnız DB hizmeti adayı) | Yönetilen PostgreSQL ve operasyon araçları; RLS ek savunma olabilir. | Bu mimaride Supabase Auth, Realtime ve Storage otomatik seçilmez: kimlik NestJS session/OIDC'den, websocket NestJS'ten, ekler ayrı özel blob deposundan geçer. Service key RLS'yi aşabilir ve sadece backend'de korunmalıdır. Bölge, sözleşme/DPA, SSO ve yedek şartları kurumca doğrulanmalı. Kaynaklar: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Realtime](https://supabase.com/docs/guides/realtime). | Resmî fiyat sayfasında Pro başlangıç fiyatı $25/ay olarak listelenmiştir; günlük yedekleme, disk, egress, PITR ve fazla kullanım plan koşulları tedarik öncesi yeniden doğrulanmalı. Free planın duraklama/backup sınırları nedeniyle üretim varsayımı değildir. Kaynak: [Supabase pricing](https://supabase.com/pricing), [billing FAQ](https://supabase.com/kb/faqs/platform/database-only-cost). | **Kısa liste adayı, henüz seçim değil.** Veri konumu, kurum onayı, RPO/RTO ve toplam maliyet incelendikten sonra. |
| Başka bulutta yönetilen PostgreSQL (AWS/Azure/GCP veya yerel sağlayıcı) | Kurumsal sözleşme, bölge ve ağ denetimi seçenekleri daha geniş olabilir; servis yedek/patch işini azaltır. | Seçilen sağlayıcıya göre fiyat ve işletim modeli değişir; platform özellikleri Supabase kadar bütünleşik olmayabilir. | DB compute, disk, backup, egress, support ayrı kalemler. Bölge ve boyut bilinmeden toplam hesaplanamaz. | Kurumun onaylı sağlayıcısı varsa Supabase ile karşılaştırılmalı. |
| PostgreSQL olmayan SQLite/MySQL | SQLite yerelde çok basit; MySQL olgun ve yaygın. | SQLite eşzamanlı çok kullanıcılı sunucu kaydı için uygun ana backend değil. MySQL mümkün olsa da ekip ve süreç ihtiyaçları için PostgreSQL'e özgü RLS, güçlü SQL/JSON ve tercih edilen sorgular ek üstünlük sağlıyor. | SQLite lisanssız/neredeyse sıfır işletim; MySQL lisansız olabilir ama hosting/ops gerekir. | **PostgreSQL** tercih; başka DB için mevcut kurumsal platform nedeni olmalı. |

PostgreSQL 18 resmi belgelerinde yedekleme yöntemleri SQL dump, dosya seviyesi backup ve WAL/PITR olarak ayrılıyor; tablo erişiminde RLS desteği var. RLS tablo sahibi/superuser/BYPASSRLS için otomatik sınır değildir; API yetkilendirmesinin yerine geçmez. Kaynaklar: [Backup and Restore](https://www.postgresql.org/docs/18/backup.html), [Row Security](https://www.postgresql.org/docs/18/ddl.html#DDL-ROWSECURITY).

## 5. ORM ve migration

| Seçenek | Avantaj | Dezavantaj / maliyet | Öneri |
|---|---|---|---|
| Drizzle ORM + Drizzle Kit | TypeScript schema ve SQL'e yakın typed query; DB kısıtları görünür; üretilebilir SQL migration dosyaları. Drizzle migrations akışında SQL dosyasını gözden geçirip sürüm kontrolüne alabilirsin. Kaynaklar: [Drizzle overview](https://orm.drizzle.team/docs/overview), [Drizzle migrations](https://orm.drizzle.team/docs/migrations). | Daha az “her şeyi yapan” soyutlama; bazı join/sorgular SQL bilgisi ister. Sorgu kurallarını ve migration incelemesini ekip öğrenmeli. Ücretsiz açık kaynak; DB/hosting bedeli ayrı. | **Önerilen.** Postgres ilişkileri ve izin sorgularında SQL görünürlüğü değerli. |
| Prisma ORM | Şema tanımı ve üretilen client üzerinden kuvvetli tür desteği; migration/Studio araçları ve veri modellerine hızlı başlangıç. Kaynak: [Prisma ORM](https://www.prisma.io/docs/orm). | Daha yüksek soyutlama ve codegen; özel Postgres SQL/RLS/migration davranışını anlamak gerekir. Resmî dokümanda Prisma 8 şu an RC olarak tanımlı; kararlı sürüm seçilmeden geçiş yapılmamalı. Prisma Compute şimdilik WebSocket sunucusu desteklemiyor; bu, Nest API hosting'iyle aynı şey değildir. | Açık kaynak temel özellikler ücretsiz; bazı hosted araçlar ayrı fiyatlı. Ekosistem ve sürüm olgunluğu doğrulanmalı. |

Her ikisinde de SQL migration'ları insan tarafından gözden geçirilip repo'da saklanmalıdır. Migration komutu üretim veritabanında geliştirici makinesinden doğrudan çalıştırılmaz; deployment adımı, backup ve rollback/roll-forward planı gerektirir.

## 6. Kimlik, sohbet gerçek zamanı, ek dosyaları ve işler

- **Kimlik:** Mevcut OIDC/SSO tercih edilir; sağlayıcı ve MFA/hesap yaşam döngüsü henüz bilinmiyor. Nest callback + opaque server-side session + same-origin cookie önerilir. Mevcut IdP yoksa Supabase Auth/self-hosted OIDC ayrıca karşılaştırılır; Supabase kısa listeye alınması, Auth seçildiği anlamına gelmez.
- **Realtime:** NestJS WebSocket; DB kalıcı mesaj kaynağı. İş değişikliği + audit + outbox tek transaction, commit sonrası tek API örneğindeki poller gateway'e at-least-once olay gönderir. Event ID dedup ve REST cursor ile toparlama kullanılır. Yatay API çoğaltma öncesi paylaşımlı broker gerekir; ilk aşamada Supabase Realtime veya Redis yok.
- **Outbox:** PostgreSQL tablo, `FOR UPDATE SKIP LOCKED`, kısa lease, retry/backoff, idempotent handler ve dead-letter görünürlüğü. Aynı API process'inde worker/poller başlangıç için yeterlidir; ayrı mikroservis/queue ürünü ancak hacim/iş türü gerektirirse.
- **Chat ekleri:** NAS dışı özel uygulama blob deposu; geliştirme/testte yalnız proje içi sentetik yerel depo. Üretim sağlayıcısı, tarayıcıya credential vermeyen API upload/download yolu, encryption, tarama, kota ve retention kararı bekliyor. Sağlayıcı/egress/storage ücretleri seçime ve hacme bağlı; toplam maliyet henüz hesaplanamaz.

## 6.1. Veri bütünlüğü ve denetim tercihleri

- İş kayıtları ve ilişkilerde generic `type/id` polymorphic FK yerine tipli link tabloları ve gerçek FK'ler tercih edilir. FK, unique/check constraint ve kritik ilişkiler için composite FK kullanılır; audit hedefi kayıt silinse de kalabilmesi için bilerek polymorphic kalır ve FK'siz olduğuna dair sınır açıklanır.
- İş değişikliği + audit + outbox aynı DB transaction'ında yazılır. Runtime DB rolü audit tablosunun owner'ı değildir; INSERT ve sınırlı SELECT dışında UPDATE/DELETE/TRUNCATE/DDL yetkisi alamaz. DB superuser ayrıcalığı ayrı operasyon kontrolü gerektirir.
- Yasal süre kuralı allowlist alanlarla version/hash taşır; keyfî kod yoktur. Yalnız bağımsız onaylı/etkin kural otomatik tarih hesaplar; her sonuç kural/tatil takvimi hash'i ve algoritma sürümüyle tekrar doğrulanabilir.

## 7. Toplam maliyet yaklaşımı

| Kurulum profili | Aylık doğrudan gider | Gizli/operasyonel maliyet | Uygunluk |
|---|---|---|---|
| Yerel geliştirme + sahte servisler | Temel OSS lisansları $0 | Geliştirici zamanı; gerçek üretim maliyetini ölçmez | Tasarım/prototip ve yerel test |
| Tek uygulama servisi + yönetilen PostgreSQL | Uygulama compute + DB planı + domain/SMTP/backup ihtiyacı. Supabase Pro veritabanı başlangıç tabanı mevcut fiyatla $25/ay, uygulama hosting'i ayrıca. | Kullanım aşımı, veri/egress, saklama, gözlemleme ve destek | Düşük operasyon bütçesiyle ilk üretim adayı; bölge/onay kontrolü gerekir |
| Kurumun yönettiği PostgreSQL + uygulama sunucusu | Lisans çoğunlukla $0, sunucu/backup/izleme maliyeti | En yüksek patch/restore/olay müdahale sorumluluğu | Mevcut kurum işletim ekibi ve onaylı platform varsa |
| Kurumsal managed platform | Daha yüksek sabit plan ve destek maliyeti | Daha az işletim yükü; sözleşme ve sağlayıcı lock-in | SSO, SLA, audit, data residency şartsa |

Kullanıcı sayısı, region, dosya eki hacmi, yasal veri saklama süresi, erişilebilirlik hedefi ve onaylı cloud policy bilinmediği için güvenilir toplam aylık rakam vermek mümkün değil. Güncel fiyat sayfası her tedarik kararından önce yeniden kontrol edilmelidir.

KVKK incelemesi, veri yerleşimi ve kişisel veri retention gereksinimleri tamamlanmadan hosting sağlayıcısı veya yasal uygunluk beyanı seçilemez/verilemez. Bu belge hukuki uygunluk iddiası değildir.

## 8. Hangi karar şimdi verilebilir?

Teknik tasarım aşamasında önerilecek çekirdek yön: React Router SPA + NestJS modular API + PostgreSQL + Drizzle. Hosting ve kimlik sağlayıcısı kurumun mevcut altyapısı ve veri yerleşimi bilgisi olmadan seçilmemeli. Supabase maliyet/işletim açısından ciddi adaydır, fakat varsayılan olarak seçilmiş değildir.
