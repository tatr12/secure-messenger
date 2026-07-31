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
import { updateProfile } from './profileApi';
import {
  indexChatPreferences,
  listChatPreferences,
  updateChatPreference,
} from './chatPreferencesApi';
import { buildWebSocketProtocols, buildWebSocketUrl } from './websocketUrl';
import { formatMessageTime } from './features/chat/messageDates';
import { advanceMessageStatus } from './features/chat/messageStatus';
import {
  buildUnreadMessageCounts,
  createDeleteEnvelope,
  createEditEnvelope,
  createMessageEnvelope,
  createReactionEnvelope,
  getMessageEventNotification,
  hasLoadedAllUnreadEventRows,
  materializeMessageEvents,
  parseMessageEvent,
  serializeMessageEnvelope,
  sortMessageEventsByServerOrder,
} from './features/chat/messageEvents';
import { createMessageEventQueue } from './features/chat/messageEventQueue';

// Укажи путь к звуковому файлу (из папки public или внешний URL)
const NOTIFICATION_SOUND_URL = '/audio_2026-06-13_23-53-24.mp3';
const DEFAULT_BIO = 'В сети СМЕРТЬ В НИЩЕТЕ';
const HISTORY_PAGE_SIZE = 50;
const UNREAD_HISTORY_PAGE_SIZE = 100;

