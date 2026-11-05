# ENCEV PULSE e-ÇED İzleyici (Manifest V3)

Bu eklenti, kullanıcının açıkça izin verdiği tarayıcı profilinde e-ÇED sekmelerine ait sınırlı sinyalleri PULSE'a gönderir. Parola, çerez, form alanı, localStorage/sessionStorage, ağ istekleri, sayfa HTML'i veya tüm sayfa metni toplanmaz. Portal izni yalnızca resmî `https://eced.csb.gov.tr` origin'i için istenir; API izni ise yalnızca PULSE bağlantısı için ayrıca istenir. Yerel geliştirme kullanımı için `http://127.0.0.1` ve `http://localhost` API origin'leri tanımlıdır.

## Kurulum

1. PULSE web uygulamasında **e-ÇED Takip → Tarayıcı eşleştirmeleri** bölümünden cihaz eşleştirmesi oluşturun.
2. Tek seferlik anahtarı kopyalayın. Anahtar yalnızca oluşturulduğu anda gösterilir.
3. Chrome veya Edge'de `chrome://extensions` veya `edge://extensions` adresini açın.
4. Geliştirici modunu açın ve **Paketlenmemiş öğe yükle** ile bu klasörü seçin.
5. Eklenti seçeneklerinden PULSE API adresini ve eşleştirme anahtarını girin. Eklenti önce API origin'inin `manifest.json` içindeki `optional_host_permissions` listesinde tam olarak tanımlı olup olmadığını kontrol eder; ardından yalnızca o origin için izin ister. Yerel geliştirme adresleri (`127.0.0.1` ve `localhost`) tanımlıdır. Canlı ortam kullanılıyorsa gerçek PULSE HTTPS origin'i bu listeye eklenmelidir; genel `https://*/*` izni kullanılmamalıdır. Bağlantı testi başarılı olmadan yeni ayarlar kaydedilmez.
6. e-ÇED sekmesine geçin. Eklenti menüsünde **Bu portalı izlemeye aç** düğmesine basın ve site iznini verin. İlk izin ve eşleştirmeden sonra algılayıcı, izinli portal sekmeleri açıldığında ve tarayıcı yeniden başladığında yeniden eklenir.
7. Portal sekmesindeki eklenti penceresinde **Seçimlerimi kaydet ve sinyal gönder** düğmesine basın. PULSE API yanıtı artık doğrudan gösterilir: başarılı HTTP yanıtı, HTTP hata kodu, eksik portal/API izni, eşleştirme sorunu ve ağ hatası birbirinden ayrılır. Sonra PULSE'un e-ÇED ekranında son sinyali kontrol edin.

## Hesap tanıma

- Eklenti, yalnızca `eced.csb.gov.tr` alanında, ekranda görünür profil/kullanıcı etiketi için küçük bir seçici izin listesine bakar.
- Tek ve açık bir görünür etiket bulursa hesabı otomatik raporlar. Sunucu bu ilk gözlemi `seen_accounts` listesine otomatik ekler; kullanıcı ayrıca hesap kaydı açmaz.
- Birden fazla farklı profil etiketi eşleşirse yanlış hesabı seçmemek için otomatik kayıt gönderilmez.
- Portalın gerçek HTML seçicileri erişilebilir canlı oturumda doğrulanamadı. Bu nedenle algılama, izin listesindeki öğelerden biri varsa çalışır; bulunmazsa eklenti hesabı belirsiz bırakır ve manuel etiket girişi kullanılabilir. Bu seçicinin gerçek e-ÇED ekranında saha doğrulaması yapılmalıdır.
- Manuel hesap etiketi otomatik tespit üzerine önceliklidir. Manuel etiket temizlenirse portal görünür profilini yeniden tanımayı deneyebilir.
- Ekranda görünen hesap adı tespit edildiğinde durum aktif olarak raporlanır. Oturumun kapandığına dair güvenilir ve doğrulanmış bir portal işareti olmadığı için otomatik çıkış/“girişe hazır” sonucu çıkarılmaz. Kullanıcı, eklenti penceresinde oturum kapalı durumunu kendisi açıkça seçebilir. Eski veya bağlantısı kesilmiş sinyal hiçbir zaman yeşil “girişe hazır” durumuna çevrilmez.

## Güvenlik ve doğruluk

- Eklenti, kullanıcı popup içindeki portal iznini açıkça verdikten sonra içerik algılayıcısını yalnızca izinli portal sekmelerine enjekte eder. Manifest'te otomatik çalışan statik portal içerik betiği yoktur; yeniden başlatma sonrası yeniden enjeksiyon, saklanan site izniyle yapılır.
- İlk site izni kullanıcı tıklamasıyla alınır; sonrasında betik yalnızca aynı origin için saklanmış izin mevcutsa sayfa yüklenmesinde tekrar enjekte edilir. Eklenti sekmeyi otomatik yenilemez veya başka sayfaya yönlendirmez.
- Otomatik algılayıcı sadece görünür, allowlist içindeki profil öğelerini okur. Form, input, textarea, select, parola alanı, çerez, tarayıcı depolaması, sayfa genelindeki metin ve HTML dökümü okunmaz.
- URL query string ve fragment rapora eklenmez; yalnızca origin ve pathname gönderilir.
- Raporlarda parola veya oturum çerezi bulunmaz. Sunucuya yalnızca hesap etiketi, sekme metaverisi ve kullanıcının seçtiği/algılayıcının çıkarabildiği oturum durumu gönderilir.
- Eklenti e-ÇED sunucusundan oturum doğrulaması yapmaz. Görünür profil etiketi hesap adının ekranda olduğunu gösterir; kimlik doğrulamasına ilişkin resmî kanıt değildir.
- Sekme kapatıldığında veya başka origin'e gittiğinde o sekmenin yerel hesap etiketi temizlenir.
- Eşleştirme iptal edilirse sunucu eski token'ı reddeder. Eklenti token'ı tarayıcı eklenti ayarlarından da temizlenebilir.

## Güncelleme

Bu klasör değiştiğinde `chrome://extensions` veya `edge://extensions` sayfasında eklentinin **Yenile** düğmesine basın. Açık e-ÇED sekmesini bir kez yenileyin. Yerel olmayan bir PULSE API alan adı kullanılacaksa ilgili tam origin, `manifest.json` içindeki `optional_host_permissions` listesine önceden eklenmeli ve eklenti yeniden yüklenmelidir; geniş `*` izinleri kullanılmamalıdır.


## Sinyal sorunlarını ayırma

- “Sinyal PULSE sunucusuna ulaştı” mesajı, raporun API tarafından kabul edildiğini gösterir; portal profil adı otomatik bulunamadıysa hesap etiketi ayrıca girilmelidir.
- HTTP 401/403, eşleştirme anahtarının geçersiz veya iptal edilmiş olabileceğini gösterir. PULSE'tan cihaz eşleştirmesini yeniden oluşturun.
- “API alan adı izin listesinde yok” mesajı, canlı sunucunun origin'inin manifestte tanımlı olmadığını gösterir. Yalnızca gerçek tam origin eklenmeli, geniş wildcard izni verilmemelidir.
- “Portal izni verilmemiş” mesajında e-ÇED sekmesinde portal iznini açın.
- Ağ hatasında API adresi, HTTPS sertifikası, sunucu erişimi ve tarayıcının verdiği host izni kontrol edilmelidir.
- API'ye sinyal ulaşması, e-ÇED profil seçicilerinin canlı portal DOM'unda doğru eşleştiğini kanıtlamaz. Otomatik hesap tanıma canlı oturumda ayrıca doğrulanmalıdır.
