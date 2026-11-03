# ENCEV PULSE — Açık Kararlar ve Riskler

Bu belge, henüz verilmemiş kararları ve ürün kapsamını etkileyen riskleri toplar. Bilinmeyen konular varsayımla kapatılmamıştır. Öncelik, kararın ürün güvenliği, yasal doğruluk veya ilk sürüm mimarisine etkisini gösterir.

## Öncelikli kararlar

| Öncelik | Konu | Bilinen durum | Karar verilmesi gereken | Etkisi |
|---|---|---|---|---|
| Çok yüksek | Kimlik ve yetki kaynağı | Kullanıcı rolleri gerekli; gerçek kaynak belirtilmedi. | Kurumsal giriş/SSO veya personel kaynağı nedir? Rol, birim ve ayrılış bilgilerini kim yönetir? | Tüm modüllerin erişimini ve güvenliğini etkiler. |
| Çok yüksek | Mevcut dosya altyapısı | Mevcut yapı korunur; toplu taşıma yok; SMB/ağ paylaşımı internete açılmaz; backend/API entegrasyonu değerlendirilir; kaynak izinleri korunur. | Mevcut depolama ürünü/protokolü nedir? Kullanıcıya özgü yetkiyi güvenli backend/API ile devretme veya doğrulama mümkün mü? | Güvenli entegrasyon ve gerçekçi ilk dosya akışını belirler. |
| Çok yüksek | Yasal süre kurallarının içeriği | Motor yapılandırılabilir; süreç türü başına kural; takvim/iş günü, tatil, başlangıç/bitiş ve saat dilimi kapsanır. | Her süreçte süreyi başlatan olay, son günün sayımı, uzatma/durdurma/düzeltme ve kuralı onaylayan yetkili kim? Resmî tatil kaynağı nedir? | Kural motoru kararlaştırıldı; kuralları yanlış doldurmak ciddi yasal/operasyonel risk taşır. |
| Çok yüksek | Kurum Görüşleri kapsamı | Yasal tarih ve işlem durumu takibi isteniyor. | Yalnızca dış kurum yazıları mı; iç kurum görüşü/onayları da mı? Gelen ve giden kayıtlar birlikte mi yönetilecek? | Veri modeli, roller ve akış adımlarını etkiler. |
| Çok yüksek | Sohbet altyapısı | Üç panelli ve gerçek mesajlaşma isteniyor. | Mevcut sohbet servisi var mı? Yeni servis gerekiyorsa saklama, arama, ekler, dışa aktarma ve denetim beklentisi nedir? | Altyapı, güvenlik ve ilk sürüm süresini etkiler. |
| Yüksek | Sohbet saklama ve yönetim politikası | Temel mesajlaşma erken geliştirme kapsamındadır; kalıcı mesaj, yanıt, reaksiyon, düzenleme/silme, okundu bilgisi, ek, arama ve mesajdan görev oluşturma gerekir. Ses/görüntü sonraki aşamadır. | Mesaj saklama süresi, düzenleme/silme sınırı, denetim/dışa aktarma, ek boyutu/türü ve arama kapsamı nedir? | Gizlilik, kullanıcı güveni ve altyapı kapasitesini etkiler. |
| Yüksek | Dilekçe şablonları | Gerçek Word çıktısı zorunlu. | Onaylı şablonlar, zorunlu alanlar, imza/onay ve çıktıların saklanacağı yer nedir? | Belge doğruluğu ve hukuki kullanımını etkiler. |
| Yüksek | e-ÇED veri kaynağı | Takip modülü isteniyor; entegrasyon belirtilmedi. | İlk sürümde manuel kayıt mı; resmî kaynaktan entegrasyon var mı ve izinli mi? Hangi aşamalar izlenecek? | Veri güncelliği ve iş yükünü etkiler. |
| Yüksek | Kayıt görünürlüğü | Yetki ve gizlilik gereklidir. | Yönetici hangi ekip verisini görür? Özel not, bire bir sohbet ve hassas süreç kayıtlarının sınırı nedir? | Güven, gizlilik ve erişim modelini belirler. |
| Yüksek | İlk sürüm kapsamı | İlk kullanılabilir sürüm kullanıcı/ekip/rol, Genel Bakış, görevler, temel projeler, bildirimler ve gerekli ayarlara odaklanır. Sohbet ve dosya entegrasyonu erken mimariye dahildir; gerçek sohbet erken geliştirme aşamasında açılır. | İlk sürüm için ekip kapasitesi ve gerçek kullanıcı doğrulama ölçütü nedir? | Faz sınırını ve ilk kullanıcıya değer sunma zamanını belirler; uzun vadeli 13 modül hedefini değiştirmez. |
| Orta | Görev ve süreç durumları | Kanban öncelikli, liste de gerekli. | Varsayılan durum sözlüğü, bekleme/iptal/arsiv davranışı ve süreçlerin görevlerden farkı nedir? | Kullanıcı deneyimi ve raporlama tutarlılığını etkiler. |
| Orta | Saklama ve denetim | Kritik değişikliklerin izlenmesi önerildi. | Mesaj, kişisel veri, görev ve belgeler ne kadar saklanır; kim denetim geçmişine erişebilir? | Uyum, gizlilik ve işletim maliyetini etkiler. |
| Orta | Takvim ve tatil veri kaynağı | Europe/Istanbul kullanılır; süre motoru resmî tatilleri ve kurum iş günü kurallarını destekler. | Resmî tatil takviminin güncel kaynağı ve kurumun özel çalışma günleri kim tarafından sağlanıp onaylanacak? Dış takvim eşitlemesi gerekli mi? | Hesaplama girdilerinin güncelliğini ve yasal tarih doğruluğunu etkiler. |
| Orta | Kurum rehberi kaynağı | Rehber dış kurum/kuruluş ve iletişim kayıtlarını kapsar; çalışan hesapları kullanıcı/ekip yönetimindedir. | Kurum verisinin kaynağı nedir? Kurum kayıtlarını kim oluşturur, doğrular ve yinelenen kayıtları birleştirir? | Veri kalitesi ve kayıt sahipliğini etkiler. |
| Orta | Dosya işlemleri | Mevcut dosya yapısı korunmalı; ağ paylaşımı ve uzaktan erişim olasılığı var. | Dosya önizleme, kilitleme/eşzamanlı düzenleme, yedekleme ve uzaktan erişim mevcut sistemde nasıl çalışıyor? | Entegrasyonun kullanıcı deneyimini ve veri güvenliğini belirler. |
| Orta | Ev/ofis erişimi | Geliştirme ofis bilgisayarında; evden AnyDesk kullanımı planlanmış. | AnyDesk geçici kullanım mı, nihai erişim beklentisi mi? Uygulamanın uzaktan dağıtımı ve kimlik doğrulaması nasıl olacak? | Dağıtım, güvenlik ve kullanılabilirlik planını etkiler. |
| Düşük | Görsel yön | Sabit sol navigasyon, açık/koyu tema; proje alanında koyu antrasit/Stitch esintisi olumlu. Slate & Teal paleti beğenilmedi. | Nihai tasarım dili ve renk paleti nasıl seçilecek? Proje görsel yönü diğer modüllere hangi ölçüde taşınacak? | Tutarlı tasarım sistemi ve kullanıcı beklentisini etkiler. |
| Orta | Teknoloji yığını | Önceki denemede Next.js 14, React 18, Supabase ve Drizzle kullanılmış; bu seçim bağlayıcı değil. | Dosya sistemi, gerçek zamanlı sohbet, kimlik, güvenlik ve dağıtım gereksinimlerine göre hangi seçenek uygun? | Önceki teknoloji tercihinin gereksinimler doğrulanmadan kopyalanması uyumsuz mimari riski taşır. |
| Orta | Yönetim metrikleri | Yalnızca gerçek veriler kullanılmalı. | Hangi kararlar için hangi ölçüler gerekir? Bireysel iş yükü ne düzeyde görünür olmalı? | Yanıltıcı veya aşırı gözetim algısı riskini etkiler. |
| Orta | Mobil ve dil | Türkçe varsayılmıştır. | Mobil web/uygulama, çevrimdışı kullanım veya başka dil gerekiyor mu? | Tasarım ve kullanım kapsamını etkiler. |

