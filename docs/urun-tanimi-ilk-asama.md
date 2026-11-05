# ENCEV PULSE — Ürün Tanımı ve İlk Aşama Gereksinimleri

> **Not:** Bu, ilk aşamada hazırlanmış ara taslaktır. Güncel ve esas alınacak belgeler `PRODUCT_VISION.md`, `USER_ROLES_AND_FLOWS.md`, `MODULE_REQUIREMENTS.md` ve `OPEN_DECISIONS.md` dosyalarıdır.

**Durum:** İlk ürün çerçevesi; karar bekleyen konular ayrıca listelenmiştir
**Dayanak:** Kullanıcının bu çalışmada verdiği amaç, modül listesi ve ürün kararları

## 1. Ürünün amacı ve kapsamı

ENCEV PULSE, EnÇev çalışanlarının kişisel işlerini tek yerden yönetmesini; ekiplerin proje, iletişim ve belge akışlarını koordine etmesini; yöneticilerin de yetkileri ölçüsünde ilerlemeyi ve gecikme risklerini görebilmesini sağlayan şirket içi çalışma platformudur.

Ürün öncelikleri sırasıyla:

1. Çalışanın kendi işini bulması, planlaması, tamamlaması ve takip etmesi.
2. Ekiplerin ve projelerin ortak işi, bağlamı ve dosyaları koordine etmesi.
3. Yöneticilerin iş yükü, ilerleme ve gecikme risklerini izlemesi.
4. Kurumsal belge, yazışma ve şirket içi bilgi akışının yönetimi.

Platform, mevcut şirket dosya düzenini korumalı; dosyaları gereksiz yere yeni bir depoya taşımamalıdır. Mesajlaşma gerçek ve kalıcı bir altyapıya dayanmalıdır. Dilekçe çıktısı gerçek Word belgesi olmalıdır. CRM, satış fırsatları, sahte kullanıcılar ve sahte etkinlik/istatistikler kapsam dışıdır.

Bu tanım ürün gereksinimidir; teknik mimari, seçilecek hizmetler, veri saklama süreleri ve mevcut sistemlerle entegrasyonların uygulanma biçimi henüz kararlaştırılmış sayılmaz.

## 2. Kullanıcı rolleri ve ihtiyaçları

Roller işlevsel taslaktır. Tek kişinin birden fazla rolü üstlenebilmesi beklenebilir; gerçek organizasyon yapısı ve yetki matrisi doğrulanmalıdır.

| Rol | Temel ihtiyaçlar |
|---|---|
| Çalışan | Bana atanan ve benim oluşturduğum işleri, takvimi, mesajları ve belgeleri kolayca bulmak; öncelik ve son tarihleri yönetmek; ilgili ekipten yardım almak. |
| Ekip sorumlusu / yönetici | Ekip işlerini, bağımlılıkları, kapasiteyi ve gecikme risklerini görmek; görev atamak ve takip etmek; yalnızca yetkili olduğu kapsamda rapor almak. |
| Proje yöneticisi | Proje hedeflerini, kilometre taşlarını, görevleri, katılımcıları, kararları ve dosyaları tek bağlamda koordine etmek. |
| Süreç / yasal iş sahibi | Kurum görüşleri, e-ÇED ve takvimdeki yasal tarihleri; sorumlu kişiyi, işlem durumunu, dayanak belgeleri ve gecikme riskini izlemek. |
| Belge sorumlusu | Ortak dosya alanlarının yapısını ve erişimini korumak; doğru dosya/kısayolun ilgili proje veya sürece bağlanmasını sağlamak. |
| Sistem yöneticisi | Kullanıcı, rol, erişim, modül ayarı ve entegrasyonları yönetmek; sorunları denetim kayıtlarıyla incelemek. |
| Denetçi / salt okunur kullanıcı (öneri) | Yetkili kapsamda kayıt ve işlem geçmişini değiştirmeden incelemek. Bu rolün gerekliliği teyit edilmelidir. |

