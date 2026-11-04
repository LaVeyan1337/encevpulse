# ENCEV PULSE — ÇED Süreç Takibi

**Durum:** Proje detayına gömülü ÇED süreç takibi. Resmî e-ÇED entegrasyonu veya dosya depolama entegrasyonu değildir. ÇED yetkisi olan kullanıcı proje detayını açtığında varsayılan sekme ÇED Süreci'dir.

## Ana belge kilometre taşları

Süreç akışında aşağıdaki beş ana etiket sırası ve yazımıyla korunur:

1. ÇBD YÜKLENDİ
2. PTD YÜKLENDİ
3. ÇED RAPORU YÜKLENDİ
4. NİHAİ RAPOR YÜKLENDİ
5. SON NİHAİ RAPOR YÜKLENDİ

Kilometre taşları, aradaki hazırlık, başvuru incelemesi, eksik tamamlama, halkın bilgilendirilmesi, komisyon/kapsam çalışmaları, kurum görüşleri, rapor hazırlığı, İDK incelemesi, revizyon, son kontrol ve karar/kapanış adımlarıyla tamamlanır. Ara adımlar eklenebilir, adlandırılabilir, sıralanabilir ve hedef tarih alabilir.

## Başvuru yolu

ÇBD ve PTD her projede peş peşe zorunlu iki belge olarak kabul edilmez. Yeni kayıt açılırken yol seçilir:

Yeni süreçlerde yalnızca iki başlangıç yolu seçilebilir:

- **Ek-1 / ÇBD:** ÇBD hazırlığı ve ÇBD yükleme basamağı aktiftir; PTD basamakları uygulanmıyor olarak işaretlenir. ÇBD akışından sonra tam ÇED aşamaları başlar.
- **Ek-2 / PTD:** PTD hazırlığı, PTD yüklemesi ve PTD değerlendirme/karar bildirimi aktiftir; ÇBD basamakları uygulanmıyor olarak işaretlenir. PTD sonucu **ÇED Raporu Hazırlanmalıdır** olduğunda sonraki ÇED aşamaları açılır. Sonuç **ÇED Olumlu** olduğunda PTD değerlendirmesi tamamlanır ve süreç kapanır.

Yeni kayıtlarda karma/özel rota seçeneği sunulmaz. Eski kayıtların karma/özel rota değerleri veri kaybı oluşturmamak için okunabilir bırakılmıştır; yeni süreç oluşturma API'si bunları kabul etmez. Rota seçimi yetkili süreç sorumlusunun kararıdır; uygulama resmî mevzuat kapsam tespiti yapmaz.

## Belge kayıtları ve depolama

Belge kaydı başlık, tür, sürüm/revizyon, belge tarihi, açıklama ve kaynak referansını tutar. Kaynak türleri şirket ağ yolu (UNC), dış bağlantı, e-ÇED referansı veya diğer kaynaktır.

**Dosya içeriği bu modüle yüklenmez, NAS'a kopyalanmaz ve e-ÇED'e gönderilmez.** Şu an yalnızca kullanıcının girdiği kaynak yolu/referansı ve metaveri saklanır. Mevcut dosya sunucusu erişim/yol yetkileri ayrıca uygulanır; SMB internet erişimine açılmaz.

Ana belge kilometre taşının tamamlanması için ilişkili belge referansının kaydı gerekir. Bir belge referansı kaydedildiğinde bağlı kilometre taşı tamamlanır. Aynı belge türünün yeni revizyonu ayrı kayıt olarak tutulabilir; eski kayıt fiziksel olarak silinmez.

## Kurum görüşleri

Kurum görüşleri ÇED dosyasına değil, doğrudan projeye bağlanır; bu nedenle ÇED süreci açılmadan önce de eklenebilir. `ced_institution_opinions.project_id` ana ilişkidir, `case_id` ise eski dosya bağlantıları için isteğe bağlı kalır. Görüş eklemek sahte/boş bir ÇED dosyası oluşturmaz ve proje için gerçek ÇED süreci sonradan açıldığında görüş kayıtları aynı projede görünmeye devam eder. Eski sürümde yalnız kurum görüşleri için oluşturulmuş geçici dosyalar silinmez; gerçek süreç oluşturulurken aynı kayıt kimliği korunarak sürece dönüştürülür.

Kurum adı, konu, talep/yanıt/son tarih, giden-gelen yazı numarası, iletişim kişisi ve notlar saklanır. Kalan gün/takvim rengi yalnızca girilen tarih üzerinden hesaplanır. Sistem mevzuata dayalı süre başlatma olayı, iş günü, resmî tatil, durma/uzama veya cevap süresini otomatik hesaplamaz.