## Riskler ve azaltma önerileri

### Yasal tarihin yanlış hesaplanması

**Risk:** Başlangıç olayı, iş günü veya tatil kuralı yanlış anlaşılırsa kullanıcı yanlış son tarihe güvenebilir.

**Öneri:** Süre kuralı süreç/hukuk sahibi tarafından yazılı doğrulanmadan otomatik hesaplama yapmayın. İlk aşamada kaynak olay, giren kişi ve son tarih doğrulama durumu görünür olsun.

### Kaynak dosya yetkilerinin aşılması

**Risk:** Backend'in geniş yetkili ortak hesabı kullanması, uygulamanın kullanıcının kaynakta sahip olmadığı dosyaları göstermesine yol açabilir. SMB/ağ paylaşımını internete açmak da kabul edilemez erişim riski oluşturur.

**Öneri:** Mevcut depolama/API ve kimlik modelini keşfedin; her kullanıcı isteğinde kaynak yetkisini koruyun; dosya ağını internete açmayın; toplu kopya/taşıma yapmayın.

### Sahte bütünleşiklik

**Risk:** Arayüzde sohbet, e-ÇED bağlantısı veya Word çıktısı varmış gibi gösterilir ancak arka planda gerçek işlev yoktur.

**Öneri:** Modül kabul kriterlerini gerçek kayıt/çıktı/başarısızlık senaryolarıyla doğrulayın. Entegrasyon yoksa manuel veri girişi açıkça belirtin.