## 3. Modüller ve işlev kapsamı

“Temel” günlük kullanım için gerekli işlevleri, “Gelişmiş” ilk sürüm sonrasında veya ihtiyaca göre açılabilecek yetenekleri ifade eder; takvim ve öncelik taahhüdü değildir.

### 3.1 Genel Bakış

- **Temel:** Kişiye atanmış görevler, yaklaşan tarihler, bekleyen onay/işlemler, okunmamış bildirimler ve kullanıcının yetkili olduğu proje/süreç bağlantılarını gösteren kişisel başlangıç ekranı. Kartlar ilgili kayda götürür.
- **Gelişmiş:** Kullanıcının kart sıralamasını seçmesi; rolüne göre ekip/proje görünümü; gecikme ve iş yükü uyarıları. Her gösterge gerçek kayıttan üretilmeli, veri yoksa açıkça “veri yok” denmelidir.

### 3.2 Görevler & Süreç

- **Temel:** Kanban varsayılanı; liste görünümü; görev oluşturma, atama, sorumlu ve takipçi belirleme, açıklama, öncelik, durum, başlangıç/son tarih, yorum, ek/dosya bağlantısı ve etkinlik geçmişi. Görev kişisel, ekip veya projeye bağlı olabilir. Filtreleme, arama ve tamamlananları görme.
- **Gelişmiş:** Özel alanlar ve iş akışları; alt görev, bağımlılık, yinelenen görev, şablon, toplu düzenleme, kaydedilmiş filtreler ve pano bazında yetki. Süreç akışlarının görevden farklı gereksinimi varsa ayrı model olarak ele alınması.
- **Ürün kuralı:** Durum değişikliği, atama ve son tarih güncellemesi geçmişte izlenebilir olmalı. Silme yerine arşivleme/geri yükleme politikası tanımlanmalı.

### 3.3 Projeler

- **Temel:** Proje adı, amaç/açıklama, sahip, üyeler, durum, başlangıç ve hedef tarih, görev panosu, temel dosya bağlantıları ve proje etkinlik akışı.
- **Gelişmiş:** Kilometre taşları, görev bağımlılıkları, zaman çizelgesi, proje şablonları, risk/karar kaydı, proje bazlı özet ve iş yükü görünümü.
- **Ürün kuralı:** Proje görünürlüğü ile projedeki tek tek kayıtların görünürlüğü tutarlı olmalı; proje üyeliği kendiliğinden tüm bağlı dosyalara yetki vermemelidir.

### 3.4 Takvim & Yasal Süreçler

- **Temel:** Kişisel ve paylaşılan takvim; görev tarihleri, toplantılar ve yasal son tarihlerin tek görünümde gösterimi; zaman dilimi ve hatırlatma; kayıt türü ve sorumluya göre filtre.
- **Gelişmiş:** Takvim paylaşımı, dış takvim entegrasyonu, yinelenen etkinlikler, iş günü/tatil takvimi, kritik tarih zinciri ve yasal süre hesaplama kuralı.
- **Ürün kuralı:** Yasal son tarih hesabı kaynağı, başlangıç tarihi, hariç tutulan günler ve değişiklik geçmişiyle açıklanabilir olmalı. Hukuki hesaplama kuralı doğrulanmadan otomatik tarih üretilmemeli.

### 3.5 Sohbet

- **Temel:** Üç panelli arayüz (sohbet/kanal listesi, mesaj akışı, bağlam/üye bilgisi); bire bir ve grup sohbeti; kalıcı mesaj geçmişi, gönderim zamanı, okunma bilgisi, arama, dosya paylaşımı ve bildirim tercihleri.
- **Gelişmiş:** Proje/ekip kanalları, yanıt dizileri, mesaj düzenleme/silme politikası, mesajdan görev oluşturma, sessize alma, sabitleme ve yönetim denetimi.
- **Ürün kuralı:** Gönderim hatası, çevrimdışı durum ve yeniden deneme kullanıcıya görünür olmalı; mesaj kaybolmuş gibi davranmamalı. Saklama, dışa aktarma ve denetim politikası belirlenmeli.

