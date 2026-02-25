// Auth Module for Supabase - ПОЛНАЯ ВЕРСИЯ БЕЗ ПОДТВЕРЖДЕНИЯ EMAIL
console.log('Auth module initializing...');

window.auth = (function() {
    let currentUser = null;
    let isAuthModeLogin = true;
    let userDisplayName = '';
    let onlineHeartbeat = null;

    // DOM Elements
    const authContainer = document.getElementById('authContainer');
    const profileContainer = document.getElementById('profileContainer');
    const roomContainer = document.getElementById('roomContainer');
    const activeRoomContainer = document.getElementById('activeRoomContainer');
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

    console.log('DOM Elements loaded:', {
        authContainer: !!authContainer,
        profileContainer: !!profileContainer,
        roomContainer: !!roomContainer,
        emailInput: !!emailInput
    });

    // Проверка сессии при загрузке
    async function checkSession() {
        try {
            console.log('Checking session...');
            const { data: { session }, error } = await window.supabase.auth.getSession();
            
            if (error) {
                console.error('Session error:', error);
                showAuthContainer();
                return;
            }
            
            console.log('Session:', session);
            
            if (session?.user) {
                currentUser = session.user;
                console.log('User logged in:', currentUser.email);
                
                // Проверяем, есть ли пользователь в таблице users
                const { data: userData, error: userError } = await window.supabase
                    .from('users')
                    .select('*')
                    .eq('id', currentUser.id)
                    .maybeSingle();
                
                console.log('User data:', userData);
                
                if (userData?.display_name) {
                    // Профиль заполнен
                    userDisplayName = userData.display_name;
                    showRoomContainer(userData.display_name);
                    startOnlineHeartbeat();
                } else {
                    // Нужно заполнить профиль
                    showProfileContainer();
                }
            } else {
                showAuthContainer();
            }
        } catch (e) {
            console.error('Session check error:', e);
            showAuthContainer();
        }
    }

    // Слушаем изменения аутентификации
    if (window.supabase) {
        window.supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth event:', event, session);
            
            if (event === 'SIGNED_IN' && session?.user) {
                currentUser = session.user;
                checkSession(); // Перепроверяем
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                userDisplayName = '';
                stopOnlineHeartbeat();
                showAuthContainer();
            } else if (event === 'USER_UPDATED') {
                console.log('User updated:', session?.user);
            }
        });
    } else {
        console.error('Supabase not initialized!');
    }

    // Запускаем проверку
    checkSession();

    function showAuthContainer() {
        console.log('Showing auth container');
        if (authContainer) authContainer.classList.remove('hidden');
        if (profileContainer) profileContainer.classList.add('hidden');
        if (roomContainer) roomContainer.classList.add('hidden');
        if (activeRoomContainer) activeRoomContainer.classList.add('hidden');
        clearMessages();
    }

    function showProfileContainer() {
        console.log('Showing profile container');
        if (authContainer) authContainer.classList.add('hidden');
        if (profileContainer) profileContainer.classList.remove('hidden');
        if (roomContainer) roomContainer.classList.add('hidden');
        if (activeRoomContainer) activeRoomContainer.classList.add('hidden');
        clearMessages();
        
        if (currentUser?.email && profileNameInput) {
            profileNameInput.value = currentUser.email.split('@')[0];
        }
    }

    function showRoomContainer(displayName) {
        console.log('Showing room container for:', displayName);
        if (authContainer) authContainer.classList.add('hidden');
        if (profileContainer) profileContainer.classList.add('hidden');
        if (roomContainer) roomContainer.classList.remove('hidden');
        if (activeRoomContainer) activeRoomContainer.classList.add('hidden');
        
        if (displayNameSpan) displayNameSpan.textContent = 'Привет, ' + displayName + '!';
        if (activeDisplayNameSpan) activeDisplayNameSpan.textContent = displayName;
        clearMessages();
    }

    function showActiveRoom() {
        console.log('Showing active room');
        if (authContainer) authContainer.classList.add('hidden');
        if (profileContainer) profileContainer.classList.add('hidden');
        if (roomContainer) roomContainer.classList.add('hidden');
        if (activeRoomContainer) activeRoomContainer.classList.remove('hidden');
    }

    function clearMessages() {
        if (errorMessage) errorMessage.textContent = '';
        if (successMessage) successMessage.textContent = '';
    }

    function showError(text) {
        console.error('Error:', text);
        if (errorMessage) errorMessage.textContent = text;
        if (successMessage) successMessage.textContent = '';
        if (window.showNotification) {
            window.showNotification(text, 'error');
        }
    }

    function showSuccess(text) {
        console.log('Success:', text);
        if (successMessage) successMessage.textContent = text;
        if (errorMessage) errorMessage.textContent = '';
        if (window.showNotification) {
            window.showNotification(text, 'success');
        }
    }

    function switchAuthMode() {
        isAuthModeLogin = !isAuthModeLogin;
        if (isAuthModeLogin) {
            if (authTitle) authTitle.textContent = 'Вход в FulloChat';
            if (authButton) authButton.textContent = 'Войти';
            if (switchAuthButton) switchAuthButton.textContent = 'Создать аккаунт';
            if (switchAuthText) switchAuthText.textContent = 'Нет аккаунта? Зарегистрируйтесь';
        } else {
            if (authTitle) authTitle.textContent = 'Регистрация в FulloChat';
            if (authButton) authButton.textContent = 'Зарегистрироваться';
            if (switchAuthButton) switchAuthButton.textContent = 'Войти';
            if (switchAuthText) switchAuthText.textContent = 'Уже есть аккаунт? Войдите';
        }
        clearMessages();
    }

    async function handleAuth() {
        const email = emailInput?.value.trim();
        const password = passwordInput?.value;

        if (!email || !password) {
            showError('Заполните все поля');
            return;
        }

        if (password.length < 6) {
            showError('Пароль должен быть минимум 6 символов');
            return;
        }

        try {
            if (isAuthModeLogin) {
                // ВХОД
                console.log('Attempting login:', email);
                const { data, error } = await window.supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) throw error;
                
                console.log('Login success:', data);
                showSuccess('Вход выполнен!');
                
            } else {
                // РЕГИСТРАЦИЯ - без подтверждения email
                console.log('Attempting signup:', email);
                
                const { data, error } = await window.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        // Отключаем email подтверждение
                        emailRedirectTo: window.location.origin,
                        data: {
                            // Метаданные пользователя
                            registered_at: new Date().toISOString()
                        }
                    }
                });
                
                if (error) throw error;
                
                console.log('Signup success:', data);
                
                if (data.user) {
                    // Сразу входим после регистрации (если Supabase настроен на auto-confirm)
                    showSuccess('Регистрация успешна! Выполняем вход...');
                    
                    // Пробуем автоматически войти
                    const { error: signInError } = await window.supabase.auth.signInWithPassword({
                        email: email,
                        password: password
                    });
                    
                    if (signInError) {
                        console.error('Auto-login error:', signInError);
                        showSuccess('Регистрация успешна! Теперь войдите в систему.');
                    }
                } else {
                    showSuccess('Регистрация успешна! Проверьте email для подтверждения.');
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            
            // Понятные сообщения об ошибках
            if (error.message.includes('Email not confirmed')) {
                showError('Email не подтвержден. Проверьте почту или войдите с другим аккаунтом.');
            } else if (error.message.includes('Invalid login credentials')) {
                showError('Неверный email или пароль');
            } else if (error.message.includes('User already registered')) {
                showError('Пользователь с таким email уже существует');
            } else if (error.message.includes('Password should be at least 6 characters')) {
                showError('Пароль должен быть минимум 6 символов');
            } else {
                showError('Ошибка: ' + error.message);
            }
        }
    }

    async function saveProfile() {
        const displayName = profileNameInput?.value.trim();
        
        if (!displayName) {
            showError('Введите имя');
            return;
        }

        if (displayName.length > 30) {
            showError('Имя не должно превышать 30 символов');
            return;
        }

        try {
            console.log('Saving profile for user:', currentUser);
            
            // Проверяем, существует ли уже запись
            const { data: existingUser } = await window.supabase
                .from('users')
                .select('id')
                .eq('id', currentUser.id)
                .maybeSingle();
            
            let result;
            
            if (existingUser) {
                // Обновляем существующую запись
                result = await window.supabase
                    .from('users')
                    .update({
                        display_name: displayName,
                        online: true,
                        last_seen: new Date().toISOString()
                    })
                    .eq('id', currentUser.id);
            } else {
                // Создаем новую запись
                result = await window.supabase
                    .from('users')
                    .insert({
                        id: currentUser.id,
                        email: currentUser.email,
                        display_name: displayName,
                        online: true,
                        last_seen: new Date().toISOString()
                    });
            }

            if (result.error) throw result.error;

            console.log('Profile saved');
            userDisplayName = displayName;
            showRoomContainer(displayName);
            showSuccess('Профиль сохранен!');
            
        } catch (error) {
            console.error('Save profile error:', error);
            showError('Ошибка сохранения профиля: ' + error.message);
        }
    }

    async function logout() {
        try {
            // Останавливаем heartbeat
            stopOnlineHeartbeat();
            
            // Обновляем статус онлайн
            if (currentUser) {
                await window.supabase
                    .from('users')
                    .update({ 
                        online: false, 
                        last_seen: new Date().toISOString() 
                    })
                    .eq('id', currentUser.id);
            }
            
            // Выходим из Supabase
            const { error } = await window.supabase.auth.signOut();
            if (error) throw error;
            
            showSuccess('Выход выполнен');
        } catch (error) {
            console.error('Logout error:', error);
            showError('Ошибка выхода: ' + error.message);
        }
    }

    // Heartbeat для онлайн статуса
    function startOnlineHeartbeat() {
        if (onlineHeartbeat) clearInterval(onlineHeartbeat);
        
        updateOnlineStatus(true);
        
        onlineHeartbeat = setInterval(async () => {
            if (currentUser && !document.hidden) {
                await updateOnlineStatus(true);
            }
        }, 10000);
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    function stopOnlineHeartbeat() {
        if (onlineHeartbeat) {
            clearInterval(onlineHeartbeat);
            onlineHeartbeat = null;
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeunload', handleBeforeUnload);
    }

    async function updateOnlineStatus(online) {
        if (!currentUser) return;
        
        try {
            await window.supabase
                .from('users')
                .update({ 
                    online: online, 
                    last_seen: new Date().toISOString() 
                })
                .eq('id', currentUser.id);
            
            console.log('Online status updated:', online);
        } catch (error) {
            console.error('Error updating online status:', error);
        }
    }

    function handleVisibilityChange() {
        if (currentUser) {
            if (document.hidden) {
                setTimeout(() => {
                    if (document.hidden && currentUser) {
                        updateOnlineStatus(false);
                    }
                }, 30000);
            } else {
                updateOnlineStatus(true);
            }
        }
    }

    function handleBeforeUnload() {
        if (currentUser) {
            // Используем sendBeacon для надежности
            const data = {
                online: false,
                last_seen: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            navigator.sendBeacon(
                window.supabase.rest.url + '/rest/v1/users?id=eq.' + currentUser.id,
                blob
            );
        }
    }

    // Заглушки для будущих функций настроек
    function showSettings() { 
        console.log('Settings not implemented'); 
        showError('Настройки в разработке');
    }
    
    function hideSettings() { 
        console.log('Settings not implemented'); 
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.add('hidden');
    }
    
    async function saveSettings() { 
        console.log('Save settings not implemented'); 
        showError('Сохранение настроек в разработке');
    }

    console.log('Auth module initialized');

    // Публичное API
    return {
        // Основные методы
        handleAuth: handleAuth,
        switchAuthMode: switchAuthMode,
        saveProfile: saveProfile,
        logout: logout,
        
        // Настройки
        showSettings: showSettings,
        hideSettings: hideSettings,
        saveSettings: saveSettings,
        
        // Уведомления
        showError: showError,
        showSuccess: showSuccess,
        
        // Навигация
        showActiveRoom: showActiveRoom,
        
        // Геттеры
        getCurrentUser: function() { return currentUser; },
        getUserDisplayName: function() { return userDisplayName; },
        
        // Статус онлайн
        updateOnlineStatus: updateOnlineStatus
    };
})();

console.log('Auth module loaded:', !!window.auth);
