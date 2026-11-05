# Sohbet medya ekleri

Bu sürümde sohbet fotoğrafı, video, belge ve sesli mesaj ekleri ENCEV PULSE uygulamasının PostgreSQL veritabanında saklanır. Şirket NAS'ı, UNC paylaşımı veya ortak evrak klasörü kullanılmaz.

## Yükleme sınırları

- Mesaj başına en fazla 5 dosya ve toplam 24 MB.
- Dosya başına en fazla 12 MB.
- Kullanıcı başına en fazla 1 GB etkin ek saklama alanı.
- JPEG, PNG, WebP, GIF, MP4, WebM, PDF, DOCX, XLSX, PPTX, TXT, CSV ve desteklenen ses biçimleri kabul edilir.
- SVG, HTML, çalıştırılabilir dosyalar, makro etkin Office uzantıları ve bilinmeyen arşiv türleri kabul edilmez.
- Uzantı ve tarayıcının bildirdiği MIME türü tek başına yeterli değildir; dosya imzası da kontrol edilir.

## Erişim ve silme

- Yükleme oturum, kaynak origin, CSRF ve sohbet mesaj oluşturma yetkisi doğrulandıktan sonra başlar.
- Dosya indirme/görüntüleme sırasında kullanıcı oturumu, sohbet görüntüleme yetkisi ve etkin sohbet üyeliği tekrar denetlenir.
- Ekler herkese açık statik URL veya tahmin edilebilir dosya yolu üzerinden sunulmaz.
- Mesaj silindiğinde ekin ikili içeriği veritabanından temizlenir; ilişkisel kayıt ve mesaj denetim olayı kalır.
- Aynı istemci istek kimliğiyle tekrarlanan yükleme yeni mesaj/ek üretmez.

## Sesli mesaj

- Kayıt, tarayıcının MediaRecorder API'sini ve kullanıcının açık mikrofon iznini kullanır.
- Kayıt en fazla 2 dakika sürer; son dosya aynı tür, imza, boyut, kota ve üyelik kontrollerinden geçer.
- Mikrofon desteği ve izinler tarayıcıya bağlıdır. Üretimde HTTPS gerekir; localhost geliştirme ortamı tarayıcıların güvenli bağlam istisnasıdır.

## Bilinen sınırlar

- Bu sürüm dosya imzası, uzantı ve MIME doğrulaması yapar; **antivirüs/malware taraması yapmaz**. Bu kontroller zararlı Office içeriğinin bulunmadığını garanti etmez.
- Dosya baytları PostgreSQL'de tutulduğu için veritabanı ve yedekleri medya boyutuyla büyür. 1 GB kullanıcı kotası bir ilk sınırdır; üretim yükü ölçülerek gerekirse nesne depolamaya geçilmelidir.
- Sesli/görüntülü arama ve uçtan uca şifreleme bu değişiklik kapsamında değildir. Bunlar için ayrı sinyalleşme, anahtar yönetimi ve çağrı altyapısı gerekir.
- Fiziksel NAS/Word dosya kilidi, NAS ajanı veya şirket ağına erişim eklenmemiştir.