### 3.6 Belgeler / Ortak Drive

- **Temel:** Mevcut şirket dosya sistemindeki klasör ve dosyalara yetkili erişim; uygulama içinde arama/göz atma; proje, görev ve süreçlere dosya veya klasör bağlantısı ekleme; dosya sahibini, yolunu ve erişim durumunu gösterme.
- **Gelişmiş:** Önizleme, etiket/metadata, sürüm bilgisi, gelişmiş arama, kullanım bağlantıları ve erişim talebi akışı.
- **Ürün kuralı:** Önce mevcut depolama ve erişim modeli keşfedilmeli. İçerik kopyalanacaksa gerekçesi ve senkronizasyon/çakışma davranışı ayrıca onaylanmalı. Uygulama, kullanıcının kaynak sistemdeki erişim yetkisini aşmamalı.

### 3.7 Kurum Rehberi

- **Temel:** Kurum arama ve kurum profili; doğrulanmış iletişim noktaları ve ilişkili yazışma/proje/süreç bağlantıları.
- **Gelişmiş:** Kurum türü/etiketleri, kurum hiyerarşisi, yinelenen kayıt denetimi ve yetkili kaynaktan eşitleme.
- **Ürün kuralı:** Handoff kurum ve iletişim bilgilerini tarif ediyor. İç çalışan rehberinin bu modüle dahil olup olmadığı ayrıca kararlaştırılmalı.

### 3.8 Kurum Görüşleri

- **Temel:** Her görüş/kurum yazışması için başlık, kurum, proje veya dosya ilişkisi, giriş tarihi, yasal son tarih, sorumlu, işlem durumu, alınan/gönderilen belgeler ve işlem geçmişi. Son tarihe yaklaşma/gecikme uyarısı.
- **Gelişmiş:** Süre kuralı ve iş günü takvimi, yanıt/inceleme alt adımları, eskalasyon, kurum/konu bazında rapor, şablon ve toplu takip.
- **Ürün kuralı:** Durumlar ve yasal süreyi başlatan olay açıkça tanımlanmalı. Son tarih değişikliği gerekçe ve kullanıcıyla kaydedilmeli.

### 3.9 Dilekçeler

- **Temel:** Yetkili Word şablonundan gerçek `.docx` üretimi; form alanlarının doğrulanması; oluşturma önizlemesi; üretilen belgeyi indirme veya belirlenen şirket dosya konumuna kaydetme; ilgili proje/süreçle ilişki ve sürüm bilgisi.
- **Gelişmiş:** Birden çok onay adımı, şablon sürümleme, alanların güvenilir kaynaktan otomatik doldurulması ve çıktı kayıt defteri.
- **Ürün kuralı:** Şablon sahibi, zorunlu alanlar, biçim, dosya adı ve saklama yeri netleşmeden otomatik doldurma kapsamı varsayılmamalı. Kullanıcı üretilen belgenin taslak olduğunu anlayabilmeli.

### 3.10 e-ÇED Takip

- **Temel:** e-ÇED dosya/proje referansı, mevcut aşama, sorumlu, önemli tarih ve son tarihler, bekleyen eylem, belge bağlantıları, durum geçmişi ve bildirimler.
- **Gelişmiş:** İş akışı şablonları, aşama bazlı kontrol listesi, gecikme riski, raporlama ve mümkünse yetkili kaynakla entegrasyon.
- **Ürün kuralı:** Resmî sistem entegrasyonu veya otomatik veri alma varmış gibi tasarlanmamalı; ilk sürümde manuel kayıt gerekip gerekmediği karara bağlanmalı.

### 3.11 Notlarım

