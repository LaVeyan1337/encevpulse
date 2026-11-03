# ENCEV PULSE — Takvim Modülü

**Durum:** Takvim temeli uygulanmıştır. Yasal süreç kural motoru ve otomatik hatırlatmalar henüz etkin değildir.

## Etkinlik türleri ve görünürlük

- **Kişisel:** Yalnız oluşturan kullanıcı görür. Katılımcı eklenemez.
- **Ortak:** `calendar.view` izni olan kullanıcılar görür. Katılımcı seçimi isteğe bağlıdır; bu aşamada davet/hatırlatma bildirimi gönderilmez.
- **Projeye bağlı:** Oluşturan, proje sahibi ve etkin proje üyeleri görür. Etkinliği oluşturan veya proje sahibi düzenleyebilir/arşivleyebilir. Katılımcılar aynı projenin etkin üyeleri olmalıdır.

Etkinlik türü `meeting`, `event`, `reminder` veya `deadline` olabilir. Saatli etkinlikler `timestamptz` olarak saklanır; tüm gün etkinlikleri başlangıç ve bitiş `date` alanlarıyla saklanır. Tüm gün bitiş tarihi kapsayıcıdır. Saatli aralıkta bitiş, başlangıçtan kesin olarak sonra olmalıdır.

## Veri ve denetim

- `calendar_events`: etkinlik ana kaydı, görünürlük, zaman aralığı, proje bağlantısı, sürüm ve arşiv bilgisi.
- `calendar_event_attendees`: katılımcı ilişkileri.
- `calendar_event_audit_events`: oluşturma, güncelleme ve arşiv olayları; append-only trigger ile korunur.
- Güncelleme, istemciden beklenen `version` değerini ister; eski sürüm 409 çakışması döndürür.
- Fiziksel silme yapılmaz. Arşivlenen kayıt takvim aralığı sorgusundan çıkarılır.

## Mevcut görev ve proje tarihleri

Takvim API'si görevlerin `starts_on`/`due_on` ve projelerin `starts_on`/`target_on` alanlarını sorgu anında kilometre taşlarına dönüştürür. Bu tarihleri ikinci bir etkinlik kaydına kopyalamaz. Görev/proje modül izni yoksa o kaydın tarihleri yanıtlanmaz. Kayda erişim ayrıca görev ataması/oluşturan/proje üyeliği veya proje sahibi/üyeliği üzerinden denetlenir.

## Tarih aralığı ve saat dilimi

API `from` dahil, `to` hariç tarih aralığı kabul eder. Aralık en fazla 93 gündür. Saatli etkinliklerle aralık kesişimi `Europe/Istanbul` gün sınırlarına göre hesaplanır. İstemci saatleri aynı saat diliminde gösterir; DB'deki `timestamptz` değerleri mutlak zamanı korur.

## Sonraki geliştirme kapıları

1. Takvim hatırlatmaları için güvenilir arka plan zamanlayıcısı, transactional outbox, idempotency ve kullanıcı tercihleri.
2. Yasal süre kuralları için süreç türü, tetikleyici olay, başlangıç/bitiş dahil etme, iş günü/tatil politikası, saat dilimi ve mevzuat sürümünü içeren onaylı kural seti.
3. İDK/kurum görüşü/e-ÇED kayıtlarının proje ve takvimle ilişkilendirilmesi.
4. Windows tarayıcı ve üretim reverse-proxy kabul testleri.

Yasal süre hesabı, yetkili süreç sahibi ve güncel mevzuat kaynağı onayı olmadan otomatik olarak kesin tarih üretmemelidir.
