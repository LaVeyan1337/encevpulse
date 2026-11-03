# ENCEV PULSE — Erişim Kontrol Modeli

## Karar ayrımı

Her istekte iki bağımsız soru değerlendirilir:

1. **Modül/eylem izni:** Kullanıcı bu modüle girebilir ve istenen eylemi yapabilir mi?
2. **Kayıt kapsamı:** Bu kullanıcı bu görev, proje, konuşma veya belge kaydına erişebilir mi?

Modül izni kayıt sahipliği veya üyelik yerine geçmez.

## Eylemler

| Anahtar | Anlam |
|---|---|
| view | Modüle giriş ve kayıt kapsamındaki veriyi okuma |
| create | Yeni kayıt oluşturma |
| update | Kayıt düzenleme |
| delete | Silme/arşivleme işlemi |
| manage | Modülde tüm eylemler; tek başına saklanan özel grant |

manage verildiğinde API tüm eylemleri kabul eder. Yönetici arayüzü bu izni diğer eylemlerin etkin görünümüyle gösterir.

## Birden fazla rol

Kullanıcıya atanmış rollerden gelen izinler birleşir (OR). Örneğin auditor + project_manager atamasında proje yöneticisinin proje güncelleme yetkisi korunur; salt okunur denetçi yetkisi bunu düşürmez. Bir rol/modül iznini değiştirmek yalnızca o satırı günceller.

## Başlangıç modülleri

| Modül | İlk durum | Not |
|---|---|---|
| Genel Bakış | Açık | İçerik için ayrıca görev/proje izinleri gerekir |
| Görevler & Süreç | Açık | Görev kayıt kapsamı ayrıca uygulanır |
| Projeler | Açık | Sahip/üye kapsamı ayrıca uygulanır |
| Sohbet | Açık | Aktif konuşma üyeliği ayrıca uygulanır |
| Çalışan Rehberi | Açık | Sohbet başlatma ayrıca chat.create ister |
| Bildirimler | Açık | Görev/sohbet bildirimleri kendi modül view iznine göre filtrelenir |
| Kullanıcı Yönetimi | Açık | Sistem yöneticisi emniyet yetkisi |
| Rol/Modül İzinleri | Açık | Yalnız system_admin |
| Takvim, Drive, Kurum Rehberi, Kurum Görüşleri, Dilekçeler, e-ÇED, Notlarım, Sistem Ayarları | Kapalı | Kurumsal süreç sahibi onayı gelmeden açılmaz |

## Sistem yöneticisi koruması

system_admin kullanıcı yönetimi, rol/modül izinleri ve sistem ayarları emniyet yetkisini kaybedemez. Son etkin sistem yöneticisinin kaldırılması da ayrıca engellenir. Bu rol özel sohbetleri veya tüm proje/görev kayıtlarını otomatik görmez.

## Geriye dönük rol temizliği

Önceki sürüm, seçilen rollere ek olarak employee ataması yapabiliyordu. Bu davranış, salt okunur rol taşıyan hesaplara çalışan yazma izinleri de kazandırabilirdi. Migration 0010, başka bir rolü bulunan hesaplardan bu otomatik employee atamasını kaldırır. Yeni kullanıcı formu varsayılan olarak employee seçer; başka bir rol ilk kez seçildiğinde çalışan rolü otomatik eklenmez, yönetici isterse ayrıca işaretleyebilir. API istemcisi roleCodes alanını hiç göndermezse eski entegrasyon uyumluluğu için employee varsayılanı uygulanır; açıkça boş liste reddedilir.

## Uygulama güvenceleri

- API her istekte session'daki güncel rolleri ve PostgreSQL grant tablosunu kullanır. Menüde öğeyi gizlemek tek başına güvenlik kontrolü sayılmaz.
- Yetkisiz modül/eylem isteği 403 MODULE_PERMISSION_DENIED döndürür.
- Modül kapalıysa grant olsa bile erişim reddedilir.
- Bildirim listesi görev ve sohbet görünürlük grant'lerine göre sunucu tarafında filtrelenir; UI da erişilemeyen bildirimi açmayı denemez.
- SSE stream açılışında ve en geç 60 saniyede bir session ve chat.view yeniden doğrulanır. SSE payload'ı mesaj gövdesi taşımaz.
- İzin değişiklikleri auth_audit_events içine yazılır.
- Mevcut proje üyeliği, görev atama/oluşturan ve sohbet üyeliği denetimleri korunur.

## Kurumsal onay gerektiren konular

Rol amaçları ve başlangıç grant'leri ürün varsayımıdır. Birim/ekip hiyerarşisi, görev/proje kayıt kapsamı, Kurum Görüşleri/e-ÇED kayıt sahipliği, ortak Drive izinleri ve denetçi kapsamı süreç sahipleri tarafından onaylanmalıdır. Kapalı modüller bu onay gelmeden etkinleştirilmemelidir.