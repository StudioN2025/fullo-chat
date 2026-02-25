// Auth Module for Supabase - ПОЛНАЯ ВЕРСИЯ С НАСТРОЙКАМИ
console.log('Auth module initializing...');

window.auth = (function() {
    let currentUser = null;
    let isAuthModeLogin = true;
    let userDisplayName = '';
    let onlineHeartbeat = null;
    let userSettings = {
        notifyMessages: true,
        notifyJoin: true,
        notifyLeave: true,
        micVolume: 80,
        speakerVolume: 100,
        status: 'online',
        avatar: null
    };

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

    // Settings Elements
    const settingsModal = document.getElementById('settingsModal');
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

    console.log('DOM Elements loaded:', {
        authContainer: !!authContainer,
        profileContainer: !!profileContainer,
        roomContainer: !!roomContainer,
        settingsModal: !!settingsModal
    });

    // Загрузка настроек пользователя
    async function loadUserSettings(userId) {
        try {
            const { data, error } = await window.supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            
            if (data) {
                userSettings = {
                    notifyMessages: data.notify_messages !== false,
                    notifyJoin: data.notify_join !== false,
                    notifyLeave: data.notify_leave !== false,
                    micVolume: data.mic_volume || 80,
                    speakerVolume: data.speaker_volume || 100,
                    status: data.status || 'online',
                    avatar: data.avatar || null
                };
                
                // Применяем настройки к UI
                applySettingsToUI();
            }
        } catch (error) {
            console.error('Error loading user settings:', error);
        }
    }

    // Применение настроек к UI
    function applySettingsToUI() {
        if (settingsNameInput && currentUser) {
            settingsNameInput.value = userDisplayName || '';
        }
        if (settingsEmailInput && currentUser) {
            settingsEmailInput.value = currentUser.email || '';
        }
        if (settingsStatusSelect) {
            settingsStatusSelect.value = userSettings.status;
        }
        if (notifyMessages) {
            notifyMessages.checked = userSettings.notifyMessages;
        }
        if (notifyJoin) {
            notifyJoin.checked = userSettings.notifyJoin;
        }
        if (notifyLeave) {
            notifyLeave.checked = userSettings.notifyLeave;
        }
        if (micVolume) {
            micVolume.value = userSettings.micVolume;
        }
        if (micVolumeValue) {
            micVolumeValue.textContent = userSettings.micVolume + '%';
        }
        if (speakerVolume) {
            speakerVolume.value = userSettings.speakerVolume;
        }
        if (speakerVolumeValue) {
            speakerVolumeValue.textContent = userSettings.speakerVolume + '%';
        }
        
        // Загружаем аватар
        if (userSettings.avatar && avatarPreview) {
            avatarPreview.textContent = '';
            avatarPreview.style.backgroundImage = 'url(\'' + userSettings.avatar + '\')';
            avatarPreview.style.backgroundSize = 'cover';
            avatarPreview.style.backgroundPosition = 'center';
        } else if (avatarPreview) {
            avatarPreview.textContent = '👤';
            avatarPreview.style.backgroundImage = '';
        }
        
        // Применяем громкость к аудио
        if (window.peer && typeof window.peer.setVolume === 'function') {
            window.peer.setVolume(userSettings.micVolume / 100, userSettings.speakerVolume / 100);
        }
    }

    // Показать настройки
    function showSettings() {
        console.log('Opening settings modal');
        if (!currentUser) {
            showError('Сначала войдите в систему');
            return;
        }
        
        // Загружаем актуальные данные
        loadUserSettings(currentUser.id);
        
        if (settingsModal) {
            settingsModal.classList.remove('hidden');
        }
    }

    // Скрыть настройки
    function hideSettings() {
        console.log('Closing settings modal');
        if (settingsModal) {
            settingsModal.classList.add('hidden');
        }
    }

    // Конвертировать изображение в Base64
    function imageToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    }

    // Оптимизация Base64 изображения
    async function optimizeBase64Image(base64, maxWidth = 150, maxHeight = 150, quality = 0.6) {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const optimizedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(optimizedBase64);
            };
        });
    }

    // Обработка загрузки аватара
    function handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showError('Пожалуйста, выберите изображение');
            avatarInput.value = '';
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showError('Размер файла не должен превышать 2MB');
            avatarInput.value = '';
            return;
        }

        // Показываем предпросмотр
        const reader = new FileReader();
        reader.onload = (e) => {
            if (avatarPreview) {
                avatarPreview.textContent = '';
                avatarPreview.style.backgroundImage = 'url(\'' + e.target.result + '\')';
                avatarPreview.style.backgroundSize = 'cover';
                avatarPreview.style.backgroundPosition = 'center';
            }
        };
        reader.readAsDataURL(file);
        
        showSuccess('Аватар выбран, нажмите "Сохранить" для загрузки');
    }

    // Сохранить настройки
    async function saveSettings() {
        console.log('Saving settings');
        
        if (!currentUser) {
            showError('Сначала войдите в систему');
            return;
        }

        const newName = settingsNameInput?.value.trim();
        if (!newName) {
            showError('Имя не может быть пустым');
            return;
        }

        if (newName.length > 30) {
            showError('Имя не должно превышать 30 символов');
            return;
        }

        // Показываем индикатор загрузки
        const saveBtn = document.querySelector('.save-btn');
        const originalText = saveBtn?.textContent;
        if (saveBtn) {
            saveBtn.textContent = '⏳ Сохранение...';
            saveBtn.disabled = true;
        }

        try {
            let avatarBase64 = userSettings.avatar;
            
            // Загружаем новый аватар если выбран
            if (avatarInput?.files.length > 0) {
                const file = avatarInput.files[0];
                let base64 = await imageToBase64(file);
                base64 = await optimizeBase64Image(base64, 150, 150, 0.6);
                avatarBase64 = base64;
            }

            // Обновляем в базе данных
            const { error } = await window.supabase
                .from('users')
                .update({
                    display_name: newName,
                    status: settingsStatusSelect?.value || 'online',
                    notify_messages: notifyMessages?.checked || true,
                    notify_join: notifyJoin?.checked || true,
                    notify_leave: notifyLeave?.checked || true,
                    mic_volume: parseInt(micVolume?.value || 80),
                    speaker_volume: parseInt(speakerVolume?.value || 100),
                    avatar: avatarBase64,
                    updated_at: new Date().toISOString()
                })
                .eq('id', currentUser.id);

            if (error) throw error;

            // Обновляем локальные данные
            userDisplayName = newName;
            userSettings = {
                notifyMessages: notifyMessages?.checked || true,
                notifyJoin: notifyJoin?.checked || true,
                notifyLeave: notifyLeave?.checked || true,
                micVolume: parseInt(micVolume?.value || 80),
                speakerVolume: parseInt(speakerVolume?.value || 100),
                status: settingsStatusSelect?.value || 'online',
                avatar: avatarBase64
            };

            // Обновляем отображаемое имя
            if (displayNameSpan) {
                displayNameSpan.textContent = 'Привет, ' + newName + '!';
            }
            if (activeDisplayNameSpan) {
                activeDisplayNameSpan.textContent = newName;
            }

            // Применяем настройки аудио
            if (window.peer && typeof window.peer.setVolume === 'function') {
                window.peer.setVolume(userSettings.micVolume / 100, userSettings.speakerVolume / 100);
            }

            // Очищаем input файла
            if (avatarInput) avatarInput.value = '';

            hideSettings();
            showSuccess('Настройки сохранены');
            
        } catch (error) {
            console.error('Save settings error:', error);
            showError('Ошибка сохранения настроек: ' + error.message);
        } finally {
            if (saveBtn) {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }
        }
    }

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
                    await loadUserSettings(currentUser.id);
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
                checkSession();
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

    // Добавляем слушатели для ползунков громкости
    if (micVolume) {
        micVolume.addEventListener('input', function() {
            if (micVolumeValue) {
                micVolumeValue.textContent = this.value + '%';
            }
        });
    }
    if (speakerVolume) {
        speakerVolume.addEventListener('input', function() {
            if (speakerVolumeValue) {
                speakerVolumeValue.textContent = this.value + '%';
            }
        });
    }
    if (avatarInput) {
        avatarInput.addEventListener('change', handleAvatarUpload);
    }

    function showAuthContainer() {
        console.log('Showing auth container');
        if (authContainer) authContainer.classList.remove('hidden');
        if (profileContainer) profileContainer.classList.add('hidden');
        if (roomContainer) roomContainer.classList.add('hidden');
        if (activeRoomContainer) activeRoomContainer.classList.add('hidden');
        if (settingsModal) settingsModal.classList.add('hidden');
        clearMessages();
    }

    function showProfileContainer() {
        console.log('Showing profile container');
        if (authContainer) authContainer.classList.add('hidden');
        if (profileContainer) profileContainer.classList.remove('hidden');
        if (roomContainer) roomContainer.classList.add('hidden');
        if (activeRoomContainer) activeRoomContainer.classList.add('hidden');
        if (settingsModal) settingsModal.classList.add('hidden');
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
        if (settingsModal) settingsModal.classList.add('hidden');
        
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
        if (settingsModal) settingsModal.classList.add('hidden');
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
        } else {
            alert('❌ ' + text);
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
                console.log('Attempting login:', email);
                const { data, error } = await window.supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) throw error;
                
                console.log('Login success:', data);
                showSuccess('Вход выполнен!');
                
            } else {
                console.log('Attempting signup:', email);
                
                const { data, error } = await window.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        emailRedirectTo: window.location.origin,
                        data: {
                            registered_at: new Date().toISOString()
                        }
                    }
                });
                
                if (error) throw error;
                
                console.log('Signup success:', data);
                
                if (data.user) {
                    showSuccess('Регистрация успешна! Выполняем вход...');
                    
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
            
            const { data: existingUser } = await window.supabase
                .from('users')
                .select('id')
                .eq('id', currentUser.id)
                .maybeSingle();
            
            let result;
            
            if (existingUser) {
                result = await window.supabase
                    .from('users')
                    .update({
                        display_name: displayName,
                        online: true,
                        last_seen: new Date().toISOString()
                    })
                    .eq('id', currentUser.id);
            } else {
                result = await window.supabase
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
                        speaker_volume: 100,
                        status: 'online'
                    });
            }

            if (result.error) throw result.error;

            console.log('Profile saved');
            userDisplayName = displayName;
            await loadUserSettings(currentUser.id);
            showRoomContainer(displayName);
            showSuccess('Профиль сохранен!');
            
        } catch (error) {
            console.error('Save profile error:', error);
            showError('Ошибка сохранения профиля: ' + error.message);
        }
    }

    async function logout() {
        try {
            stopOnlineHeartbeat();
            
            if (currentUser) {
                await window.supabase
                    .from('users')
                    .update({ 
                        online: false, 
                        last_seen: new Date().toISOString() 
                    })
                    .eq('id', currentUser.id);
            }
            
            const { error } = await window.supabase.auth.signOut();
            if (error) throw error;
            
            showSuccess('Выход выполнен');
        } catch (error) {
            console.error('Logout error:', error);
            showError('Ошибка выхода: ' + error.message);
        }
    }

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

    console.log('Auth module initialized');

    return {
        handleAuth: handleAuth,
        switchAuthMode: switchAuthMode,
        saveProfile: saveProfile,
        logout: logout,
        showSettings: showSettings,
        hideSettings: hideSettings,
        saveSettings: saveSettings,
        showError: showError,
        showSuccess: showSuccess,
        showActiveRoom: showActiveRoom,
        getCurrentUser: () => currentUser,
        getUserDisplayName: () => userDisplayName,
        getUserSettings: () => userSettings,
        updateOnlineStatus: updateOnlineStatus
    };
})();

console.log('Auth module loaded:', !!window.auth);
