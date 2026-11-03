# ENCEV PULSE — Modül Gereksinimleri ve Kabul Kriterleri

**Belge durumu:** Ürün gereksinimi taslağı
**Terimler:** “Temel” günlük kullanım için gerekli; “Gelişmiş” sonraki olgunlaşma adımlarıdır. Bu etiketler kesin yayın sırası değildir.

## Ortak gereksinimler

- Kullanıcı yalnızca yetkili olduğu kayıtları ve dosyaları görebilir. Arama, bildirim ve doğrudan bağlantılar aynı yetki kuralını uygular.
- Temel kayıtlarda oluşturan, sorumlu, oluşturma/güncelleme zamanı ve gerekiyorsa durum geçmişi bulunur.
- Ekranlar yükleniyor, boş, hata ve başarı durumlarını anlaşılır gösterir; kaydetme başarısızlığı sessizce geçilmez.
- Arşiv, silme ve geri yükleme davranışı tanımlı olur. Kritik iş kayıtlarında varsayılan tercih geri alınabilir arşivlemedir.
- Türkçe metin, tarih ve saat gösterimi tutarlı olmalı; saat dilimi etkisi takvim ve mesajlarda açık olmalıdır.
- Kurum içi tarih/saat varsayılanı Europe/Istanbul olmalıdır; saklanan zaman ve başka bölgede çalışan kullanıcıların gösterimi ayrıca ele alınmalıdır.
- Masaüstü ve dar ekranlarda ana akışlar kullanılabilir; klavye ile erişim ve yeterli kontrast sağlanır.
- Ölçüm/istatistik yalnızca gerçek sistem verisinden hesaplanır; veri yoksa sahte değer yerine açıklama gösterilir.
- Modül, kullanıcı akışı ve gerekli veri/izin/entegrasyon işlevleri hazır olduğunda açılır. Hazır olmayan modül yalnızca menü öğesi veya çalışıyormuş izlenimi veren ekran olarak sunulmaz.

## 1. Genel Bakış

**Amaç:** Kullanıcının güne nereden başlayacağını ve hangi işi ele alacağını göstermesi.

- **Temel:** Atanan/oluşturulan/takip edilen görevler; yaklaşan ve geciken tarihler; okunmamış bildirimler; bekleyen süreç aksiyonları. Her kart ilgili kaydı açar.
- **Gelişmiş:** Kullanıcının kart düzeni, yetkili ekip/proje özeti ve gecikme eğilimleri.
- **Kabul:** İçerik gerçek ve yetkili kayıtlardan gelir; veri yokken sayaç üretilmez; karttaki sayı ile açılan filtre sonucu tutarlıdır; kişisel ve yönetici kapsamı ayrıdır.

## 2. Görevler & Süreç

**Amaç:** Bireysel işi kolayca yakalamak, planlamak, yürütmek ve tamamlamak.

- **Temel:** Kanban varsayılanı ve liste görünümü; görev oluşturma, atama, takipçi, açıklama, öncelik, durum, başlangıç/son tarih, yorum ve dosya/proje/süreç bağlantısı; arama ve filtreler. Görev detayı için sağ panel tercih edilir.
- **Gelişmiş:** Alt görev, bağımlılık, yinelenme, şablon, özel alan, kaydedilmiş görünüm ve yapılandırılabilir süreç akışı.
- **Kabul:** Kanban ve liste aynı kayıtları gösterir; temel alan değişiklikleri kaydedilip tekrar açıldığında korunur; filtre/arama doğru sonuç verir; kritik değişikliklerin kim/ne zaman geçmişi bulunur; görev arşivlenebilir ve yetkiyle geri yüklenebilir.

## 3. Projeler

**Amaç:** Ortak hedef, iş, sorumlu ve bağlamı bir arada koordine etmek.

