# Şirket NAS'ı için değişmez güvenlik sınırı

Bu belge, ENCEV PULSE web geliştirmesinin şirket ağı ve NAS üzerindeki sınırını tanımlar.

## Bu dalda izin verilenler

- Uygulama kaynak kodunun GitHub üzerindeki özellik dalında geliştirilmesi.
- Dilekçe şablonunun kullanıcının açıkça seçtiği dosyadan tarayıcının kendi IndexedDB alanına alınması.
- Tarayıcı yerelinde tutulan DOCX şablonunun SHA-256 ile bütünlük kontrolü (tarayıcı Web Crypto API destekliyorsa).
- Kullanıcının açıkça başlattığı, özgün baytları değiştirmeyen yerel DOCX indirmesi.
- Uygulamanın kendi PostgreSQL veritabanındaki uygulama kayıtları; NAS dosya yolları veya dosya içerikleri olmadan.

## Yasak işlemler

Kullanıcı açık ve ayrı bir izin vermedikçe hiçbir kod, yardımcı program, test veya dağıtım adımı:

- NAS'a veya şirket paylaşımına bağlanamaz, ağ taraması ya da erişilebilirlik/yazma testi yapamaz.
- SMB/UNC yolunu açamaz, listeleyemez, okuyamaz veya bağlayamaz.
- NAS üzerinde dosya ya da klasör oluşturamaz, değiştiremez, yeniden adlandıramaz, taşıyamaz veya silemez.
- Kilit, bekleme kuyruğu, çevrimiçi kullanıcı, günlük, yedek veya geçici dosya yazamaz.
- Eski yedekleri otomatik temizleyemez veya dosya sürümlerini budayamaz.
- NAS cihaz ayarlarını, DSM'yi, kullanıcıları, izinleri, ağ geçidini, DNS'i, güvenlik duvarını veya portları değiştiremez.
- NAS erişimi olan bir Windows servisi/arka plan ajanı kuramaz veya başlatamaz.

## Dilekçeler modülünün mevcut sınırı

Web sürümündeki DOCX şablonu yalnızca tarayıcı profiline kaydedilir. Şablonun SHA-256 özeti yerel kayıtta saklanır ve taslak indirilmeden önce doğrulanır. Bu özet şifreleme veya kötü niyetli yerel müdahaleye karşı kimlik doğrulama değildir; yerel baytların beklenmedik şekilde değişmesini fark etmeye yarar.

Taslak ve yedek indirmeleri yalnızca kullanıcı bilgisayarına yapılır. Web sürümü NAS'a erişmez. Masaüstü Python uygulamasındaki ortak Word kilidi, SMB varlığı, bekleme sırası, ortak günlük ve otomatik yedekleme/temizleme akışı bu web sürümüne taşınmayacaktır.

## Gelecekteki değişiklikler

NAS erişimi gerektiren herhangi bir özellik ayrı bir tasarım ve risk incelemesi gerektirir. Bu sınır, kullanıcıdan açık ve ayrı bir yetki alınmadan gevşetilemez. Güvenli varsayılan davranış NAS'a hiç bağlanmamaktır.
