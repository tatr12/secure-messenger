import { useState, useEffect, useRef } from 'react';
import { derivePasswordKey, arrayBufferToBase64, base64ToArrayBuffer, decryptMessagePacket } from './crypto';

// Укажи путь к звуковому файлу (из папки public или внешний URL)
const NOTIFICATION_SOUND_URL = '/audio_2026-06-13_23-53-24.mp3';

export function useMessenger() {
  const [isRegMode, setIsRegMode] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('В сети СМЕРТЬ В НИЩЕТЕ');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
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
  const wsRef = useRef(null);

  // Реф для аудио, чтобы не создавать экземпляр при каждом рендере
  const audioRef = useRef(null);
  // Флаг — разблокирован ли звук после первого клика
  const audioUnlockedRef = useRef(false);

  const userCacheRef = useRef({});
  const inFlightFetchesRef = useRef(new Set());

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
    userCacheRef.current = userCache;
  }, [userCache]);

  // Живой поиск
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/search?q=${searchQuery}&exclude=${username}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (e) { console.error(e); }
    }, 200);
    return () => clearTimeout(delayDebounce);
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
    const cleanLogin = login.trim().toLowerCase();

    if (userCacheRef.current[cleanLogin]) return userCacheRef.current[cleanLogin];
    if (inFlightFetchesRef.current.has(cleanLogin)) return cleanLogin;
    inFlightFetchesRef.current.add(cleanLogin);
    try {
      const res = await fetch(`/user/${cleanLogin}`);
      if (res.ok) {
        const data = await res.json();
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
    try {
      const res = await fetch(`/user/${partnerLogin}`);
      if (res.ok) {
        const data = await res.json();
        setViewingPartnerProfile(data);
      }
    } catch (e) { console.error(e); }
  }

  async function tryStartChat(targetLogin) {
    const cleanTarget = targetLogin.trim();
    if (!cleanTarget || cleanTarget === username) return false;
    try {
      const res = await fetch(`/user/${cleanTarget}`);
      if (!res.ok) {
        showNotification(`Ошибка доступа: Субъект @${cleanTarget} не зарегистрирован в сети.`, 'error');
        return false;
      }
      const data = await res.json();
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
    try {
      const res = await fetch(`/user/${username}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: newName, bio: newBio })
      });
      if (res.ok) {
        const data = await res.json();
        setDisplayName(data.display_name);
        setBio(data.bio);
        setUserCache(prev => ({ ...prev, [username]: data.display_name }));
      }
    } catch (e) { console.error(e); }
  }

  function sendReadReceipt(senderUsername) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "read_receipt", sender: senderUsername }));
      setAllMessages(prev => prev.map(m => m.from === senderUsername ? { ...m, status: 'read' } : m));
    }
  }

  async function syncCloudHistory(myPrivateKey, currentUsername, accessToken) {
    try {
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
      const decryptedMessages = [];
      const partnersSet = new Set();
      const newNamesToCache = {};

      for (const msg of encryptedHistory) {
        const partner = msg.from === currentUsername ? msg.to : msg.from;
        partnersSet.add(partner);
      }
      const uniquePartners = Array.from(partnersSet);
      await Promise.all(uniquePartners.map(async (partner) => {
        if (userCacheRef.current[partner]) return;
        try {
          const userRes = await fetch(`/user/${partner}`);
          if (userRes.ok) {
            const userData = await userRes.json();
            newNamesToCache[partner] = userData.display_name;
          }
        } catch (e) { console.error(e); }
      }));
      if (Object.keys(newNamesToCache).length > 0) {
        setUserCache(prev => ({ ...prev, ...newNamesToCache }));
      }
      for (const msg of encryptedHistory) {
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
    console.log('[AUTH]', {
      isRegMode,
      username,
      email,
      password,
      confirmPassword,
    });
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

        if (loginResp.ok) {
          const loginData = await loginResp.json();

          console.log("[Register AutoLogin]", loginData);

          const loggedUser = loginData.user;

          setUserId(loggedUser.id);
          setSessionToken(loginData.access_token);
          setUsername(loggedUser.username);
          setDisplayName(loggedUser.display_name || loggedUser.username);
          setIsLoggedIn(true);

          initWebSocket(loggedUser.username, loginData.access_token);

          showNotification("Добро пожаловать!", "success");
        } else {
          const errorData = await loginResp.json();
          console.log("[AutoLogin error]", errorData);

          showNotification(
            "Аккаунт создан. Выполните вход.",
            "success"
          );
        }

setIsRegMode(false);
        setUsername('');
        setDisplayName('');
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
        console.log('[Login] Server response:', data);

        // Попытка восстановить privateKey из зашифрованных данных
        console.log('[Login] Starting to restore private key for user:', username);
        try {
          console.log('[Login] Fetching user data...');
          const userRes = await fetch(`/user/${username}`);
          console.log('[Login] User fetch response status:', userRes.status);
          if (userRes.ok) {
            const userData = await userRes.json();
            console.log('[Login] User data received, has encrypted_private_key:', !!userData.encrypted_private_key);

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
            console.log('[Login] AES key derived for decryption');

            const decryptedPrivateKeyBuffer = await window.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: base64ToArrayBuffer(userData.private_key_iv) },
              aesKey,
              base64ToArrayBuffer(userData.encrypted_private_key)
            );
            console.log('[Login] Private key decrypted, buffer size:', decryptedPrivateKeyBuffer.byteLength);

            console.log('[Login] Attempting to import PKCS8 key...');
            const privateKey = await window.crypto.subtle.importKey(
              "pkcs8",
              decryptedPrivateKeyBuffer,
              { name: "ECDH", namedCurve: "P-256" },
              true,
              ["deriveBits", "deriveKey"]
            );
            console.log('[Login] Private key imported successfully');

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
            console.log('[Login] Private key restored successfully');
          }
        } catch (keyErr) {
          console.error('[Login] Ошибка восстановления приватного ключа:', keyErr);
          console.error('[Login] Error stack:', keyErr.stack);
          // Continue anyway - user can still login and messages from before will be unavailable
        }

        const loggedUser = data.user;

        console.log('[Login] Setting displayName to:', loggedUser.display_name);
        setUserId(loggedUser.id);
        setSessionToken(data.access_token);
        setUsername(loggedUser.username);
        setDisplayName(loggedUser.display_name || loggedUser.username);
        setIsLoggedIn(true);

        await syncCloudHistory(
          myKeysRef.current.privateKey,
          loggedUser.username,
          data.access_token
        );

        initWebSocket(loggedUser.username, data.access_token);
        setPassword('');
        showNotification(
          `Добро пожаловать, ${loggedUser.display_name || loggedUser.username}!`,
          "success"
        );
      } catch (err) {
        showNotification("Ошибка сети при входе", "error");
      }
    }
  };

  function initWebSocket(user, token) {
    if (!token) {
      console.error("[WS] Session token отсутствует");
      setWsStatus("offline");
      return;
    }

    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      wsRef.current.close();
    }

    const wsUrl =
      `ws://127.0.0.1:8000/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      console.log(`[WS] Соединение установлено: ${user}`);
      setWsStatus('online');

      const queuedMessages = outboundQueueRef.current.splice(0);

      console.log(
        `[WS] Отправляем сообщения из очереди: ${queuedMessages.length}`
      );

      for (const queued of queuedMessages) {
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
      setWsStatus('offline');
      if (wsRef.current === ws) {
        console.log(`[WS] Соединение потеряно, реконнект через 4с...`);
        setTimeout(() => initWebSocket(user, token), 4000);
      }
    };
    ws.onerror = (err) => {
      console.error('[WS] Ошибка соединения:', err);
    };
    ws.onmessage = async (event) => {
      let data;
      try {
        data = JSON.parse(event.data);

        console.log("[WS IN] Получен пакет", {
          type: data.type,
          from: data.from,
          to: data.to,
          hasCiphertext: Boolean(data.ciphertext),
          id: data.id
        });
      } catch (e) {
        console.error('[WS] Невалидный JSON:', event.data);
        return;
      }
      if (data.type === "read_receipt_update") {
        setAllMessages(prev => prev.map(m => m.to === data.reader ? { ...m, status: 'read' } : m));
        return;
      }

      try {
        let senderName = userCacheRef.current[data.from];
        if (!senderName) {
          const res = await fetch(`/user/${data.from}`);
          if (res.ok) {
            const senderData = await res.json();
            senderName = senderData.display_name;
            setUserCache(prev => ({ ...prev, [data.from]: senderName }));
          } else {
            senderName = data.from;
          }
        }
        const res = await fetch(`/user/${data.from}`);
        const senderData = await res.json();
        const senderPublicKey = await window.crypto.subtle.importKey(
          "jwk", senderData.public_key,
          { name: "ECDH", namedCurve: "P-256" },
          true, []
        );
        const sharedBits = await window.crypto.subtle.deriveBits(
          { name: "ECDH", public: senderPublicKey },
          myKeysRef.current.privateKey,
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
        const text = new TextDecoder().decode(decryptedRaw);

        setChatPartners(prev => prev.includes(data.from) ? prev : [...prev, data.from]);
        setAllMessages(prev => [...prev,{
          id:data.id,

          from:data.from,
          to:user,

          type:"text",

          text,

          createdAt:Date.now(),
          updatedAt:Date.now(),

          edited:false,
          deleted:false,

          replyTo:null,

          reactions:{},

          deliveredAt:Date.now(),
          readAt:null,

          time:data.time,

          status:"delivered"
        }]);

        // 🔥 КЛЮЧЕВАЯ ЛОГИКА ОПОВЕЩЕНИЯ В РЕАЛЬНОМ ВРЕМЕНИ
        playNotificationSound();

        // Показываем пуш только если этот чат сейчас не открыт прямо перед глазами
        // Чтобы не спамить пушами во время активного диалога
        showNotification(text, 'chat', senderName);

      } catch (e) {
        console.error(
          '[WS] Ошибка расшифровки входящего сообщения:',
          {
            name: e?.name,
            message: e?.message,
            from: data?.from,
            to: data?.to,
            hasPrivateKey: Boolean(myKeysRef.current?.privateKey)
          },
          e
        );
      }
    };
  }

  async function sendMessage(currentTarget, textOverride = null) {
    const currentMessage = textOverride ?? message;

    console.log("[SEND DEBUG] sendMessage вызван", {
      username,
      currentTarget,
      textLength: currentMessage?.length ?? 0,
      wsExists: Boolean(wsRef.current),
      wsReadyState: wsRef.current?.readyState,
      hasPrivateKey: Boolean(myKeysRef.current?.privateKey)
    });

    if (!currentTarget || !currentMessage.trim()) return;
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

      console.log("[SEND DEBUG] Ответ профиля получателя", {
        status: res.status,
        ok: res.ok,
        currentTarget
      });

      if (!res.ok) {
        throw new Error(`Не удалось получить пользователя: HTTP ${res.status}`);
      }

      const targetData = await res.json();

      console.log("[SEND DEBUG] Ключи перед шифрованием", {
        hasTargetPublicKey: Boolean(targetData.public_key),
        hasMyPrivateKey: Boolean(myKeysRef.current?.privateKey)
      });

      if (!targetData.public_key) {
        throw new Error("У получателя отсутствует public_key");
      }

      if (!myKeysRef.current?.privateKey) {
        throw new Error("Приватный ключ отправителя не восстановлен");
      }
      const targetPublicKey = await window.crypto.subtle.importKey(
        "jwk", targetData.public_key,
        { name: "ECDH", namedCurve: "P-256" },
        true, []
      );
      const derivedBits = await window.crypto.subtle.deriveBits(
        { name: "ECDH", public: targetPublicKey },
        myKeysRef.current.privateKey,
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

      console.log("[SEND DEBUG] Шифрование завершено", {
        ciphertextLength: ciphertextBase64.length,
        ivLength: ivBase64.length
      });
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const packet = {
          id: msgId,
          to: currentTarget,
          ciphertext: ciphertextBase64,
          iv: ivBase64,
          time: timeString
        };

        console.log("[SEND] Отправляем WebSocket-пакет", {
          from: username,
          to: currentTarget,
          readyState: wsRef.current.readyState,
          hasPrivateKey: Boolean(myKeysRef.current?.privateKey)
        });

        wsRef.current.send(JSON.stringify(packet));
      } else {
        outboundQueueRef.current.push({ msgId, to: currentTarget, ciphertext: ciphertextBase64, iv: ivBase64, time: timeString });
      }
    } catch (err) {
      console.error('[sendMessage] Ошибка шифрования:', err);
    }
  }

  function logout() {
    console.log("[AUTH] Logout");

    // закрываем websocket
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        console.warn("[WS] close error", e);
      }
      wsRef.current = null;
    }

    // очищаем локальные данные
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('privateKey');
    localStorage.removeItem('publicKey');

    // очищаем состояние
    setIsLoggedIn(false);
    setUserId(null);
    setAllMessages([]);
    setChatPartners([]);
    setActiveChatUser('');
    setWsStatus('offline');

    console.log("[AUTH] Logged out");
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
    handleAuth, sendMessage, sendReadReceipt, logout,
    changeProfileData, tryStartChat, fetchAndCacheUser, inspectPartnerProfile, initWebSocket
  };
}