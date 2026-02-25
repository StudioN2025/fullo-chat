// Room Module for Supabase
console.log('Initializing room module...');

window.room = (function() {
    let currentRoom = null;
    let roomCode = null;
    let roomSubscription = null;
    let participantsSubscription = null;
    let messagesSubscription = null;
    let heartbeatInterval = null;
    let isHost = false;
    let roomCheckTimeout = null;
    let connectionCheckInterval = null;
    let leaveInProgress = false;
    let currentUser = null;
    let kickedListener = null;
    let wasKicked = false;
    let enlargedVideo = null;

    // DOM Elements
    const roomCodeInput = document.getElementById('roomCodeInput');
    const currentRoomCode = document.getElementById('currentRoomCode');
    const participantsContainer = document.getElementById('participantsContainer');
    const chatMessages = document.getElementById('chatMessages');
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const activeDisplayName = document.getElementById('activeDisplayName');
    const participantsCount = document.getElementById('participantsCount');
    const roomContainer = document.getElementById('roomContainer');
    const activeRoomContainer = document.getElementById('activeRoomContainer');
    const localVideoContainer = document.getElementById('localVideoContainer');
    const localScreenContainer = document.getElementById('localScreenContainer');

    console.log('DOM Elements loaded:', {
        roomCodeInput: !!roomCodeInput,
        participantsContainer: !!participantsContainer,
        activeRoomContainer: !!activeRoomContainer
    });

    // Генерация 12-значного кода комнаты
    function generateRoomCode() {
        return Math.floor(100000000000 + Math.random() * 900000000000).toString();
    }

    // Генерация уникального ID для комнаты
    function generateRoomId() {
        return 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Обновление отображения кода комнаты
    function updateRoomCodeDisplay(code) {
        if (currentRoomCode) currentRoomCode.textContent = code;
        if (roomCodeDisplay) roomCodeDisplay.textContent = code;
    }

    // Проверка бана перед действиями
    async function checkBanBeforeAction() {
        const user = window.auth?.getCurrentUser?.();
        if (!user) return true;
        
        try {
            const { data: userData, error } = await window.supabase
                .from('users')
                .select('banned, ban_expiry')
                .eq('id', user.id)
                .single();
            
            if (userData?.banned) {
                if (userData.ban_expiry) {
                    const expiryDate = new Date(userData.ban_expiry);
                    if (expiryDate > new Date()) {
                        window.auth.showError('❌ Ваш аккаунт заблокирован');
                        await window.supabase.auth.signOut();
                        return true;
                    }
                } else {
                    window.auth.showError('❌ Ваш аккаунт заблокирован');
                    await window.supabase.auth.signOut();
                    return true;
                }
            }
        } catch (error) {
            console.error('Error checking ban:', error);
        }
        return false;
    }

    // Создание комнаты
    async function createRoom() {
        console.log('createRoom called');
        
        if (await checkBanBeforeAction()) return;
        
        const user = window.auth?.getCurrentUser?.();
        if (!user) {
            window.auth.showError('Пользователь не авторизован');
            return;
        }

        currentUser = user;
        roomCode = generateRoomCode();
        
        try {
            // Получаем данные пользователя
            const { data: userData, error: userError } = await window.supabase
                .from('users')
                .select('display_name, avatar')
                .eq('id', user.id)
                .single();

            if (userError || !userData) {
                window.auth.showError('Профиль пользователя не найден');
                return;
            }

            const displayName = userData.display_name;
            const avatar = userData.avatar;

            // Генерируем уникальный ID для комнаты
            const roomId = generateRoomId();

            // Создаем комнату с явным ID
            const { data: roomData, error: roomError } = await window.supabase
                .from('rooms')
                .insert({
                    id: roomId,
                    code: roomCode,
                    host_id: user.id,
                    host_name: displayName,
                    active: true,
                    encrypted: true,
                    participants: [user.id]
                })
                .select()
                .single();

            if (roomError) throw roomError;

            currentRoom = roomData.id;
            isHost = true;

            // Обновляем текущую комнату пользователя
            await window.supabase
                .from('users')
                .update({ 
                    current_room: currentRoom,
                    online: true,
                    last_seen: new Date().toISOString()
                })
                .eq('id', user.id);

            // Добавляем участника в комнату
            await window.supabase
                .from('room_participants')
                .insert({
                    room_id: currentRoom,
                    user_id: user.id,
                    display_name: displayName,
                    avatar: avatar,
                    is_host: true,
                    online: true
                });

            // Initialize WebRTC
            if (window.peer && typeof window.peer.init === 'function') {
                await window.peer.init(user.id, displayName);
                window.peer.setCurrentRoom(currentRoom);
            }

            // Запускаем heartbeat
            startHeartbeat();

            // Запускаем проверку соединения
            startConnectionChecker();

            // Слушаем кик
            listenForKick();

            // Обновляем UI
            updateRoomCodeDisplay(roomCode);
            if (activeDisplayName) activeDisplayName.textContent = displayName;
            if (roomContainer) roomContainer.classList.add('hidden');
            if (activeRoomContainer) activeRoomContainer.classList.remove('hidden');
            
            // Запускаем слушатели
            listenToRoom();
            listenToParticipants();
            listenToMessages();

            window.auth.showSuccess('Комната создана! Код: ' + roomCode);
        } catch (error) {
            console.error('Error creating room:', error);
            window.auth.showError('Ошибка создания комнаты: ' + (error.message || 'Неизвестная ошибка'));
        }
    }

    // Подключение к комнате
    async function joinRoom() {
        console.log('joinRoom called');
        
        if (await checkBanBeforeAction()) return;
        
        const code = roomCodeInput?.value.trim();
        if (!code || code.length !== 12 || !/^\d+$/.test(code)) {
            window.auth.showError('Введите корректный 12-значный код');
            return;
        }

        const user = window.auth?.getCurrentUser?.();
        if (!user) {
            window.auth.showError('Пользователь не авторизован');
            return;
        }

        // Проверяем, не был ли пользователь кикнут
        const kickedStatus = localStorage.getItem('kicked_' + user.id + '_' + code);
        if (kickedStatus) {
            const kickTime = parseInt(kickedStatus);
            const now = Date.now();
            if (now - kickTime < 30000) {
                window.auth.showError('Вас выгнали из этой комнаты. Подождите 30 секунд.');
                return;
            } else {
                localStorage.removeItem('kicked_' + user.id + '_' + code);
            }
        }

        currentUser = user;

        try {
            // Ищем комнату по коду
            const { data: rooms, error: roomsError } = await window.supabase
                .from('rooms')
                .select('*')
                .eq('code', code)
                .eq('active', true);

            if (roomsError) throw roomsError;
            if (!rooms || rooms.length === 0) {
                window.auth.showError('Комната не найдена или уже удалена');
                return;
            }

            const roomData = rooms[0];
            currentRoom = roomData.id;
            roomCode = code;
            
            // Проверяем, является ли пользователь создателем
            isHost = (roomData.host_id === user.id);

            // Получаем данные пользователя
            const { data: userData, error: userError } = await window.supabase
                .from('users')
                .select('display_name, avatar')
                .eq('id', user.id)
                .single();

            if (userError || !userData) {
                window.auth.showError('Профиль пользователя не найден');
                return;
            }

            const displayName = userData.display_name;
            const avatar = userData.avatar;

            // Обновляем текущую комнату пользователя
            await window.supabase
                .from('users')
                .update({ 
                    current_room: currentRoom,
                    online: true,
                    last_seen: new Date().toISOString()
                })
                .eq('id', user.id);

            // Проверяем, существует ли уже участник
            const { data: existingParticipant, error: checkError } = await window.supabase
                .from('room_participants')
                .select('*')
                .eq('room_id', currentRoom)
                .eq('user_id', user.id)
                .maybeSingle();

            if (checkError) throw checkError;

            if (existingParticipant) {
                // Обновляем существующего участника
                await window.supabase
                    .from('room_participants')
                    .update({
                        online: true,
                        last_seen: new Date().toISOString(),
                        is_host: isHost,
                        display_name: displayName,
                        avatar: avatar,
                        muted: false
                    })
                    .eq('room_id', currentRoom)
                    .eq('user_id', user.id);
            } else {
                // Добавляем нового участника
                await window.supabase
                    .from('room_participants')
                    .insert({
                        room_id: currentRoom,
                        user_id: user.id,
                        display_name: displayName,
                        avatar: avatar,
                        is_host: isHost,
                        online: true,
                        muted: false,
                        camera: false,
                        screen: false
                    });
            }

            // Добавляем пользователя в массив participants, если его там нет
            if (!roomData.participants.includes(user.id)) {
                await window.supabase
                    .from('rooms')
                    .update({ 
                        participants: [...roomData.participants, user.id],
                        last_active: new Date().toISOString()
                    })
                    .eq('id', currentRoom);
            }

            // Initialize WebRTC
            if (window.peer && typeof window.peer.init === 'function') {
                await window.peer.init(user.id, displayName);
                window.peer.setCurrentRoom(currentRoom);
            }

            // Запускаем heartbeat
            startHeartbeat();

            // Запускаем проверку соединения
            startConnectionChecker();

            // Слушаем кик
            listenForKick();

            // Обновляем UI
            updateRoomCodeDisplay(roomCode);
            if (activeDisplayName) activeDisplayName.textContent = displayName;
            if (roomContainer) roomContainer.classList.add('hidden');
            if (activeRoomContainer) activeRoomContainer.classList.remove('hidden');

            // Запускаем слушатели
            listenToRoom();
            listenToParticipants();
            listenToMessages();

            // Отправляем сообщение о подключении
            await window.supabase
                .from('messages')
                .insert({
                    room_id: currentRoom,
                    sender_id: 'system',
                    sender_name: '🔔 Система',
                    message: displayName + ' присоединился к комнате',
                    type: 'join',
                    encrypted: true
                });

            window.auth.showSuccess('Подключение к комнате выполнено');
        } catch (error) {
            console.error('Error joining room:', error);
            window.auth.showError('Ошибка подключения к комнате: ' + error.message);
        }
    }

    // Слушаем изменения комнаты
    function listenToRoom() {
        if (!currentRoom) return;
        if (roomSubscription) roomSubscription.unsubscribe();

        roomSubscription = window.supabase
            .channel('room-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'rooms',
                    filter: 'id=eq.' + currentRoom
                },
                (payload) => {
                    console.log('Room change:', payload);
                    if (!payload.new && !leaveInProgress && !wasKicked) {
                        console.log('Room deleted');
                        window.auth.showError('Комната была удалена');
                        forceLeave();
                    }
                }
            )
            .subscribe();
    }

    // Слушаем изменения участников
    function listenToParticipants() {
        if (!currentRoom) return;
        if (participantsSubscription) participantsSubscription.unsubscribe();

        participantsSubscription = window.supabase
            .channel('participants-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'room_participants',
                    filter: 'room_id=eq.' + currentRoom
                },
                (payload) => {
                    console.log('Participants change:', payload);
                    if (leaveInProgress || wasKicked) return;
                    
                    // Обновляем UI при изменениях
                    loadParticipants();
                }
            )
            .subscribe();
    }

    // Загрузка участников
    async function loadParticipants() {
        if (!currentRoom || leaveInProgress || wasKicked) return;

        try {
            const { data: participants, error } = await window.supabase
                .from('room_participants')
                .select('*')
                .eq('room_id', currentRoom);

            if (error) throw error;

            const now = Date.now();
            const currentUserId = window.auth?.getCurrentUser?.()?.id;
            
            // Фильтруем онлайн участников (последняя активность менее 7 секунд)
            const onlineParticipants = participants.filter(p => {
                if (p.user_id === currentUserId) return true;
                if (!p.online) return false;
                
                const lastSeen = new Date(p.last_seen).getTime();
                const diff = now - lastSeen;
                return diff < 7000;
            });

            if (participantsCount) participantsCount.textContent = onlineParticipants.length;

            // Проверяем пустую комнату
            const otherParticipants = onlineParticipants.filter(p => p.user_id !== currentUserId);
            checkEmptyRoom(otherParticipants);

            const onlineIds = new Set(onlineParticipants.map(p => p.user_id));
            
            // Удаляем офлайн участников из UI
            document.querySelectorAll('.participant-card').forEach(card => {
                const cardId = card.id.replace('participant-', '');
                if (!onlineIds.has(cardId) && cardId !== currentUserId) {
                    removeParticipantFromUI(cardId);
                }
            });

            // Добавляем или обновляем участников
            onlineParticipants.forEach(p => {
                const card = document.getElementById('participant-' + p.user_id);
                if (card) {
                    updateParticipantInUI(p.user_id, p);
                } else {
                    addParticipantToUI(p.user_id, p);
                }
            });

            // Подключаемся к новым участникам
            onlineParticipants.forEach(p => {
                if (p.user_id !== currentUserId) {
                    setTimeout(() => {
                        if (window.peer && typeof window.peer.connectToPeer === 'function') {
                            window.peer.connectToPeer(p.user_id);
                        }
                    }, 1000);
                }
            });
        } catch (error) {
            console.error('Error loading participants:', error);
        }
    }

    // Слушаем сообщения
    function listenToMessages() {
        if (!currentRoom) return;
        if (messagesSubscription) messagesSubscription.unsubscribe();

        messagesSubscription = window.supabase
            .channel('messages-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: 'room_id=eq.' + currentRoom
                },
                (payload) => {
                    console.log('New message:', payload);
                    if (leaveInProgress || wasKicked) return;
                    
                    const data = payload.new;
                    
                    if (data.type === 'kick' && data.target_user_id === currentUser?.id) {
                        console.log('Kick message received');
                        forceLeave();
                    } else if (data.type === 'room_deleted') {
                        console.log('Room deleted message received');
                        forceLeave();
                    } else if (data.sender_id !== window.auth?.getCurrentUser?.()?.id) {
                        if (window.peer && typeof window.peer.addMessage === 'function') {
                            window.peer.addMessage(data.sender_name, data.message);
                        }
                    }
                }
            )
            .subscribe();
    }

    // Слушаем кик
    function listenForKick() {
        if (!currentRoom || !currentUser) return;
        
        if (kickedListener) {
            kickedListener.unsubscribe();
        }

        kickedListener = window.supabase
            .channel('kick-check')
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'room_participants',
                    filter: 'room_id=eq.' + currentRoom + ' and user_id=eq.' + currentUser.id
                },
                () => {
                    if (currentRoom && !leaveInProgress && !wasKicked) {
                        console.log('You have been kicked from the room');
                        
                        wasKicked = true;
                        
                        if (roomCode) {
                            localStorage.setItem('kicked_' + currentUser.id + '_' + roomCode, Date.now().toString());
                        }
                        
                        window.auth.showError('❌ Вас выгнали из комнаты');
                        
                        forceLeave();
                    }
                }
            )
            .subscribe();
    }

    // Принудительный выход
    function forceLeave() {
        console.log('Force leaving room due to kick');
        
        leaveInProgress = true;
        
        stopAllListeners();
        
        if (window.peer && typeof window.peer.cleanup === 'function') {
            window.peer.cleanup();
        }

        // Обновляем статус пользователя
        if (currentUser) {
            window.supabase
                .from('users')
                .update({
                    current_room: null,
                    last_seen: new Date().toISOString()
                })
                .eq('id', currentUser.id)
                .then(() => {});
        }

        // Скрываем видео
        if (localVideoContainer) localVideoContainer.classList.add('hidden');
        if (localScreenContainer) localScreenContainer.classList.add('hidden');

        if (participantsContainer) participantsContainer.innerHTML = '';
        if (chatMessages) chatMessages.innerHTML = '';
        
        enlargedVideo = null;
        
        // Отписываемся от всех каналов
        if (roomSubscription) roomSubscription.unsubscribe();
        if (participantsSubscription) participantsSubscription.unsubscribe();
        if (messagesSubscription) messagesSubscription.unsubscribe();
        if (kickedListener) kickedListener.unsubscribe();
        
        currentRoom = null;
        roomCode = null;
        isHost = false;
        leaveInProgress = false;
        wasKicked = false;

        if (roomContainer) roomContainer.classList.remove('hidden');
        if (activeRoomContainer) activeRoomContainer.classList.add('hidden');
        if (roomCodeInput) roomCodeInput.value = '';
    }

    // Остановка всех слушателей
    function stopAllListeners() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval);
            connectionCheckInterval = null;
        }
        if (roomCheckTimeout) {
            clearTimeout(roomCheckTimeout);
            roomCheckTimeout = null;
        }
    }

    // Heartbeat
    function startHeartbeat() {
        const user = window.auth?.getCurrentUser?.();
        if (!user || !currentRoom) return;

        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }

        heartbeatInterval = setInterval(async () => {
            if (currentRoom && user && navigator.onLine && !leaveInProgress && !wasKicked) {
                try {
                    await window.supabase
                        .from('room_participants')
                        .update({
                            online: true,
                            last_seen: new Date().toISOString()
                        })
                        .eq('room_id', currentRoom)
                        .eq('user_id', user.id);
                    
                    await window.supabase
                        .from('users')
                        .update({
                            online: true,
                            last_seen: new Date().toISOString(),
                            current_room: currentRoom
                        })
                        .eq('id', user.id);
                    
                    console.log('Heartbeat sent');
                } catch (error) {
                    console.error('Error sending heartbeat:', error);
                }
            }
        }, 3000);
    }

    // Проверка соединения
    function startConnectionChecker() {
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval);
        }

        connectionCheckInterval = setInterval(() => {
            if (!navigator.onLine && !leaveInProgress && !wasKicked) {
                console.log('Internet connection lost');
                window.auth.showError('Потеряно соединение с интернетом');
            }
        }, 5000);
    }

    // Проверка пустой комнаты
    function checkEmptyRoom(otherParticipants) {
        if (roomCheckTimeout) {
            clearTimeout(roomCheckTimeout);
        }

        if (otherParticipants.length === 0) {
            console.log('Room has no other participants, scheduling deletion in 7 seconds');
            roomCheckTimeout = setTimeout(async () => {
                if (currentRoom) {
                    try {
                        const { data, error } = await window.supabase
                            .from('room_participants')
                            .select('*')
                            .eq('room_id', currentRoom);
                        
                        if (error) throw error;
                        
                        if (data.length <= 1) {
                            await window.supabase
                                .from('rooms')
                                .delete()
                                .eq('id', currentRoom);
                            
                            console.log('Room deleted - no other participants');
                            
                            if (!leaveInProgress && !wasKicked) {
                                window.auth.showError('Комната удалена');
                                forceLeave();
                            }
                        }
                    } catch (error) {
                        console.error('Error deleting empty room:', error);
                    }
                }
            }, 7000);
        }
    }

    // Добавление участника в UI
    function addParticipantToUI(userId, data) {
        if (!participantsContainer) return;
        
        if (document.getElementById('participant-' + userId)) return;

        const card = document.createElement('div');
        card.className = 'participant-card';
        card.id = 'participant-' + userId;
        
        const currentUserId = window.auth?.getCurrentUser?.()?.id;
        const isCurrentUser = userId === currentUserId;
        const hostBadge = data.is_host ? ' 👑' : '';
        const mutedIcon = data.muted ? ' 🔇' : '';
        const cameraIcon = data.camera ? ' 📷' : '';
        const screenIcon = data.screen ? ' 🖥️' : '';
        
        if (isCurrentUser) {
            card.classList.add('current-user');
        }
        
        // Аватарка
        let avatarHtml = '';
        if (data.avatar) {
            avatarHtml = '<div class="participant-avatar" style="background-image: url(\'' + data.avatar + '\')"></div>';
        } else {
            const firstLetter = data.display_name ? data.display_name.charAt(0).toUpperCase() : '?';
            avatarHtml = '<div class="participant-avatar default-avatar">' + firstLetter + '</div>';
        }
        
        // Контейнер для видео
        const videoContainer = '<div class="participant-video-container" id="video-container-' + userId + '"></div>';
        
        // Контейнер для экрана
        const screenContainer = '<div class="participant-screen-container" id="screen-container-' + userId + '"></div>';
        
        // Кнопка увеличения
        const enlargeButton = '<button class="enlarge-video-btn hidden" id="enlarge-' + userId + '" onclick="if(window.room) window.room.enlargeVideo(\'' + userId + '\', \'video\')">🔍 Увеличить</button>';
        
        // Контролы для хоста
        let controls = '';
        const currentUserIsHost = isHost;
        if (currentUserIsHost && !isCurrentUser && !data.is_host) {
            controls = '<div class="participant-controls">' +
                '<button class="mute-btn" onclick="if(window.room) window.room.' + (data.muted ? 'unmuteParticipant' : 'muteParticipant') + '(\'' + userId + '\')">' +
                    (data.muted ? '🔊 Включить звук' : '🔇 Заглушить') +
                '</button>' +
                '<button class="kick-btn" onclick="if(confirm(\'Вы уверены, что хотите выгнать этого участника?\') && window.room) window.room.kickParticipant(\'' + userId + '\')">' +
                    '👢 Выгнать' +
                '</button>' +
            '</div>';
        }
        
        card.innerHTML = 
            '<div class="participant-header">' +
                avatarHtml +
                '<div class="participant-name-container">' +
                    '<div class="participant-name">' +
                        (data.display_name || 'Unknown') + hostBadge +
                        (isCurrentUser ? '<span class="current-user-badge">(Вы)</span>' : '') +
                    '</div>' +
                    '<div class="participant-status" id="status-' + userId + '">' +
                        '🟢 В сети' + mutedIcon + cameraIcon + screenIcon +
                    '</div>' +
                '</div>' +
            '</div>' +
            videoContainer +
            screenContainer +
            '<div class="participant-video-controls">' +
                enlargeButton +
            '</div>' +
            controls;

        participantsContainer.appendChild(card);
    }

    // Обновление участника в UI
    function updateParticipantInUI(userId, data) {
        const card = document.getElementById('participant-' + userId);
        if (!card) return;
        
        // Обновляем статус
        const statusDiv = card.querySelector('.participant-status');
        if (statusDiv) {
            const mutedIcon = data.muted ? ' 🔇' : '';
            const cameraIcon = data.camera ? ' 📷' : '';
            const screenIcon = data.screen ? ' 🖥️' : '';
            statusDiv.innerHTML = '🟢 В сети' + mutedIcon + cameraIcon + screenIcon;
        }
        
        // Обновляем кнопку увеличения
        const enlargeBtn = document.getElementById('enlarge-' + userId);
        const videoContainer = document.getElementById('video-container-' + userId);
        if (enlargeBtn && videoContainer) {
            if (videoContainer.children.length > 0) {
                enlargeBtn.classList.remove('hidden');
            } else {
                enlargeBtn.classList.add('hidden');
            }
        }
    }

    // Удаление участника из UI
    function removeParticipantFromUI(userId) {
        const card = document.getElementById('participant-' + userId);
        if (card) {
            console.log('Removing participant from UI:', userId);
            card.remove();
            
            if (enlargedVideo === userId + 'video' || enlargedVideo === userId + 'screen') {
                enlargedVideo = null;
            }
        }
    }

    // Увеличение видео
    function enlargeVideo(userId, type) {
        console.log('Enlarging video:', userId, type);
        const videoElement = document.getElementById(type + '-' + userId);
        if (!videoElement) return;
        
        if (enlargedVideo === userId + type) {
            videoElement.classList.remove('enlarged');
            enlargedVideo = null;
        } else {
            if (enlargedVideo) {
                const prevId = enlargedVideo.slice(0, -1);
                const prevType = enlargedVideo.slice(-1) === 'v' ? 'video' : 'screen';
                const prevVideo = document.getElementById(prevType + '-' + prevId);
                if (prevVideo) prevVideo.classList.remove('enlarged');
            }
            
            videoElement.classList.add('enlarged');
            enlargedVideo = userId + type;
            videoElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Копирование кода комнаты
    function copyRoomCode() {
        if (!roomCode) return;
        navigator.clipboard.writeText(roomCode)
            .then(() => window.auth.showSuccess('Код скопирован!'))
            .catch(() => window.auth.showError('Ошибка копирования'));
    }

    // Выход из комнаты
    async function leaveRoom() {
        if (leaveInProgress || wasKicked) return;
        leaveInProgress = true;
        
        const user = window.auth?.getCurrentUser?.();
        console.log('Leaving room:', currentRoom, 'user:', user?.id);
        
        if (currentRoom && user) {
            try {
                // Получаем имя пользователя
                const { data: userData } = await window.supabase
                    .from('users')
                    .select('display_name')
                    .eq('id', user.id)
                    .single();

                const displayName = userData?.display_name || 'Пользователь';
                
                // Отправляем сообщение о выходе
                await window.supabase
                    .from('messages')
                    .insert({
                        room_id: currentRoom,
                        sender_id: 'system',
                        sender_name: '🔔 Система',
                        message: displayName + ' покинул комнату',
                        type: 'leave',
                        encrypted: true
                    });

                // Обновляем статус участника
                await window.supabase
                    .from('room_participants')
                    .update({
                        online: false,
                        last_seen: new Date().toISOString()
                    })
                    .eq('room_id', currentRoom)
                    .eq('user_id', user.id);

                // Удаляем пользователя из массива participants
                const { data: roomData } = await window.supabase
                    .from('rooms')
                    .select('participants')
                    .eq('id', currentRoom)
                    .single();
                
                if (roomData) {
                    const updatedParticipants = roomData.participants.filter(id => id !== user.id);
                    await window.supabase
                        .from('rooms')
                        .update({
                            participants: updatedParticipants,
                            last_active: new Date().toISOString()
                        })
                        .eq('id', currentRoom);
                }

                // Обновляем статус пользователя
                await window.supabase
                    .from('users')
                    .update({
                        current_room: null,
                        last_seen: new Date().toISOString()
                    })
                    .eq('id', user.id);
                    
            } catch (error) {
                console.error('Error leaving room:', error);
            }
        }

        stopAllListeners();
        
        if (window.peer && typeof window.peer.cleanup === 'function') {
            window.peer.cleanup();
        }

        // Скрываем видео
        if (localVideoContainer) localVideoContainer.classList.add('hidden');
        if (localScreenContainer) localScreenContainer.classList.add('hidden');

        if (participantsContainer) participantsContainer.innerHTML = '';
        if (chatMessages) chatMessages.innerHTML = '';
        
        // Отписываемся от всех каналов
        if (roomSubscription) roomSubscription.unsubscribe();
        if (participantsSubscription) participantsSubscription.unsubscribe();
        if (messagesSubscription) messagesSubscription.unsubscribe();
        if (kickedListener) kickedListener.unsubscribe();
        
        currentRoom = null;
        roomCode = null;
        isHost = false;
        leaveInProgress = false;

        if (roomContainer) roomContainer.classList.remove('hidden');
        if (activeRoomContainer) activeRoomContainer.classList.add('hidden');
        
        window.auth.showSuccess('Вы покинули комнату');
        if (roomCodeInput) roomCodeInput.value = '';
    }

    // Заглушить участника (только для хоста)
    async function muteParticipant(userId) {
        if (!isHost || !currentRoom) return;
        try {
            await window.supabase
                .from('room_participants')
                .update({ muted: true })
                .eq('room_id', currentRoom)
                .eq('user_id', userId);
            
            window.auth.showSuccess('Участник заглушен');
        } catch (error) {
            console.error('Error muting participant:', error);
        }
    }

    // Включить звук участника (только для хоста)
    async function unmuteParticipant(userId) {
        if (!isHost || !currentRoom) return;
        try {
            await window.supabase
                .from('room_participants')
                .update({ muted: false })
                .eq('room_id', currentRoom)
                .eq('user_id', userId);
            
            window.auth.showSuccess('Звук включен');
            
            // Переподключаемся для восстановления аудио
            if (window.peer && typeof window.peer.connectToPeer === 'function') {
                setTimeout(() => {
                    window.peer.connectToPeer(userId);
                }, 1000);
            }
        } catch (error) {
            console.error('Error unmuting participant:', error);
        }
    }

    // Выгнать участника (только для хоста)
    async function kickParticipant(userId) {
        if (!isHost || !currentRoom || userId === currentUser?.id) return;
        
        try {
            // Получаем имя участника
            const { data: participant } = await window.supabase
                .from('room_participants')
                .select('display_name')
                .eq('room_id', currentRoom)
                .eq('user_id', userId)
                .single();
            
            const participantName = participant?.display_name || 'Участник';

            // Закрываем WebRTC соединение
            if (window.peer && typeof window.peer.closeConnection === 'function') {
                window.peer.closeConnection(userId);
            }

            // Удаляем участника из комнаты
            await window.supabase
                .from('room_participants')
                .delete()
                .eq('room_id', currentRoom)
                .eq('user_id', userId);

            // Удаляем из массива participants
            const { data: roomData } = await window.supabase
                .from('rooms')
                .select('participants')
                .eq('id', currentRoom)
                .single();
            
            if (roomData) {
                const updatedParticipants = roomData.participants.filter(id => id !== userId);
                await window.supabase
                    .from('rooms')
                    .update({ participants: updatedParticipants })
                    .eq('id', currentRoom);
            }

            // Обновляем статус пользователя
            await window.supabase
                .from('users')
                .update({
                    current_room: null,
                    last_seen: new Date().toISOString()
                })
                .eq('id', userId);

            // Отправляем сообщение о кике
            await window.supabase
                .from('messages')
                .insert({
                    room_id: currentRoom,
                    sender_id: 'system',
                    sender_name: '👑 Система',
                    message: participantName + ' был удален из комнаты',
                    type: 'kick',
                    target_user_id: userId,
                    encrypted: true
                });
            
            window.auth.showSuccess('Участник удален');
        } catch (error) {
            console.error('Error kicking participant:', error);
            window.auth.showError('Ошибка при удалении участника');
        }
    }

    // Удалить комнату (только для хоста)
    async function deleteRoom() {
        if (!isHost || !currentRoom) return;
        
        if (!confirm('Вы уверены, что хотите удалить комнату? Все участники будут отключены.')) return;
        
        try {
            // Отправляем сообщение о удалении
            await window.supabase
                .from('messages')
                .insert({
                    room_id: currentRoom,
                    sender_id: 'system',
                    sender_name: '👑 Система',
                    message: 'Комната была удалена создателем',
                    type: 'room_deleted',
                    encrypted: true
                });

            // Закрываем все WebRTC соединения
            if (window.peer && typeof window.peer.cleanup === 'function') {
                window.peer.cleanup();
            }

            // Получаем всех участников для обновления их статуса
            const { data: participants } = await window.supabase
                .from('room_participants')
                .select('user_id')
                .eq('room_id', currentRoom);

            // Обновляем статус каждого участника
            if (participants) {
                for (const p of participants) {
                    await window.supabase
                        .from('users')
                        .update({
                            current_room: null,
                            last_seen: new Date().toISOString()
                        })
                        .eq('id', p.user_id);
                }
            }

            // Удаляем комнату (каскадно удалятся все связанные записи)
            await window.supabase
                .from('rooms')
                .delete()
                .eq('id', currentRoom);
            
            window.auth.showSuccess('Комната удалена');
            forceLeave();
        } catch (error) {
            console.error('Error deleting room:', error);
            window.auth.showError('Ошибка при удалении комнаты');
        }
    }

    console.log('Room module ready');

    return {
        createRoom: createRoom,
        joinRoom: joinRoom,
        leaveRoom: leaveRoom,
        copyRoomCode: copyRoomCode,
        muteParticipant: muteParticipant,
        unmuteParticipant: unmuteParticipant,
        kickParticipant: kickParticipant,
        deleteRoom: deleteRoom,
        enlargeVideo: enlargeVideo,
        getCurrentRoom: () => currentRoom,
        getRoomCode: () => roomCode,
        isCurrentUserHost: () => isHost
    };
})();

console.log('Room module loaded:', !!window.room);