- **Temel:** Kişisel not oluşturma, düzenleme, arama, etiketleme ve arşivleme; nota görev/proje bağlantısı ekleyebilme.
- **Gelişmiş:** Not şablonları, nottan görev oluşturma, seçili notu paylaşma ve güvenli sürüm/geçmiş.
- **Ürün kuralı:** Notlar varsayılan olarak kişisel olmalı. Paylaşım açık ve geri alınabilir bir işlem olmalı.

### 3.12 Bildirimler

- **Temel:** Görev ataması/değişikliği, yorum/mention, yaklaşan tarih ve süreç aksiyonu için uygulama içi bildirim; okunmamış/okunmuş durumu; bildirimin ilgili kayda gitmesi; kullanıcı bazlı tercih.
- **Gelişmiş:** E-posta veya diğer kanallar, sessiz saatler, özet bildirim, önem düzeyi ve bildirim kuralı ayarı.
- **Ürün kuralı:** Aynı olayın yinelenen veya gereksiz bildirimleri azaltılmalı; teslim edilemeyen bildirim ve tercih değişikliği anlaşılır olmalı.

### 3.13 Ayarlar / Sistem Yönetimi

- **Temel:** Açık/koyu tema ve sistem temasını izleme; profil ve bildirim tercihleri; kullanıcı/rol yönetimi; modül ve erişim ayarları; denetim kaydı; temel sistem durumu.
- **Gelişmiş:** SSO/kurumsal kimlik entegrasyonu, birim eşitleme, saklama politikaları, entegrasyon izleme, alan/iş akışı yönetimi ve dışa aktarma politikaları.
- **Ürün kuralı:** Yetki değişiklikleri ve yönetici işlemleri denetlenebilir olmalı. Tema tercihi kullanıcı bazında saklanmalı ve arayüzün tamamına uygulanmalı.

## 4. Modüller arası bağlantılar

- **Kişi ve yetki**, görev, proje, sohbet, belge bağlantısı ve süreçlerin ortak temelidir. Kullanıcı devre dışı kalınca açık işler için yeni sorumlu atama süreci gerekir.
- **Görevler**, kişisel başlangıç ekranında, proje panosunda ve takvimde aynı kayıt olarak görünür. Bir görünümdeki güncelleme diğerlerinde tutarlı olmalıdır.
- **Projeler**, görevleri, sohbet kanallarını, takvim kayıtlarını, dosya bağlantılarını, kurum görüşlerini ve e-ÇED dosyalarını bağlayan çalışma bağlamıdır.
- **Kurum Görüşleri ve e-ÇED**, sorumlu, tarih, durum, belge ve görevlerle ilişkilendirilir; kritik bir tarih ilgili takvimde ve yetkili kişinin görünümünde yer alır.
- **Dilekçe çıktıları**, ilgili kurum görüşü/proje/süreç kaydına ve şirket dosya sistemindeki konumuna bağlanır.
- **Sohbet**, proje veya görev bağlamından başlatılabilir; mesajdan iş oluşturulursa kaynak mesaja geri bağlantı bulunur.
- **Bildirimler**, modüllerdeki olayların ortak dağıtım katmanıdır; erişimi olmayan kaydın hassas içeriğini bildirimde ifşa etmemelidir.
- **Denetim izi**, en azından yetki, durum, sorumlu, son tarih ve belge bağlantısı gibi kritik değişikliklerde ortak davranmalıdır.

## 5. Günlük kullanım senaryoları

### Çalışan

1. Güne Genel Bakış ekranında kendisine atanmış, geciken ve yaklaşan işleri görerek başlar.
2. Görev panosundan işi açar; açıklamayı, bağlı projeyi ve şirket dosya sistemindeki kaynak belgeyi inceler.
3. Görev durumunu günceller, ekip arkadaşından sohbet üzerinden bilgi ister ve gerekiyorsa mesajı göreve bağlar.
4. Takvimde toplantı ve yasal tarihleri görür; sistemin gösterdiği son tarihin kaynağını gerektiğinde inceleyebilir.
5. Kendi notunu ilgili işe bağlar; notu paylaşmadığı sürece kişisel kalır.
6. Dilekçe gerekiyorsa yetkili şablondan Word belgesi üretir ve ilgili kayda bağlar.

