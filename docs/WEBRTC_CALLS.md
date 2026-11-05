# Bire bir WebRTC aramaları

## İlk sürüm kapsamı
- Yalnızca bire bir sohbet içinde sesli veya görüntülü arama başlatılabilir.
- Aranan taraf gelen çağrıyı kabul edebilir veya reddedebilir; katılımcılardan biri çağrıyı bitirebilir.
- Oturum ve sinyalleşme kayıtları PostgreSQL'de tutulur. SDP ve ICE içerikleri yalnızca çağrının iki katılımcısına döndürülür.
- Sinyalleşme olayları mevcut sohbet SSE kanalından yalnızca “çağrı değişti” sinyaliyle duyurulur; SDP/ICE içeriği SSE kanalında yayınlanmaz.
- SDP boyutu, ICE aday boyutu ve aday adedi sınırlandırılır; çağrı/mesaj erişimi etkin sohbet üyeliğine bağlıdır.
- Arama çalma süresi 45 saniyedir. Cevaplanmayan çağrı kullanıcı sonraki durum sorguladığında “missed” olarak sonlandırılır.

## STUN ve TURN
Uygulama, arama başlatıldığında API'den kullanıcıya özgü ICE sunucu yapılandırması alır.

- CHAT_STUN_URLS: virgülle ayrılmış STUN URL listesi. Örnek biçim: `stun:stun.example.com:3478`.
- CHAT_TURN_URLS: virgülle ayrılmış TURN/TURNS URL listesi. Örnek biçim: `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp`.
- CHAT_TURN_SHARED_SECRET: coturn sunucusunun `static-auth-secret` değeriyle aynı, en az 32 karakterlik gizli anahtar.
- CHAT_TURN_TTL_SECONDS: geçici TURN kimliğinin ömrü; 600–86400 saniye aralığında. Varsayılan 43200 saniyedir.

TURN geçici kimlik bilgileri coturn REST shared-secret yöntemine göre HMAC-SHA1 ile üretilir; uzun ömürlü kullanıcı/parola tarayıcıya verilmez. TURN yapılandırması olmadan tarayıcı yalnızca yerel/uygun ağ eşleşmelerini deneyebilir. Bu, farklı ev/ofis ağlarında çağrının kesin kurulacağı anlamına gelmez. İnternet üzerinden güvenilir NAT geçişi için erişilebilir ve doğru yapılandırılmış TURN/TLS hizmeti gerekir.

## Dağıtım gereksinimleri
- Gerçek kullanıcılar için HTTPS zorunludur; tarayıcı mikrofon/kamera izinleri güvenli bağlam ister (localhost geliştirme istisnası).
- TURN portları, UDP/TCP/TLS erişimi ve ağ güvenlik duvarı kuralları barındırma tarafında ayrıca yapılandırılmalıdır. Bu kod değişikliği herhangi bir şirket ağını veya NAS'ı değiştirmez.
- Production ortamında TURN shared secret sadece API sunucusunun secret/environment store'unda tutulmalıdır.
- Çağrı sinyalleşmesi HTTPS API + PostgreSQL + SSE kullanır; medya akışı WebRTC peer connection üzerinden taşınır. TURN kullanılırsa medya TURN relay üzerinden geçebilir.
- Bu özellik **uçtan uca şifreleme (E2EE) olarak sunulmaz**. WebRTC medya taşıması DTLS-SRTP ile korunur; ancak uygulama sunucusu çağrı sinyalleşmesine erişebilir ve ayrı istemci tarafı anahtar yönetimi bu sürümde yoktur.

## Sınırlar
- Grup araması, arama geçmişi arayüzü, ekran paylaşımı, arama kaydı ve E2EE kapsam dışıdır.
- Gerçek ses/video kalite ve NAT geçişi testi için TURN hizmeti ve iki ayrı gerçek ağda tarayıcı testi gerekir. CI yalnızca API sinyalleşme/üyelik/oturum durumunu doğrular.