### Fazla geniş ilk sürüm

**Risk:** 13 modülün tümünü aynı anda çıkarmak temel görev akışlarının ve güvenli yetkilendirmenin olgunlaşmasını geciktirebilir.

**Öneri:** Kişisel görev akışını ve ortak kimlik/yetki temelini önce teslim edin; süreç modüllerini sahipleri ve doğrulanmış kuralları hazır olduğunda ekleyin. Sıra kesin karar değildir.

### Gizlilik ve yönetici görünürlüğü

**Risk:** Yönetsel takip kişisel not, sohbet veya gereğinden fazla ayrıntılı çalışan takibine dönüşebilir.

**Öneri:** Kişisel alanları varsayılan özel tutun; yönetici görünürlüğünü iş amacı, rol ve kayıt kapsamına göre tanımlayın; kullanıcıya görünür kılın.

### Bildirim yorgunluğu ve veri kalitesi

**Risk:** Fazla bildirimler göz ardı edilir; eksik sorumlu/tarih bilgisi raporları anlamsızlaştırır.

**Öneri:** Bildirim türü ve sıklığı ayarlanabilir olsun; sahipsiz, tarihsiz ve çelişkili kayıtlar için veri kalite listesi sunun.

### Sahipsiz kayıtlar ve çalışan değişikliği

**Risk:** Kullanıcı pasifleştiğinde görevler, dilekçeler veya yasal takipler sahipsiz kalabilir.

**Öneri:** İşten ayrılma/rol değişimi için yetkili yeniden atama akışı ve denetim kaydı tanımlayın.

## Şimdilik kullanılacak varsayımlar

- Ürün şirket içi ve ilk arayüz dili Türkçedir.
- Görevlerde Kanban başlangıç görünümü, liste ek görünümüdür.
- Kişisel notlar varsayılan olarak özeldir.
- Mevcut dosya sistemi ana kaynak kabul edilir; yeni depoya taşıma varsayılmaz.
- Kurum Görüşleri ve e-ÇED kayıtları için otomatik resmî entegrasyon olduğu varsayılmaz.
- Dilekçe Word çıktısı taslak olabilir; otomatik imzalama/gönderim olduğu varsayılmaz.
- Kurum Rehberi dış kurum/kuruluş ve iletişim noktalarını kapsar; çalışan hesapları ve ekipleri kullanıcı yönetimindedir.
- Güvenli backend/API erişimi dosya entegrasyonu için değerlendirilecek yaklaşımdır; mevcut depolamanın bunu ve kullanıcı bazlı izinleri destekleyip desteklemediği doğrulanmalıdır. Nihai bağlantı yöntemi henüz seçilmemiştir.
- Yapılandırılabilir yasal süre motoru süreç türü kurallarını saklar; kural içerikleri yetkili süreç/hukuk sahiplerince sağlanır ve onaylanır.
- İlk kullanılabilir sürüm; kullanıcı/ekip/rol, Genel Bakış, görevler, temel proje ilişkisi ve bildirimleri kapsar. Sohbet ve dosya entegrasyonu erken mimariye alınır; tüm 13 modülün ilk sürümde olması beklenmez.
- Türkiye/İstanbul, tarih ve saat gösteriminde varsayılan saat dilimidir.
- Sabit sol navigasyon ve sağ detay panelleri tercih edilir; renk ve tasarım sistemi nihai olarak onaylanmış değildir.
- Önceki denemede kullanılan Next.js/React/Supabase/Drizzle yığını yeni uygulama için bağlayıcı değildir.
- AnyDesk ev/ofis erişiminde mevcut bir kullanım planıdır; ürünün nihai dağıtım veya uzaktan erişim mimarisi olarak kabul edilmemelidir.
- Bu varsayımlar ürün yönünü çalışabilir kılmak için geçicidir; belirsiz yasal/erişim kuralları varsayımla uygulanmamalıdır.

## Kararların değiştirilebilirliği

### Ürün yönü olarak sabit kabul edilecekler

- Temel mesajlaşmanın erken geliştirilmesi ve ses/görüntü görüşmelerinin sonraki aşamaya bırakılması.
- Kurum Rehberi'nin dış kurum/kuruluşları kapsaması; çalışanların kullanıcı ve ekip yönetiminde bulunması.
- Mevcut şirket dosya yapısını korumak, toplu taşıma yapmamak ve SMB/ağ paylaşımını internete açmamak.
- Kaynak dosya ve kullanıcı izinlerini korumak; modülü yalnızca menü/boş ekran olarak tamamlanmış göstermemek.
- Yasal süre kurallarının yapılandırılabilir motorla süreç türüne göre tanımlanması.