### Yönetici / ekip sorumlusu

1. Yetkili olduğu ekip veya projelerde açık işleri, gecikmeleri ve sorumluları inceler.
2. İş yükü dengesizliğini fark edince görevleri yeniden atar veya önceliği netleştirir.
3. Kurum Görüşleri ve e-ÇED takip ekranında yaklaşan yasal tarihleri ve işlem bekleyen dosyaları kontrol eder.
4. Kritik risk için görev ve sorumlu belirler; ekip kanalında bağlamı paylaşır.
5. Dönem sonunda gerçek kayıtlar üzerinden durum özeti alır; veri eksikliği ve kapsamı raporda görünür.

## 6. Kullanıcı deneyiminde ek gereksinimler

- **İlk kullanım:** Kullanıcı boş ekranla karşılaşmamalı; gerçek verisi yoksa hangi adımın eksik olduğunu açıklayan yönlendirme görmeli. Örnek/sahte kayıt eklenmemeli.
- **Arama:** Kişi, görev, proje, süreç ve erişilebilir dosyalar için ortak arama; sonuçlar kullanıcının yetkisine göre daraltılmalı.
- **Kişisel çalışma alanı:** “Bana atanan”, “oluşturduklarım”, “takip ettiklerim” ayrımı ve görevleri hızlı yakalama/ekleme akışı olmalı.
- **İş yükü ve odak:** Bildirim kontrolü, sessiz zaman ve aciliyet ayrımı; aynı işi farklı modüllerde tekrar tekrar kaydetme ihtiyacını azaltmalı.
- **Erişilebilirlik ve cihazlar:** Klavye kullanımı, ekran okuyucuya uygun etiketler, yeterli kontrast, dar ekranlarda taşmayan arayüz ve Türkçe tarih/numara biçimleri ele alınmalı.
- **Güven ve geri alma:** Otomatik kaydetme durumu, işlem başarısı/hatası, arşivden geri alma ve kritik değişiklik geçmişi kullanıcıya görünmeli.
- **Kullanıcı yaşam döngüsü:** Yeni çalışan, rol/birim değişikliği ve işten ayrılma durumlarında erişimler ile sahipsiz görevler için süreç tanımlanmalı.
- **Bildirim yorgunluğu:** Varsayılanlar ölçülü olmalı; kullanıcı bildirim kanalını ve sıklığını anlayıp değiştirebilmeli.
- **Veri kalitesi:** Sahipsiz, süresiz veya çelişen kayıtlar raporlanmalı; yönetim ekranları sahte/hesaplanmamış metrik göstermemeli.

## 7. Tamamlanma kabul kriterleri

Aşağıdaki modül kriterlerine ek olarak her modülde ortak koşullar aranır: yetki kontrolü, boş/yükleniyor/hata durumları, arama veya ilgili kayda erişim yolu, klavye ile kullanılabilir ana akış, kaydedilen değişikliğin kalıcı olduğuna dair geri bildirim ve gerçek veriden türetilen içerik.

