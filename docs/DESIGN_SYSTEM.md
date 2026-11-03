# ENCEV PULSE Tasarım Sistemi

**Durum:** Ürün arayüzü için bağlayıcı tasarım ve içerik rehberi (Glass workspace revizyonu)
**Dil:** Türkçe
**Öncelik:** Proje kökündeki `AGENTS.md` ve veri koruma politikasıyla birlikte uygulanır.

## 1. Tasarım amacı

ENCEV PULSE, EnÇev çalışanlarının günlük işlerini ve ekip süreçlerini yürüteceği kurumsal bir uygulamadır. Arayüz, Bitrix24 Space yaklaşımındaki mavi navigasyon, ferah çalışma yüzeyleri ve hızlı iş akışı hissinden yararlanır. Görsel dil; yarı saydam cam yüzeyler, yumuşak arka plan ışımaları, ince parlak kenarlıklar ve net durum renkleriyle uygulanır. Gereksiz tanıtım alanları, boş kartlar ve tamamlanmamış modül bağlantıları içermez.

Öncelik sırası:

1. Çalışanın kendi işini hızlıca görmesi ve yönetmesi.
2. Proje ve ekip işlerinin koordine edilmesi.
3. Yöneticilerin durum ve iş yükünü takip etmesi.

## 2. Ürün dili

### Yazım ilkeleri

- Doğal, kısa ve profesyonel Türkçe kullan.
- Ekran başlığı modülün veya işin adını söylesin: **Görevlerim**, **Projeler**, **Takvim**, **Sohbet**, **Belgeler**, **Kurum Görüşleri**, **Bildirimler**, **Sistem Ayarları**.
- Eylem düğmeleri fiille ve açık sonuçla adlandırılsın: **Görev oluştur**, **Kaydet**, **Yanıtla**, **İndir**, **İptal et**.
- Hata ve doğrulama metni sorunu ve kullanıcının yapabileceği düzeltmeyi doğrudan anlatsın.
- Boş durum metni yalnız gerçek boşluğu açıklar; kullanıcıyı sahte içerik veya tanıtım metniyle doldurmaz.
- Teknik terimler yalnız ilgili teknik yönetim ekranında, gerektiği ölçüde kullanılır.

### Kullanılmayacak içerik

Genel AI pazarlama dili, slogan, dolgu ve yapay ifadeler kullanılmaz. Örnekler: “İşleriniz için tek bir merkez”, “Güvenli çalışma alanınız”, “Daha akıllı çalışın”, “Verimliliğinizi artırın”, “Her şey tek yerde”, “Çalışma alanınız hazırlanıyor”, “İşlerinizi bir üst seviyeye taşıyın” ve “Yapay zekâ destekli deneyim”. Aynı anlamı taşıyan farklı ifadeler de kullanılmaz.

Normal kullanıcı arayüzünde yerel geliştirme, API bağlantısı, PostgreSQL bağlantısı, ilk sürüm veya geliştirme aşaması gösterilmez. Bu bilgiler geliştirici araçları ve teknik loglar içindir.

## 3. Uygulama kabuğu ve gezinme

- İşlevsel ana modüller masaüstünde sabit sol navigasyonda yer alır. Navigasyon daraltılabilir; seçili modül açıkça belirtilir.
- Üst çubukta yalnız uygulama genelinde gerekli ve çalışır kontroller bulunur. Kullanıcı/ekip bilgisi gerçek kimlik sistemi bağlanana kadar uydurulmaz.
- Modüller tamamlanmadan menü öğesi, boş sayfa veya işlevsiz bağlantı eklenmez.
- Tablet ve dar pencerelerde sol navigasyon daraltılmış ya da açılır biçime geçer. Mobilde gezinme erişilebilir bir menü olarak sunulur.
- Sağ detay paneli görev, proje, mesaj veya süreç kaydının bağlamını kaybetmeden inceleme ve düzenleme gerektiğinde kullanılır. Basit bir bilgi için panel açılmaz.
- İçerik alanı ekran genişliğini anlamlı kullanır; gereksiz büyük kahraman alanları ve dekoratif kartlar kullanılmaz.

## 4. Yerleşim ve bilgi yoğunluğu

- Ana iş içeriği başlık, gerekli filtre/eylemler ve kayıt alanı sırasıyla düzenlenir.
- Veri tabloları ve görev panolarında taranabilirlik korunur; önemli durum, sorumlu ve tarih bilgisi gözden kaçmayacak yerde tutulur.
- Liste ve pano görünümleri aynı kayıtları temsil eder; görünüm değişikliği veri yaratmaz veya kaydı sessizce değiştirmez.
- Sağ panel açıkken ana liste bağlamı ve seçili kayıt görünürlüğü korunur.
- Küçük ekranlarda tablolar taşırılmadan kullanılabilir olmalı; kolonları saklama, kart görünümüne geçme veya yatay kaydırma kararı modülün işine göre verilir.

## 5. Renk ve tema

