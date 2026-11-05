# ENCEV PULSE — Uygulama Kararları

**Durum:** Uygulama sırasında alınan, ürün kararlarıyla uyumlu teknik kararlar

## 2026-11-03 — İlk görev ve proje erişim kapsamı

- Görev; oluşturan kullanıcıya, sorumlu kullanıcıya ve varsa projenin üyelerine görünür. Yönetici rolü tek başına başka kullanıcıların özel görevlerini göstermez.
- Projeyi oluşturan kişi otomatik üyedir. Projeye atanacak çalışan önce proje üyesi olmalıdır; aktörün de proje üyeliği kontrol edilir.
- İlk görev durumları `open`, `in_progress`, `waiting`, `done`; öncelikler `low`, `normal`, `high`, `urgent` olarak tutulur. Bu sözlük kod tarafından doğrulanır, ürün sahibi ihtiyaçla değiştirebilir.
- Görev güncellemesi satır `version` değeriyle çakışma kontrolü yapar. Silme yerine sürümlü arşivleme/geri yükleme kullanılır.
- Görev ataması alıcıya PostgreSQL'de kalıcı bir uygulama içi bildirim üretir; notification ve task aynı transaction'da kaydolur. Arayüz alıcıya ait okunmamış sayısını ve son hareketleri gerçek DB kayıtlarından okur. İlk sürümde yalnız görev ataması olayı vardır.
- İlk listeler sayfa başına en çok 200 kayıt döndürür; arayüz `Daha fazla görev göster` ile sonraki sayfayı alır. Veri büyüdüğünde offset yerine keyset pagination ölçülüp devreye alınmalıdır.
- İlk sürümde görev yorumu, takipçi, dosya eki, atama dışındaki bildirim türleri, ekip üyelik/rol yönetimi ve gelişmiş proje yaşam döngüsü bulunmaz. Bunlar hazırmış gibi gösterilmez.

## 2026-11-03 — Kimlik doğrulama dilimi

- Giriş kimliği normalize edilmiş kurumsal e-posta veya kısa kullanıcı adıdır; ikisi aynı yerel hesaba gider. OIDC/Entra ID entegrasyonu daha sonra ayrı provider eşlemesiyle eklenebilir.
- Yeni kullanıcıyı yalnız sistem yöneticisi oluşturur. Sabit/varsayılan hesap yoktur; ilk yönetici yalnız tek kullanımlı yerel TTY kurulum komutuyla oluşturulur.
- Parola Argon2id ile saklanır; oturum hash'i PostgreSQL'de tutulur ve tarayıcıya HttpOnly cookie verilir. Üretimde Secure zorunludur; mutating isteklerde CSRF ve Origin kontrolü yapılır.
- SMTP olmadığı için e-posta parola sıfırlama bağlantısı sunulmaz. Yönetici tek kullanımlı geçici parola üretir; ilk kullanımda değişim istenir ve eski oturumlar kapatılır.

## 2026-11-03 — PostgreSQL sorgu erişimi

- Tekil parametreli uygulama sorguları Drizzle'ın PostgreSQL SQL arayüzünden ve `node-postgres` havuzuyla çalıştırılır. Karmaşık yetki, raporlama ve denetim sorguları okunabilir, parametreli SQL olarak tutulur.
- Çok adımlı işlemler aynı `node-postgres` havuzundan alınan istemci üzerinde açık transaction ile yürütülür; bu sayede kilit, sıra ve atomicity davranışı açık kalır. Şema değişiklikleri incelemeye açık SQL migration dosyalarıdır.

## Değiştirilebilir kararlar

Görev durum/öncelik sözlüğü, liste sayfa boyutu, 8 saatlik hareketsizlik ve 7 günlük mutlak oturum ömrü üretim ölçümü ve kurum süreçleriyle güncellenebilir. Kimlik, yetki ve audit kuralları gevşetilmeden değiştirilmelidir.
