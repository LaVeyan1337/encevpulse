# ENCEV PULSE Tasarım Sistemi

**Durum:** Ürün arayüzü için bağlayıcı tasarım ve içerik rehberi
**Dil:** Türkçe
**Öncelik:** Proje kökündeki `AGENTS.md` ve veri koruma politikasıyla birlikte uygulanır.

## 1. Tasarım amacı

ENCEV PULSE, EnÇev çalışanlarının günlük işlerini ve ekip süreçlerini yürüteceği kurumsal bir uygulamadır. Arayüz, Bitrix24'ün kolay gezinme ve iş akışı yaklaşımından yararlanır; gereksiz tanıtım alanları, boş kartlar ve tamamlanmamış modül bağlantıları içermez.

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

Mevcut uygulama CSS değişkenleri başlangıç paletidir. Yeni bileşenler renk değerlerini doğrudan çoğaltmak yerine semantik değişkenleri kullanır.

| Semantik token | Koyu tema başlangıcı | Açık tema başlangıcı | Kullanım |
|---|---|---|---|
| `--page` | `#101722` | `#f4f7f9` | Ana sayfa zemini |
| `--surface` | `#172231` | `#ffffff` | Panel ve yüzey |
| `--surface-raised` | `#1d2a3a` | `#f4f8f8` | Yüzey üstü öğeler |
| `--text` | `#f1f5f9` | `#182532` | Birincil metin |
| `--muted` | `#9ba9b9` | `#647383` | İkincil metin |
| `--line` | `rgba(192, 211, 231, .13)` | `rgba(33, 57, 76, .12)` | Kenarlık ve ayraç |
| `--accent` | `#70d3c1` | `#178a7b` | Vurgu ve odak |

- Tema seçimi kullanıcı tercihidir; local storage kullanılamazsa arayüz çalışmaya devam eder.
- Durum renkleri tek başına anlam taşımaz; metin veya erişilebilir ikonla desteklenir.
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
