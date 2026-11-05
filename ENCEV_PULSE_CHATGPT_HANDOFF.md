# ENCEV PULSE — ChatGPT → Codex Handoff

> Bu dosya, ChatGPT görüşmelerinde netleşen ürün bağlamını Codex'e taşımak için hazırlanmıştır. Yeni gereksinimlerde bu dosyayı körü körüne izleme: kullanıcının en son açık talimatı önceliklidir. Çelişki veya önemli belirsizlik varsa bunu görünür kıl.

## 1. Ürün hedefi

ENCEV PULSE, EnÇev'in şirket içi kullanımına yönelik, Bitrix24'ten kullanım kolaylığı ve çalışma alanı yaklaşımı bakımından ilham alan; ancak EnÇev'in gerçek iş akışlarına göre tasarlanan bir çalışma platformudur.

Ana hedef, çalışanların günlük işlerini tek yerde yürütebilmesidir. Öncelik sırası:
1. Çalışanın kendi görevlerini, işlerini ve takvimini yönetmesi.
2. Proje ve ekip koordinasyonu.
3. Yöneticinin ekip iş yükünü, ilerlemeyi ve yasal süreçleri takip etmesi.
4. Kurumsal belgeler, yazışmalar ve şirket içi bilgi akışının yönetimi.

Bu bir satış CRM'i değildir. Satış fırsatları, lead yönetimi ve benzeri gereksiz CRM modülleri eklenmeyecek.

## 2. Modüller ve bilinen gereksinimler

### Genel Bakış
- Yalnızca gerçek PULSE verilerini göstermeli.
- Demo sayaçları, sahte kullanıcılar, uydurma aktiviteler veya örnek istatistikler kesinlikle kullanılmamalı.
- Çalışanın günlük işine başlamasını kolaylaştıran kişisel çalışma ekranı olmalı.

### Görevler & Süreç
- Kanban birincil görünüm olmalı; liste ve uygun diğer görünümler de sunulmalı.
- Görev detayları tercihen sağdan açılan bir detay panelinde gösterilmeli.
- Sorumlu, takipçi, tarih, öncelik, durum, yorumlar, dosyalar ve ilgili proje gibi gerçek alanlar düşünülmeli.
- Görevler çalışan odaklı olmalı; yönetici ekip takibi yapabilmeli.

### Projeler
- Proje, ekip, görev, belge, takvim ve ilgili kurum görüşleri arasında ilişkiler kurulmalı.
- Sekmeli, düzenli proje çalışma alanı tercih ediliyor.
- Görsel yön için koyu antrasit/Stitch esintili proje yerleşimi daha önce beğenilmişti; bunu tüm uygulamaya düşünmeden yayma, bütünsel tasarım sistemi içinde değerlendir.

### Takvim & Yasal Süreçler
- Kişisel/ekip etkinlikleri ve proje tarihleriyle ilişkili olmalı.
- Yasal tarihler, son başvuru/yanıt süreleri ve kalan günler görünür olmalı.
- Tarih ve hatırlatma mantığı güvenilir olmalı; saat dilimi Türkiye/İstanbul.

### Sohbet
- Üç panelli, ekip sohbeti deneyimi hedefleniyor.
- Gerçek mesajlaşma ve kalıcı veri olmalı; yalnızca görsel demo olmamalı.
- Dosya/görsel paylaşımı, mesaj arama, okundu bilgisi, düzenleme/silme, reaksiyonlar, yanıtlar, sabitlenmiş mesajlar ve mesajdan görev oluşturma ihtiyaçları var.
- Sesli/görüntülü arama isteniyor; uygulanabilirlik, altyapı ve maliyet ayrıca değerlendirilip aşamalı planlanmalı. Çalışmayan arama düğmesi konulmamalı.

