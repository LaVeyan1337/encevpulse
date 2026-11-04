# ENCEV PULSE e-ÇED İzleyici (Manifest V3)

Bu eklenti, kullanıcının açıkça izin verdiği portal origin'lerinde sekme/hesap gözlemi yapar. Parola, çerez, form alanı, localStorage/sessionStorage, sayfa HTML'i veya DOM dökümü toplamaz.

## Kurulum

1. PULSE web uygulamasında **e-ÇED Takip → Tarayıcı eşleştirmeleri** ekranında bir cihaz eşleştirmesi oluşturun.
2. Anahtar ekranda yalnızca bir kez gösterilir. Anahtarı kopyalayın; kaybolursa eski eşleştirmeyi iptal edip yenisini oluşturun.
3. Chrome veya Edge'de chrome://extensions veya edge://extensions adresini açın.
4. Geliştirici modunu açın ve **Paketlenmemiş öğe yükle** ile bu klasörü seçin.
5. Eklenti ayrıntılarından **Uzantı seçenekleri** bölümünü açın. PULSE API adresini (ör. https://pulse.sirketiniz.com/api) ve tek seferlik anahtarı girip kaydedin.
6. PULSE web uygulamasında “Bağlantı doğrulandı” mesajını kontrol edin.
7. e-ÇED portal sekmesine geçin. Eklenti menüsünde **Bu portalı izlemeye aç** düğmesine basın ve tarayıcının site izni istemini onaylayın.
8. Görünür hesap etiketini ve oturum durumunu kendiniz seçip kaydedin. Seçim yapılmazsa hesap/oturum unknown gönderilir.
9. PULSE web uygulamasında e-ÇED ekranını yenileyin; cihaz ve rapor sinyali görünmelidir.

## Güvenlik ve doğruluk

- API eşleştirme anahtarı uzantı profilinin chrome.storage.local alanında tutulur; sunucuda yalnız SHA-256 özeti saklanır.
- Portal erişimi isteğe bağlı host permission olarak sorulur; kullanıcı izin vermediği origin'ler izlenmez.
- URL query string ve fragment rapora eklenmez; yalnız origin ve pathname gönderilir.
- Hesap etiketi ve oturum durumu kullanıcı tarafından açıkça seçilir ve portal + sekme kimliği bazında saklanır. Sekme kapatıldığında veya başka origin'e yönlendiğinde o sekmenin eski etiketi temizlenir.
- Eklenti portal sunucusunun oturumunu doğrulayamaz. unknown veya eski sinyal “oturum kapalı” anlamına gelmez.
- Rapor şemasında parola, çerez, form girdisi, depolama anahtarı, sayfa metni veya HTML alanı yoktur.
- Eşleştirme iptal edildiğinde sunucu token'ı reddeder. Eklenti içindeki token ayrıca tarayıcı eklenti ayarlarından temizlenebilir.

## Güncelleme

Bu klasörün içeriği güncellendiğinde chrome://extensions veya edge://extensions sayfasında eklentinin Yenile düğmesine basın; açık portal sekmesini de yenileyin.
