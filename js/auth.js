// Auth Module for Supabase - РАБОЧАЯ ВЕРСИЯ
console.log('Auth module initializing...');

window.auth = (function() {
    let currentUser = null;
    let isAuthModeLogin = true;

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
                    showRoomContainer(userData.display_name);
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
                showAuthContainer();
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
                    password: password
                });
                if (error) throw error;
                console.log('Signup success:', data);
                showSuccess('Регистрация успешна! Проверьте email для подтверждения.');
            }
        } catch (error) {
            console.error('Auth error:', error);
            showError('Ошибка: ' + error.message);
        }
    }

    async function saveProfile() {
        const displayName = profileNameInput?.value.trim();
        
        if (!displayName) {
            showError('Введите имя');
            return;
        }

        try {
            console.log('Saving profile for user:', currentUser);
            
            const { data, error } = await window.supabase
                .from('users')
                .insert({
                    id: currentUser.id,
                    email: currentUser.email,
                    display_name: displayName,
                    online: true
                });

            if (error) {
                console.error('Insert error:', error);
                throw error;
            }

            console.log('Profile saved:', data);
            showRoomContainer(displayName);
            showSuccess('Профиль сохранен!');
        } catch (error) {
            console.error('Save profile error:', error);
            showError('Ошибка: ' + error.message);
        }
    }

    async function logout() {
        try {
            await window.supabase.auth.signOut();
            showSuccess('Выход выполнен');
        } catch (error) {
            showError('Ошибка: ' + error.message);
        }
    }

    // Заглушки для будущих функций
    function showSettings() { 
        console.log('Settings not implemented'); 
        alert('Настройки в разработке');
    }
    
    function hideSettings() { 
        console.log('Settings not implemented'); 
    }
    
    async function saveSettings() { 
        console.log('Save settings not implemented'); 
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
        getCurrentUser: function() { return currentUser; },
        getUserDisplayName: function() { return activeDisplayNameSpan?.textContent || ''; }
    };
})();

console.log('Auth module loaded:', !!window.auth);
