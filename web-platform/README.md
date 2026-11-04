# ENCEV PULSE — Web Platformı

Bu klasör, ENCEV PULSE web uygulaması için ayrılmıştır. Depo kökündeki eski Python masaüstü uygulaması ve onun dosyalarıyla karıştırılmamalıdır.

## 4 Kasım 2026 kaynak snapshot'ının kapsamı

- React Router 7 / Vite web istemcisi
- NestJS API ve PostgreSQL migration'ları
- Kimlik doğrulama, rol/modül izinleri (RBAC)
- Görevler, projeler, çalışan rehberi ve kalıcı sohbet
- Takvim
- ÇED süreç takibi, belge referansları, kurum görüşleri ve İDK kayıtları

## Doğrulama sınırı

4 Kasım 2026 kaynak snapshot'ında web kaynak testleri 15/15 geçmiştir. API entegrasyon testleri, PostgreSQL migration uygulaması, TypeScript kontrolleri ve üretim derlemeleri henüz doğrulanmamıştır. API workspace Node >=24.7.0 gerektirir.

## Sıradaki işler

1. Node >=24.7.0 ile temiz bağımlılık kurulumu.
2. Yalnızca test amaçlı, ayrı PostgreSQL veritabanında migration ve API entegrasyon testleri.
3. İki workspace TypeScript kontrolleri ve API/Web üretim derlemeleri.
4. Tarayıcıda giriş, rol/izin, görev, takvim ve ÇED akışlarının görsel/işlevsel kabulü.
5. Güvenli dosya depolama, transactional outbox/hatırlatmalar ve onaylı yasal süre kuralları için ayrı geliştirme dilimleri.

## Güvenlik

Gerçek şirket dosya sunucusu adresi ve kimlik bilgileri bu genel depoya konulmamalıdır. Gerçek NAS/SMB bağlantısı ve dosya aktarımı etkin değildir. ÇED belge kayıtları dosya baytlarını değil, metaveri ve kaynak referansını saklar.

> Not: Bu commit klasörün indeksini oluşturur. Tam kaynak snapshot ZIP'i bu commit'e henüz eklenmemiştir; binary dosya aktarımı mevcut GitHub yazma aracı üzerinden desteklenmediği için eklenmiş gibi gösterilmemektedir.