Bu kararlar ürün ilkesi olarak değiştirilebilir; değişiklik erişim güvenliği, veri kaybı veya yasal doğruluk riskini artırabileceğinden yeni gerekçe, etki analizi ve açık onay gerektirir.

### İleride daha kolay değiştirilebilecekler

- Fazların tam sırası, her fazdaki küçük işlevler ve modülün kademeli açılma zamanı.
- Genel Bakış kart düzeni, görsel tema ayrıntıları ve bildirim tercihleri.
- Süreç sahiplerinin onayladığı görev durum adları ve süreç adımları.
- Kurum rehberindeki isteğe bağlı alanlar ve arama filtreleri.

### Değiştirilmesi maliyetli olabilecek temel kararlar

- Kullanıcı kimliği, ekip/rol/izin modeli ve kayıt sahipliği.
- Dosya sistemine erişim/kimlik doğrulama biçimi ve dosya-yetki eşlemesi.
- Sohbetin mesaj kimliği, saklama, arama ve ek yetki modeli.
- Yasal süre kurallarının veri modeli, sürüm geçmişi ve kayıtların kural sürümüyle ilişkisi.

Bunlar teknoloji seçilmeden ve uygulama başlamadan önce doğrulanmalıdır.

## Kritik olarak cevap bekleyen konular

1. Şirket kullanıcıları ve ekipleri hangi mevcut kaynaktan alınacak; oturum açma ve işten ayrılma işlemleri kim tarafından yönetilecek?
2. Mevcut dosya depolaması nedir ve backend/API, kullanıcının kendi izinlerini güvenli biçimde uygulayabilir mi? Web erişiminin ağ sınırı nasıl korunuyor?
3. Her yasal süreçte kuralı kim onaylayacak; son gün, uzatma ve resmî tatil yorumları hangi yazılı iş kuralına dayanacak?
4. Sohbet ve ekler için saklama süresi, düzenleme/silme politikası ve denetim gereksinimi nedir?
5. İlk MVP için ekip kapasitesi ve kullanıcı kabul ölçütü nedir? Bu bilinmeden takvim/efor taahhüdü verilmemelidir.

## Önerilen karar sırası

1. Kimlik, kullanıcı kaynağı ve yetki sınırları.
2. Mevcut dosya sistemi ve kullanıcı yetkisini koruyan API erişiminin uygulanabilirliği.
3. Sohbet saklama, ek ve denetim kuralları.
4. Süreç sahipleri, yasal kural onayı ve resmî tatil veri kaynağı.
5. İlk MVP'nin kullanıcı kabul ölçütü ve ekip kapasitesi.
6. Dilekçe şablonları/çıktı konumu ve e-ÇED veri kaynağı.

## Handoff ile belge karşılaştırmasından çıkan önemli farklar

- Önceki taslak Kurum Rehberi'ni çalışan/birim dizini gibi yorumlamıştı. Son karar bunu netleştirdi: rehber dış kurum/kuruluş ve iletişim içindir; çalışanlar kullanıcı ve ekip yönetimindedir. Bu yanlış anlaşılma giderildi.
- Önceki yol haritası sohbeti geç aşamaya atıyordu. Son karar temel gerçek mesajlaşmayı erken geliştirmeye aldı; sesli/görüntülü görüşme ileri aşamada. Önceki öncelik gerilimi bu kararla çözüldü.
- Dosya taşıma ve SMB erişimi artık açık seçenek değildir: toplu taşıma yapılmaz ve SMB/ağ paylaşımı internete açılmaz. Hangi backend/API entegrasyonunun mevcut depoda kullanıcı izinlerini güvenle koruyacağı ise kritik teknik keşiftir.
- Yasal süre motorunun yapılandırılabilir olması kararlaştırıldı. Belirsiz kalan, her süreç türünün yetkili hukuk/süreç sahibi tarafından onaylanacak gerçek kural içeriğidir.
- İlk sürüm gerçek kullanıcı/ekip/rol, Genel Bakış, görev/proje ilişkisi ve bildirimlere odaklanır. Sohbet ve dosya entegrasyonu erken mimariye alınır; diğer modüller aşamalı gelir.

Bu sıralama; kullanıcı, dosya ve yasal süreçler gibi sonradan değiştirilmesi maliyetli konulara teknoloji veya geliştirme kararı bağlamadan önce doğrulama yapılmasını sağlar.