- **Temel:** Proje adı, amaç, sahip, üyeler, durum, başlangıç/hedef tarih; görev panosu; ilgili takvim, belge ve Kurum Görüşü bağlantıları. Düzenli, sekmeli proje çalışma alanı tercih edilir.
- **Gelişmiş:** Kilometre taşları, bağımlılıklar, zaman çizelgesi, karar/risk kaydı, şablon ve iş yükü özeti.
- **Kabul:** Proje ve bağlı görevler aynı ilişkiyi farklı görünümlerde tutarlı gösterir; üyelik görünürlüğü beklenen kayıtlara uygulanır; proje üyeliği kaynak dosya iznini genişletmez; proje arşivlendiğinde geçmişi bulunabilir kalır.

## 4. Takvim & Yasal Süreçler

**Amaç:** Kişisel/ekip etkinlikleri ve kritik iş/yasal tarihleri görünür kılmak.

- **Temel:** Kişisel ve paylaşılan takvim, görev tarihleri, toplantılar, proje tarihleri, yasal tarihler, kalan gün bilgisi, sorumlu/kayıt türü filtreleri ve hatırlatmalar. Saatler Europe/Istanbul'a göre gösterilir.
- **Gelişmiş:** Dış takvim eşitleme, yinelenen etkinlik, resmî tatil/kurum iş günü takvimi ve yapılandırılabilir yasal süre hesaplama motoru.
- **Kabul:** Yetkili etkinlikler doğru tarih ve saatte gösterilir; hatırlatma tercihi uygulanır; her süreç türünün kuralı ayrı yapılandırılabilir; kural takvim günü/iş günü, resmî tatil, başlangıç/bitiş ve Europe/Istanbul saat dilimini dikkate alır; kural değişiklikleri sürüm ve aktörle izlenir; onaylanmamış kural doğruymuş gibi çalıştırılmaz.

## 5. Sohbet

**Amaç:** Çalışanların gerçek zamanlı/kalıcı iletişim kurması ve konuşmayı işe bağlaması.

- **Temel:** Üç panel: sohbet listesi, mesaj akışı, bağlam/üye bilgisi. Bire bir ve grup sohbeti; kalıcı mesajlar; yanıtlar; reaksiyonlar; yetkiye tabi düzenleme/silme; okundu bilgisi; dosya paylaşımı; mesaj arama; mesajdan görev oluşturma; gönderim durumu ve bildirim.
- **Gelişmiş:** Proje/ekip kanalları, sabitlenmiş mesajlar, sessize alma, yönetim ve saklama araçları. Sesli/görüntülü görüşme sonraki aşamadadır.
- **Kabul:** Mesaj kalıcı kaydolur ve aranabilir; yanıt/reaksiyon doğru mesaja bağlanır; düzenleme/silme izin ve geçmiş politikasını uygular; okundu bilgisi alıcı kapsamına uygundur; mesajdan oluşturulan görev kaynak mesaja geri bağlanır; ekler yetki denetimini aşmaz; gönderim hatası görünür; üç panel kullanılabilir; çalışmayan görüşme düğmesi yer almaz.

## 6. Belgeler / Ortak Drive

**Amaç:** Mevcut şirket dosyalarını taşımadan, güvenli erişim ve iş bağlamı sağlamak.

- **Temel:** Mevcut şirket dosya yapısı sistem kaynağı kalır; toplu taşıma veya çoğaltma yapılmaz. Güvenli backend/API entegrasyonu yalnızca mimari olarak değerlendirilir; bu aşamada gerçek sunucu bağlantısı kurulmaz veya etkinleştirilmez. Dosya yönetimi geliştirme/testi yerel sahte klasörlerle yapılır.
- **Gelişmiş:** İleride, ayrı ve açık kullanıcı izni verildikten sonra güvenli API erişimi, önizleme, etiket, sürüm bilgisi, gelişmiş arama ve erişim talebi değerlendirilebilir. Ağ paylaşımı/uzaktan erişim, dosya kilidi ve eşzamanlı düzenleme ile yedekleme ancak izinli ve kontrollü keşif kapsamında incelenebilir.
- **Kabul:** Bu aşamadaki testler yalnızca yerel sahte veriyi kullanır ve gerçek sunucu adresine istek göndermez; SMB/ağ paylaşımı internete doğrudan açılmaz; tasarlanan erişim kullanıcı/kaynak dosya izinlerini korur ve geniş yetkili ortak hesapla bu sınırı aşmaz; dosya taşıma yapılmaz; yol/kimlik bilgileri kod içine sabit yazılmaz; gerçek sunucu bağlantısı ayrıca açık izin olmadan etkinleştirilmez.

