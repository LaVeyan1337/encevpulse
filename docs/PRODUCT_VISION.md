# ENCEV PULSE — Ürün Vizyonu

**Belge durumu:** İlk ürün tanımı
**Kapsam:** Ürün amacı, sınırlar, ilkeler ve başarı yaklaşımı

## Vizyon

ENCEV PULSE, EnÇev çalışanlarının günlük işlerini güvenilir biçimde yürütebildiği; ekiplerin proje, iletişim ve belge bağlamını kaybetmeden birlikte çalıştığı; yöneticilerin ise yetkileri dâhilinde ilerleme ve riskleri görebildiği şirket içi çalışma platformudur. Bitrix24'ten kullanım kolaylığı ve çalışma alanı yaklaşımı bakımından ilham alır; iş akışları EnÇev'in gerçek ihtiyaçlarına göre tasarlanır.

Ürün, çalışanların bireysel işlerini kolaylaştırmayı birinci öncelik kabul eder. Proje ve ekip koordinasyonu ikinci, yönetsel takip üçüncü, kurumsal belge/yazışma ve bilgi akışının yönetimi dördüncü önceliktir. Bu sıralama, ürün kararlarında ve ilk sürüm kapsamlandırmasında korunmalıdır.

## Çözdüğümüz ihtiyaç

İşler, görevler, tarihler, belgeler ve yazışmalar farklı yerlerde kaldığında çalışanlar ne yapacağını, hangi bilginin güncel olduğunu ve kimden yanıt beklediğini takip etmek için ek çaba harcar. ENCEV PULSE; iş kaydını, sorumlusunu, tarihini, ilgili proje/süreci ve dayanak belgesini birbiriyle ilişkilendirerek bu takip yükünü azaltmayı hedefler.

Bu hedef, tüm içeriklerin mutlaka yeni bir depoya taşınması anlamına gelmez. Mevcut şirket dosya yapısı korunmalı; platform dosyalara erişim ve bağlam sağlamalıdır. Gerçek mesajlaşma, gerçek Word çıktısı ve izlenebilir yasal süreçler ürünün işlevsel gereksinimleridir; yalnızca görsel maket yeterli değildir.

## Hedef kullanıcılar

- Günlük işlerini planlayan ve tamamlayan çalışanlar.
- Ekip ve proje çalışmalarını koordine eden sorumlular.
- Kurum görüşü, e-ÇED ve diğer yasal/operasyonel süreçleri izleyen iş sahipleri.
- Erişimleri, kullanıcıları, ayarları ve entegrasyonları yöneten sistem yöneticileri.

Rollerin ayrıntıları ve kullanım akışları [USER_ROLES_AND_FLOWS.md](USER_ROLES_AND_FLOWS.md) içindedir.

## Ürün kapsamı

1. Genel Bakış
2. Görevler & Süreç
3. Projeler
4. Takvim & Yasal Süreçler
5. Sohbet
6. Belgeler / Ortak Drive
7. Kurum Rehberi
8. Kurum Görüşleri
9. Dilekçeler
10. e-ÇED Takip
11. Notlarım
12. Bildirimler
13. Ayarlar / Sistem Yönetimi

Modül gereksinimleri ve tamamlanma ölçütleri [MODULE_REQUIREMENTS.md](MODULE_REQUIREMENTS.md) içindedir.

## Kapsam dışı ve değişmez kararlar

- CRM, müşteri yönetimi ve satış fırsatları bu ürünün kapsamı değildir.
- Sahte kullanıcı, mesaj, görev, aktivite, istatistik veya demo kayıtları kullanılmaz.
- Şirket çalışanları uygulama kullanıcıları ve ekipleri olarak yönetilir; Kurum Rehberi dış kurum/kuruluş ve iletişim kayıtları içindir.
- Görevlerde varsayılan çalışma görünümü Kanban'dır; liste görünümü de bulunur.
- Temel sohbet erken geliştirme kapsamındadır: kalıcı mesaj, yanıt, reaksiyon, düzenleme/silme, okundu bilgisi, dosya paylaşımı, arama ve mesajdan görev oluşturma.
- Sesli/görüntülü görüşme sonraki aşamadadır.
- Belgeler mevcut şirket dosya yapısını korur; toplu dosya taşıma yapılmaz. Güvenli backend/API erişimi değerlendirilecek yaklaşımdır; uygulanabilir bağlantı biçimi mevcut altyapı keşfinden sonra seçilir. SMB/ağ paylaşımı internete doğrudan açılmaz ve kaynak kullanıcı/dosya yetkileri korunur.
- Yasal süre kuralları yapılandırılabilir olmalı; her süreç türünün takvim/iş günü, başlangıç/bitiş ve resmî tatil kuralı ayrı tanımlanabilmelidir.
- Dilekçeler açılabilir ve kullanılabilir gerçek Word belgesi üretmelidir.
- Kurum Görüşleri yasal süreleri, sorumluları ve işlem durumlarını takip etmelidir.
- Açık ve koyu tema bulunmalıdır.
- Arayüz profesyonel, modern ve kullanım kolaylığı odaklı olmalıdır.
- Sabit sol ana navigasyon, dengeli bilgi yoğunluğu ve gerektiğinde sağ detay paneli temel yerleşim tercihidir. Proje alanlarında sekmeli ve düzenli çalışma alanı tercih edilir.
- Daha önce beğenilmeyen füme/petrol/mint (Slate & Teal) paleti varsayılan olarak tekrarlanmamalıdır. Koyu antrasit/Stitch esintisi proje alanı için olumlu referanstır; tüm ürüne otomatik yayılmamalı, bütünsel tasarım sistemi içinde değerlendirilmelidir.

