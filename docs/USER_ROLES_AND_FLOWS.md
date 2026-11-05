# ENCEV PULSE — Kullanıcı Rolleri ve İş Akışları

**Belge durumu:** İlk rol ve süreç taslağı; gerçek organizasyon yapısı doğrulanmalıdır.

## Rol modeli

Rol adları işlevsel örneklerdir; EnÇev'in resmî unvan veya organizasyon şeması oldukları varsayılmamıştır. Bir kullanıcı birden fazla sorumluluğa sahip olabilir. Erişim, yalnızca rol adına değil kayıt/proje kapsamına ve gerektiğinde hassasiyet düzeyine de bağlı olmalıdır.

| Rol | İhtiyaç ve yetki sınırı |
|---|---|
| Çalışan | Kendi görevlerini yönetir, üyesi olduğu ekip/proje bağlamına erişir, kişisel notlarını görür ve paylaşımı kendisi başlatır. |
| Ekip sorumlusu | Yetkili ekibin görevlerini dağıtır, durum ve gecikmeleri takip eder; kişisel notları ve özel sohbetleri varsayılan olarak görmez. |
| Proje yöneticisi | Yetkili projenin üyelerini, görevlerini, tarihlerini, karar ve risklerini koordine eder. Proje üyeliği bağlı tüm dosyalara otomatik erişim sağlamaz. |
| Süreç sahibi | Atandığı Kurum Görüşleri/e-ÇED kayıtlarının sorumlusu ve tarihlerini yönetir; değişiklikler gerekçe ve geçmişle izlenir. |
| Belge sorumlusu | Ortak dosya alanı yapısı, bağlantılar ve ilgili erişim kurallarının doğru işlemesine destek verir. Kaynak dosya sisteminin yetkilerini aşamaz. |
| Sistem yöneticisi | Şirket çalışanı kullanıcı hesaplarını, ekipleri, rolleri, izinleri ve sistem entegrasyonlarını yönetir; kritik işlemleri denetim izine tabidir. İş içeriğine erişimi ayrıca sınırlandırılmalıdır. |
| Denetçi / salt okunur (öneri) | Belirlenmiş kayıtları değiştirmeden inceler. Bu rolün gereksinimi ve kapsamı karara bağlanmalıdır. |

## Modül bazlı izin uygulaması

Uygulamada rol izinleri modül ve eylem düzeyinde PostgreSQL'de tutulur. Geçerli başlangıç rolleri işlevsel taslaktır; resmî organizasyon kararı değildir.

- İzin anahtarı: view, create, update, delete veya manage. manage ilgili modülde tüm eylemleri kapsar ve tek başına atanır.
- Bir kullanıcının birden fazla rolü varsa izinler birleşir (OR). Bir rolden izin kaldırılması, başka bir rolden gelen yetkiyi iptal etmez.
- Modül kapalıysa rol izni bulunsa da erişim reddedilir. Ortak Drive, bağımsız Kurum Rehberi ve Dilekçeler; kaynak dosya yetkisi, bağımsız kurum CRUD akışı ve gerçek alan doldurmalı Word üretimi tamamlanmadığı için kapalıdır. Kurum iletişim listesi, Kurum Görüşleri içindeki proje kapsamlı görünümde kullanılabilir. Takvim, Kurum Görüşleri, e-ÇED eklenti izleme ve Notlarım mevcut gerçek akışlarıyla etkinleştirilmiştir; otomatik yasal süre ve portal doğrulaması gibi eksik işlevler ayrıca tamamlanmış sayılmaz. Başlangıç izinleri süreç sahiplerince onaylanmalıdır.
- system_admin rolünün Kullanıcılar, Rol/Modül İzinleri ve Sistem Ayarları yönetimi emniyet yetkisi kaldırılamaz. Bu rol iş verilerindeki tüm kayıtları otomatik görmez.
- Modül yetkisi kayıt sahipliğinin yerine geçmez: görevler atama/oluşturan/proje üyeliği; projeler sahip/üye; sohbetler aktif konuşma üyeliğiyle ayrıca sınırlandırılır.
- Çalışan hesabı oluşturma ekranı varsayılan employee seçer. Başka rol ilk kez seçildiğinde employee otomatik eklenmez; yönetici isterse ayrıca seçebilir. API roleCodes alanını hiç göndermezse eski entegrasyon uyumluluğu için employee varsayılanı uygulanır; açıkça boş rol listesi reddedilir.

