ENÇEV PULSE 2.7.0 — BITRIX WORKSPACE EDITION
==============================================

AMAÇ
Bu sürüm, mevcut PULSE masaüstü uygulamasını Bitrix24'ün çalışma alanı yaklaşımından esinlenen tutarlı bir arayüze taşır. Stitch'ten gelen Genel Bakış ve Görevler & Süreç ekranları mevcut MainWindow içine gömülüdür; ikinci bir uygulama veya pulse_desktop.py yoktur. Diğer bütün mevcut PULSE sayfaları, alt pencereler ve diyaloglar merkezi koyu/açık tasarım sistemiyle biçimlendirilmiştir.

YENİ TASARIM / TEK PENCERE
- Stitch Genel Bakış ve dört sütunlu Görevler & Süreç Kanban ekranı, QWebEngineView olarak mevcut pencerenin içinde açılır.
- Görev kartları yalnızca WorkspaceStore içindeki gerçek kayıtlardan oluşturulur; HTML'de demo kartlar bırakılmaz.
- Proje filtresi, öncelik filtresi, bana ait görev filtresi, arama, pano/liste görünümü, görev ayrıntı çekmecesi, durum değişikliği ve not kaydetme akışları mevcut PULSE servislerine bağlanır.
- Üst arama, yeni proje/görev, bildirim, tema ve modül menüsü PULSE işlevlerine köprülenmiştir.
- Ortak `pulse_theme.py`, yerel/native sayfalardaki tabloları, form alanlarını, butonları, sekmeleri, menüleri, uyarıları ve diyalogları aynı tema kurallarına bağlar. Stitch web ekranları için `assets/stitch_design.css` ve `assets/stitch_app.js` kullanılır.
- Açık tema ve koyu Obsidian teması vardır. Stitch HTML/CSS/JS dosyaları yerel pakettedir; görünümün temelini oluşturmak için ağ bağlantısı gerekmez. Harici font dosyası paketlenmez; sistem fontları ve simge yedekleri kullanılır.

MODÜLLER
- Genel Bakış: proje/görev/e-ÇED/dilekçe özeti ve gerçek kayıtlardan gelen öncelikli görevler.
- Görevler & Süreç: Kanban, liste görünümü, filtreler, görev ayrıntıları, durum ve not güncellemesi.
- Projeler: mevcut proje kayıtları, editör, aşama/durum, ekip ve kurum görüşleri.
- Mesajlar & Sohbet: mevcut ortak mesaj deposu, okunma/alındı bilgileri, tepkiler ve dosya ekleri korunur. Gerçek mesajın bağlam menüsünden görev oluşturma akışı bulunur.
- Takvim & Yasal Süreç: projelerin teslim tarihleri, görev teslimleri ve kurum görüşü tarihlerinden beslenen takvim. Takvim şu sürümde yeni toplantı oluşturma/senkronizasyon sistemi değildir.
- Belgeler / Drive: ayarlanan ortak Windows klasöründe salt-okunur, tek-seviye dosya/klasör listeleme, arama, sıralama ve dosya/klasör açma. Tarama arka planda yapılır ve alt klasörlere özyinelemeli girmez.
- Ekip, Kurum Rehberi, Notlarım, Bildirimler, e-ÇED Canlı, Dilekçeler ve Ayarlar önceki PULSE veri/iş akışlarını kullanır. Dilekçe ortak Word kilidi, kuyruk, geçmiş ve yedek akışları bu sürümde de korunur.

KURULUM / GÜVENLİ GEÇİŞ
1. ZIP'i yeni ve ayrı bir klasöre çıkarın. Çalışan eski klasörün üzerine yazmayın.
2. Windows'ta Python 3 ve Python Launcher (py.exe) mevcut olmalı.
3. `PULSE_SETUP.bat` kurulum/kısayol geçişi içindir. Yalnız test/ön izleme için `START_PULSE_NO_SHORTCUT_MIGRATION.bat` mevcut uygulamayı kısayol geçişi çalıştırmadan başlatır.
4. `RUN_TESTS.bat` Python kontrollerini, otomatik testleri ve mevcutsa Node.js sözdizimi kontrollerini çalıştırır.
5. Önce test bilgisayarında açılışı ve ortak ağ bağlantısını kontrol etmeden `PUBLISH_PULSE.bat` ile şirketin ortak güncelleme alanına yayın yapmayın.

BITRIX24 İLE KAPSAM SINIRI
PULSE, Bitrix24 ürünü veya birebir sunucu/özellik kopyası değildir. Tasarım dili ve çalışma alanı davranışları Bitrix24'ten esinlenir; PULSE'ın gerçek backend'leri korunur. Tam Bitrix CRM lead/deal hattı, bulut Drive eşitleme/sürümleme/izin sistemi, sesli/video görüşme, Contact Center, CoPilot, görsel workflow otomasyonu, e-imza ağı, şirket sosyal akışı ve kurumsal organizasyon şeması bu ZIP'te Bitrix sunucu hizmeti olarak yoktur. Belgeler sayfası ağ klasörüne salt-okunur göz atıcıdır, Bitrix Drive yerine geçmez. Takvim gerçek kayıt tarihlerini gösterir; takvim etkinliği davet/senkronizasyonu sağlamaz.

VERİ GÜVENLİĞİ
- Bu teslim sırasında gerçek şirket ağına veya `\192.168.1.55\Genel Evrak` içeriğine erişilip dosya değiştirilmedi.
- Proje ve mesaj verisi üretimden silinmez; UI tasarımı ayrı katmandadır.
- Yeni sürümü ayrı klasörde deneyin; yedek almadan mevcut kurulumun üstüne kopyalamayın.

DOĞRULAMA SINIRI
- Son test: pytest 198/198 geçti; compileall, Node.js sözdizim kontrolleri ve ZIP bütünlüğü ayrıca doğrulanmalıdır.
- Chromium görsel/etkileşim denemesi Genel Bakış ve Kanban için 1024x768, 1280x800 ve 1600x900 çözünürlüklerini kapsar. Bu test için sentetik fixture yalnız QA betiğinde kullanılır; uygulama modüllerinde gerçek kayıt yerine kullanılmaz.
- PySide6/QtWebEngine bu geliştirme ortamında bulunmadığından Windows masaüstü MainWindow açılışı burada çalıştırılamadı. Şirket Windows makinesinde gerçek açılış, ortak klasör, sohbet, dilekçe kilidi ve tarayıcı eklentisiyle kabul testi yapılmalıdır.

REFERANSLAR
Bitrix24 kullanıcı kılavuzu ve mimari karşılaştırma: `BITRIX_WORKSPACE_RESEARCH_AND_GAP_ANALYSIS.txt`.
