# Dilekçeler: NAS erişimi olmadan güvenli geliştirme planı

## Değişmez sınır

Bu geliştirme dalı şirket ağına veya NAS paylaşımına bağlanmaz. Hiçbir test, uygulama, yardımcı süreç veya dağıtım adımı paylaşımın varlığını sorgulamaz. NAS'a yazma, okuma, listeleme, kilit/varlık/günlük/yedek oluşturma ve eski dosya temizleme işlemleri kapalıdır.

Bu belge bir erişim izni değildir. Kullanıcı ayrıca, açıkça ve kapsamı belirli şekilde izin vermedikçe bu tasarım sınırı değiştirilemez.

## Eski masaüstü akışının kaynak kodu incelemesi

Eski Python Dilekçeler akışı yalnızca bir kilit kaydı değildir. Kaynak kodu şu ortak dosya yapılarını kullanır:

- `kilit.json`: kullanıcı, bilgisayar, açılış zamanı ve heartbeat.
- `bekleme_sirasi.jsonl`: sıraya giriş/çıkış olayları.
- `varlik/*.json`: ekip çevrimiçi sinyali.
- `gunluk.jsonl`: açma/kapatma ve erişim olayları.
- `yedekler/`: DOCX sürüm kopyaları.
- Windows fiziksel dosya kilidi: paylaşım ihlali kontrolü.
- Windows sunucularında açık dosya sahibini bulmak için işletim sistemi API'leri ve Word geçici sahibi işaretçisi.

Bu akış; kilit, varlık ve günlük dosyaları yazma, DOCX yedekleme ve eski yedekleri silme yolları içerir. Bunların web'e veya arka plan servisine doğrudan taşınması şirket NAS güvenlik sınırına aykırıdır.

## Web sürümünde izin verilen işlev

- Kullanıcının seçtiği DOCX yalnızca tarayıcı IndexedDB alanında saklanır.
- Tarayıcı destekliyorsa SHA-256, yerel şablon baytlarının beklenmedik değişimini fark etmek için kullanılır. Bu bir dijital imza veya sunucu doğrulaması değildir.
- Taslak indirmesi şablonun baytlarını değiştirmez; proje bilgisi yalnızca dosya adına yansır.
- Şablon sunucuya ve NAS'a gönderilmez.
- Web uygulaması fiziksel Word kilidi, ortak SMB bekleme sırası veya ortak ağ yedeği varmış gibi davranmaz.

## Güvenli sonraki geliştirme

Ekip koordinasyonu için gerekirse PULSE'un kendi PostgreSQL veritabanında süreli bir **uygulama rezervasyonu** tasarlanabilir. Bu kayıt yalnızca kimin hangi proje/dilekçe taslağı üzerinde çalıştığını gösterir. Süreli lease, heartbeat, sahiplik ve denetim olayları uygulama veritabanında tutulabilir.

Bu uygulama rezervasyonu:

1. NAS yolunu veya DOCX içeriğini saklamaz.
2. SMB/UNC, Windows dosya API'si, PowerShell, işletim sistemi açık-dosya sorgusu veya yerel yardımcı servis kullanmaz.
3. Süre aşımında yalnızca uygulama rezervasyonunu serbest bırakır.
4. Word belgesinin fiziksel olarak kilitlendiğini **garanti etmez**.
5. Gerçek ortak Word dosya düzenleme ve yedekleme akışının yerine geçtiği şeklinde sunulmaz.

## Test stratejisi

- Testler geçici test veritabanı, bellek içi nesneler ve sentetik DOCX dosyaları kullanır.
- Gerçek şirket paylaşımı, NAS adresi veya UNC yolu test girdisi olamaz.
- Ofis ağına bağlı Windows makinede erişilebilirlik kontrolü, tarama veya yazma denemesi yapılmaz.
- NAS'a erişen yardımcı servis kurulmaz, başlatılmaz veya paketlenmez.