Bağlayıcı geliştirme ve test sınırları için [Veri Koruma Politikası](DATA_PROTECTION_POLICY.md) uygulanır.

## 7. Kurum Rehberi

**Amaç:** Dış kurum, kuruluş ve iletişim bilgilerini aranabilir, tutarlı ve diğer iş kayıtlarıyla ilişkili biçimde yönetmek. Şirket çalışanları bu rehberde değil, kullanıcı ve ekip yönetiminde bulunur.

- **Temel:** Kurum arama ve kurum profili; doğrulanmış iletişim kişileri/kanalları, adres ve ilgili yazışma, proje veya süreç bağlantıları.
- **Gelişmiş:** Kurum türü ve konu etiketleri, kurum hiyerarşisi, yinelenen kayıt eşleştirme ve yetkili kaynaktan veri eşitleme.
- **Kabul:** Arama kurum/kuruluş ve iletişim kayıtlarını bulur; gösterilen alanlar kaynağı ve güncelleme zamanı ile izlenir; yetkili kullanıcı değişiklik yapar; yinelenen veya güncel olmayan kayıt anlaşılır biçimde yönetilir; çalışan hesapları ve ekipleri bu modülden bağımsız yönetilir.

## 8. Kurum Görüşleri

**Amaç:** Kurumlarla ilgili görüş/yazı işlerini, yasal tarihleri ve yanıt sorumluluğunu izlemek.

- **Temel:** Kurum Rehberi'ndeki kurumla ilişki, konu, proje/dosya, giriş/gönderim tarihi, yasal son tarih ve kalan gün, sorumlu, işlem durumu, yazışmalar/belgeler ve işlem geçmişi. Tablo/işlem merkezi ve sağ detay paneli tercih edilir.
- **Gelişmiş:** Bu süreç türü için ayrı süre kuralı yapılandırması; alt adımlar, eskalasyon, rapor ve şablon.
- **Kabul:** Her kayıt sorumlu, tarih, durum ve dayanak belgelere sahiptir; yaklaşan/geciken uyarısı ilgili süreç kuralıyla çalışır; süre başlangıç/bitiş olayı ve hesaplama kuralı izlenebilir; son tarih değişikliği gerekçe ve aktörle izlenir; tamamlanan kayıt aranabilir/arşivlenebilir.

## 9. Dilekçeler

**Amaç:** Onaylı şablondan gerçek ve kullanılabilir Word belgesi üretmek.

- **Temel:** Yetkili `.docx` şablon seçimi, alan doğrulama, çıktı üretme, önizleme/indirme veya tanımlı depoya kaydetme, kayıt/proje bağlantısı.
- **Gelişmiş:** Şablon sürümleme, güvenilir kaynaktan alan doldurma, çok adımlı onay ve çıktı kayıt defteri. Taslak, incelemede, onaylandı ve gönderildi durumları süreç sahibinin doğrulamasıyla kapsanabilir.
- **Kabul:** Açılabilir gerçek `.docx` üretilir; zorunlu alan eksikse hangi alanın tamamlanacağı bildirilir; çıktı ilgili kayıt ve şablon sürümüyle izlenir; taslak/nihai ayrımı görünürdür; çıktı hedefi ve erişimi tanımlıdır.

## 10. e-ÇED Takip

**Amaç:** e-ÇED dosyalarının aşama, sorumlu, tarih ve bekleyen işini izlemek.