| Modül | Kabul kriterleri |
|---|---|
| Genel Bakış | Kullanıcı yalnızca yetkili olduğu ve kendisiyle ilgili kayıtları görür; kartlar doğru kayda açılır; yaklaşan/geciken ayrımı tanımlı kurala uyar; veri yokken sahte sayaç gösterilmez. |
| Görevler & Süreç | Kanban ve liste aynı görevi yansıtır; oluşturma, atama, durum, öncelik, tarih, yorum ve dosya bağlantısı kaydedilip yeniden açıldığında korunur; filtre/arama beklenen kayıtları bulur; değişiklik geçmişi kritik alanları gösterir. |
| Projeler | Yetkili kullanıcı proje oluşturup üyeleri ve tarihleri yönetebilir; proje görevleri ve bağlantılı kayıtlar doğru bağlamda görünür; üyelik/erişim kuralları doğrulanır; arşivlenmiş proje durumu kaybolmaz. |
| Takvim & Yasal Süreçler | Yetkili etkinlikler ve tarihler doğru saat/tarih ile görünür; kayıt türü ve sorumlu filtreleri çalışır; hatırlatma tercih edildiği şekilde yapılır; yasal tarih hesabı kaynağı ve değişikliği açıklanabilir. |
| Sohbet | Bire bir ve grup mesajı kalıcı kaydolur; gönderim/başarısızlık durumu görünür; geçmiş açılıp arandığında sonuç verir; üç panel farklı ekran boyutlarında kullanılabilir; mesaj erişimi üyelik kuralına uyar. |
| Belgeler / Ortak Drive | Kullanıcı kaynak sistemde erişebildiği dosyaya gidebilir; uygulama ek erişim sağlamaz; dosya/klasör bağlantısı ilgili kayda doğru bağlanır; taşınan/silinen veya erişimi kaldırılan dosyanın durumu anlaşılır biçimde ele alınır. |
| Kurum Rehberi | Kurum araması doğrulanmış kurum ve iletişim bilgileri döndürür; kurum kayıtları ilgili yazışma/proje/süreçlerle ilişkilidir; güncel olmayan kayıtlar anlaşılır yönetilir. |
| Kurum Görüşleri | Her kayıt sorumlu, durum, tarih ve dayanak belgelerle izlenebilir; yaklaşan/geciken uyarısı doğru çalışır; süreyi başlatan olay ve tarih değişiklik gerekçesi geçmişte görünür; tamamlanan kayıtlar arşivden bulunabilir. |
| Dilekçeler | Yetkili şablondan açılabilen `.docx` üretilir; zorunlu alan eksikse üretim durdurulur ve alan belirtilir; çıktı önizlenir/indirilebilir veya hedefe kaydedilir; şablon ve çıktı sürümü izlenebilir. |
| e-ÇED Takip | Her dosyanın aşaması, sorumlusu, tarihleri, bekleyen işi ve geçmişi bulunur; bağlı belgeler açılabilir; aşama değişikliği kaydedilir; otomatik entegrasyon yoksa manuel veri kaynağı kullanıcıya açıkça gösterilir. |
| Notlarım | Kişisel not oluşturma/düzenleme/arama/arşivleme çalışır; varsayılan görünürlük kişiseldir; paylaşım açık rıza ile açılır ve geri alınır; bağlantılı görev/proje açılabilir. |
| Bildirimler | Desteklenen olay doğru yetkili alıcıya gider; ilgili kayda açılır; okundu durumu ve tercihler saklanır; erişilemeyen kayıt ayrıntısı sızmaz; tekrar ve hata davranışı tanımlıdır. |
| Ayarlar / Sistem Yönetimi | Açık/koyu/sistem teması tüm ekranlarda uygulanır ve korunur; rol değişiklikleri erişimi doğru etkiler; kritik yönetici işlemleri denetim kaydına geçer; kullanıcı ve modül ayarları yetkisiz kullanıcıya kapalıdır. |

## 8. Riskler ve karara bağlanmamış konular

### Yüksek etkili ürün kararları