### Belgeler / Ortak Drive
- Şirketin gerçek dosya ve klasör yapısıyla çalışmalı.
- Mevcut şirket dosyalarını gereksiz yere başka depoya taşımak veya çoğaltmak istemiyoruz.
- Ağ paylaşımı, uzaktan erişim, yetkilendirme, dosya kilidi/eşzamanlı düzenleme, önizleme ve yedekleme gibi konular gerçek ortama göre incelenmeli.
- Yol/kimlik bilgileri kod içine sabit yazılmamalı; yapılandırma ve güvenlik tasarımı yapılmalı.

### Kurum Rehberi
- Kurum ve iletişim bilgilerinin aranabilir, tutarlı yönetimi.
- Diğer modüllerle ilişkilendirilebilir olmalı.

### Kurum Görüşleri
- Tablo/işlem merkezi yaklaşımı ve sağ detay paneli.
- Görüş yazısı, kurum, proje, sorumlu, durum, yazışma ve yasal süre ilişkileri.
- Son tarih ve kalan gün göstergeleri; gecikme ve yaklaşan süre uyarıları.

### Dilekçeler
- Şablonlar ve doldurulabilir alanlar.
- Belge önizleme.
- Gerçek DOCX/Word çıktısı üretimi.
- Taslak, incelemede, onaylandı, gönderildi gibi uygun durum takibi.
- Üretilen belgenin şablonla ve ilgili kayıtla ilişkisi korunmalı.

### e-ÇED Takip
- Gerçek proje/başvuru ve süreç kayıtlarının takibi.
- Aşamalar, sorumlular, tarihler ve ilgili dokümanlar.
- Süreç ve mevzuat gereksinimleri varsayılmamalı; kullanıcıdan gelen iş akışlarıyla doğrulanmalı.

### Notlarım
- Kullanıcıya ait kişisel notlar; gerektiğinde proje/görev bağlantısı.

### Bildirimler
- Gerçek olaylara dayalı bildirimler; sahte aktivite akışı yok.
- Okundu/okunmadı, öncelik ve bildirim tercihleri değerlendirilmeli.

### Ayarlar / Sistem Yönetimi
- İki panelli/iki bölümlü ayar deneyimi tercih ediliyor.
- Kullanıcılar, roller, izinler, ekipler, uygulama tercihleri ve sistem ayarları ayrıştırılmalı.

## 3. Tasarım ve kullanıcı deneyimi ilkeleri

- Modern, profesyonel, kurumsal ve gerçekten kullanılabilir arayüz.
- Sabit sol ana navigasyon.
- Açık ve koyu tema seçeneği.
- Dengeli bilgi yoğunluğu; gereksiz boşluk veya aşırı sıkışıklık olmamalı.
- Tutarlı tipografi, renk sistemi, ikonografi, boşluk ve etkileşim dili.
- Gerektiğinde sağ detay panelleri ve bağlama duyarlı araç alanları.
- Responsive davranış, erişilebilir kontrast, klavye kullanımı ve metin taşması kontrol edilmeli.
- Gösterişli efektler işlevselliğin önüne geçmemeli.
- Daha önce önerilen füme/petrol/mint (Slate & Teal) paleti beğenilmedi; aynı paleti varsayılan olarak tekrar kullanma. Önce tasarım alternatiflerini gerekçelendir.
- Kullanıcı genel UI kalitesine yüksek önem veriyor: kesilen metinler, işlevsiz kontroller, gereksiz kutular, sahte veriler ve yarım sayfalar kabul edilmiyor.

## 4. Teknik ve ürün kararlarında çalışma ilkeleri

