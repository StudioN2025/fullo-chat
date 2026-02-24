// Auth Module with Supabase
window.auth = (function() {
    let currentUser = null;
    let isAuthModeLogin = true;
    let userDisplayName = '';
    let banCheckInterval = null;
    let onlineHeartbeat = null;
    let userSettings = {};

    // DOM Elements
    const authContainer = document.getElementById('authContainer');
    const profileContainer = document.getElementById('profileContainer');
    const roomContainer = document.getElementById('roomContainer');
    const activeRoomContainer = document.getElementById('activeRoomContainer');
    const settingsModal = document.getElementById('settingsModal');
    const authTitle = document.getElementById('authTitle');
    const authButton = document.getElementById('authButton');
    const switchAuthButton = document.getElementById('switchAuthButton');
    const switchAuthText = document.getElementById('switchAuthText');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const displayNameSpan = document.getElementById('displayName');
    const activeDisplayNameSpan = document.getElementById('activeDisplayName');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const profileNameInput = document.getElementById('profileNameInput');

    // Settings Elements
    const settingsNameInput = document.getElementById('settingsNameInput');
    const settingsEmailInput = document.getElementById('settingsEmailInput');
    const settingsStatusSelect = document.getElementById('settingsStatusSelect');
    const notifyMessages = document.getElementById('notifyMessages');
    const notifyJoin = document.getElementById('notifyJoin');
    const notifyLeave = document.getElementById('notifyLeave');
    const micVolume = document.getElementById('micVolume');
    const micVolumeValue = document.getElementById('micVolumeValue');
    const speakerVolume = document.getElementById('speakerVolume');
    const speakerVolumeValue = document.getElementById('speakerVolumeValue');
    const avatarInput = document.getElementById('avatarInput');
    const avatarPreview = document.getElementById('avatarPreview');

    // Check current session
    async function checkSession() {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session?.user) {
            handleUser(session.user);
        } else {
            showAuthContainer();
        }
    }

    // Handle authenticated user
    async function handleUser(user) {
        currentUser = user;
        
        // Check if user is banned
        const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (userData?.banned) {
            if (userData.ban_expiry) {
                const expiryDate = new Date(userData.ban_expiry);
                if (expiryDate > new Date()) {
                    handleBannedUser();
                    return;
                }
            } else {
                handleBannedUser();
                return;
            }
        }

        if (userData?.display_name) {
            userDisplayName = userData.display_name;
            userSettings = {
                displayName: userData.display_name,
                email: user.email,
                status: userData.status || 'online',
                notifyMessages: userData.notify_messages !== false,
                notifyJoin: userData.notify_join !== false,
                notifyLeave: userData.notify_leave !== false,
                micVolume: userData.mic_volume || 80,
                speakerVolume: userData.speaker_volume || 100,
                avatar: userData.avatar || null
            };
            
            showRoomContainer(userDisplayName);
            startOnlineHeartbeat();
            startBanCheck(user.id);
        } else {
            showProfileContainer();
        }
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth event:', event);
        if (event === 'SIGNED_IN' && session?.user) {
            handleUser(session.user);
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showAuthContainer();
            stopOnlineHeartbeat();
            stopBanCheck();
        }
    });

    // Check session on load
    checkSession();

    // Show functions
    function showAuthContainer() {
        authContainer.classList.remove('hidden');
        profileContainer.classList.add('hidden');
        roomContainer.classList.add('hidden');
        activeRoomContainer.classList.add('hidden');
        settingsModal.classList.add('hidden');
        clearMessages();
    }

    function showProfileContainer() {
        authContainer.classList.add('hidden');
        profileContainer.classList.remove('hidden');
        roomContainer.classList.add('hidden');
        activeRoomContainer.classList.add('hidden');
        settingsModal.classList.add('hidden');
        clearMessages();
    }

    function showRoomContainer(displayName) {
        authContainer.classList.add('hidden');
        profileContainer.classList.add('hidden');
        roomContainer.classList.remove('hidden');
        activeRoomContainer.classList.add('hidden');
        settingsModal.classList.add('hidden');
        
        displayNameSpan.textContent = 'Привет, ' + displayName + '!';
        activeDisplayNameSpan.textContent = displayName;
        userDisplayName = displayName;
        clearMessages();
    }

    function showActiveRoom() {
        authContainer.classList.add('hidden');
        profileContainer.classList.add('hidden');
        roomContainer.classList.add('hidden');
        activeRoomContainer.classList.remove('hidden');
        settingsModal.classList.add('hidden');
    }

    function clearMessages() {
        errorMessage.textContent = '';
        successMessage.textContent = '';
    }

    function showError(text) {
        errorMessage.textContent = text;
        successMessage.textContent = '';
        if (window.showNotification) {
            window.showNotification(text, 'error');
        }
    }

    function showSuccess(text) {
        successMessage.textContent = text;
        errorMessage.textContent = '';
        if (window.showNotification) {
            window.showNotification(text, 'success');
        }
    }

    // Switch between login and signup
    function switchAuthMode() {
        isAuthModeLogin = !isAuthModeLogin;
        if (isAuthModeLogin) {
            authTitle.textContent = 'Вход в FulloChat';
            authButton.textContent = 'Войти';
            switchAuthButton.textContent = 'Создать аккаунт';
            switchAuthText.textContent = 'Нет аккаунта? Зарегистрируйтесь';
        } else {
            authTitle.textContent = 'Регистрация в FulloChat';
            authButton.textContent = 'Зарегистрироваться';
            switchAuthButton.textContent = 'Войти';
            switchAuthText.textContent = 'Уже есть аккаунт? Войдите';
        }
        clearMessages();
    }

    // Handle authentication
    async function handleAuth() {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError('Пожалуйста, заполните все поля');
            return;
        }

        try {
            if (isAuthModeLogin) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                if (error) throw error;
                showSuccess('Вход выполнен успешно!');
            } else {
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password
                });
                if (error) throw error;
                showSuccess('Регистрация успешна! Проверьте email для подтверждения.');
            }
        } catch (error) {
            showError('Ошибка: ' + error.message);
        }
    }

    // Save profile
    async function saveProfile() {
        const displayName = profileNameInput.value.trim();
        
        if (!displayName) {
            showError('Пожалуйста, введите ваше имя');
            return;
        }

        if (displayName.length > 30) {
            showError('Имя не должно превышать 30 символов');
            return;
        }

        try {
            const { error } = await supabase
                .from('users')
                .insert({
                    id: currentUser.id,
                    email: currentUser.email,
                    display_name: displayName,
                    online: true,
                    last_seen: new Date().toISOString(),
                    notify_messages: true,
                    notify_join: true,
                    notify_leave: true,
                    mic_volume: 80,
                    speaker_volume: 100
                });

            if (error) throw error;

            userDisplayName = displayName;
            showRoomContainer(displayName);
            showSuccess('Профиль сохранен!');
            
            startOnlineHeartbeat();
        } catch (error) {
            showError('Ошибка сохранения профиля: ' + error.message);
        }
    }

    // Logout
    async function logout() {
        try {
            stopOnlineHeartbeat();
            stopBanCheck();
            
            if (currentUser) {
                await supabase
                    .from('users')
                    .update({ online: false, last_seen: new Date().toISOString() })
                    .eq('id', currentUser.id);
            }
            
            if (window.room && window.room.getCurrentRoom()) {
                await window.room.leaveRoom();
            }
            
            if (window.peer) {
                window.peer.cleanup();
            }
            
            await supabase.auth.signOut();
            showSuccess('Выход выполнен');
        } catch (error) {
            showError('Ошибка выхода: ' + error.message);
        }
    }

    // Heartbeat для онлайн статуса
    function startOnlineHeartbeat() {
        if (onlineHeartbeat) clearInterval(onlineHeartbeat);
        
        onlineHeartbeat = setInterval(async function() {
            if (currentUser && !document.hidden) {
                await supabase
                    .from('users')
                    .update({ 
                        online: true, 
                        last_seen: new Date().toISOString() 
                    })
                    .eq('id', currentUser.id);
            }
        }, 10000);
    }

    function stopOnlineHeartbeat() {
        if (onlineHeartbeat) {
            clearInterval(onlineHeartbeat);
            onlineHeartbeat = null;
        }
    }

    // Проверка бана
    async function checkIfBanned(userId) {
        const { data, error } = await supabase
            .from('users')
            .select('banned, ban_expiry')
            .eq('id', userId)
            .single();
        
        if (data?.banned) {
            if (data.ban_expiry) {
                const expiryDate = new Date(data.ban_expiry);
                return expiryDate > new Date();
            }
            return true;
        }
        return false;
    }

    function startBanCheck(userId) {
        if (banCheckInterval) clearInterval(banCheckInterval);
        
        banCheckInterval = setInterval(async function() {
            if (currentUser) {
                const isBanned = await checkIfBanned(userId);
                if (isBanned) {
                    showError('❌ Ваш аккаунт был заблокирован');
                    
                    if (window.room && window.room.getCurrentRoom()) {
                        await window.room.leaveRoom();
                    }
                    
                    await supabase.auth.signOut();
                }
            }
        }, 30000);
    }

    function stopBanCheck() {
        if (banCheckInterval) {
            clearInterval(banCheckInterval);
            banCheckInterval = null;
        }
    }

    function handleBannedUser() {
        showError('❌ Ваш аккаунт заблокирован');
        supabase.auth.signOut();
    }

    // Public API
    return {
        handleAuth: handleAuth,
        switchAuthMode: switchAuthMode,
        saveProfile: saveProfile,
        logout: logout,
        showError: showError,
        showSuccess: showSuccess,
        showActiveRoom: showActiveRoom,
        showSettings: function() { /* TODO */ },
        hideSettings: function() { /* TODO */ },
        saveSettings: async function() { /* TODO */ },
        getCurrentUser: function() { return currentUser; },
        getUserDisplayName: function() { return userDisplayName; },
        getUserSettings: function() { return userSettings; },
        updateOnlineStatus: async function(online) {
            if (currentUser) {
                await supabase
                    .from('users')
                    .update({ online: online, last_seen: new Date().toISOString() })
                    .eq('id', currentUser.id);
            }
        }
    };
})();
