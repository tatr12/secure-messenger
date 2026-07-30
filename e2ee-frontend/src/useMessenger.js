import { useState, useEffect, useRef } from 'react';
import { arrayBufferToBase64, base64ToArrayBuffer, decryptMessagePacket } from './crypto';
import { createSessionLifecycle } from './sessionLifecycle';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Новый стейт для хранения кастомных пуш-уведомлений
  const [toasts, setToasts] = useState([]);

  const outboundQueueRef = useRef([]);
  const myKeysRef = useRef({ publicKey: null, privateKey: null });
  const sessionTokenRef = useRef(null);
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
    };
  }, []);

  useEffect(() => {
    userCacheRef.current = userCache;
  }, [userCache]);

  // Живой поиск
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

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
    const id = Date.now();
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
      const res = await fetch(`/user/${username}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    if (isRegMode) {
      if (!email || !confirmPassword) return;
      if (password !== confirmPassword) {
        showNotification("Пароли не совпадают", "error");
        return;
      }
      try {
        // Генерация криптографических ключей ECDH
        const privateKey = await window.crypto.subtle.generateKey(
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveBits"]
        );

        // Экспорт публичного ключа в формат JWK
        const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", privateKey.publicKey);

        // Экспорт частного ключа в PKCS8
        const privateKeyPkcs8 = await window.crypto.subtle.exportKey("pkcs8", privateKey.privateKey);

        // Генерация ключа шифрования из пароля
        const encoder = new TextEncoder();
        const baseKey = await window.crypto.subtle.importKey(
          "raw",
          encoder.encode(password),
          "PBKDF2",
          false,
          ["deriveKey"]
        );
        const aesKey = await window.crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: encoder.encode(username + "_key_enc"), iterations: 10000, hash: "SHA-256" },
          baseKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );

        // Шифрование частного ключа AES-GCM
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encryptedPrivateKeyBuffer = await window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          aesKey,
          privateKeyPkcs8
        );

        const publicKey = publicKeyJwk;
        const encryptedPrivateKey = arrayBufferToBase64(encryptedPrivateKeyBuffer);
        const privateKeyIv = arrayBufferToBase64(iv.buffer);

        const resp = await fetch(`/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username,
            display_name: username,
            email: email,
            password: password,
            bio: bio,
            public_key: publicKey,
            encrypted_private_key: encryptedPrivateKey,
            private_key_iv: privateKeyIv,
          }),
        });

        if (!resp.ok) {
          const data = await resp.json();
          showNotification(data.detail || "Ошибка регистрации", "error");
          return;
        }

        // Сохранение ключей в ref для дальнейшего использования
        myKeysRef.current = { publicKey: publicKeyJwk, privateKey };

        showNotification("Регистрация успешна! Входим...", "success");

        const loginResp = await fetch(`/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        myKeysRef.current = { publicKey: null, privateKey: null };

        // Попытка восстановить privateKey из зашифрованных данных
        try {
          const userRes = await fetch(`/user/${username}`);
          if (userRes.ok) {
            const userData = await userRes.json();

            // Расшифровка приватного ключа
            const encoder = new TextEncoder();
            const baseKey = await window.crypto.subtle.importKey(
              "raw",
              encoder.encode(password),
              "PBKDF2",
              false,
              ["deriveKey"]
            );
            const aesKey = await window.crypto.subtle.deriveKey(
              { name: "PBKDF2", salt: encoder.encode(username + "_key_enc"), iterations: 10000, hash: "SHA-256" },
              baseKey,
              { name: "AES-GCM", length: 256 },
              false,
              ["decrypt"]
            );

            const decryptedPrivateKeyBuffer = await window.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: base64ToArrayBuffer(userData.private_key_iv) },
              aesKey,
              base64ToArrayBuffer(userData.encrypted_private_key)
            );

            const privateKey = await window.crypto.subtle.importKey(
              "pkcs8",
              decryptedPrivateKeyBuffer,
              { name: "ECDH", namedCurve: "P-256" },
              true,
              ["deriveBits", "deriveKey"]
            );

            const restoredPrivateJwk =
              await window.crypto.subtle.exportKey("jwk", privateKey);

            const publicKeyMatches =
              restoredPrivateJwk.x === userData.public_key?.x &&
              restoredPrivateJwk.y === userData.public_key?.y;

            console.log(
              `[KEY CHECK] username=${username} publicKeyMatches=${publicKeyMatches}`
            );

            if (!publicKeyMatches) {
              console.error(
                "[KEY CHECK] Публичный и приватный ключи аккаунта не соответствуют друг другу"
              );
            }

            myKeysRef.current = {
              publicKey: userData.public_key,
              privateKey
            };
          }
        } catch (keyErr) {
          console.error('[Login] Ошибка восстановления приватного ключа:', keyErr);
          console.error('[Login] Error stack:', keyErr.stack);
          // Continue anyway - user can still login and messages from before will be unavailable
        }

        const loggedUser = data.user;
        const sessionGeneration = beginSession();

        setUserId(loggedUser.id);
        sessionTokenRef.current = data.access_token;
        setUsername(loggedUser.username);
        setDisplayName(loggedUser.display_name || loggedUser.username);
        setIsLoggedIn(true);

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

    const wsUrl =
      `ws://127.0.0.1:8000/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
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

    ws.onclose = () => {
      if (!isCurrentSocket()) return;

      wsRef.current = null;
      setWsStatus('offline');
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

  function terminateSession(reason) {
    sessionLifecycleRef.current.end();
    closeCurrentWebSocket(
      reason === 'switch-account' ? 'Switching account' : 'Logging out'
    );

    myKeysRef.current = { publicKey: null, privateKey: null };
    outboundQueueRef.current = [];
    userCacheRef.current = {};
    inFlightFetchesRef.current.clear();

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
    setToasts([]);
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
    viewingPartnerProfile, setViewingPartnerProfile,
    toasts, showNotification, dismissToast, // Выводим управление пушами наружу
    handleAuth, sendMessage, sendReadReceipt, logout, switchAccount,
    changeProfileData, tryStartChat, fetchAndCacheUser, inspectPartnerProfile
  };
}