1. **Kimlik ve yetki kaynağı:** Kullanıcılar nereden gelir? SSO/kurumsal dizin var mı? Rol ve birimlerin sahibi kimdir?
2. **Mevcut dosya altyapısı:** Hangi depolama sistemi ve klasör kuralları kullanılıyor? Uygulama bağlantı mı gösterecek, yoksa sınırlı bir entegrasyon mu kuracak? Dosya yetkisi nasıl doğrulanacak?
3. **Yasal süre kuralları:** Kurum Görüşleri ve e-ÇED için süre başlangıcı, hafta sonu/resmî tatil hesabı, uzatma ve sorumlu onayı nedir? Kurallar hukuki/süreç sahibi tarafından doğrulanmalı.
4. **Sohbet beklentisi:** Kurum içi mevcut mesajlaşma aracı var mı? Yeni mesajlaşma saklama süresi, dışa aktarma, denetim, arama ve ek boyutu ihtiyaçları nedir?
5. **Dilekçe şablonu ve kayıt yeri:** Onaylı Word şablonları, zorunlu alanlar, imza/onay, dosya adlandırma ve çıktı saklama yeri nedir?
6. **Kurum Görüşleri anlamı:** Modül dış kurumlardan alınan/verilen resmî görüş/yazıları mı kapsıyor, yoksa kurum içi görüş/onay akışı da var mı?
7. **e-ÇED veri girişi:** Resmî sistem entegrasyonu mümkün ve isteniyor mu; yoksa sorumlu kullanıcılar takip verisini elle mi girecek?

### Diğer riskler ve açık kararlar

- **İlk sürüm sınırı:** 13 modülün tümü ilk yayında mı olmalı? Önerilen sıralama: kişisel görev/Genel Bakış/Bildirimler; Projeler/Takvim; sonra belge ve uzman süreç modülleri. Sohbet altyapısı ayrı teknik keşif gerektirir.
- **İş akışı esnekliği:** Süreçler yönetici tarafından yapılandırılabilir mi, yoksa başlangıçta sabit akışlar mı yeterli?
- **Görünürlük ve gizlilik:** Yönetici çalışan notlarını, özel sohbetleri ve bireysel iş yükü ayrıntısını hangi şartlarda görebilir? Varsayılan gizlilik sınırı belirlenmeli.
- **Saklama ve denetim:** Mesaj, görev, belge bağlantısı, kişisel veri ve arşiv için saklama/silme süreleri ile denetim erişimi tanımlanmalı.
- **Raporlama:** Yönetici metriklerinin tanımları, dönemleri ve kapsamı net olmalı; yalnızca güvenilir veriden hesaplanmalı.
- **İş takvimi:** Türkiye resmî tatilleri, kurum içi çalışma günleri ve farklı saat dilimlerinde çalışanların gereksinimleri doğrulanmalı.
- **Entegrasyon ve kesinti:** Dosya sistemi, kimlik sağlayıcı veya mesaj altyapısı kullanılamadığında kullanıcıya ne gösterileceği ve kayıtların nasıl eşitleneceği belirlenmeli.
- **Dil ve mobil kullanım:** Türkçe ilk dil varsayılmıştır; ek diller, mobil uygulama veya mobil web gereksinimi teyit edilmelidir.

## 9. Varsayımlar ve doğrulama notu

- EnÇev içi kullanım ve Türkçe arayüz, talep bağlamına dayalı çalışma varsayımıdır; ayrıca teyit edilmelidir.
- Roller örnek organizasyon görevleridir, EnÇev'in gerçek unvan/organizasyon şeması oldukları iddia edilmemektedir.
- “Kurum Görüşleri” ve e-ÇED takibi operasyonel kayıt takibi olarak ele alınmıştır; dış sistemlerle entegrasyon varsayılmamıştır.
- Belgeler için mevcut dosya sistemi sistem kaynağı kabul edilmiştir; hangi ürün/altyapı olduğu bilinmemektedir.
- Görev durumları, süreç adımları, yasal süre formülleri, yetki detayları, saklama politikaları ve Word şablonları bu çalışmada verilmemiştir; uydurulmamış, karar konularına taşınmıştır.
- Açık/koyu tema ve üç panelli gerçek sohbet, verilen zorunlu ürün kararları olarak kabul edilmiştir.

Bu doküman, keşif ve önceliklendirme için ürün çerçevesidir. İlk sürüm kapsamını kesinleştirmek için öncelikle kimlik/yetki kaynağı, dosya altyapısı, yasal süre kuralları ve Dilekçeler/Kurum Görüşleri süreç sahipleri doğrulanmalıdır.