| Rol | Uygulanan başlangıç amacı |
|---|---|
| employee | Kendi görev iş akışı, proje görüntüleme, rehber ve sohbet |
| team_lead | Ekip görevleri ve proje takibi |
| project_manager | Proje ve görev koordinasyonu |
| process_owner | Yasal süreç modülleri açıldığında ilgili kayıtları yönetme |
| document_steward | Belge/rehber modülleri açıldığında belge iş akışları |
| auditor | Etkinleştirilmiş kayıt kapsamlarında salt okunur inceleme |
| system_admin | Hesap/rol/izin yönetimi; operasyon kayıtlarına yalnızca ayrı kayıt kapsamı içinde erişim |

Bu başlangıç izinleri süreç sahiplerince doğrulanması gereken ürün varsayımlarıdır; resmî görev tanımı veya hukuki erişim kararı değildir.
## Temel nesneler ve yaşam döngüleri

- **Görev:** Taslak/aktif → devam ediyor → bekliyor (kurumca tanımlanırsa) → tamamlandı veya iptal/arşiv. Durum sözlüğü henüz kararlaştırılmamıştır. Atama, tarih ve durum geçmişi tutulur.
- **Proje:** Hazırlık → aktif → beklemede (gerekiyorsa) → tamamlandı/arşiv. Proje durumu görevlerin durumundan ayrı yönetilir.
- **Kurum Görüşü:** Kayıt açıldı → sorumlu/inceleme → yanıt veya işlem bekliyor → tamamlandı/arşiv. Gerçek adımlar süreç sahibi tarafından doğrulanmalıdır.
- **e-ÇED kaydı:** Dosya oluşturuldu → tanımlı aşamalar arasında ilerleme → kapanış. Aşama adları ve zorunlu belgeler resmî/kurumsal işleyişten alınmalıdır.
- **Dilekçe:** Veri girişi → doğrulama → Word taslağı üretimi → kullanıcı incelemesi → gerekiyorsa onay ve kayıt. Otomatik resmî gönderim varsayılmaz.
- **Belge bağlantısı:** Kaynakta erişilebilir → kaynakta taşınmış/yeniden adlandırılmış → erişim kaldırılmış veya silinmiş. Uygulama bağlantı durumunu anlaşılır göstermelidir.
- **Sohbet mesajı:** Gönderildi → yanıt/reaksiyon/okunma bilgileri eklenebilir → izin verilen süre/rol içinde düzenlenebilir veya silinebilir. Değişiklik ve silme politikası kurumsal saklama kuralına tabidir.

## Günlük çalışan akışı

1. Kullanıcı oturum açar; Genel Bakış'ta kendisine atanmış, oluşturduğu veya takip ettiği işleri; yaklaşan tarihleri ve okunmamış bildirimleri Türkiye/İstanbul saat dilimine göre görür.
2. Bir görevi açınca amaç, sorumlu, son tarih, durum, proje/süreç, ilgili yorumlar ve erişebildiği belgeler aynı bağlamda yer alır.
3. Çalışan görevi Kanban'da ilerletir veya liste görünümünde arar/filtreler. Her iki görünüm aynı kaydı günceller.
4. Bilgi bekliyorsa göreve/projeye bağlı sohbetten iletişim kurar; mesajın gönderilip gönderilmediği açıkça görünür. Sohbette dosya paylaşır, arama yapar, mesaja yanıt verir veya reaksiyon ekler; kendi yetkisine göre mesajını düzenler/siler. Gerektiğinde mesajdan kaynak mesaja bağlı görev oluşturur.
5. Takviminden yaklaşan toplantıları ve süreç tarihlerini kontrol eder. Yasal tarih için başlangıç kaynağına ve değişiklik geçmişine ulaşabilir.
6. Gerekli belgeyi mevcut şirket dosya sisteminden açar; dosyayı uygulamaya kopyalamadan göreve/sürece iliştirir.
7. Kendi notlarını özel alanda tutar; paylaşım gerekiyorsa seçili not için açık paylaşım yapar.
8. Dilekçe ihtiyacında yetkili şablonu seçer, gerekli alanları doldurur, Word çıktısını inceler ve tanımlı konuma kaydeder.
9. İş tamamlandığında durumu günceller. İşlem geçmişi ve bağlı kayıtlar daha sonra bulunabilir.

