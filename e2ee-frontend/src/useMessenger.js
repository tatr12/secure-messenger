import { useState, useEffect, useRef } from 'react';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  createKeyEnvelopeV2,
  decryptMessagePacket,
  fetchKeyEnvelope,
  importVerifiedPrivateKey,
  unlockKeyEnvelope,
  updateKeyEnvelope,
} from './crypto';
import { createSessionLifecycle } from './sessionLifecycle';
import {
  getSessionRefreshDelay,
  refreshSession,
  revokeSession,
} from './sessionApi';
import { buildWebSocketProtocols, buildWebSocketUrl } from './websocketUrl';

// Укажи путь к звуковому файлу (из папки public или внешний URL)
const NOTIFICATION_SOUND_URL = '/audio_2026-06-13_23-53-24.mp3';
const DEFAULT_BIO = 'В сети СМЕРТЬ В НИЩЕТЕ';

export function useMessenger() {
  const [isRegMode, setIsRegMode] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState(DEFAULT_BIO);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [activeChatUser, setActiveChatUser] = useState('');
  const [chatPartners, setChatPartners] = useState([]);
  const [userCache, setUserCache] = useState({});
  const [message, setMessage] = useState('');
  const [allMessages, setAllMessages] = useState([]);
  const [wsStatus, setWsStatus] = useState('offline');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [viewingPartnerProfile, setViewingPartnerProfile] = useState(null);
  const [searchQuery, setSearchQueryState] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Новый стейт для хранения кастомных пуш-уведомлений
  const [toasts, setToasts] = useState([]);

  const outboundQueueRef = useRef([]);
  const myKeysRef = useRef({ publicKey: null, privateKey: null });
  const sessionTokenRef = useRef(null);
  const sessionRefreshPromiseRef = useRef(null);
  const sessionRevocationPromiseRef = useRef(null);
  const wsRef = useRef(null);
  const sessionLifecycleRef = useRef(null);

  if (sessionLifecycleRef.current === null) {
    sessionLifecycleRef.current = createSessionLifecycle();
  }

  // Реф для аудио, чтобы не создавать экземпляр при каждом рендере
  const audioRef = useRef(null);
  // Флаг — разблокирован ли звук после первого клика
  const audioUnlockedRef = useRef(false);

  const userCacheRef = useRef({});
  const inFlightFetchesRef = useRef(new Set());
  const nextToastIdRef = useRef(0);

  const setSearchQuery = (nextQuery) => {
    setSearchQueryState(nextQuery);
    if (!nextQuery.trim()) {
      setSearchResults([]);
    }
  };

  const closeCurrentWebSocket = (reason) => {
    const currentWebSocket = wsRef.current;
    wsRef.current = null;

    if (!currentWebSocket) return;

    try {
      currentWebSocket.close(1000, reason);
    } catch (error) {
      console.warn('[WS] Не удалось закрыть соединение', error);
    }
  };

  const beginSession = () => {
    const generation = sessionLifecycleRef.current.begin();
    closeCurrentWebSocket('Starting a new session');
    outboundQueueRef.current = [];
    setWsStatus('offline');
    return generation;
  };

  function scheduleSessionRefresh(user, sessionGeneration, expiresIn) {
    sessionLifecycleRef.current.scheduleRefresh(
      sessionGeneration,
      () => {
        void refreshAccessToken(user, sessionGeneration);
      },
      getSessionRefreshDelay(expiresIn),
    );
  }

  async function refreshAccessToken(user, sessionGeneration) {
    const lifecycle = sessionLifecycleRef.current;
    if (!lifecycle.isActive(sessionGeneration)) return;

    if (sessionRefreshPromiseRef.current) {
      return sessionRefreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const data = await refreshSession();
        if (!lifecycle.isActive(sessionGeneration)) return;

        sessionTokenRef.current = data.access_token;
        scheduleSessionRefresh(user, sessionGeneration, data.expires_in);
        initWebSocket(user, data.access_token, sessionGeneration);
        return data.access_token;
      } catch (error) {
        if (!lifecycle.isActive(sessionGeneration)) return;

        if (error?.status === 401) {
          await terminateSession('session-expired', { revokeRemote: false });
          showNotification(
            'Сессия завершена. Войдите в аккаунт снова.',
            'error',
          );
          return;
        }

        lifecycle.scheduleRefresh(
          sessionGeneration,
          () => {
            void refreshAccessToken(user, sessionGeneration);
          },
          15_000,
        );
      }
    })();

    sessionRefreshPromiseRef.current = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      if (sessionRefreshPromiseRef.current === refreshPromise) {
        sessionRefreshPromiseRef.current = null;
      }
    }
  }

  // Инициализируем аудио-движок на фронте
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);

    // Разблокировка автозапуска: при первом клике/тапе на странице
    // делаем play().pause() — это снимает блокировку браузера
    const unlockAudio = () => {
      if (!audioUnlockedRef.current && audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          audioUnlockedRef.current = true;
          console.log('[Audio] Звук разблокирован!');
        }).catch(() => { });
      }
    };

    document.addEventListener('click', unlockAudio, { once: false });
    document.addEventListener('keydown', unlockAudio, { once: false });

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    return () => {
      sessionLifecycleRef.current.end();
      closeCurrentWebSocket('Application unmounted');
      outboundQueueRef.current = [];
      myKeysRef.current = { publicKey: null, privateKey: null };
      sessionTokenRef.current = null;
      sessionRefreshPromiseRef.current = null;
    };
  }, []);

  useEffect(() => {
    userCacheRef.current = userCache;
  }, [userCache]);

  // Живой поиск
  useEffect(() => {
    if (!searchQuery.trim()) return;

    const sessionGeneration = sessionLifecycleRef.current.currentGeneration();
    const abortController = new AbortController();
    const delayDebounce = setTimeout(async () => {
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

      try {
        const res = await fetch(`/search?q=${searchQuery}&exclude=${username}`, {
          signal: abortController.signal,
        });
        if (
          res.ok &&
          sessionLifecycleRef.current.isActive(sessionGeneration)
        ) {
          const data = await res.json();
          if (sessionLifecycleRef.current.isActive(sessionGeneration)) {
            setSearchResults(data);
          }
        }
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      }
    }, 200);
    return () => {
      clearTimeout(delayDebounce);
      abortController.abort();
    };
  }, [searchQuery, username]);

  // Функция вызова красивого киберпанк-уведомления
  const showNotification = (msgText, type = 'success', title = null) => {
    nextToastIdRef.current += 1;
    const id = nextToastIdRef.current;
    setToasts((prev) => [...prev, { id, message: msgText, type, title, fadeOut: false }]);

    // Автоматическое скрытие через 4 секунды, если пользователь не закрыл сам
    setTimeout(() => {
      dismissToast(id);
    }, 4000);
  };

  // Функция ручного закрытия тоста (с анимацией)
  const dismissToast = (id) => {
    setToasts((prev) => prev.map(t => t.id === id ? { ...t, fadeOut: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  };

  // Воспроизведение звука входящего сообщения
  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0; // Сброс в начало, если сообщения летят пачкой
      audioRef.current.play().catch(e => console.log("[Audio] Воспроизведение заблокировано браузером до первого клика", e));
    }
  };

  async function fetchAndCacheUser(login) {
    if (!login) return '';
    const sessionGeneration = sessionLifecycleRef.current.currentGeneration();
    if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return '';

    const cleanLogin = login.trim().toLowerCase();

    if (userCacheRef.current[cleanLogin]) return userCacheRef.current[cleanLogin];
    if (inFlightFetchesRef.current.has(cleanLogin)) return cleanLogin;
    inFlightFetchesRef.current.add(cleanLogin);
    try {
      const res = await fetch(`/user/${cleanLogin}`);
      if (
        res.ok &&
        sessionLifecycleRef.current.isActive(sessionGeneration)
      ) {
        const data = await res.json();
        if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return '';
        setUserCache(prev => ({ ...prev, [cleanLogin]: data.display_name }));
        return data.display_name;
      }
    } catch (e) { console.error(e); }
    finally {
      inFlightFetchesRef.current.delete(cleanLogin);
    }
    return cleanLogin;
  }

  async function inspectPartnerProfile(partnerLogin) {
    const sessionGeneration = sessionLifecycleRef.current.currentGeneration();
    if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

    try {
      const res = await fetch(`/user/${partnerLogin}`);
      if (
        res.ok &&
        sessionLifecycleRef.current.isActive(sessionGeneration)
      ) {
        const data = await res.json();
        if (sessionLifecycleRef.current.isActive(sessionGeneration)) {
          setViewingPartnerProfile(data);
        }
      }
    } catch (e) { console.error(e); }
  }

  async function tryStartChat(targetLogin) {
    const cleanTarget = targetLogin.trim();
    if (!cleanTarget || cleanTarget === username) return false;
    const sessionGeneration = sessionLifecycleRef.current.currentGeneration();
    if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return false;

    try {
      const res = await fetch(`/user/${cleanTarget}`);
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return false;

      if (!res.ok) {
        showNotification(`Ошибка доступа: Субъект @${cleanTarget} не зарегистрирован в сети.`, 'error');
        return false;
      }
      const data = await res.json();
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return false;

      setUserCache(prev => ({ ...prev, [cleanTarget]: data.display_name }));
      setChatPartners(prev => prev.includes(cleanTarget) ? prev : [...prev, cleanTarget]);
      setActiveChatUser(cleanTarget);
      setSearchQuery('');
      setSearchResults([]);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async function changeProfileData(newName, newBio) {
    if (!newName.trim()) return;
    const sessionGeneration = sessionLifecycleRef.current.currentGeneration();
    if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

    try {
      const res = await fetch('/user/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionTokenRef.current}`,
        },
        body: JSON.stringify({ display_name: newName, bio: newBio })
      });
      if (
        res.ok &&
        sessionLifecycleRef.current.isActive(sessionGeneration)
      ) {
        const data = await res.json();
        if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

        setDisplayName(data.display_name);
        setBio(data.bio);
        setUserCache(prev => ({ ...prev, [username]: data.display_name }));
      }
    } catch (e) { console.error(e); }
  }

  async function loadSessions() {
    const lifecycle = sessionLifecycleRef.current;
    const sessionGeneration = lifecycle.currentGeneration();
    if (!lifecycle.isActive(sessionGeneration)) return;

    setSessionsLoading(true);
    try {
      const requestSessions = () => fetch('/sessions', {
        headers: { Authorization: `Bearer ${sessionTokenRef.current}` },
        cache: 'no-store',
      });
      let response = await requestSessions();

      if (response.status === 401 && lifecycle.isActive(sessionGeneration)) {
        await refreshAccessToken(username, sessionGeneration);
        if (!lifecycle.isActive(sessionGeneration)) return;
        response = await requestSessions();
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (lifecycle.isActive(sessionGeneration)) {
        setSessions(data);
      }
    } catch (error) {
      if (lifecycle.isActive(sessionGeneration)) {
        console.error('[AUTH] Не удалось получить список сессий', error);
        showNotification('Не удалось загрузить активные сессии.', 'error');
      }
    } finally {
      if (lifecycle.isActive(sessionGeneration)) {
        setSessionsLoading(false);
      }
    }
  }

  async function revokeDeviceSession(sessionId) {
    const lifecycle = sessionLifecycleRef.current;
    const sessionGeneration = lifecycle.currentGeneration();
    if (!lifecycle.isActive(sessionGeneration)) return false;

    try {
      const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionTokenRef.current}` },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (lifecycle.isActive(sessionGeneration)) {
        setSessions((current) => current.filter((item) => item.id !== sessionId));
        showNotification('Сессия на устройстве завершена.', 'success');
      }
      return true;
    } catch (error) {
      if (lifecycle.isActive(sessionGeneration)) {
        console.error('[AUTH] Не удалось завершить сессию', error);
        showNotification('Не удалось завершить выбранную сессию.', 'error');
      }
      return false;
    }
  }

  function sendReadReceipt(senderUsername) {
    const lifecycle = sessionLifecycleRef.current;
    const sessionGeneration = lifecycle.currentGeneration();

    if (
      lifecycle.isActive(sessionGeneration) &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      wsRef.current.send(JSON.stringify({ type: "read_receipt", sender: senderUsername }));
      setAllMessages(prev => prev.map(m => m.from === senderUsername ? { ...m, status: 'read' } : m));
    }
  }

  async function syncCloudHistory(
    myPrivateKey,
    currentUsername,
    accessToken,
    sessionGeneration
  ) {
    try {
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

      if (!myPrivateKey) {
        console.error("[History] Приватный ключ отсутствует");
        return;
      }

      if (!accessToken) {
        console.error("[History] Access token отсутствует");
        return;
      }

      const res = await fetch("/history", {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!res.ok) {
        console.error("[History] Ошибка загрузки:", res.status);
        return;
      }

      const encryptedHistory = await res.json();
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

      const decryptedMessages = [];
      const partnersSet = new Set();
      const newNamesToCache = {};

      for (const msg of encryptedHistory) {
        const partner = msg.from === currentUsername ? msg.to : msg.from;
        partnersSet.add(partner);
      }
      const uniquePartners = Array.from(partnersSet);
      await Promise.all(uniquePartners.map(async (partner) => {
        if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;
        if (userCacheRef.current[partner]) return;
        try {
          const userRes = await fetch(`/user/${partner}`);
          if (userRes.ok) {
            const userData = await userRes.json();
            newNamesToCache[partner] = userData.display_name;
          }
        } catch (e) { console.error(e); }
      }));

      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

      if (Object.keys(newNamesToCache).length > 0) {
        setUserCache(prev => ({ ...prev, ...newNamesToCache }));
      }
      for (const msg of encryptedHistory) {
        if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

        try {
          const decryptedText = await decryptMessagePacket(
            msg,
            myPrivateKey,
            currentUsername
          );

          decryptedMessages.push({
            id: msg.id || crypto.randomUUID(),
            from: msg.from,
            to: msg.to,
            text: decryptedText,
            time: msg.time,
            status: msg.status || "sent",
            isMine: msg.from === currentUsername
          });
        } catch (decryptError) {
          console.error(
            `[History] Не удалось расшифровать сообщение ${msg.id}:`,
            decryptError
          );
        }
      }

      decryptedMessages.sort((a, b) => {
        const firstId = Number(a.id) || 0;
        const secondId = Number(b.id) || 0;
        return firstId - secondId;
      });

      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

      setChatPartners(uniquePartners);
      setAllMessages(decryptedMessages);

      console.log("[History] История восстановлена", {
        messages: decryptedMessages.length,
        chats: uniquePartners.length
      });
    } catch (e) {
      console.error("[History] Ошибка синхронизации:", e);
    }
  }

  const handleAuth = async () => {
    if (!username || !password) return;

    if (sessionRevocationPromiseRef.current) {
      await sessionRevocationPromiseRef.current;
    }

    if (isRegMode) {
      if (!email || !confirmPassword) return;
      if (password !== confirmPassword) {
        showNotification("Пароли не совпадают", "error");
        return;
      }
      try {
        // Генерация криптографических ключей ECDH
        const generatedKeys = await window.crypto.subtle.generateKey(
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveBits", "deriveKey"]
        );

        // Экспорт публичного ключа в формат JWK
        const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", generatedKeys.publicKey);

        // Экспорт частного ключа в PKCS8
        const privateKeyPkcs8 = await window.crypto.subtle.exportKey("pkcs8", generatedKeys.privateKey);
        let keyEnvelope;
        let sessionPrivateKey;

        try {
          keyEnvelope = await createKeyEnvelopeV2(privateKeyPkcs8, password);
          sessionPrivateKey = await importVerifiedPrivateKey(
            privateKeyPkcs8,
            publicKeyJwk
          );
        } finally {
          new Uint8Array(privateKeyPkcs8).fill(0);
        }

        const resp = await fetch(`/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username,
            display_name: username,
            email: email,
            password: password,
            bio: bio,
            public_key: publicKeyJwk,
            key_envelope: keyEnvelope,
          }),
        });

        if (!resp.ok) {
          const data = await resp.json();
          showNotification(data.detail || "Ошибка регистрации", "error");
          return;
        }

        // Сохранение ключей в ref для дальнейшего использования
        myKeysRef.current = {
          publicKey: publicKeyJwk,
          privateKey: sessionPrivateKey,
        };

        showNotification("Регистрация успешна! Входим...", "success");

        const loginResp = await fetch(`/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            username: username,
            password: password,
          }),
        });

        let autoLoginSucceeded = false;

        if (loginResp.ok) {
          const loginData = await loginResp.json();
          const loggedUser = loginData.user;
          const sessionGeneration = beginSession();

          setUserId(loggedUser.id);
          sessionTokenRef.current = loginData.access_token;
          setUsername(loggedUser.username);
          setDisplayName(loggedUser.display_name || loggedUser.username);
          setIsLoggedIn(true);

          scheduleSessionRefresh(
            loggedUser.username,
            sessionGeneration,
            loginData.expires_in,
          );

          initWebSocket(
            loggedUser.username,
            loginData.access_token,
            sessionGeneration
          );

          showNotification("Добро пожаловать!", "success");
          autoLoginSucceeded = true;
        } else {
          showNotification(
            "Аккаунт создан. Выполните вход.",
            "success"
          );
        }

        setIsRegMode(false);
        if (!autoLoginSucceeded) {
          myKeysRef.current = { publicKey: null, privateKey: null };
          setUsername('');
          setDisplayName('');
        }
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      } catch (err) {
        showNotification(`Ошибка при регистрации: ${err.message}`, "error");
      }
    } else {
      try {
        const resp = await fetch(`/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            username: username,
            password: password,
          }),
        });

        if (resp.status === 403) {
          showNotification("Аккаунт не верифицирован. Проверьте почту.", "error");
          return;
        }

        if (!resp.ok) {
          const data = await resp.json();
          showNotification(data.detail || "Ошибка входа", "error");
          return;
        }

        const data = await resp.json();
        const loggedUser = data.user;
        myKeysRef.current = { publicKey: null, privateKey: null };

        // Попытка восстановить privateKey из зашифрованных данных
        try {
          const userData = await fetchKeyEnvelope(data.access_token);
          const { privateKey, migratedEnvelope } = await unlockKeyEnvelope({
            keyEnvelope: userData.key_envelope,
            password,
            username: loggedUser.username,
            publicKey: userData.public_key,
          });

          myKeysRef.current = {
            publicKey: userData.public_key,
            privateKey
          };

          if (migratedEnvelope) {
            try {
              await updateKeyEnvelope(
                data.access_token,
                password,
                migratedEnvelope
              );
            } catch (migrationError) {
              console.warn(
                '[Login] Защита старого ключа будет обновлена при следующем входе:',
                migrationError
              );
            }
          }
        } catch (keyErr) {
          console.error('[Login] Ошибка восстановления приватного ключа:', keyErr);
          myKeysRef.current = { publicKey: null, privateKey: null };
          showNotification(
            'Не удалось разблокировать ключи аккаунта. Вход остановлен.',
            'error'
          );
          try {
            await revokeSession(data.access_token);
          } catch (revokeError) {
            console.warn('[AUTH] Не удалось отозвать незавершённую сессию', revokeError);
          }
          return;
        }

        const sessionGeneration = beginSession();

        setUserId(loggedUser.id);
        sessionTokenRef.current = data.access_token;
        setUsername(loggedUser.username);
        setDisplayName(loggedUser.display_name || loggedUser.username);
        setIsLoggedIn(true);

        scheduleSessionRefresh(
          loggedUser.username,
          sessionGeneration,
          data.expires_in,
        );

        await syncCloudHistory(
          myKeysRef.current.privateKey,
          loggedUser.username,
          data.access_token,
          sessionGeneration
        );

        if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

        initWebSocket(loggedUser.username, data.access_token, sessionGeneration);
        setPassword('');
        showNotification(
          `Добро пожаловать, ${loggedUser.display_name || loggedUser.username}!`,
          "success"
        );
      } catch {
        showNotification("Ошибка сети при входе", "error");
      }
    }
  };

  function initWebSocket(user, token, sessionGeneration) {
    const lifecycle = sessionLifecycleRef.current;

    if (
      !token ||
      sessionTokenRef.current !== token ||
      !lifecycle.isActive(sessionGeneration)
    ) {
      setWsStatus('offline');
      return;
    }

    const previousWebSocket = wsRef.current;
    if (
      previousWebSocket &&
      (previousWebSocket.readyState === WebSocket.OPEN ||
        previousWebSocket.readyState === WebSocket.CONNECTING)
    ) {
      try {
        previousWebSocket.close(1000, 'Replacing connection');
      } catch (error) {
        console.warn('[WS] Не удалось заменить соединение', error);
      }
    }

    const wsUrl = buildWebSocketUrl();
    const ws = new WebSocket(wsUrl, buildWebSocketProtocols(token));
    wsRef.current = ws;

    const isCurrentSocket = () =>
      lifecycle.isActive(sessionGeneration) &&
      sessionTokenRef.current === token &&
      wsRef.current === ws;

    ws.onopen = () => {
      if (!isCurrentSocket()) {
        ws.close(1000, 'Stale session');
        return;
      }

      console.log(`[WS] Соединение установлено: ${user}`);
      setWsStatus('online');

      const queuedMessages = outboundQueueRef.current.splice(0);
      for (const queued of queuedMessages) {
        if (!isCurrentSocket()) return;

        ws.send(JSON.stringify({
          id: queued.msgId,
          to: queued.to,
          ciphertext: queued.ciphertext,
          iv: queued.iv,
          time: queued.time
        }));
      }
    };

    ws.onclose = (event) => {
      if (!isCurrentSocket()) return;

      wsRef.current = null;
      setWsStatus('offline');
      if (event.code === 1008) {
        void refreshAccessToken(user, sessionGeneration);
        return;
      }
      lifecycle.scheduleReconnect(
        sessionGeneration,
        () => initWebSocket(user, token, sessionGeneration),
        4000
      );
    };

    ws.onerror = (error) => {
      if (isCurrentSocket()) {
        console.error('[WS] Ошибка соединения:', error);
      }
    };

    ws.onmessage = async (event) => {
      if (!isCurrentSocket()) return;

      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.error('[WS] Невалидный JSON:', event.data);
        return;
      }

      if (data.type === "read_receipt_update") {
        if (!isCurrentSocket()) return;
        setAllMessages(prev => prev.map(m => m.to === data.reader ? { ...m, status: 'read' } : m));
        return;
      }

      try {
        const privateKey = myKeysRef.current.privateKey;
        if (!privateKey) return;

        let senderName = userCacheRef.current[data.from];
        if (!senderName) {
          const profileResponse = await fetch(`/user/${data.from}`);
          if (!isCurrentSocket()) return;

          if (profileResponse.ok) {
            const senderProfile = await profileResponse.json();
            if (!isCurrentSocket()) return;
            senderName = senderProfile.display_name;
            setUserCache(prev => ({ ...prev, [data.from]: senderName }));
          } else {
            senderName = data.from;
          }
        }

        const keyResponse = await fetch(`/user/${data.from}`);
        if (!isCurrentSocket()) return;

        const senderData = await keyResponse.json();
        if (!isCurrentSocket()) return;

        const senderPublicKey = await window.crypto.subtle.importKey(
          "jwk", senderData.public_key,
          { name: "ECDH", namedCurve: "P-256" },
          true, []
        );
        const sharedBits = await window.crypto.subtle.deriveBits(
          { name: "ECDH", public: senderPublicKey },
          privateKey,
          256
        );
        const aesKey = await window.crypto.subtle.importKey(
          "raw",
          sharedBits,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
        const decryptedRaw = await window.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToArrayBuffer(data.iv) },
          aesKey,
          base64ToArrayBuffer(data.ciphertext)
        );

        if (!isCurrentSocket()) return;

        const text = new TextDecoder().decode(decryptedRaw);
        setChatPartners(prev => prev.includes(data.from) ? prev : [...prev, data.from]);
        setAllMessages(prev => [...prev, {
          id: data.id,
          from: data.from,
          to: user,
          type: "text",
          text,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          edited: false,
          deleted: false,
          replyTo: null,
          reactions: {},
          deliveredAt: Date.now(),
          readAt: null,
          time: data.time,
          status: "delivered"
        }]);

        playNotificationSound();
        showNotification(text, 'chat', senderName);
      } catch (error) {
        if (!isCurrentSocket()) return;

        console.error(
          '[WS] Ошибка расшифровки входящего сообщения:',
          {
            name: error?.name,
            message: error?.message,
            from: data?.from,
            to: data?.to,
            hasPrivateKey: Boolean(myKeysRef.current?.privateKey)
          },
          error
        );
      }
    };
  }

  async function sendMessage(currentTarget, textOverride = null) {
    const currentMessage = textOverride ?? message;
    if (!currentTarget || !currentMessage.trim()) return;

    const lifecycle = sessionLifecycleRef.current;
    const sessionGeneration = lifecycle.currentGeneration();
    const privateKey = myKeysRef.current.privateKey;

    if (!lifecycle.isActive(sessionGeneration) || !privateKey) return;

    const msgId = Math.random();
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setAllMessages(prev => [...prev, {
      id: msgId, from: username, to: currentTarget,
      text: currentMessage, time: timeString,
      status: wsStatus === 'online' ? 'sent' : 'pending'
    }]);
    const msgText = currentMessage;
    setMessage('');
    try {
      const res = await fetch(`/user/${currentTarget}`);
      if (!lifecycle.isActive(sessionGeneration)) return;

      if (!res.ok) {
        throw new Error(`Не удалось получить пользователя: HTTP ${res.status}`);
      }

      const targetData = await res.json();
      if (!lifecycle.isActive(sessionGeneration)) return;

      if (!targetData.public_key) {
        throw new Error("У получателя отсутствует public_key");
      }

      const targetPublicKey = await window.crypto.subtle.importKey(
        "jwk", targetData.public_key,
        { name: "ECDH", namedCurve: "P-256" },
        true, []
      );
      const derivedBits = await window.crypto.subtle.deriveBits(
        { name: "ECDH", public: targetPublicKey },
        privateKey,
        256
      );
      const aesKey = await window.crypto.subtle.importKey(
        "raw",
        derivedBits,
        { name: "AES-GCM", length: 256 },
        false, ["encrypt"]
      );
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const ciphertextRaw = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, aesKey,
        new TextEncoder().encode(msgText)
      );
      const ciphertextBase64 = arrayBufferToBase64(ciphertextRaw);
      const ivBase64 = arrayBufferToBase64(iv);

      if (!lifecycle.isActive(sessionGeneration)) return;

      const currentWebSocket = wsRef.current;
      if (currentWebSocket?.readyState === WebSocket.OPEN) {
        const packet = {
          id: msgId,
          to: currentTarget,
          ciphertext: ciphertextBase64,
          iv: ivBase64,
          time: timeString
        };

        currentWebSocket.send(JSON.stringify(packet));
      } else {
        outboundQueueRef.current.push({ msgId, to: currentTarget, ciphertext: ciphertextBase64, iv: ivBase64, time: timeString });
      }
    } catch (error) {
      if (lifecycle.isActive(sessionGeneration)) {
        console.error('[sendMessage] Ошибка шифрования:', error);
      }
    }
  }

  function clearLocalSession(reason) {
    sessionLifecycleRef.current.end();
    closeCurrentWebSocket(
      reason === 'switch-account' ? 'Switching account' : 'Logging out'
    );

    myKeysRef.current = { publicKey: null, privateKey: null };
    outboundQueueRef.current = [];
    userCacheRef.current = {};
    inFlightFetchesRef.current.clear();
    sessionRefreshPromiseRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    try {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('privateKey');
      localStorage.removeItem('publicKey');
    } catch (error) {
      console.warn('[AUTH] Не удалось очистить устаревшее локальное состояние', error);
    }

    setIsLoggedIn(false);
    setUserId(null);
    sessionTokenRef.current = null;
    setIsRegMode(false);
    setUsername('');
    setDisplayName('');
    setEmail('');
    setBio(DEFAULT_BIO);
    setPassword('');
    setConfirmPassword('');
    setAllMessages([]);
    setChatPartners([]);
    setUserCache({});
    setActiveChatUser('');
    setMessage('');
    setWsStatus('offline');
    setIsProfileOpen(false);
    setViewingPartnerProfile(null);
    setSearchQuery('');
    setSearchResults([]);
    setSessions([]);
    setSessionsLoading(false);
    setToasts([]);
  }

  async function terminateSession(reason, { revokeRemote = true } = {}) {
    const accessToken = sessionTokenRef.current;
    const pendingRefresh = sessionRefreshPromiseRef.current;
    clearLocalSession(reason);

    if (!revokeRemote) return;
    const revocationPromise = (async () => {
      if (pendingRefresh) {
        await pendingRefresh;
      }
      await revokeSession(accessToken);
    })().catch((error) => {
      console.warn('[AUTH] Серверный отзыв сессии не подтверждён', error);
    });
    sessionRevocationPromiseRef.current = revocationPromise;
    try {
      await revocationPromise;
    } finally {
      if (sessionRevocationPromiseRef.current === revocationPromise) {
        sessionRevocationPromiseRef.current = null;
      }
    }
  }

  function logout() {
    terminateSession('logout');
  }

  function switchAccount() {
    terminateSession('switch-account');
  }


  return {
    isRegMode, setIsRegMode,
    username, setUsername,
    displayName, setDisplayName,
    email, setEmail,
    bio, setBio,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    isLoggedIn,
    userId,
    activeChatUser, setActiveChatUser,
    chatPartners, setChatPartners,
    userCache,
    message, setMessage,
    allMessages,
    wsStatus,
    isProfileOpen, setIsProfileOpen,
    searchQuery, setSearchQuery,
    searchResults,
    sessions, sessionsLoading, loadSessions, revokeDeviceSession,
    viewingPartnerProfile, setViewingPartnerProfile,
    toasts, showNotification, dismissToast, // Выводим управление пушами наружу
    handleAuth, sendMessage, sendReadReceipt, logout, switchAccount,
    changeProfileData, tryStartChat, fetchAndCacheUser, inspectPartnerProfile
  };
}