## Tasarım ve kullanım beklentileri

- Modern, profesyonel, kurumsal ve tamamlanmış hissi veren arayüz; açık ve koyu tema.
- Kanban'dan görev detayına geçişte sağdan açılan detay paneli tercih edilir.
- Kurum Görüşleri'nde tablo/işlem merkezi ve sağ detay paneli tercih edilir.
- Gereksiz boşluk, aşırı sıkışıklık, kesilen metin, işlevsiz kontrol ve yarım ekran kabul edilmez.
- Gösterişli efektler işlevselliğin önüne geçmemelidir.

## Ürün ilkeleri

1. **Önce kişisel iş akışı:** Çalışan, kendisine düşen işi, sonraki adımı, tarihi ve bağlamı hızla bulabilmelidir.
2. **Tek kayıt, çok görünüm:** Bir görev pano, liste, proje ve takvimde görünebilir; her yerde aynı kaydı ifade etmelidir.
3. **Bağlamı koru:** Görev, proje, süreç, sohbet ve belge birbirine bağlanabilmeli; kullanıcı aynı bilgiyi tekrar tekrar girmek zorunda kalmamalıdır.
4. **Yetkiyi kaynağında uygula:** Kullanıcı bir kaydı veya dosyayı göremiyorsa bildirim, arama veya bağlantı üzerinden içeriği sızmamalıdır.
5. **Gerçek veriye dayan:** Gösterge ve raporlar kayıtlı veriden üretilir. Veri yoksa bu açıkça söylenir; sahte sayaç gösterilmez.
6. **İzlenebilirlik:** Sorumlu, durum, son tarih ve erişim gibi kritik değişikliklerde kim/ne zaman/ne değiştirdi bilgisi bulunmalıdır.
7. **Hata anlaşılır olmalı:** Kaydetme, mesaj gönderme, dosyaya erişme veya bildirim başarısızlığında kullanıcı ne olduğunu ve mümkün olan sonraki adımı görmelidir.
8. **Kullanıcıyı bildirimle boğma:** Bildirimler eyleme dönük, tercih edilebilir ve tekrarları azaltılmış olmalıdır.

## Başarı yaklaşımı

Başarı, kullanım kolaylığı ve iş akışının tamamlanması üzerinden değerlendirilmelidir. İzlenebilecek ölçüler; çalışanların kendi görevlerini bulup güncelleme süresi, geciken işlerin görünür olma oranı, süreçlerde sorumlusu/tarihi eksik kayıt sayısı, bildirimlerin eyleme dönüşmesi ve gerçek kullanıcı geri bildirimidir. Bunlar ölçüm önerileridir; hedef değer veya mevcut performans verisi verilmediği için sayı uydurulmamıştır.

Ölçüm yapılacaksa kapsam, dönem, veri kaynağı ve kullanıcı gizliliği önceden açıklanmalıdır. Yönetici ekranları bireysel çalışan takibini gereğinden fazla genişletmemelidir.

## Önerilen geliştirme aşamaları

Ürünün uzun vadeli modül listesi ile ilk kullanılabilir sürümün kapsamı ayrıdır. Önerilen sıra, bağımlılıkları erkenden çözerek küçük ama gerçek iş akışları sunar:

