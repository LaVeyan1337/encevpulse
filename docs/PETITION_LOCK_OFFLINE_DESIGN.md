# Dilekçeler: NAS erişimi olmadan güvenli geliştirme planı

## Değişmez çalışma sınırı

Bu geliştirme dalı, şirket NAS'ına ve `\\\\192.168.1.55\\Genel Evrak` paylaşımına bağlanmaz. Hiçbir test, uygulama, yardımcı süreç veya dağıtım adımı bu paylaşımın varlığını sorgulamaz. NAS'a yazma, okuma, listeleme, kilit/varlık/günlük/yedek oluşturma ve eski dosya temizleme işlemleri kapalıdır.

Bu belge bir erişim izni değildir. Gelecekte NAS erişimi istenirse kullanıcıdan ayrı, açık ve kapsamı belirli onay alınmadan tasarım sınırı değiştirilemez.

## Eski masaüstü akışının kaynak kodu incelemesi

Eski `pulse_petition.py` uygulamasında ortak dilekçe iş akışı yalnızca bir kilit kaydından oluşmuyor:

- `kilit.json`: kullanıcı, bilgisayar, açılış zamanı ve heartbeat.
- `bekleme_sirasi.jsonl`: sıraya giriş/çıkış olayları.
- `varlik/*.json`: ekip çevrimiçi sinyali.
- `gunluk.jsonl`: açma/kapatma ve erişim olayları.
- `yedekler/`: DOCX sürüm kopyaları.
- Windows fiziksel dosya kilidi: `CreateFileW` paylaşım ihlali kontrolü.
- Bazı Windows sunucularında açık dosya sahibini bulmak için `NetFileEnum` ve `openfiles.exe`; son çare olarak Word `~$` sahibi işaretçisi.

Kaynak kodda ayrıca NAS/paylaşım üzerinde dosya oluşturan, güncelleyen, yeniden adlandıran ve silen yollar var: kilit alma/heartbeat/serbest bırakma, varlık ve günlük yazımı, yedek kopyalama ve eski yedekleri 30 kayıt sınırında temizleme. Bu yolların web'e veya bir arka plan servisine doğrudan taşınması mevcut güvenlik politikasına aykırı olur.

## Şu an web sürümünde izin verilen işlev

- Kullanıcının seçtiği DOCX, yalnızca tarayıcı IndexedDB alanında saklanır.
- Şablon SHA-256 özeti destekleniyorsa yerel bayt bütünlüğünü kontrol eder; bu bir dijital imza veya sunucu doğrulaması değildir.
- Taslak indirmesi şablonun baytlarını değiştirmez; proje bilgisi yalnızca dosya adına yansır.
- Şablon sunucuya ve NAS'a gönderilmez.
- Web uygulaması fiziksel Word kilidi, ekip ortak varlığı veya ortak bekleme sırası varmış gibi davranmaz.

## NAS'tan bağımsız sonraki geliştirme

İleride ekip koordinasyonu gerekiyorsa ilk güvenli ara katman, yalnızca PULSE'un kendi PostgreSQL veritabanında tutulan bir **uygulama rezervasyonu** olabilir. Bu rezervasyon:

1. Bir kullanıcının web arayüzünde bir dilekçe üzerinde çalıştığını diğer kullanıcılara bildirir.
2. Süreli lease ve heartbeat kullanır; süre aşımı yalnızca uygulama rezervasyonunu serbest bırakır.
3. Kullanıcı, cihaz, başlangıç ve bitiş olaylarını uygulama denetim kaydında tutar.
4. NAS yolunu veya DOCX içeriğini saklamaz; SMB/UNC, Windows dosya API'si, PowerShell, `openfiles.exe` veya yerel yardımcı servis çağırmaz.
5. **Word dosyasının fiziksel olarak kilitlendiğini garanti etmez.** Bu ayrım arayüzde açıkça gösterilir.

Bu ara katman dahi eski ENCTakip kilit dosyasının yerine geçmez. Fiziksel Word/SMB kilidi entegrasyonu, bu güvenlik sınırı altında yapılmayacaktır.

## Test stratejisi

- Birim ve entegrasyon testleri yalnızca geçici test veritabanı, bellek içi nesneler ve sentetik DOCX dosyaları kullanır.
- Testler gerçek şirket paylaşımını, NAS IP adresini veya UNC yolunu parametre olarak almaz.
- Ofis ağına bağlı Windows makinede test, keşif, erişilebilirlik kontrolü veya yazma denemesi yapılmaz.
- NAS'a erişen yardımcı servis kurulmaz, başlatılmaz veya paketlenmez.