function mergeEncryptedHistoryRows(...collections) {
  const rowsById = new Map();

  for (const rows of collections) {
    for (const row of rows) {
      rowsById.set(row.id, row);
    }
  }

  return Array.from(rowsById.values()).sort(
    (first, second) => first.id - second.id,
  );
}

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
  const [unreadCounts, setUnreadCounts] = useState({});
  const [chatPreferences, setChatPreferences] = useState({});
  const [chatPreferenceSaving, setChatPreferenceSaving] = useState({});
  const [historyPartners, setHistoryPartners] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [wsStatus, setWsStatus] = useState('offline');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [viewingPartnerProfile, setViewingPartnerProfile] = useState(null);
  const [searchQuery, setSearchQueryState] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Новый стейт для хранения кастомных пуш-уведомлений
  const [toasts, setToasts] = useState([]);

  const outboundQueueRef = useRef(new Map());
  const deliveryReceiptQueueRef = useRef(new Map());
  const receivedMessageIdsRef = useRef(new Set());
  const messageEventsRef = useRef([]);
  const messageEventQueueRef = useRef(null);
  const historyBeforeIdRef = useRef(null);
  const historyLoadingRef = useRef(false);
  const myKeysRef = useRef({ publicKey: null, privateKey: null });
  const sessionTokenRef = useRef(null);
  const sessionRefreshPromiseRef = useRef(null);
  const sessionRevocationPromiseRef = useRef(null);
  const wsRef = useRef(null);
  const sessionLifecycleRef = useRef(null);
  const chatPreferencesRef = useRef({});
  const activeChatUserRef = useRef('');

  if (sessionLifecycleRef.current === null) {
    sessionLifecycleRef.current = createSessionLifecycle();
  }
  if (messageEventQueueRef.current === null) {
    messageEventQueueRef.current = createMessageEventQueue();
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

  const commitMessageEvents = (events, currentUsername = username) => {
    messageEventsRef.current = events;
    const messages = materializeMessageEvents(events, currentUsername);
    setAllMessages(messages);
    return messages;
  };

  const updateMessageEvents = (updater, currentUsername = username) => {
    return commitMessageEvents(
      updater(messageEventsRef.current),
      currentUsername,
    );
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
    outboundQueueRef.current.clear();
    deliveryReceiptQueueRef.current.clear();
    receivedMessageIdsRef.current.clear();
    messageEventsRef.current = [];
    messageEventQueueRef.current.reset();
    historyBeforeIdRef.current = null;
    historyLoadingRef.current = false;
    chatPreferencesRef.current = {};
    setHistoryLoading(false);
    setHasOlderMessages(false);
    setChatPreferences({});
    setChatPreferenceSaving({});
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
    const outboundQueue = outboundQueueRef.current;
    const deliveryReceiptQueue = deliveryReceiptQueueRef.current;
    const receivedMessageIds = receivedMessageIdsRef.current;

    return () => {
      sessionLifecycleRef.current.end();
      closeCurrentWebSocket('Application unmounted');
      outboundQueue.clear();
      deliveryReceiptQueue.clear();
      receivedMessageIds.clear();
      messageEventsRef.current = [];
      messageEventQueueRef.current.reset();
      myKeysRef.current = { publicKey: null, privateKey: null };
      sessionTokenRef.current = null;
      sessionRefreshPromiseRef.current = null;
      chatPreferencesRef.current = {};
    };
  }, []);

  useEffect(() => {
    userCacheRef.current = userCache;
  }, [userCache]);

  useEffect(() => {
    activeChatUserRef.current = activeChatUser;
  }, [activeChatUser]);

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
    if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return false;

    try {
      const res = await fetch(`/user/${partnerLogin}`);
      if (
        res.ok &&
        sessionLifecycleRef.current.isActive(sessionGeneration)
      ) {
        const data = await res.json();
        if (sessionLifecycleRef.current.isActive(sessionGeneration)) {
          setViewingPartnerProfile(data);
          return true;
        }
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      if (sessionLifecycleRef.current.isActive(sessionGeneration)) {
        console.error('[PROFILE] Не удалось открыть профиль собеседника', error);
        showNotification('Не удалось загрузить профиль собеседника.', 'error');
      }
      return false;
    }
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
    const cleanName = newName.trim();
    const cleanBio = newBio.trim();
    if (!cleanName) return false;

    const lifecycle = sessionLifecycleRef.current;
    const sessionGeneration = lifecycle.currentGeneration();
    if (!lifecycle.isActive(sessionGeneration)) return false;

    try {
      const requestProfileUpdate = () => updateProfile(
        sessionTokenRef.current,
        { displayName: cleanName, bio: cleanBio },
      );
      let data;

      try {
        data = await requestProfileUpdate();
      } catch (error) {
        if (error.status !== 401 || !lifecycle.isActive(sessionGeneration)) {
          throw error;
        }
        await refreshAccessToken(username, sessionGeneration);
        if (!lifecycle.isActive(sessionGeneration)) return false;
        data = await requestProfileUpdate();
      }
      if (!lifecycle.isActive(sessionGeneration)) return false;

      setDisplayName(data.display_name);
      setBio(data.bio);
      setUserCache((current) => ({
        ...current,
        [username]: data.display_name,
      }));
      showNotification('Профиль обновлён.', 'success');
      return true;
    } catch (error) {
      if (lifecycle.isActive(sessionGeneration)) {
        console.error('[PROFILE] Не удалось обновить профиль', error);
        showNotification('Не удалось сохранить профиль.', 'error');
      }
      return false;
    }
  }

  async function saveChatPreference(partner, updates) {
    if (!partner || Object.keys(updates).length === 0) return false;

    const lifecycle = sessionLifecycleRef.current;
    const sessionGeneration = lifecycle.currentGeneration();
    if (!lifecycle.isActive(sessionGeneration)) return false;

    setChatPreferenceSaving((current) => ({
      ...current,
      [partner]: true,
    }));
    try {
      const requestUpdate = () => updateChatPreference(
        sessionTokenRef.current,
        partner,
        updates,
      );
      let preference;

      try {
        preference = await requestUpdate();
      } catch (error) {
        if (error.status !== 401 || !lifecycle.isActive(sessionGeneration)) {
          throw error;
        }
        await refreshAccessToken(username, sessionGeneration);
        if (!lifecycle.isActive(sessionGeneration)) return false;
        preference = await requestUpdate();
      }

      if (!lifecycle.isActive(sessionGeneration)) return false;
      setChatPreferences((current) => {
        const next = { ...current, [partner]: preference };
        chatPreferencesRef.current = next;
        return next;
      });

      if (preference.archived) {
        setActiveChatUser((current) => (current === partner ? '' : current));
      }

      let notice = 'Настройки чата сохранены.';
      if ('pinned' in updates) {
        notice = preference.pinned ? 'Чат закреплён.' : 'Чат откреплён.';
      } else if ('muted' in updates) {
        notice = preference.muted
          ? 'Уведомления для чата выключены.'
          : 'Уведомления для чата включены.';
      } else if ('archived' in updates) {
        notice = preference.archived
          ? 'Чат перемещён в архив.'
          : 'Чат возвращён из архива.';
      }
      showNotification(notice, 'success');
      return true;
    } catch (error) {
      if (lifecycle.isActive(sessionGeneration)) {
        console.error(
          '[Chat Preferences] Не удалось сохранить настройку чата',
          error,
        );
        showNotification('Не удалось сохранить настройку чата.', 'error');
      }
      return false;
    } finally {
      if (lifecycle.isActive(sessionGeneration)) {
        setChatPreferenceSaving((current) => {
          const next = { ...current };
          delete next[partner];
          return next;
        });
      }
    }
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
      try {
        const readAt = new Date().toISOString();
        wsRef.current.send(JSON.stringify({
          type: 'read_receipt',
          sender: senderUsername,
        }));
        updateMessageEvents((events) => events.map((event) => (
          event.from === senderUsername && event.to === username
            ? {
                ...event,
                status: advanceMessageStatus(event.status, 'read'),
                readAt,
              }
            : event
        )));
        setUnreadCounts((current) => ({
          ...current,
          [senderUsername]: 0,
        }));
      } catch (error) {
        console.warn('[WS] Не удалось отправить подтверждение прочтения', error);
      }
    }
  }

  function flushDeliveryReceipts(socket) {
    if (socket?.readyState !== WebSocket.OPEN) return;

    for (const [messageId, clientId] of deliveryReceiptQueueRef.current) {
      try {
        socket.send(JSON.stringify({
          type: 'delivery_receipt',
          message_id: messageId,
          client_id: clientId,
        }));
        deliveryReceiptQueueRef.current.delete(messageId);
      } catch (error) {
        console.warn('[WS] Подтверждение доставки осталось в очереди', error);
        return;
      }
    }
  }

  function queueDeliveryReceipt(messageId, clientId) {
    if (!Number.isInteger(messageId)) return;
    deliveryReceiptQueueRef.current.set(messageId, clientId ?? null);
    flushDeliveryReceipts(wsRef.current);
  }

  async function requestHistoryPage(
    accessToken,
    beforeId = null,
    { unreadOnly = false, limit = HISTORY_PAGE_SIZE } = {},
  ) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (beforeId) query.set('before_id', String(beforeId));
    if (unreadOnly) query.set('unread_only', 'true');

    const response = await fetch(`/history/page?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function requestUnreadHistoryRows(accessToken, sessionGeneration) {
    const rows = [];
    const seenCursors = new Set();
    let beforeId = null;

    do {
      const page = await requestHistoryPage(accessToken, beforeId, {
        unreadOnly: true,
        limit: UNREAD_HISTORY_PAGE_SIZE,
      });
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return [];

      rows.push(...(page.messages ?? []));
      const nextBeforeId = page.next_before_id ?? null;
      if (!nextBeforeId || seenCursors.has(nextBeforeId)) break;
      seenCursors.add(nextBeforeId);
      beforeId = nextBeforeId;
    } while (beforeId);

    return rows;
  }

  async function cachePartnerNames(partners, sessionGeneration) {
    const newNamesToCache = {};
    await Promise.all(partners.map(async (partner) => {
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;
      if (userCacheRef.current[partner]) return;

      try {
        const response = await fetch(`/user/${partner}`);
        if (!response.ok) return;
        const userData = await response.json();
        newNamesToCache[partner] = userData.display_name;
      } catch (error) {
        console.error('[History] Не удалось загрузить имя пользователя', error);
      }
    }));

    if (
      sessionLifecycleRef.current.isActive(sessionGeneration) &&
      Object.keys(newNamesToCache).length > 0
    ) {
      setUserCache((current) => ({ ...current, ...newNamesToCache }));
    }
  }

  async function decryptHistoryEvents(
    encryptedMessages,
    myPrivateKey,
    currentUsername,
    sessionGeneration,
  ) {
    const decryptedEvents = [];

    for (const encryptedMessage of encryptedMessages) {
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) break;

      try {
        const decryptedText = await decryptMessagePacket(
          encryptedMessage,
          myPrivateKey,
          currentUsername,
        );
        const createdAt = encryptedMessage.created_at ?? null;
        decryptedEvents.push(parseMessageEvent(decryptedText, {
          id: encryptedMessage.id || crypto.randomUUID(),
          serverId: encryptedMessage.id,
          clientId: encryptedMessage.client_id ?? null,
          from: encryptedMessage.from,
          to: encryptedMessage.to,
          createdAt,
          deliveredAt: encryptedMessage.delivered_at ?? null,
          readAt: encryptedMessage.read_at ?? null,
          time: formatMessageTime(createdAt, encryptedMessage.time),
          status: encryptedMessage.status || 'sent',
        }));
        if (Number.isInteger(encryptedMessage.id)) {
          receivedMessageIdsRef.current.add(encryptedMessage.id);
        }

        if (
          encryptedMessage.from !== currentUsername &&
          encryptedMessage.status === 'sent'
        ) {
          queueDeliveryReceipt(
            encryptedMessage.id,
            encryptedMessage.client_id,
          );
        }
      } catch (decryptError) {
        console.error(
          `[History] Не удалось расшифровать сообщение ${encryptedMessage.id}:`,
          decryptError,
        );
      }
    }

    return decryptedEvents;
  }

  async function syncCloudHistory(
    myPrivateKey,
    currentUsername,
    accessToken,
    sessionGeneration,
  ) {
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    try {
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

      if (!myPrivateKey || !accessToken) {
        console.error('[History] Ключ или активная сессия отсутствуют');
        return;
      }

      const [page, preferenceList] = await Promise.all([
        requestHistoryPage(accessToken),
        listChatPreferences(accessToken).catch((error) => {
          console.error(
            '[Chat Preferences] Не удалось загрузить настройки чатов',
            error,
          );
          return [];
        }),
      ]);
      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

      const historyPartnerList = page.chat_partners ?? [];
      const preferencePartners = preferenceList.map(
        (preference) => preference.partner,
      );
      const partners = Array.from(new Set([
        ...historyPartnerList,
        ...preferencePartners,
      ]));
      await cachePartnerNames(partners, sessionGeneration);

      let encryptedRows = page.messages ?? [];
      if (!hasLoadedAllUnreadEventRows(
        encryptedRows,
        currentUsername,
        page.unread_counts,
      )) {
        const unreadRows = await requestUnreadHistoryRows(
          accessToken,
          sessionGeneration,
        );
        encryptedRows = mergeEncryptedHistoryRows(
          encryptedRows,
          unreadRows,
        );
      }

      const decryptedEvents = await decryptHistoryEvents(
        encryptedRows,
        myPrivateKey,
        currentUsername,
        sessionGeneration,
      );

      if (!sessionLifecycleRef.current.isActive(sessionGeneration)) return;

      historyBeforeIdRef.current = page.next_before_id ?? null;
      setHasOlderMessages(Boolean(page.next_before_id));
      const indexedPreferences = indexChatPreferences(preferenceList);
      chatPreferencesRef.current = indexedPreferences;
      setChatPreferences(indexedPreferences);
      setHistoryPartners(historyPartnerList);
      setChatPartners(partners);
      const messages = commitMessageEvents(
        decryptedEvents,
        currentUsername,
      );
      setUnreadCounts(
        buildUnreadMessageCounts(messages, currentUsername),
      );

      console.log('[History] Последняя страница восстановлена', {
        messages: materializeMessageEvents(
          decryptedEvents,
          currentUsername,
        ).length,
        chats: partners.length,
      });
    } catch (error) {
      if (sessionLifecycleRef.current.isActive(sessionGeneration)) {
        console.error('[History] Ошибка синхронизации:', error);
        showNotification('Не удалось загрузить историю сообщений.', 'error');
      }
    } finally {
      historyLoadingRef.current = false;
      if (sessionLifecycleRef.current.isActive(sessionGeneration)) {
        setHistoryLoading(false);
      }
    }
  }

  async function loadOlderMessages() {
    const lifecycle = sessionLifecycleRef.current;
    const sessionGeneration = lifecycle.currentGeneration();
    const beforeId = historyBeforeIdRef.current;
    const privateKey = myKeysRef.current.privateKey;
    const accessToken = sessionTokenRef.current;
    if (
      !lifecycle.isActive(sessionGeneration) ||
      !beforeId ||
      !privateKey ||
      !accessToken ||
      historyLoadingRef.current
    ) return;

    historyLoadingRef.current = true;
    setHistoryLoading(true);
    try {
      const page = await requestHistoryPage(accessToken, beforeId);
      if (!lifecycle.isActive(sessionGeneration)) return;

      const decryptedEvents = await decryptHistoryEvents(
        page.messages ?? [],
        privateKey,
        username,
        sessionGeneration,
      );
      if (!lifecycle.isActive(sessionGeneration)) return;

      historyBeforeIdRef.current = page.next_before_id ?? null;
      setHasOlderMessages(Boolean(page.next_before_id));
      const knownServerIds = new Set(
        messageEventsRef.current.map((item) => item.serverId),
      );
      const knownEventIds = new Set(
        messageEventsRef.current.map((item) => item.eventId),
      );
      const olderEvents = decryptedEvents.filter(
        (item) => (
          !knownServerIds.has(item.serverId) &&
          !knownEventIds.has(item.eventId)
        ),
      );
      const messages = commitMessageEvents(
        sortMessageEventsByServerOrder([
          ...olderEvents,
          ...messageEventsRef.current,
        ]),
        username,
      );
      setUnreadCounts(buildUnreadMessageCounts(messages, username));
    } catch (error) {
      if (lifecycle.isActive(sessionGeneration)) {
        console.error('[History] Ошибка загрузки старых сообщений:', error);
        showNotification('Не удалось загрузить предыдущие сообщения.', 'error');
      }
    } finally {
      historyLoadingRef.current = false;
      if (lifecycle.isActive(sessionGeneration)) {
        setHistoryLoading(false);
      }
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
          setEmail(loggedUser.email || '');
          setBio(loggedUser.bio || DEFAULT_BIO);
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
          setEmail('');
        }
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
        setEmail(loggedUser.email || '');
        setBio(loggedUser.bio || DEFAULT_BIO);
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

      for (const queued of outboundQueueRef.current.values()) {
        if (!isCurrentSocket()) return;

        try {
          ws.send(JSON.stringify({
            client_id: queued.clientId,
            to: queued.to,
            ciphertext: queued.ciphertext,
            iv: queued.iv,
            time: queued.time
          }));
        } catch (error) {
          console.warn('[WS] Сообщение осталось в очереди подтверждения', error);
          return;
        }
      }

      flushDeliveryReceipts(ws);
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
        updateMessageEvents((events) => events.map((eventItem) => (
          eventItem.from === user && eventItem.to === data.reader
            ? {
                ...eventItem,
                status: advanceMessageStatus(eventItem.status, 'read'),
                readAt: data.read_at ?? eventItem.readAt,
              }
            : eventItem
        )), user);
        return;
      }

      if (data.type === 'message_ack') {
        outboundQueueRef.current.delete(data.client_id);
        updateMessageEvents((events) => events.map((item) => (
          item.clientId === data.client_id
            ? {
                ...item,
                serverId: data.message_id,
                createdAt: data.created_at ?? item.createdAt,
                time: formatMessageTime(data.created_at, item.time),
                status: advanceMessageStatus(item.status, 'sent'),
              }
            : item
        )), user);
        return;
      }

      if (data.type === 'delivery_receipt_update') {
        updateMessageEvents((events) => events.map((item) => {
          const matchesServerId = item.serverId === data.message_id;
          const matchesClientId = data.client_id != null &&
            item.clientId === data.client_id;
          if (!matchesServerId && !matchesClientId) return item;

          return {
            ...item,
            serverId: data.message_id,
            deliveredAt: data.delivered_at ?? item.deliveredAt,
            status: advanceMessageStatus(item.status, 'delivered'),
          };
        }), user);
        return;
      }

      if (
        Number.isInteger(data.id) &&
        receivedMessageIdsRef.current.has(data.id)
      ) {
        queueDeliveryReceipt(data.id, data.client_id);
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

        const plaintext = new TextDecoder().decode(decryptedRaw);
        const createdAt = data.created_at ?? new Date().toISOString();
        const deliveredAt = data.delivered_at ?? new Date().toISOString();
        const incomingEvent = parseMessageEvent(plaintext, {
          id: data.id,
          serverId: data.id,
          clientId: data.client_id ?? null,
          from: data.from,
          to: user,
          createdAt,
          deliveredAt,
          readAt: null,
          time: formatMessageTime(createdAt, data.time),
          status: 'delivered',
        });
        if (Number.isInteger(data.id)) {
          receivedMessageIdsRef.current.add(data.id);
        }
        setChatPartners(prev => prev.includes(data.from) ? prev : [...prev, data.from]);
        setHistoryPartners((current) => (
          current.includes(data.from) ? current : [...current, data.from]
        ));
        const isActiveConversation = activeChatUserRef.current === data.from;
        const messages = updateMessageEvents(
          (events) => [...events, incomingEvent],
          user,
        );
        if (!isActiveConversation) {
          setUnreadCounts(buildUnreadMessageCounts(messages, user));
        }

        queueDeliveryReceipt(data.id, data.client_id);

        if (isActiveConversation) {
          sendReadReceipt(data.from);
        }

        if (!chatPreferencesRef.current[data.from]?.muted) {
          // playNotificationSound(); // временно отключено
          showNotification(
            getMessageEventNotification(incomingEvent),
            'chat',
            senderName,
          );
        }
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

  async function transmitMessageEvent(
    clientId,
    currentTarget,
    envelope,
    timeString,
    sessionGeneration,
  ) {
    const lifecycle = sessionLifecycleRef.current;
    const privateKey = myKeysRef.current.privateKey;

    if (!lifecycle.isActive(sessionGeneration) || !privateKey) return false;

    try {
      const res = await fetch(`/user/${currentTarget}`);
      if (!lifecycle.isActive(sessionGeneration)) return false;

      if (!res.ok) {
        throw new Error(`Не удалось получить пользователя: HTTP ${res.status}`);
      }

      const targetData = await res.json();
      if (!lifecycle.isActive(sessionGeneration)) return false;

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
        new TextEncoder().encode(serializeMessageEnvelope(envelope))
      );
      const ciphertextBase64 = arrayBufferToBase64(ciphertextRaw);
      const ivBase64 = arrayBufferToBase64(iv);

      if (!lifecycle.isActive(sessionGeneration)) return false;

      const packet = {
        clientId,
        to: currentTarget,
        ciphertext: ciphertextBase64,
        iv: ivBase64,
        time: timeString,
      };
      outboundQueueRef.current.set(clientId, packet);

      const currentWebSocket = wsRef.current;
      if (currentWebSocket?.readyState === WebSocket.OPEN) {
        currentWebSocket.send(JSON.stringify({
          client_id: clientId,
          to: currentTarget,
          ciphertext: ciphertextBase64,
          iv: ivBase64,
          time: timeString,
        }));
      }
      return true;
    } catch (error) {
      if (lifecycle.isActive(sessionGeneration)) {
        outboundQueueRef.current.delete(clientId);
        updateMessageEvents((events) => events.map((item) => (
          item.clientId === clientId
            ? { ...item, status: 'error' }
            : item
        )));
        console.error('[sendMessageEvent] Событие не отправлено:', error);
        showNotification(
          envelope.kind === 'message'
            ? 'Сообщение не отправлено. Можно повторить безопасно.'
            : 'Действие с сообщением не отправлено.',
          'error',
        );
      }
      return false;
    }
  }

  function queueMessageEventTransmission(
    clientId,
    currentTarget,
    envelope,
    timeString,
  ) {
    const sessionGeneration = sessionLifecycleRef.current.currentGeneration();
    return messageEventQueueRef.current.enqueue(() => transmitMessageEvent(
      clientId,
      currentTarget,
      envelope,
      timeString,
      sessionGeneration,
    ));
  }

  function enqueueMessageEvent(currentTarget, envelope) {
    const createdAt = new Date().toISOString();
    const timeString = formatMessageTime(createdAt);
    const optimisticEvent = parseMessageEvent(
      serializeMessageEnvelope(envelope),
      {
        id: envelope.event_id,
        serverId: null,
        clientId: envelope.event_id,
        from: username,
        to: currentTarget,
        createdAt,
        deliveredAt: null,
        readAt: null,
        time: timeString,
        status: 'sending',
      },
    );
    updateMessageEvents((events) => [...events, optimisticEvent]);
    void queueMessageEventTransmission(
      envelope.event_id,
      currentTarget,
      envelope,
      timeString,
    );
    return envelope.event_id;
  }

  function sendMessage(currentTarget, textOverride = null, options = {}) {
    const currentMessage = textOverride ?? message;
    if (!currentTarget || !currentMessage.trim()) return false;

    const lifecycle = sessionLifecycleRef.current;
    const sessionGeneration = lifecycle.currentGeneration();
    if (
      !lifecycle.isActive(sessionGeneration) ||
      !myKeysRef.current.privateKey
    ) return false;

    const eventId = window.crypto.randomUUID();
    const envelope = createMessageEnvelope({
      eventId,
      text: currentMessage,
      replyTo: options.replyTo ?? null,
    });
    enqueueMessageEvent(currentTarget, envelope);
    setMessage('');
    return eventId;
  }

  function retryMessage(messageId) {
    const failedEvent = messageEventsRef.current.find(
      (item) => (
        item.kind === 'message' &&
        item.messageId === messageId &&
        item.status === 'error'
      ),
    );
    if (!failedEvent || failedEvent.from !== username) return;

    outboundQueueRef.current.delete(failedEvent.clientId);
    updateMessageEvents((events) => events.map((item) => (
      item.eventId === failedEvent.eventId
        ? { ...item, status: 'sending' }
        : item
    )));
    void queueMessageEventTransmission(
      failedEvent.clientId,
      failedEvent.to,
      createMessageEnvelope({
        eventId: failedEvent.eventId,
        text: failedEvent.text,
        replyTo: failedEvent.replyToId,
      }),
      failedEvent.time,
    );
  }

  function editMessage(currentTarget, messageId, nextText) {
    const target = allMessages.find((item) => item.id === messageId);
    const cleanText = nextText.trim();
    if (
      !currentTarget ||
      !target ||
      target.from !== username ||
      target.deleted ||
      !cleanText ||
      cleanText === target.text
    ) return false;

    enqueueMessageEvent(
      currentTarget,
      createEditEnvelope({
        eventId: window.crypto.randomUUID(),
        targetId: messageId,
        text: cleanText,
      }),
    );
    return true;
  }

  function deleteMessage(currentTarget, messageId) {
    const target = allMessages.find((item) => item.id === messageId);
    if (
      !currentTarget ||
      !target ||
      target.from !== username ||
      target.deleted
    ) return false;

    enqueueMessageEvent(
      currentTarget,
      createDeleteEnvelope({
        eventId: window.crypto.randomUUID(),
        targetId: messageId,
      }),
    );
    return true;
  }

  function toggleMessageReaction(currentTarget, messageId, emoji) {
    const target = allMessages.find((item) => item.id === messageId);
    if (!currentTarget || !target || target.deleted) return false;
    const existingReaction = target.reactions.find(
      (reaction) => reaction.emoji === emoji,
    );

    enqueueMessageEvent(
      currentTarget,
      createReactionEnvelope({
        eventId: window.crypto.randomUUID(),
        targetId: messageId,
        emoji,
        operation: existingReaction?.reactedByMe ? 'remove' : 'add',
      }),
    );
    return true;
  }

  function clearLocalSession(reason) {
    sessionLifecycleRef.current.end();
    closeCurrentWebSocket(
      reason === 'switch-account' ? 'Switching account' : 'Logging out'
    );

    myKeysRef.current = { publicKey: null, privateKey: null };
    outboundQueueRef.current.clear();
    deliveryReceiptQueueRef.current.clear();
    receivedMessageIdsRef.current.clear();
    messageEventsRef.current = [];
    messageEventQueueRef.current.reset();
    historyBeforeIdRef.current = null;
    historyLoadingRef.current = false;
    chatPreferencesRef.current = {};
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
    setUnreadCounts({});
    setChatPreferences({});
    setChatPreferenceSaving({});
    setHistoryPartners([]);
    setHistoryLoading(false);
    setHasOlderMessages(false);
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
    unreadCounts,
    chatPreferences,
    chatPreferenceSaving,
    historyPartners,
    historyLoading,
    hasOlderMessages,
    loadOlderMessages,
    wsStatus,
    isProfileOpen, setIsProfileOpen,
    searchQuery, setSearchQuery,
    searchResults,
    sessions, sessionsLoading, loadSessions, revokeDeviceSession,
    viewingPartnerProfile, setViewingPartnerProfile,
    toasts, showNotification, dismissToast, // Выводим управление пушами наружу
    handleAuth, sendMessage, retryMessage, editMessage, deleteMessage,
    toggleMessageReaction, sendReadReceipt, logout, switchAccount,
    changeProfileData, saveChatPreference, tryStartChat,
    fetchAndCacheUser, inspectPartnerProfile
  };
}