| Aşama | Kapsam | Neden bu aşamada |
|---|---|---|
| 0. Temel keşif ve mimari | Kullanıcı/ekip/rol modeli; kayıt ve dosya yetki yaklaşımı; gerçek depolama için backend/API keşfi; sohbet veri/erişim yaklaşımı; yapılandırılabilir yasal süre motorunun kural modeli; kabul ve güvenlik ilkeleri. | Kimlik, dosya erişimi, mesajlaşma ve yasal tarihler sonraki modüllerin temel bağımlılıklarıdır. Teknoloji seçimi bu keşif tamamlanmadan yapılmaz. |
| 1. İlk kullanılabilir ürün | Gerçek kullanıcılar, ekipler ve roller; kişisel Genel Bakış; Kanban ve liste görevleri; temel Projeler ve görev-proje ilişkisi; uygulama içi bildirimler; açık/koyu tema ve gerekli yönetim ayarları. | Kullanıcının günlük değerini en önce görev ve iş bağlamı sağlar. İlk sürümün sınırı bu çalışan akışlardır; diğer modüller sadece menü öğesi olarak eklenmez. |
| 2. Erken ekip işbirliği | Üç panelli, kalıcı ve işlevsel sohbet: yanıt, reaksiyon, düzenleme/silme, okundu bilgisi, dosya paylaşımı, arama ve mesajdan görev. Ortak Drive için yalnızca mimari tasarım ve yerel sahte verilerle adapter/API sözleşmesi denemeleri. | Sohbet erken geliştirme planına alınır. Gerçek sunucu bağlantısı kurulmaz/etkinleştirilmez; depolama taşınmaz. Gerçek bağlantı ayrı açık izin ve sonraki güvenlik incelemesine bağlıdır. |
| 3. Takvim ve yasal operasyon | Takvim; ayrı süreç kurallarıyla yapılandırılabilir yasal süre motoru; dış kurum/kuruluş rehberi; Kurum Görüşleri; e-ÇED takibi. | Yasal tarihler ve süreç adımları sahipleri tarafından doğrulanınca devreye alınır; aynı kural motoru farklı süreçleri destekler. |
| 4. Belge üretimi ve ileri yetenekler | Onaylı şablonlarla Dilekçe Word üretimi/onay akışı; Notlarım; gelişmiş raporlama, gelişmiş süreç ayarları; sesli/görüntülü görüşme ancak altyapı ve ihtiyaç doğrulanırsa. | Şablon ve yönetsel süreçler doğrulanmış operasyonel temele dayanır; ses/görüntü temel mesajlaşmayı geciktirmez. |

Bu aşamalar öneridir ve kullanıcı geri bildirimiyle sıraları değişebilir. Her aşamada yalnızca kabul kriterlerini karşılayan gerçek akışlar kullanıcıya açılır. Hazır olmayan modül tamamlanmış gibi navigasyonda veya arayüzde sunulmaz.

## Varsayımlar

- Ürün EnÇev çalışanları içindir ve ilk dil Türkçedir. Bu, kullanıcı talebindeki bağlamdan çıkarılmış varsayımdır.
- Kullanıcı/rol kaynağı, dosya platformu, e-ÇED bağlantısı, mesaj saklama politikası ve onaylı dilekçe şablonlarının hangileri olduğu bilinmiyor.
- Dosya altyapısının kullanıcıya özgü yetkiyi backend/API üzerinden korumaya elverişli olduğu henüz doğrulanmadı; değilse güvenli alternatif bağlantı yaklaşımı keşfedilmelidir.
- Yasal süre motoru kuralları çalıştırabilmelidir; fakat mevzuat/proses kurallarının içeriği hukuk veya süreç sahiplerince sağlanıp onaylanmalıdır.
- “Kurum Görüşleri” resmî kurumlarla gelen/giden görüş yazılarının ve yasal sürelerinin takibi olarak ele alınmıştır. Kurum içi onay akışının kapsamı ayrıca doğrulanmalıdır.
- Ürün mimarisi ve teknoloji seçimi bu vizyon belgesinin konusu değildir.
- Önceki bir denemedeki Next.js/React/Supabase/Drizzle seçimi yeni uygulama için bağlayıcı değildir; teknoloji yığını gerçek gereksinimler değerlendirildikten sonra seçilmelidir.
- Ev ve ofisten kullanım ihtiyacı vardır. AnyDesk ile uzaktan masaüstü kullanımı geçici çalışma bağlamıdır; nihai dağıtım/uzaktan erişim mimarisi henüz kararlaştırılmamıştır.

## İlgili belgeler

- [Kullanıcı rolleri ve akışları](USER_ROLES_AND_FLOWS.md)
- [Modül gereksinimleri](MODULE_REQUIREMENTS.md)
- [Açık kararlar ve riskler](OPEN_DECISIONS.md)