Uygulamanın güncel görsel dili koyu lacivert/cam yüzeyler, doygun mavi navigasyon ve mavi-camgöbeği vurgu üzerine kuruludur. Açık tema aynı görsel dilin daha aydınlık karşılığıdır. Yüzeylerde `backdrop-filter` desteklendiğinde blur ve transparanlık kullanılır; desteklenmediğinde opak renkli geri dönüşler devreye girer. Bileşen renkleri token üzerinden kullanılır.

| Semantik token | Koyu tema | Açık tema | Kullanım |
|---|---|---|---|
| `--page` | `#08182d` | `#eaf2fb` | Ana sayfa zemini |
| `--surface` | `rgba(16, 39, 67, .76)` | `rgba(255, 255, 255, .72)` | Cam panel yüzeyi |
| `--surface-raised` | `rgba(27, 54, 86, .78)` | `rgba(255, 255, 255, .88)` | Kart ve yükseltilmiş yüzey |
| `--surface-hover` | `rgba(43, 77, 115, .86)` | `rgba(240, 247, 255, .96)` | Hover yüzeyi |
| `--text` | `#f4f8ff` | `#172b45` | Birincil metin |
| `--text-secondary` | `#b6c9df` | `#526b87` | İkincil metin |
| `--text-muted` | `#829bb8` | `#7c91aa` | Yardımcı metin |
| `--border` | `rgba(176, 211, 249, .16)` | `rgba(46, 88, 139, .13)` | Cam kenarlığı ve ayraç |
| `--accent` | `#65baff` | `#237bd5` | Vurgu, aktif gezinme ve odak |

- Tema seçimi kullanıcı tercihidir; local storage kullanılamazsa arayüz çalışmaya devam eder.
- Durum renkleri (hata, uyarı, başarı) vurgu renginden ayrı tutulur; tek başına renk anlam taşımaz, metinle desteklenir.
- Arka plan derinliği mavi/camgöbeği degrade ve sınırlı ışımalarla sağlanır. Navigasyon mavi bir ray olarak ayrışır; ana içerik yarı saydam panellerle zeminden katmanlanır. Her alan ayrı karta dönüştürülmez.
- Metin ve kontrol karşıtlığı açık ve koyu temada ayrıca kontrol edilir. Renk yalnız dekorasyon için kullanılmaz.

## 6. Tipografi, boşluk ve şekil

- Sistem yazı tipi tercih edilir; uzaktaki font servisine bağımlı olunmaz.
- Sayfa başlıkları belirgin ama ölçülü; tablo ve form metinleri günlük kullanımda rahat okunur boyutta olmalıdır.
- Mevcut temel boşluklar 8 px katları üzerinden ilerler: 4, 8, 12, 16, 24, 32 ve 48 px. Yeni ölçü gerekiyorsa komşu aralıklar tutarlı kalır.
- Form alanı, düğme ve küçük etkileşimlerde köşe yuvarlatma tutarlı tutulur. Her yüzey karta dönüştürülmez.
- Animasyon kısa ve işlevseldir; `prefers-reduced-motion` dikkate alınır.

## 7. Bileşen ve etkileşim kuralları

- Düğme yalnız tıklanabilir görünmekle kalmaz; çalışır, klavyeyle erişilir ve odağı görünürdür.
- Sadece ikon kullanan kontrolün erişilebilir adı ve gerektiğinde açıklaması bulunur.
- İşlem sonucunda kullanıcıya kayıt durumu açıkça gösterilir. Başarısız işlem başarı gibi sunulmaz.
- Onay penceresi yalnız geri alınması zor veya önemli sonuç doğuran işlemlerde kullanılır; mesajı etkiyi açıklar.
- Formlar etiket, doğrulama, hata ve kaydedilmemiş değişiklik davranışını tanımlar.
- Sağ panelin kapatılması ve geri gezinme davranışı tutarlı olur; kaydedilmemiş değişiklik varsa kayıp önlenir.

## 8. Gerçek veri ve boş durumlar

- Sahte kullanıcı, görev, proje, sayaç, istatistik veya etkinlik gösterilmez.
- Veritabanında kayıt yoksa boş durum gerçek ve sade bir metin gösterir; örnek kayıt üretmez.
- İşlevi bulunmayan modül ve menü eklenmez. Kısmi özellik tamamlanmış gibi tanıtılmaz.
- Geliştirme/bağımlılık/servis sağlık ayrıntıları normal kullanıcı ekranlarına konmaz.

## 9. Erişilebilirlik ve responsive kabul kontrolü

Bir ekran tamamlanmadan önce:

- Açık ve koyu tema kontrol edilir.
- Dar ve geniş görünümde içerik, tablo ve panellerin taşmadığı doğrulanır.
- Klavye ile gezinme, görünür odak, etiketler ve ekran okuyucu adları gözden geçirilir.
- Metin ve durum karşıtlığı incelenir.
- Her görünen eylemin gerçek işlevi doğrulanır.
- Slogan, dolgu, geliştirme bilgisi, uydurma veri veya işlevsiz menü bulunmadığı kontrol edilir.
