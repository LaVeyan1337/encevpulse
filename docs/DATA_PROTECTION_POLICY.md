# ENCEV PULSE — Şirket Dosya Sunucusu Veri Koruma Politikası

**Durum:** Zorunlu proje güvenlik kuralı

**Kapsam:** ENCEV PULSE'un tüm geliştirme, inceleme ve test çalışmaları
**Öncelik:** Bu politika, projedeki diğer geliştirme talimatlarından üstündür.

## 1. Korunan kaynak

Ofiste yıllardır kullanılan şirket dosya sunucusu ve üzerindeki bütün klasörler koruma kapsamındadır. Özellikle `\\192.168.1.55\Genel Evrak` paylaşımı bu kapsamdadır. Bu sunucudaki verilerin yedeklenmesi kolay değildir; hata riski göze alınamaz.

## 2. Kesin yasaklar

Kullanıcıdan ayrıca ve açıkça izin alınmadığı sürece:

- Sunucuya bağlantı kurma veya ona ağ isteği gönderme; ağ taraması yapma.
- Sunucudaki dosyaları veya klasörleri okuma, toplu okuma/indeksleme, yerel bilgisayara toplu kopyalama ya da başka depoya taşıma.
- Herhangi bir sunucu içeriğini silme, değiştirme, taşıma, yeniden adlandırma, üzerine yazma veya yeni dosya/klasör oluşturma.
- Dosya/klasör izinlerini, sahipliklerini, paylaşım ayarlarını veya yedekleme/senkronizasyon durumunu değiştirme.
- NAS yönetim paneline, DSM arayüzüne veya yönetim servislerine erişme.
- Sunucu hesabı, parola, bağlantı bilgisi veya ağ yapılandırması ekleme, değiştirme ya da kullanma.
- Test, geliştirme, yedekleme veya eşitleme amacıyla sunucuda işlem yapma.

Bu yasak, salt okunur görünen bağlantı ve testleri de kapsar. Kullanıcının bu konuşmada belirttiği üzere gerçek sunucu izni şu anda verilmemiştir.

## 3. İzin gerektiren işlerde davranış

Bir görev şirket dosya sunucusuna erişim gerektiriyorsa sunucuya yönelik adımı durdur. Önce sunucuya erişmeden yapılabilecek bir yöntem öner: yerel sahte dosya ağacı, yerel fixture, sahte API/adapter veya yalnızca dokümantasyon ve mimari tasarım. Kullanıcıdan ayrı ve açık izin gelmeden sunucu erişimine bağlı işi sürdürme.

İzin verilmesi gelecekte değerlendirilecekse izin kapsamı açıkça belirtilmelidir; genel bir geliştirme talebi sunucu erişim izni sayılmaz. Şimdiki talimatlar gerçek bağlantı kurmaya izin vermemektedir.

## 4. Geliştirme ve test sınırı

- Proje dosyaları ve tüm geliştirme/test çalışmaları `C:\Code\encev-pulse` içinde kalır.
- Dosya yönetimi testleri sadece yerel bilgisayarda oluşturulan sahte/test klasörleriyle yapılır.
- `192.168.1.55` adresine veya herhangi bir şirket paylaşımına istek gönderilmez; sunucuya ait kimlik bilgileri uygulama yapılandırmasına eklenmez.
- Ağ/SMB/NAS/DSM komutları, tarayıcı erişimi, ağ tarama araçları veya sunucuya dokunan dosya işlemleri çalıştırılmaz.
- Testler, hedef path'in yerel bir test dizini olduğunu doğrulayan sınırlar kullanmalıdır; gerçek ağ yoluna yönelen bir yapılandırma testte hata vermelidir.

## 5. Gelecekteki Ortak Drive tasarımı

Bu aşamada Drive entegrasyonu yalnızca mimari olarak tasarlanır. Gerçek dosya sunucusuna bağlanılmaz ve entegrasyon etkinleştirilmez.

İlerideki tasarım ilkeleri:

- Mevcut şirket dosya/klasör yapısını ve konumlarını koru; toplu taşıma veya çoğaltma yapma.
- Güvenli web erişimi için backend/API entegrasyonunu değerlendir; SMB/ağ paylaşımını internete doğrudan açma.
- Varsayılan erişim salt okunur olsun.
- Kullanıcının ve dosyanın kaynak sistemdeki izinlerini koru; uygulama, daha geniş yetkili servis hesabıyla bu sınırı aşmasın.
- Silme, değiştirme, taşıma ve yeniden adlandırma işlemlerini varsayılan olarak kapalı tut.
- Gerçek bağlantı veya sunucuda işlem ancak kullanıcıdan ayrıca, açık izin alındıktan sonra değerlendirilebilir. Bu politika tek başına izin değildir.

## 6. İlgili proje kuralları

- Proje kökündeki [AGENTS.md](../AGENTS.md) bu politikayı tüm proje çalışmaları için bağlayıcı kılar.
- [Modül Gereksinimleri](MODULE_REQUIREMENTS.md) içindeki Belgeler / Ortak Drive kriterleri bu politikayla birlikte uygulanır.
- Çakışma halinde gerçek sunucuya erişimi yasaklayan bu politika geçerlidir; uygulama veya test görevi yerel sahte veriye uyarlanır.