## Yönetici / ekip sorumlusu akışı

1. Yönetici kendi yetki alanındaki ekip/proje özetini açar; açık işler, gecikme riski, sorumlu ve yaklaşan tarihler gerçek kayıtlardan gelir.
2. Gecikmiş veya sahipsiz işi açar, bağlamı inceler ve sorumlu/tarih/öncelik değiştirir. Kritik değişiklik gerekçesi veya geçmiş kaydı korunur.
3. İş yükünü değerlendirirken yalnızca gerekli iş metriklerine erişir. Bireysel özel not ve sohbet içeriği yönetici görünümüne otomatik taşınmaz.
4. Kurum Görüşleri/e-ÇED ekranında süre yaklaşan, yanıt bekleyen veya sorumlusu olmayan kayıtları inceler ve takip görevi açar.
5. Ekipte önemli karar veya risk için ilgili sohbet/proje kaydına bağlantı verir; kararın yalnızca sohbet geçmişinde kaybolmasını önler.
6. Dönemsel raporda filtre, tarih aralığı ve veri kapsamı görünür. Veri eksikse rapor bunu saklamaz.

## Süreç sahibi akışı: Kurum Görüşleri

1. Yeni yazı/görüş kaydı oluşturulur; kurum, konu, proje/dosya, giriş veya gönderim tarihi ve dayanak belge eklenir.
2. Süreyi başlatan olay ve bu süreç türüne ait yapılandırılmış kural belirlenir. Kural takvim/iş günü, resmî tatil, başlangıç/bitiş ve Europe/Istanbul davranışını tanımlar. Sistem yalnızca yetkili süreç sahibince onaylanmış kuralı çalıştırır; aksi durumda son tarihi doğrulanmış gibi sunmaz.
3. Sorumlu atanır; gerekli alt işler görev olarak açılır ve ilgili takvimde gösterilir.
4. Belge/yanıt geldikçe kayıt durumu ve ekleri güncellenir. Her değişiklik aktör ve zaman bilgisiyle izlenir.
5. Son tarih yaklaşınca yetkili sorumluya bildirim gider. Gecikme, uzatma veya tarih düzeltmesi gerekçesiyle kaydedilir.
6. İşlem kapatılır; kayıt ve belgeler arşivlenebilir ve aranabilir kalır. Kural güncellense bile önceki hesaplamanın hangi kural sürümüyle yapıldığı korunur.

## Süreç sahibi akışı: e-ÇED

1. Proje/dosya referansı ve sorumlusu kaydedilir; başlangıç aşaması ve mevcut kaynak bilgisi belirtilir.
2. Her aşama değişiminde tarih, yapan kişi, bekleyen iş ve dayanak belge eklenir.
3. Önemli tarihler takvime yansır; gerekli kontrol listesi ve görevler sorumlulara bağlanır.
4. Değişiklik/geri dönüş olduğunda eski aşama geçmişte kalır; sadece güncel durumu ezerek kaybetmek kabul edilmez.
5. Dosya tamamlanınca kapanış durumu ve nihai belgeler iliştirilir.

Bu akış mevcut e-ÇED sisteminden otomatik veri alınacağını varsaymaz. Manuel takip veya entegrasyon kararı [OPEN_DECISIONS.md](OPEN_DECISIONS.md) içinde beklemektedir.

## Kurum Rehberi akışı

