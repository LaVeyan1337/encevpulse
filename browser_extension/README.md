# ENCEV PULSE e-ÇED İzleyici (Manifest V3)

Bu eklenti, kullanıcının açıkça izin verdiği tarayıcı profilinde e-ÇED sekmelerine ait sınırlı sinyalleri PULSE'a gönderir. Parola, çerez, form alanı, localStorage/sessionStorage, ağ istekleri, sayfa HTML'i veya tüm sayfa metni toplanmaz.

## Kurulum

1. PULSE web uygulamasında **e-ÇED Takip → Tarayıcı eşleştirmeleri** bölümünden cihaz eşleştirmesi oluşturun.
2. Tek seferlik anahtarı kopyalayın. Anahtar yalnızca oluşturulduğu anda gösterilir.
3. Chrome veya Edge'de `chrome://extensions` veya `edge://extensions` adresini açın.
4. Geliştirici modunu açın ve **Paketlenmemiş öğe yükle** ile bu klasörü seçin.
5. Eklenti seçeneklerinden PULSE API adresini ve eşleştirme anahtarını kaydedin.
6. e-ÇED sekmesine geçin. Eklenti menüsünde **Bu portalı izlemeye aç** düğmesine basın ve site iznini verin. Bu işlemden sonra algılayıcı yalnızca açık sekmeye eklenir.
7. Tarayıcı enjeksiyonu reddederse PULSE sayfayı otomatik yenilemez; sekmeyi kendiniz yenileyip eklentiyi tekrar açın.
8. PULSE'un e-ÇED ekranında cihaz sinyalini kontrol edin.

## Hesap tanıma

- Eklenti, yalnızca `eced.csb.gov.tr` alanında, ekranda görünür profil/kullanıcı etiketi için küçük bir seçici izin listesine bakar.
- Tek ve açık bir görünür etiket bulursa hesabı otomatik raporlar. Sunucu bu ilk gözlemi `seen_accounts` listesine otomatik ekler; kullanıcı ayrıca hesap kaydı açmaz.
- Birden fazla farklı profil etiketi eşleşirse yanlış hesabı seçmemek için otomatik kayıt gönderilmez.
- Portalın gerçek HTML seçicileri erişilebilir canlı oturumda doğrulanamadı. Bu nedenle algılama, izin listesindeki öğelerden biri varsa çalışır; bulunmazsa eklenti hesabı belirsiz bırakır ve manuel etiket girişi kullanılabilir. Bu seçicinin gerçek e-ÇED ekranında saha doğrulaması yapılmalıdır.
- Manuel hesap etiketi otomatik tespit üzerine önceliklidir. Manuel etiket temizlenirse portal görünür profilini yeniden tanımayı deneyebilir.
- Ekranda görünen hesap adı tespit edildiğinde durum aktif olarak raporlanır. Oturumun kapandığına dair güvenilir ve doğrulanmış bir portal işareti olmadığı için otomatik çıkış/“girişe hazır” sonucu çıkarılmaz. Kullanıcı, eklenti penceresinde oturum kapalı durumunu kendisi açıkça seçebilir. Eski veya bağlantısı kesilmiş sinyal hiçbir zaman yeşil “girişe hazır” durumuna çevrilmez.

## Güvenlik ve doğruluk

- Eklenti, kullanıcı popup içindeki portal iznini açıkça verdiğinde içerik algılayıcısını yalnızca o anki sekmeye enjekte eder. Manifest'te otomatik çalışan statik portal içerik betiği yoktur.
- Site izni ve betik enjeksiyonu kullanıcı tıklamasıyla başlatılır; eklenti sekmeyi otomatik yenilemez veya başka sayfaya yönlendirmez.
- Otomatik algılayıcı sadece görünür, allowlist içindeki profil öğelerini okur. Form, input, textarea, select, parola alanı, çerez, tarayıcı depolaması, sayfa genelindeki metin ve HTML dökümü okunmaz.
- URL query string ve fragment rapora eklenmez; yalnızca origin ve pathname gönderilir.
- Raporlarda parola veya oturum çerezi bulunmaz. Sunucuya yalnızca hesap etiketi, sekme metaverisi ve kullanıcının seçtiği/algılayıcının çıkarabildiği oturum durumu gönderilir.
- Eklenti e-ÇED sunucusundan oturum doğrulaması yapmaz. Görünür profil etiketi hesap adının ekranda olduğunu gösterir; kimlik doğrulamasına ilişkin resmî kanıt değildir.
- Sekme kapatıldığında veya başka origin'e gittiğinde o sekmenin yerel hesap etiketi temizlenir.
- Eşleştirme iptal edilirse sunucu eski token'ı reddeder. Eklenti token'ı tarayıcı eklenti ayarlarından da temizlenebilir.

## Güncelleme

Bu klasör değiştiğinde `chrome://extensions` veya `edge://extensions` sayfasında eklentinin **Yenile** düğmesine basın. Portal sekmesini yenileyin.
