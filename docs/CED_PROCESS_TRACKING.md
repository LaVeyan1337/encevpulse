# ENCEV PULSE — ÇED Süreç Takibi

**Durum:** Proje kapsamlı ilk süreç takip temeli. Resmî e-ÇED entegrasyonu veya dosya depolama entegrasyonu değildir.

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

- **Ek-1 / ÇBD:** ÇBD hazırlığı ve ÇBD yükleme basamağı aktiftir; PTD basamakları uygulanmıyor olarak işaretlenir.
- **Ek-2 / PTD:** PTD hazırlığı, PTD yüklemesi ve PTD değerlendirme/karar bildirimi aktiftir; ÇBD basamakları uygulanmıyor olarak işaretlenir.
- **Karma takip:** İki belge kolu da açık tutulur.
- **Özel / henüz netleşmedi:** Her iki kol aktif kalır ve proje sorumlusu akışı düzenler.

Bu seçim operasyonel bir takip şablonudur; projenin mevzuat kapsamı, başvuru yolu veya zorunlu belge dizisini sistem kendiliğinden belirlemez.

## Belge kayıtları ve depolama

Belge kaydı başlık, tür, sürüm/revizyon, belge tarihi, açıklama ve kaynak referansını tutar. Kaynak türleri şirket ağ yolu (UNC), dış bağlantı, e-ÇED referansı veya diğer kaynaktır.

**Dosya içeriği bu modüle yüklenmez, NAS'a kopyalanmaz ve e-ÇED'e gönderilmez.** Şu an yalnızca kullanıcının girdiği kaynak yolu/referansı ve metaveri saklanır. Mevcut dosya sunucusu erişim/yol yetkileri ayrıca uygulanır; SMB internet erişimine açılmaz.

Ana belge kilometre taşının tamamlanması için ilişkili belge referansının kaydı gerekir. Bir belge referansı kaydedildiğinde bağlı kilometre taşı tamamlanır. Aynı belge türünün yeni revizyonu ayrı kayıt olarak tutulabilir; eski kayıt fiziksel olarak silinmez.

## Kurum görüşleri

Kurum adı, konu, talep/yanıt/son tarih, giden-gelen yazı numarası, iletişim kişisi ve notlar saklanır. Kalan gün/takvim rengi yalnızca girilen tarih üzerinden hesaplanır. Sistem mevzuata dayalı süre başlatma olayı, iş günü, resmî tatil, durma/uzama veya cevap süresini otomatik hesaplamaz.

institution_opinions.view/create/update izinleri eced izinlerinden ayrıdır. Kurum görüşü içeriği, görüş belgeleri ve ilgili denetim olayları bu ayrı izin olmadan API yanıtlarında gösterilmez.

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
