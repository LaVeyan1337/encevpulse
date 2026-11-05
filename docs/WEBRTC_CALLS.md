# Bire bir WebRTC aramaları

## İlk sürüm kapsamı
- Yalnızca bire bir sohbet içinde sesli veya görüntülü arama başlatılabilir.
- Aranan taraf gelen çağrıyı kabul edebilir veya reddedebilir; katılımcılardan biri çağrıyı bitirebilir.
- Çağrı oturumları PostgreSQL'de tutulur. SDP ve ICE içerikleri yalnızca etkin çağrı sırasında iki katılımcıya döndürülür; çağrı bittiğinde, reddedildiğinde veya zaman aşımına uğradığında sinyal payload'ları veritabanından silinir.
- Sinyalleşme olayları mevcut sohbet SSE kanalından yalnızca “çağrı değişti” sinyaliyle duyurulur; SDP/ICE içeriği SSE kanalında yayınlanmaz.
- SDP boyutu, ICE aday boyutu ve aday adedi sınırlandırılır; çağrı/mesaj erişimi etkin sohbet üyeliğine bağlıdır.
- Arama çalma süresi 45 saniyedir. Cevaplanmayan çağrı sonraki durum sorgusunda “missed” olarak sonlandırılır. Kabul edilmiş çağrıda iki katılımcı da 20 saniyede bir heartbeat gönderir; taraflardan biri 120 saniye sessiz kalırsa çağrı sonlandırılır.

## STUN ve TURN
Uygulama, arama başlatıldığında API'den kullanıcıya özgü ICE sunucu yapılandırması alır.

- CHAT_STUN_URLS: isteğe bağlı, virgülle ayrılmış STUN URL listesi. Boş bırakılırsa ücretsiz `stun:stun.l.google.com:19302` varsayılan olarak kullanılır; istenirse şirketin kendi STUN adresleriyle değiştirilebilir.
- CHAT_TURN_URLS: isteğe bağlı TURN/TURNS URL listesi. Örnek biçim: `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp`.
- CHAT_TURN_SHARED_SECRET: yalnız TURN kullanılıyorsa coturn sunucusunun `static-auth-secret` değeriyle aynı, en az 32 karakterlik gizli anahtar.
- CHAT_TURN_TTL_SECONDS: TURN kullanılıyorsa geçici kimliğin ömrü; 600–86400 saniye aralığında. Varsayılan 43200 saniyedir.

**Ücretsiz varsayılan kurulumda TURN yoktur ve ek sunucu kurulmaz.** STUN yalnızca eşlerin genel ağ adreslerini keşfetmesine yardım eder; ses/video trafiğini taşımaz. Pek çok ağda doğrudan WebRTC bağlantısı kurulur. Ancak simetrik NAT, katı güvenlik duvarı veya UDP engeli olan bazı ev/ofis/mobil ağ kombinasyonlarında TURN olmadan bağlantı kurulamayabilir. Bu durumda özellik ücretli hizmete otomatik geçmez; kullanıcıya bağlantı kurulamadığı bildirilir. İleride kurumun zaten işlettiği uygun bir relay varsa, isteğe bağlı TURN yapılandırılabilir.

TURN geçici kimlik bilgileri coturn REST shared-secret yöntemine göre HMAC-SHA1 ile üretilir; uzun ömürlü kullanıcı/parola tarayıcıya verilmez.

## Dağıtım gereksinimleri
- Gerçek kullanıcılar için HTTPS zorunludur; tarayıcı mikrofon/kamera izinleri güvenli bağlam ister (localhost geliştirme istisnası).
- TURN portları, UDP/TCP/TLS erişimi ve ağ güvenlik duvarı kuralları barındırma tarafında ayrıca yapılandırılmalıdır. Bu kod değişikliği herhangi bir şirket ağını veya NAS'ı değiştirmez.
- Production ortamında TURN shared secret sadece API sunucusunun secret/environment store'unda tutulmalıdır.
- Çağrı sinyalleşmesi HTTPS API + PostgreSQL + SSE kullanır; medya akışı WebRTC peer connection üzerinden taşınır. TURN kullanılırsa medya TURN relay üzerinden geçebilir.
- Bu özellik **uçtan uca şifreleme (E2EE) olarak sunulmaz**. WebRTC medya taşıması DTLS-SRTP ile korunur; ancak uygulama sunucusu çağrı sinyalleşmesine erişebilir ve ayrı istemci tarafı anahtar yönetimi bu sürümde yoktur.

## Kullanım sınırı
Gelen arama penceresi, kullanıcının Sohbet modülüne geçmesini beklemeden PULSE'un diğer modüllerinde de gösterilir. Sohbet modülüne görüntü izni bulunan kullanıcıda arka plan Sohbet bileşeni oturum boyunca bağlı kalır; çağrı durumu SSE olayıyla anlık, yedek sorguyla modül arka plandayken 10 saniyede bir kontrol edilir. Gelen arama kabul edildiğinde ilgili sohbet açılır; arama penceresi uygulamanın üst katmanında kalır. Sayfa yenileme, oturum kapatma veya sohbet görüntü izninin kaldırılması bileşeni sonlandırır; etkin arama da kapatılır. Sunucu heartbeat zaman aşımı ayrıca 120 saniyedir.

## Sınırlar
- Grup araması, arama geçmişi arayüzü, ekran paylaşımı, arama kaydı ve E2EE kapsam dışıdır.
- Gerçek ses/video kalite ve NAT geçişi testi için TURN hizmeti ve iki ayrı gerçek ağda tarayıcı testi gerekir. CI yalnızca API sinyalleşme/üyelik/oturum durumunu doğrular.
