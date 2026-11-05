# ENCEV PULSE — Şirket İçi Sürüm Birleştirme Kaydı

**Kaynak dalı:** `release/company-internal-2026-11-05`  
**Birleştirme tabanı:** `main` (ana dal değiştirilmedi)  
**Tarih:** 5 Kasım 2026

Bu dal, mevcut web uygulamasını, API'yi, e-ÇED tarayıcı eklentisini ve veritabanı migration'larını tek kaynak ağacında toplar. Ana daldaki eski Python PULSE kaynakları, kurulum dosyaları ve mevcut kök belgeler korunmuştur.

## Modül kapsamı

Migration `0021_notes_and_module_activation.sql` ile Takvim, Kurum Görüşleri, e-ÇED Takip, Kurum Rehberi, Dilekçeler, Notlarım ve Sistem Ayarları etkinleştirilir. Önceden etkin olan Genel Bakış, Görevler, Projeler, Sohbet, Çalışan Rehberi, Bildirimler, Kullanıcı Yönetimi ve Rol/İzin Yönetimi korunur.

**Ortak Drive bu sürümde etkin değildir.** Modül, şirket dosya alanına kaynak kullanıcı izinlerini koruyan bir sunucu adaptörü olmadan açılmaz. Bu dal NAS'a bağlanmaz, paylaşım içeriğini taramaz ve dosyalara okuma/yazma yapmaz.

## Ücretsiz sesli/görüntülü görüşme

- Bire bir WebRTC çağrıları eşler arası bağlantı kurmayı dener.
- STUN ayarı verilmezse ücretsiz `stun:stun.l.google.com:19302` kullanılır.
- TURN, ücretli bir sağlayıcı veya ilave relay sunucusu zorunlu değildir.
- STUN medya aktarması yapmaz; yalnızca ağ adresi keşfine yardım eder. Katı NAT/güvenlik duvarı/UDP kısıtlarında TURN olmadan bazı ağ çiftleri bağlanamayabilir. Uygulama ücretli bir servise otomatik geçmez.
- WebRTC medya kalitesi ve iki ayrı gerçek ağdaki bağlantı bu CI çalışmasının kapsamı değildir. Grup araması, ekran paylaşımı ve çağrı kaydı da bu sürümde yoktur.

## Bilinmesi gereken işlev sınırları

- Dilekçeler şu anda tarayıcı içinde saklanan DOCX şablonunu kopyalayıp indiren temel akıştır; dinamik alan eşlemesi ve ortak onay süreci değildir.
- Sohbet ekleri API'nin PostgreSQL depolamasında tutulur; NAS/SMB'ye yazılmaz.
- e-ÇED eklentisi yalnızca resmî `https://eced.csb.gov.tr` kaynağına rapor gönderir. Gerçek kullanıcı oturumları ve portalın güncel DOM/profil işaretleriyle canlı doğrulama ayrıca gerekir.
- Uygulamanın kendisi yine şirket içinde çalışacak bir Node.js API/web sürecine, PostgreSQL'e ve tarayıcı mikrofon/kamera izinleri için HTTPS erişimine ihtiyaç duyar. Bu belge yeni bir ücretli bulut sunucusu veya ücretli ses relay'i önermemektedir; mevcut kurum içi altyapı üzerinde çalıştırma hedeflenir.

## Bu dalda doğrulanacaklar

GitHub Actions iş akışı migration'ları yalnızca geçici CI PostgreSQL veritabanına uygular; API/web testlerini, TypeScript kontrollerini, üretim derlemelerini ve e-ÇED eklenti paketlemesini çalıştırır. Başarılı CI, gerçek e-ÇED portalını, şirket ağı dağıtımını, NAS bağlantısını veya iki farklı ağdaki WebRTC medya bağlantısını doğruladığı anlamına gelmez.