- **Temel:** Dosya/proje referansı, aşama, sorumlu, tarih/son tarih, bekleyen eylem, belge bağlantısı ve değişiklik geçmişi.
- **Gelişmiş:** Aşama kontrol listesi, gecikme uyarısı, rapor, şablon ve doğrulanmış resmî sistem entegrasyonu.
- **Kabul:** Aşama değişikliği, aktör ve zaman geçmişte kalır; tarihler ve bekleyen işler sorumluya bağlanır; belge bağlantısı açılır; entegrasyon yoksa veri kaynağı/manüel giriş durumu açıkça belirtilir.

## 11. Notlarım

**Amaç:** Çalışanın kendi bağlam notlarını güvenle tutması.

- **Temel:** Oluşturma, düzenleme, arama, etiketleme, arşivleme ve görev/proje bağlantısı.
- **Gelişmiş:** Şablon, nottan görev oluşturma, seçili notu paylaşma ve sürüm geçmişi.
- **Kabul:** Not varsayılan olarak yalnızca sahibine görünür; paylaşım açıkça başlatılır ve geri alınabilir; not düzenlemesi korunur; yetkisiz kişi arama veya bağlantı ile notu göremez.

## 12. Bildirimler

**Amaç:** Kullanıcıyı ilgili ve zamanında bir sonraki eylemden haberdar etmek.

- **Temel:** Atama, yorum/mention, yaklaşan tarih ve süreç aksiyonu için uygulama içi bildirim; okundu durumu, ilgili kayda bağlantı ve kullanıcı tercihleri.
- **Gelişmiş:** E-posta/diğer kanal, sessiz saat, özet ve önem düzeyi ayarı.
- **Kabul:** Olay doğru yetkili alıcıya gider; bildirim doğru kaydı açar; okundu ve tercih durumu kalıcıdır; yetkisiz kaydın ayrıntısı sızmaz; tekrar ve teslimat hatası davranışı bellidir.

## 13. Ayarlar / Sistem Yönetimi

**Amaç:** Kullanıcı tercihleri ve güvenli sistem yönetimi.

- **Temel:** İki bölümlü ayar deneyimi; kullanıcılar, roller, izinler ve ekipler; uygulama tercihleri ve sistem ayarları ayrı alanlarda; açık/koyu/sistem teması; profil/bildirim tercihleri; kritik işlem geçmişi.
- **Gelişmiş:** Kurumsal kimlik eşitleme, saklama politikası, iş akışı/alan ayarı, entegrasyon durumu ve denetim dışa aktarımı.
- **Kabul:** Tema tüm ekranlara uygulanır ve kullanıcı tercihi korunur; kullanıcı/rol/izin/ekip ile kişisel uygulama tercihi ve sistem ayarı net ayrılır; rol değişikliği erişim sonucunu doğru etkiler; kritik yönetici işlemi aktör/zamanla kaydedilir; yönetim işlevleri yetkisiz kullanıma kapalıdır.

## Modüller arası tamamlanma ölçütü

Görev, proje, takvim, süreç, sohbet ve belge bağlantıları ortak kayıt kimliğiyle tutarlı olmalıdır. Bir modülde yapılan güncelleme, diğer görünümde güncel veriyi göstermelidir. Bildirim ve arama, aynı yetki sınırını izlemelidir. Hata durumunda ilişki kaybolmamalı ve kullanıcıya düzeltme yolu sunulmalıdır.

Bir modül yalnızca navigasyonda görünmesi veya statik ekranının olmasıyla tamamlanmış sayılmaz. İlgili kayıt/veri yapısı, gerçek kullanıcı akışı, yetkilendirme, hata durumları ve gerekli entegrasyonlar uygulanmış; fonksiyonel akışlar doğrulanmış olmalıdır. Görsel değişikliklerde gerçek uygulama üzerinde kullanım ve görünüm kontrolü yapılmalıdır.