- Teknoloji yığını henüz kesinleşmiş kabul edilmemeli. Önce gerçek gereksinimlere göre seçenekleri değerlendir.
- Önceki `replica` denemesinde Next.js 14, React 18, Supabase ve Drizzle kullanılmıştı; bu tercih yeni proje için otomatik olarak bağlayıcı değildir.
- Önceki deneme kullanıcı beklentisini karşılamadı: demo/sahte veri, yüzeysel ve işlevsiz ekranlar, tamamlanmamış modüller ve çalışan bir ürün hissi vermeyen çıktı oluştu. Aynı yaklaşım kesinlikle tekrarlanmamalı.
- Uygulama modülleri gerçek veri, gerçek iş kuralları ve birbirleriyle çalışan ilişkilerle inşa edilmeli.
- Veri modeli, yetkilendirme, denetim izi, yedekleme, eşzamanlı kullanım, hata yönetimi ve güvenlik en baştan düşünülmeli.
- Şirket dosya alanı ve kişisel/kurumsal veriler korunmalı. Destructive migration, dosya taşıma/silme veya mevcut veriyi dönüştürme gibi işlemler öncesi açık onay ve geri dönüş planı gerekli.
- Ev ve ofis bilgisayarlarından kullanım ihtiyacı var. Şu an geliştirme için ofis bilgisayarı ve `C:\Code\encev-pulse` klasörü hedefleniyor; evden ofis bilgisayarına AnyDesk ile erişim planlanıyor. Nihai dağıtım/uzaktan erişim mimarisi ayrıca tasarlanmalı.

## 5. Kullanıcının çalışma ve iletişim tercihleri

- Kullanıcı profesyonel yazılımcı değil; teknik işleri ve ayrıntılı komut zincirlerini ona yükleme.
- Türkçe, doğrudan, doğal ve açık iletişim kur.
- Kullanıcının yalnızca kelimelerini değil, asıl niyetini ve beklediği sonucu anlamaya çalış.
- Makul, düşük riskli varsayımları kendin yap; önemli sonuç doğuran belirsizlikleri kısa ve anlaşılır biçimde sor.
- Kullanıcının daha önce verdiği bilgileri tekrar sorma.
- Hemen kodlamaya atlama. Kapsamlı işlerde önce ne anladığını, seçenekleri, riskleri ve kabul kriterlerini ortaya koy.
- Ancak bunu gereksiz analiz döngüsüne dönüştürme. Düşünme süreci kısa sürede somut çıktı üretmeli.
- Kullanıcıyı her teknik kararı vermeye zorlamadan öneri geliştir; gerekçesini kısa anlat.
- Çalışmayan özelliği çalışıyor diye sunma. Yapılan ve test edilen işleri açıkça raporla.
- Kod değişikliğinde mevcut işlevleri/verileri koru; önce kök nedeni bul.

## 6. Codex için mevcut görev / bu dosyanın kullanımı

1. Bu dosyayı ürün bağlamı ve önceki konuşmalardan gelen gereksinimlerin tamamlayıcısı olarak oku.
2. Kullanıcının zaten oluşturduğunu söylediği şu analiz belgelerini incele:
   - `docs/PRODUCT_VISION.md`
   - `docs/USER_ROLES_AND_FLOWS.md`
   - `docs/MODULE_REQUIREMENTS.md`
   - `docs/OPEN_DECISIONS.md`
3. Belgeleri bu dosyadaki bilgilerle karşılaştır. Eksik, çelişkili, yüzeysel veya uydurulmuş noktaları tespit et.
4. Eski gereksinimleri sessizce ezme. Çelişki varsa `docs/OPEN_DECISIONS.md` içinde açıkça belirt ve kullanıcıya anlaşılır bir öneri sun.
5. Henüz uygulama kodu, bağımlılık kurulumu, veritabanı veya rastgele arayüz oluşturma. Önce analiz belgelerini düzelt ve kısa bir özet sun.
6. Kullanıcı onayı olmadan uygulama geliştirme aşamasına geçme.

## 7. Tamamlanma ölçütü

Bir modül, yalnızca navigasyonda görünmesi veya statik ekranının bulunması nedeniyle tamamlanmış sayılmaz. İlgili veri modeli, gerçek kullanıcı akışı, yetkilendirme, hata durumları, entegrasyonlar ve fonksiyonel testleri çalışır olmalıdır. UI değişikliklerinde gerçek uygulama üzerinde görsel kontrol de yapılmalıdır.