institution_opinions.view/create/update izinleri eced izinlerinden ayrıdır. Kurum görüşü içeriği, görüş belgeleri ve ilgili denetim olayları bu ayrı izin olmadan API yanıtlarında gösterilmez.

## e-ÇED tarayıcı gözlemi

Genel Bakış, eşleştirilmiş tarayıcı profillerinden gelen hesap gözlem sinyallerini küçük bir özet halinde gösterir. Ekrandaki “etkin sinyal” veya “oturum kapalı işaretli” metinleri resmî e-ÇED kimlik doğrulaması değildir; eklentinin izin verilen portal sekmesinde gördüğü görünür hesap etiketi ve son gözlem raporudur. Durum belirsiz/eski olduğunda hesap oturum kapalı kabul edilmez. Eklenti eşleştirmeleri e-ÇED takip ekranının en altındadır. Eklenti yalnız açıkça izin verilmiş portal sekmesinde çalışır ve parola, çerez, form alanı, localStorage/sessionStorage veya sayfa HTML içeriği okumaz.

## İDK / toplantılar ve takvim

Toplantı türü, başlangıç/bitiş zamanı, yer, durum, gündem ve sonuç/karar notları saklanır. ÇED aşamalarının hedef tarihleri, açık kurum görüşlerinin son tarihleri ve planlanmış/ertelenmiş İDK toplantıları takvim kilometre taşlarına yansıtılır. Saatli toplantılar Europe/Istanbul saat diliminde gösterilir.

Takvim gösterimi kullanıcıya açık proje üyeliği/sahipliği ve ilgili modül görüntüleme iznine göre filtrelenir. Takvim kayıtları kaynak ÇED/görüş/toplantı kayıtlarının kopyası değildir.

## Denetim ve eşzamanlı düzenleme

Dosya, aşama, belge, kurum görüşü ve toplantı değişiklikleri append-only ced_audit_events tablosuna yazılır. Dosya/aşama/görüş/toplantı güncellemeleri version alanıyla iyimser eşzamanlılık denetimi yapar; eski sürüm 409 döndürür. Proje arşivlenmişse ÇED kayıtları değiştirilemez.

## Yetki sınırları

eced modülü proje kapsamlı ÇED kaydını, aşamaları, belge referanslarını ve İDK kayıtlarını yönetir. Kurum görüşü kayıtları ayrıca institution_opinions izni ister. Her API işleminde modül iznine ek olarak proje sahibi/oluşturan/aktif üye kapsamı doğrulanır. Yalnızca menü gizlemek güvenlik kontrolü sayılmaz.

Migration 0012 başlangıçta process_owner rolüne ilgili modüllerde görüntüleme/oluşturma/düzenleme, project_manager rolüne görüntüleme izni verir. Bunlar ürün varsayımlarıdır; kurumun gerçek rol/iş dağılımı onayı yerine geçmez.

## Açık kapsam dışı işler

- e-ÇED sisteminden otomatik veri çekme veya resmî gönderim
- Dosyaların PULSE'a yüklenmesi, NAS'a kopyalanması veya sunucuda önizlenmesi
- Doğrulanmış mevzuat/iş günü/resmî tatil temelli yasal süre motoru
- Otomatik bildirim zamanlayıcısı, eskalasyon ve hatırlatma teslimatı
- Bir projeye birden fazla bağımsız ÇED başvuru dosyası bağlanması (ilk sürümde proje başına tek aktif kayıt)
- İDK katılımcı davetleri ve kurum rehberiyle otomatik eşleştirme

## Resmî kaynaklar

- [ÇED, İzin ve Denetim Genel Müdürlüğü — ÇED Uygulamaları](https://ced.csb.gov.tr/ced-uygulamalari-i-85396)
- [Çevresel Etki Değerlendirmesi Yönetmeliğinde değişiklik yapılmasına dair düzenleme — 5 Mart 2026](https://www.lexpera.com.tr/resmi-gazete/metin/cevresel-etki-degerlendirmesi-yonetmeliginde-degisiklik-yapilmasina-dair-yonetmelik-33187/1)

Bu kaynaklar uygulamaya bağlanmış mevzuat motoru anlamına gelmez. Proje kapsamı ve hangi başvuru yolunun uygulanacağı uzman/süreç sahibi tarafından doğrulanır.