1. Çalışan dış kurum/kuruluş ve iletişim kişisini arar. İç çalışan hesapları bu rehberde değil, kullanıcı ve ekip yönetimindedir.
2. Kurum veya iletişim kaydı bulunmuyorsa yetkili süreç sahibi/belge sorumlusu yeni kayıt açar; kurum adı ve kayıt kaynağı zorunludur.
3. Kaynak etiketi, URL/yazı referansı ve varsa teyit tarihi kullanıcı tarafından girilir. Sistem dış kurum sistemine bağlanıp doğrulama yapmaz; kullanıcı beyanı ile otomatik doğrulama birbirinden ayrıdır.
4. Yetkili kullanıcı kayıt bilgilerini günceller veya arşivler. Sürüm çakışması eski verinin üzerine yazmayı engeller; oluşturma, güncelleme ve arşivleme aktör/zaman bilgisiyle denetim kaydına eklenir.
5. Proje Kurum Görüşü kayıtlarından gelen iletişim bilgileri ortak rehbere kendiliğinden açılmaz. Bir kaydın ortak rehberde görünmesi için ayrıca yetkili kullanıcı tarafından eklenmesi gerekir.

Kurum Rehberi dış kurum ve iletişim bilgilerini kapsar. Çalışan hesapları ve ekipleri kullanıcı yönetiminde yer alır. İlk rol izinleri: çalışan görüntüler; süreç sahibi ve belge sorumlusu ekler, düzenler ve arşivler. Resmî kaynak eşitlemesi sonraki karar/onay gerektirir.

## Dilekçe oluşturma akışı

1. Kullanıcı yetkili şablonu ve ilgili süreç/projeyi seçer.
2. Sistem gerekli alanları ve veri kaynağını açıklar; eksik/çelişen bilgiler düzeltilmeden çıktı üretmez.
3. Gerçek `.docx` dosyası oluşturulur; şablon biçimi korunur ve çıktı kullanıcıya önizleme/indirme veya tanımlı depoya kaydetme imkânı verir.
4. Kullanıcı belgeyi inceler. Taslak ile onaylanmış/nihai belge ayrımı görünür olur.
5. Belge sürümü, oluşturan kişi, tarih ve ilişkili kayıt izlenebilir.

## Hata ve istisna akışları

- **Sorumlu ayrıldı/etkisiz:** İşler sahipsiz bırakılmaz; yetkili yöneticiye yeniden atama listesi sunulur.
- **Dosya erişilemiyor:** Kullanıcıya dosyanın yolu/bağlantısının çalışmadığı veya kaynak izninin olmadığı söylenir; içerik kopyası uydurulmaz. Erişim backend/API üzerinden yapılır; SMB/ağ paylaşımı internete açılmaz ve kaynak dosya izni korunur.
- **Sohbet gönderilemedi:** Mesaj gönderilmiş gibi gösterilmez; yeniden deneme ve hata nedeni sağlanır.
- **Yasal süre belirsiz:** Sistem sessizce tarih hesaplamaz; kuralın/sorumlunun doğrulaması istenir ve belirsizlik görünür tutulur.
- **Bildirim izni yok veya kanal kapalı:** Uygulama içi kayıt erişilebilir kalır; başarısız dış bildirim sessizce başarılı sayılmaz.
- **Yetki kaldırıldı:** Eski bağlantı ve arama sonucu hassas içeriği göstermez; yetki değişikliği denetlenebilir.

## Bildirim ilkeleri

Bildirim olayları atama, mention, yorum, tarih yaklaşması, yasal süreç aksiyonu ve kritik durum değişikliğiyle sınırlandırılmalıdır. Kullanıcı okunma/sessize alma/kanal tercihini yönetebilir. Aynı olayın yinelenmesi önlenmeli; bildirimde kullanıcı yetkisi olmayan kayıt içeriği yer almamalıdır.

## Açık doğrulama noktaları

Resmî roller, birim hiyerarşisi, kayıt görünürlük sınırları, görev ve süreç durumları, yasal süre hesabı, yönetici rapor kapsamı, işten ayrılma akışı, sohbet saklama/moderasyon kuralları ve onay adımları süreç sahipleriyle kesinleştirilmelidir. Açık konuların listesi [OPEN_DECISIONS.md](OPEN_DECISIONS.md) içindedir.
