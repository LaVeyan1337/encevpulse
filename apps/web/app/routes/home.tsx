import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { applyTheme, readSavedTheme, type Theme } from '../theme';
import { Workspace } from '../components/workspace';
import { Drawer } from '../components/drawer';

interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  roles: string[];
}

interface ManagedUser extends User {
  status: 'active' | 'disabled';
  createdAt: string;
}

type ViewState =
  | { status: 'checking' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User; csrfToken: string }
  | { status: 'unavailable' };

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function meta() {
  return [
    { title: 'Giriş | ENCEV PULSE' },
    { name: 'description', content: 'ENCEV PULSE kullanıcı girişi.' },
  ];
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [view, setView] = useState<ViewState>({ status: 'checking' });
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [temporaryCredential, setTemporaryCredential] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [newUser, setNewUser] = useState({ displayName: '', username: '', email: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const savedTheme = readSavedTheme(window.localStorage);
    setTheme(savedTheme);
    applyTheme(savedTheme, document.documentElement, window.localStorage);

    void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('session');
        const result = await readBody(response);
        if (result.authenticated && result.user && typeof result.csrfToken === 'string') {
          setView({
            status: 'authenticated',
            user: result.user as User,
            csrfToken: result.csrfToken,
          });
        } else {
          setView({ status: 'anonymous' });
        }
      })
      .catch(() => setView({ status: 'unavailable' }));
  }, []);

  useEffect(() => {
    if (
      view.status !== 'authenticated' ||
      view.user.mustChangePassword ||
      !view.user.roles.includes('system_admin')
    )
      return;
    let cancelled = false;
    void fetch('/api/auth/users', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await readBody(response);
        if (!response.ok) throw new Error('users');
        if (!cancelled)
          setManagedUsers(Array.isArray(result.users) ? (result.users as ManagedUser[]) : []);
      })
      .catch(() => {
        if (!cancelled)
          setAdminError('Kullanıcı listesi alınamadı. Sayfayı yenileyip tekrar deneyin.');
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next, document.documentElement, window.localStorage);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const challengeResponse = await fetch('/api/auth/csrf', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const challenge = await readBody(challengeResponse);
      if (challengeResponse.status === 429) {
        setError('Çok fazla giriş denemesi yapıldı. Bir süre sonra yeniden deneyin.');
        return;
      }
      if (!challengeResponse.ok || typeof challenge.csrfToken !== 'string') {
        throw new Error('challenge');
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': challenge.csrfToken,
        },
        body: JSON.stringify({ identifier, password }),
      });
      const result = await readBody(response);
      if (!response.ok) {
        if (response.status === 429 || result.code === 'LOGIN_RATE_LIMITED') {
          setError('Çok fazla giriş denemesi yapıldı. Bir süre sonra yeniden deneyin.');
        } else if (response.status === 401) {
          setError('E-posta/kullanıcı adı veya parola hatalı.');
        } else if (response.status === 403) {
          setError('Güvenlik doğrulaması yenilenemedi. Sayfayı yenileyip tekrar deneyin.');
        } else {
          setError('Giriş şu anda tamamlanamadı. Bir süre sonra yeniden deneyin.');
        }
        return;
      }

      setPassword('');
      setError('');
      setTemporaryCredential(null);
      setAdminMessage('');
      setAdminError('');
      setManagedUsers([]);
      setView({
        status: 'authenticated',
        user: result.user as User,
        csrfToken: result.csrfToken as string,
      });
    } catch {
      setError('Giriş şu anda tamamlanamadı. Bir süre sonra yeniden deneyin.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Yeni parolalar eşleşmiyor.');
      return;
    }
    if (view.status !== 'authenticated') return;

    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': view.csrfToken,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await readBody(response);
      if (!response.ok) {
        setError(typeof result.message === 'string' ? result.message : 'Parola değiştirilemedi.');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setView({
        status: 'authenticated',
        user: result.user as User,
        csrfToken: result.csrfToken as string,
      });
    } catch {
      setError('Parola değiştirilemedi. Bir süre sonra yeniden deneyin.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (view.status !== 'authenticated') return;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': view.csrfToken },
        body: '{}',
      });
      if (!response.ok) throw new Error('logout');
      setTemporaryCredential(null);
      setManagedUsers([]);
      setAdminMessage('');
      setAdminError('');
      setView({ status: 'anonymous' });
    } catch {
      setError('Oturum kapatılamadı. Yeniden deneyin.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view.status !== 'authenticated') return;
    setAdminError('');
    setAdminMessage('');
    setTemporaryCredential(null);
    setBusy(true);
    try {
      const response = await fetch('/api/auth/users', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': view.csrfToken },
        body: JSON.stringify(newUser),
      });
      const result = await readBody(response);
      if (!response.ok) {
        setAdminError(
          typeof result.message === 'string' ? result.message : 'Kullanıcı oluşturulamadı.',
        );
        return;
      }
      const user = result.user as ManagedUser;
      setManagedUsers((users) =>
        [...users, user].sort((left, right) =>
          left.displayName.localeCompare(right.displayName, 'tr'),
        ),
      );
      setTemporaryCredential({
        username: user.username,
        password: String(result.temporaryPassword),
      });
      setAdminMessage('Kullanıcı hesabı oluşturuldu. Geçici parolayı güvenli yoldan iletin.');
      setNewUser({ displayName: '', username: '', email: '' });
      setUserDrawerOpen(false);
    } catch {
      setAdminError('Kullanıcı oluşturulamadı. Bir süre sonra yeniden deneyin.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(user: ManagedUser) {
    if (view.status !== 'authenticated') return;
    setAdminError('');
    setAdminMessage('');
    setTemporaryCredential(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/users/${user.id}/reset-password`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': view.csrfToken },
      });
      const result = await readBody(response);
      if (!response.ok) {
        setAdminError(
          typeof result.message === 'string' ? result.message : 'Geçici parola üretilemedi.',
        );
        return;
      }
      setTemporaryCredential({
        username: user.username,
        password: String(result.temporaryPassword),
      });
      setManagedUsers((users) =>
        users.map((item) => (item.id === user.id ? { ...item, mustChangePassword: true } : item)),
      );
      setAdminMessage('Geçici parola üretildi; kullanıcının önceki oturumları kapatıldı.');
    } catch {
      setAdminError('Geçici parola üretilemedi. Bir süre sonra yeniden deneyin.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisableUser(user: ManagedUser) {
    if (view.status !== 'authenticated' || user.id === view.user.id || user.status === 'disabled')
      return;
    if (
      !window.confirm(
        `${user.displayName} hesabı devre dışı bırakılacak ve açık oturumları kapatılacak. Devam edilsin mi?`,
      )
    )
      return;
    setAdminError('');
    setAdminMessage('');
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/users/${user.id}/disable`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': view.csrfToken },
        body: '{}',
      });
      const result = await readBody(response);
      if (!response.ok) {
        setAdminError(
          typeof result.message === 'string' ? result.message : 'Kullanıcı devre dışı bırakılamadı.',
        );
        return;
      }
      setManagedUsers((users) =>
        users.map((item) => (item.id === user.id ? { ...item, status: 'disabled' } : item)),
      );
      setAdminMessage('Kullanıcı hesabı devre dışı bırakıldı.');
    } catch {
      setAdminError('Kullanıcı devre dışı bırakılamadı. Bir süre sonra yeniden deneyin.');
    } finally {
      setBusy(false);
    }
  }

  const handleSessionExpired = useCallback(() => setView({ status: 'anonymous' }), []);

  if (view.status === 'authenticated' && !view.user.mustChangePassword) {
    const activeCount = managedUsers.filter((u) => u.status === 'active').length;
    const disabledCount = managedUsers.filter((u) => u.status === 'disabled').length;

    return (
      <Workspace
        user={view.user}
        csrfToken={view.csrfToken}
        theme={theme}
        onTheme={toggleTheme}
        onLogout={() => void handleLogout()}
        onExpired={handleSessionExpired}
      >
        {view.user.roles.includes('system_admin') && (
          <section className="admin-panel workspace-admin" aria-labelledby="user-management-title">
            {/* Admin Header with stats and action button */}
            <div className="admin-header-row">
              <div className="admin-stats-group">
                <div className="admin-stat-pill">
                  <span className="stat-label">Toplam:</span>
                  <strong>{managedUsers.length}</strong>
                </div>
                <div className="admin-stat-pill">
                  <span className="stat-label">Etkin:</span>
                  <strong className="stat-active">{activeCount}</strong>
                </div>
                {disabledCount > 0 && (
                  <div className="admin-stat-pill">
                    <span className="stat-label">Devre Dışı:</span>
                    <strong className="stat-disabled">{disabledCount}</strong>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="primary-button compact-button"
                onClick={() => {
                  setAdminError('');
                  setAdminMessage('');
                  setUserDrawerOpen(true);
                }}
              >
                Yeni Kullanıcı Ekle
              </button>
            </div>

            {/* Temporary Credential Notice */}
            {temporaryCredential && (
              <div className="temporary-credential" role="status">
                <div className="temp-credential-header">
                  <strong>Geçici Parola Üretildi · {temporaryCredential.username}</strong>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(temporaryCredential.password);
                      setCopiedPassword(true);
                      setTimeout(() => setCopiedPassword(false), 2000);
                    }}
                  >
                    {copiedPassword ? 'Kopyalandı' : 'Parolayı Kopyala'}
                  </button>
                </div>
                <code>{temporaryCredential.password}</code>
                <p>
                  Bu geçici parola 24 saat geçerlidir ve kullanıcı ilk girişte parolasını değiştirmeye
                  zorlanacaktır. Güvenli bir kanaldan iletin.
                </p>
              </div>
            )}

            {adminMessage && (
              <p className="workspace-success" role="status">
                {adminMessage}
              </p>
            )}
            {adminError && (
              <p className="auth-error" role="alert">
                {adminError}
              </p>
            )}

            {/* Managed Users Table */}
            <div className="user-table-wrap" aria-live="polite">
              {managedUsers.length === 0 ? (
                <div className="empty-state">
                  <span>Kayıtlı çalışan hesabı bulunamadı.</span>
                </div>
              ) : (
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Çalışan</th>
                      <th>Kullanıcı Adı</th>
                      <th>Rol</th>
                      <th>Durum</th>
                      <th>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedUsers.map((u) => {
                      const isSelf = u.id === view.user.id;
                      const isAdmin = u.roles?.includes('system_admin');
                      return (
                        <tr key={u.id} className={u.status === 'disabled' ? 'row-disabled' : ''}>
                          <td>
                            <div className="user-cell">
                              <span className="assignee-avatar-sm">
                                {u.displayName.trim().slice(0, 1).toLocaleUpperCase('tr-TR')}
                              </span>
                              <div className="user-cell-meta">
                                <strong>{u.displayName}</strong>
                                <span>{u.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <code className="username-code">@{u.username}</code>
                          </td>
                          <td>
                            <span className={isAdmin ? 'role-badge-admin' : 'role-badge'}>
                              {isAdmin ? 'Sistem Yöneticisi' : 'Çalışan'}
                            </span>
                          </td>
                          <td>
                            <span className={`user-status user-status-${u.status}`}>
                              {u.status === 'active' ? 'Etkin' : 'Devre dışı'}
                            </span>
                          </td>
                          <td>
                            <div className="user-row-actions">
                              <button
                                type="button"
                                className="user-action-button"
                                onClick={() => void handleResetPassword(u)}
                                disabled={busy || u.status !== 'active' || isSelf}
                                title="Geçici yeni parola üret"
                              >
                                Parola yenile
                              </button>
                              <button
                                type="button"
                                className="user-action-button user-action-danger"
                                onClick={() => void handleDisableUser(u)}
                                disabled={busy || u.status !== 'active' || isSelf}
                                title="Hesabı askıya al"
                              >
                                Devre dışı bırak
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {managedUsers.length >= 200 && (
              <p className="user-list-note">İlk 200 kullanıcı gösteriliyor.</p>
            )}

            {/* Slide-over User Creation Drawer */}
            <Drawer
              isOpen={userDrawerOpen}
              onClose={() => setUserDrawerOpen(false)}
              size="md"
              title="Yeni Çalışan Hesabı"
              subtitle="Çalışan bilgilerini girerek sisteme dahil edin"
              ariaLabelledBy="user-create-drawer-title"
              footer={
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setUserDrawerOpen(false)}
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    form="user-create-form"
                    className="primary-button"
                    disabled={busy}
                  >
                    {busy ? 'Kaydediliyor…' : 'Kullanıcı oluştur'}
                  </button>
                </>
              }
            >
              <form id="user-create-form" className="drawer-form" onSubmit={handleCreateUser}>
                <div className="form-group">
                  <label htmlFor="new-display-name">Ad Soyad</label>
                  <input
                    id="new-display-name"
                    value={newUser.displayName}
                    onChange={(event) =>
                      setNewUser({ ...newUser, displayName: event.target.value })
                    }
                    maxLength={120}
                    placeholder="Örn: Ahmet Yılmaz"
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="new-username">Kullanıcı Adı</label>
                  <input
                    id="new-username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={newUser.username}
                    onChange={(event) =>
                      setNewUser({ ...newUser, username: event.target.value.toLowerCase() })
                    }
                    minLength={2}
                    maxLength={32}
                    placeholder="Örn: ahmetyilmaz (küçük harf)"
                    required
                  />
                  <p className="field-hint">Giriş yaparken veya atamalarda kullanılacaktır.</p>
                </div>

                <div className="form-group">
                  <label htmlFor="new-email">Kurumsal E-posta</label>
                  <input
                    id="new-email"
                    type="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={newUser.email}
                    onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                    maxLength={254}
                    placeholder="Örn: ahmet@encev.com.tr"
                    required
                  />
                </div>

                <div className="drawer-notice-box">
                  <p>
                    Hesap oluşturulduğunda sistem tarafından tek kullanımlık güvenli geçici bir parola
                    üretilecektir. Bu parola ilk oturum açılışında değiştirilmelidir.
                  </p>
                </div>

                {adminError && (
                  <p className="auth-error" role="alert">
                    {adminError}
                  </p>
                )}
              </form>
            </Drawer>
          </section>
        )}
      </Workspace>
    );
  }

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <a className="brand" href="/" aria-label="ENCEV PULSE">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-name">
            ENCEV<span> PULSE</span>
          </span>
        </a>
        <button
          className="theme-button"
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span>
          <span>{theme === 'dark' ? 'Açık tema' : 'Koyu tema'}</span>
        </button>
      </header>

      <main className="auth-main">
        {view.status === 'checking' && (
          <p className="auth-status" role="status">
            Oturum kontrol ediliyor.
          </p>
        )}

        {view.status === 'unavailable' && (
          <section className="auth-card" aria-labelledby="unavailable-title">
            <h1 id="unavailable-title">Giriş yapılamıyor</h1>
            <p className="auth-description">
              Şu anda giriş bilgileri doğrulanamıyor. Bir süre sonra yeniden deneyin.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Yeniden dene
            </button>
          </section>
        )}

        {view.status === 'anonymous' && (
          <section className="auth-card" aria-labelledby="login-title">
            <p className="auth-section-label">ENCEV PULSE</p>
            <h1 id="login-title">Giriş</h1>
            <form className="auth-form" onSubmit={handleLogin}>
              <label htmlFor="identifier">E-posta veya kullanıcı adı</label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
                autoFocus
              />

              <label htmlFor="password">Parola</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
              </button>
            </form>
          </section>
        )}

        {view.status === 'authenticated' && view.user.mustChangePassword && (
          <section className="auth-card" aria-labelledby="change-password-title">
            <p className="auth-section-label">{view.user.displayName}</p>
            <h1 id="change-password-title">Parolanızı değiştirin</h1>
            <p className="auth-description">Devam etmek için yeni bir parola belirleyin.</p>
            <form className="auth-form" onSubmit={handlePasswordChange}>
              <label htmlFor="current-password">Mevcut parola</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <label htmlFor="new-password">Yeni parola</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <label htmlFor="confirm-password">Yeni parola tekrar</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? 'Kaydediliyor…' : 'Parolayı değiştir'}
              </button>
            </form>
          </section>
        )}
      </main>
      <footer className="auth-footer">EnÇev</footer>
    </div>
  );
}
