# ENCEV PULSE — Zorunlu Şirket Dosya Sunucusu Koruma Kuralı

Bu kural proje kapsamındaki bütün geliştirme, inceleme ve test çalışmalarında zorunludur; diğer görev talimatlarından önceliklidir.

## Şirket dosya sunucusuna erişim yasağı

- `\\192.168.1.55\Genel Evrak` ve sunucudaki diğer tüm klasörler korumalıdır.
- Kullanıcıdan ayrıca ve açıkça izin gelmediği sürece sunucuya bağlanma veya ağ isteği gönderme. Ağ taraması, SMB/NAS/DSM erişimi, dosya indeksleme, toplu okuma, test, yedekleme ve senkronizasyon da yasaktır.
- Sunucudaki dosya/klasörleri okuma amacıyla toplu alma; silme, değiştirme, taşıma, yeniden adlandırma, üzerine yazma veya oluşturma yapma. İzin, sahiplik, paylaşım, hesap, parola ve ağ ayarlarını değiştirme.
- NAS yönetim paneline, DSM arayüzüne veya yönetim servislerine erişme.
- Sunucuya ait kimlik bilgilerini, parolaları veya bağlantı bilgilerini isteme, kullanma ya da uygulama yapılandırmasına ekleme.
- Sunucu erişimi gerektiren işte dur. Sunucuya erişmeden yapılabilecek yerel alternatifleri açıkla; kullanıcıdan ayrı, açık izin gelene kadar sunucuya bağlı adımı sürdürme. Mevcut talimatlarda izin bulunmuyor.

## Geliştirme ve test sınırı

- Bütün geliştirme ve test işlemleri `C:\Code\encev-pulse` altında yürütülür.
- Dosya yönetimi denemelerinde yalnızca yerel bilgisayarda oluşturulmuş sahte/test klasörleri kullanılır.
- Gerçek sunucu adresi veya ağ paylaşımına istek gönderilmez. Sunucu kimlik bilgileri yapılandırmaya konulmaz.
- Ortak Drive şu aşamada yalnızca mimari olarak tasarlanır; gerçek sunucu bağlantısı kurulmaz veya etkinleştirilmez.

Politikanın ayrıntıları [docs/DATA_PROTECTION_POLICY.md](docs/DATA_PROTECTION_POLICY.md) içindedir.

## Ürün dili ve arayüz ilkeleri

- ENCEV PULSE gerçek bir kurumsal iş yazılımı olarak tasarlanır. Kullanıcıya görünen bütün metinler doğal, kısa, anlaşılır Türkçe kullanır ve gerçek bir işi veya kontrolü anlatır.
- Yapay zekâ pazarlama dili, slogan, dolgu cümlesi ve aynı anlama gelen yeniden yazımlar kullanılmaz. Özellikle “İşleriniz için tek bir merkez”, “Daha akıllı çalışın”, “Verimliliğinizi artırın”, “Her şey tek yerde”, “Çalışma alanınız hazırlanıyor”, “İşlerinizi bir üst seviyeye taşıyın” ve “Yapay zekâ destekli deneyim” ifadeleri yasaktır.
- Yerel geliştirme, API/HTTP bağlantısı, PostgreSQL, ilk sürüm ve geliştirme aşaması gibi teknik bilgiler normal kullanıcı arayüzünde gösterilmez; bunlar geliştirici araçlarında ve teknik loglarda kalır.
- Gerçek kullanıcı, görev, proje, sayaç veya istatistik yoksa bunlar uydurulmaz. Henüz işlevi bulunmayan modüller menüye eklenmez ve tamamlanmış gibi sunulmaz.
- Görünen her buton, bağlantı, menü öğesi ve kontrol gerçek bir işleve sahip olmalıdır. İşlevi henüz hazır değilse arayüzde yer almaz.
- İşlevsel modüller için masaüstünde sabit sol navigasyon kullanılır; kayıt ayrıntıları, düzenleme ve bağlam içi işlemler uygun olduğunda sağ detay panelinde açılır. Mevcut ekranı, çalışmayan menülerle doldurma.
- Açık ve koyu tema; responsive düzen, klavye ile kullanım, görünür odak durumu ve yeterli renk karşıtlığı korunur. Tasarım kararlarının ayrıntısı [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) içindedir.
