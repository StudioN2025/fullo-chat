// Peer Module for WebRTC with Supabase
console.log('Initializing peer module...');

window.peer = (function() {
    let localStream = null;
    let screenStream = null;
    let cameraStream = null;
    let peerConnections = new Map();
    let remoteAudioElements = new Map();
    let remoteVideoElements = new Map();
    let remoteScreenElements = new Map();
    let micEnabled = true;
    let cameraEnabled = false;
    let screenSharing = false;
    let currentRoom = null;
    let userName = '';
    let userId = null;
    let pendingCandidates = new Map();
    let micGainNode = null;
    let audioContext = null;
    
    // DOM Elements
    const micToggleButton = document.getElementById('micToggleButton');
    const cameraToggleButton = document.getElementById('cameraToggleButton');
    const screenShareButton = document.getElementById('screenShareButton');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const localVideo = document.getElementById('localVideo');
    const localScreen = document.getElementById('localScreen');
    const localVideoContainer = document.getElementById('localVideoContainer');
    const localScreenContainer = document.getElementById('localScreenContainer');

    console.log('Peer DOM Elements:', {
        micToggleButton: !!micToggleButton,
        cameraToggleButton: !!cameraToggleButton,
        chatMessages: !!chatMessages
    });

    // Configuration
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    };

    // Initialize
    async function init(uid, displayName) {
        userId = uid;
        userName = displayName;
        
        console.log('Initializing WebRTC for user:', userId);
        
        try {
            // Создаем AudioContext для управления громкостью
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Получаем доступ только к аудио (микрофон)
            localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }, 
                video: false 
            });
            
            // Создаем узел усиления для микрофона
            const source = audioContext.createMediaStreamSource(localStream);
            micGainNode = audioContext.createGain();
            source.connect(micGainNode);
            
            // Создаем новый поток с усилением
            const destination = audioContext.createMediaStreamDestination();
            micGainNode.connect(destination);
            
            // Заменяем оригинальный поток на обработанный
            localStream = destination.stream;
            
            console.log('Microphone access granted');
            updateMicButton();
            
            // Загружаем настройки громкости
            const userSettings = window.auth?.getUserSettings?.();
            if (userSettings) {
                setVolume(userSettings.micVolume / 100, userSettings.speakerVolume / 100);
            }
            
            return userId;
        } catch (error) {
            console.error('Error accessing microphone:', error);
            window.auth.showError('Ошибка доступа к микрофону: ' + error.message);
            return null;
        }
    }

    // Установка громкости
    function setVolume(micVolume, speakerVolume) {
        if (micGainNode) {
            micGainNode.gain.value = micVolume;
        }
        
        // Устанавливаем громкость для всех удаленных аудио
        remoteAudioElements.forEach(function(audio) {
            audio.volume = speakerVolume;
        });
        
        console.log('Volume set - mic: ' + micVolume + ', speaker: ' + speakerVolume);
    }

    // Включение/выключение камеры
    async function toggleCamera() {
        if (!currentRoom || !userId) {
            window.auth.showError('Сначала войдите в комнату');
            return;
        }

        try {
            if (cameraEnabled) {
                // Выключаем камеру
                if (cameraStream) {
                    cameraStream.getTracks().forEach(function(track) { track.stop(); });
                    cameraStream = null;
                }
                cameraEnabled = false;
                
                // Скрываем локальное видео
                if (localVideo) {
                    localVideo.srcObject = null;
                    if (localVideoContainer) localVideoContainer.classList.add('hidden');
                }
                
                // Удаляем видео из своей карточки
                const videoContainer = document.getElementById('video-container-' + userId);
                if (videoContainer) {
                    videoContainer.innerHTML = '';
                }
            } else {
                // Включаем камеру
                cameraStream = await navigator.mediaDevices.getUserMedia({ 
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    }, 
                    audio: false 
                });
                
                cameraEnabled = true;
                
                // Показываем локальное видео
                if (localVideo) {
                    localVideo.srcObject = cameraStream;
                    if (localVideoContainer) localVideoContainer.classList.remove('hidden');
                }
                
                // Добавляем видео в свою карточку
                const videoContainer = document.getElementById('video-container-' + userId);
                if (videoContainer) {
                    videoContainer.innerHTML = '';
                    const video = document.createElement('video');
                    video.srcObject = cameraStream;
                    video.autoplay = true;
                    video.playsInline = true;
                    video.muted = true;
                    video.id = 'video-' + userId;
                    video.className = 'participant-video';
                    videoContainer.appendChild(video);
                }
                
                // Добавляем видео-треки ко всем существующим соединениям
                peerConnections.forEach(function(connection, targetUserId) {
                    if (connection && connection.pc && connection.pc.connectionState === 'connected') {
                        cameraStream.getTracks().forEach(function(track) {
                            connection.pc.addTrack(track, cameraStream);
                        });
                    }
                });
            }
            
            updateCameraButton();
            
            // Обновляем статус камеры в participants
            await supabase
                .from('room_participants')
                .update({ camera: cameraEnabled })
                .eq('room_id', currentRoom)
                .eq('user_id', userId);
            
        } catch (error) {
            console.error('Error toggling camera:', error);
            window.auth.showError('Ошибка доступа к камере: ' + error.message);
        }
    }

    // Демонстрация экрана
    async function toggleScreenShare() {
        if (!currentRoom || !userId) {
            window.auth.showError('Сначала войдите в комнату');
            return;
        }

        try {
            if (screenSharing) {
                // Выключаем демонстрацию экрана
                if (screenStream) {
                    screenStream.getTracks().forEach(function(track) { track.stop(); });
                    screenStream = null;
                }
                screenSharing = false;
                
                // Скрываем локальный экран
                if (localScreen) {
                    localScreen.srcObject = null;
                    if (localScreenContainer) localScreenContainer.classList.add('hidden');
                }
                
                // Удаляем экран из своей карточки
                const screenContainer = document.getElementById('screen-container-' + userId);
                if (screenContainer) {
                    screenContainer.innerHTML = '';
                }
            } else {
                // Включаем демонстрацию экрана
                screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: {
                        cursor: 'always'
                    },
                    audio: true
                });
                
                screenSharing = true;
                
                // Показываем локальный экран
                if (localScreen) {
                    localScreen.srcObject = screenStream;
                    if (localScreenContainer) localScreenContainer.classList.remove('hidden');
                }
                
                // Добавляем экран в свою карточку
                let screenContainer = document.getElementById('screen-container-' + userId);
                if (!screenContainer) {
                    const card = document.getElementById('participant-' + userId);
                    if (card) {
                        screenContainer = document.createElement('div');
                        screenContainer.id = 'screen-container-' + userId;
                        screenContainer.className = 'participant-screen-container';
                        card.appendChild(screenContainer);
                    }
                }
                
                if (screenContainer) {
                    screenContainer.innerHTML = '';
                    const video = document.createElement('video');
                    video.srcObject = screenStream;
                    video.autoplay = true;
                    video.playsInline = true;
                    video.muted = true;
                    video.id = 'screen-' + userId;
                    video.className = 'participant-screen';
                    screenContainer.appendChild(video);
                }
                
                // Добавляем экранные треки ко всем существующим соединениям
                peerConnections.forEach(function(connection, targetUserId) {
                    if (connection && connection.pc && connection.pc.connectionState === 'connected') {
                        screenStream.getTracks().forEach(function(track) {
                            connection.pc.addTrack(track, screenStream);
                        });
                    }
                });
                
                // Обработчик остановки демонстрации
                screenStream.getVideoTracks()[0].onended = function() {
                    toggleScreenShare();
                };
            }
            
            updateScreenButton();
            
            // Обновляем статус демонстрации в participants
            await supabase
                .from('room_participants')
                .update({ screen: screenSharing })
                .eq('room_id', currentRoom)
                .eq('user_id', userId);
            
        } catch (error) {
            console.error('Error toggling screen share:', error);
            window.auth.showError('Ошибка демонстрации экрана: ' + error.message);
        }
    }

    // Обновление кнопки камеры
    function updateCameraButton() {
        if (cameraToggleButton) {
            cameraToggleButton.textContent = cameraEnabled ? '📷 Камера вкл' : '📷 Камера выкл';
            cameraToggleButton.classList.toggle('active', cameraEnabled);
        }
    }

    // Обновление кнопки демонстрации экрана
    function updateScreenButton() {
        if (screenShareButton) {
            screenShareButton.textContent = screenSharing ? '🖥️ Экран вкл' : '🖥️ Поделиться экраном';
            screenShareButton.classList.toggle('active', screenSharing);
        }
    }

    // Обновление кнопки микрофона
    function updateMicButton() {
        if (micToggleButton) {
            micToggleButton.textContent = micEnabled ? '🎤 Микрофон вкл' : '🔇 Микрофон выкл';
            micToggleButton.classList.toggle('muted', !micEnabled);
        }
    }

    // Переключение микрофона
    function toggleMic() {
        if (!localStream) return;

        micEnabled = !micEnabled;
        if (localStream.getAudioTracks().length > 0) {
            localStream.getAudioTracks()[0].enabled = micEnabled;
        }
        updateMicButton();

        if (currentRoom && userId) {
            supabase
                .from('room_participants')
                .update({ muted: !micEnabled })
                .eq('room_id', currentRoom)
                .eq('user_id', userId)
                .then(() => {});
        }
    }

    // Отправка сообщения
    function sendMessage() {
        const message = chatInput?.value.trim();
        if (!message) return;

        addMessage(userName, message, true);

        if (currentRoom && userId) {
            supabase
                .from('messages')
                .insert({
                    room_id: currentRoom,
                    sender_id: userId,
                    sender_name: userName,
                    message: message,
                    encrypted: true
                })
                .then(() => {
                    if (chatInput) chatInput.value = '';
                })
                .catch(console.error);
        }
    }

    // Добавление сообщения в UI
    function addMessage(sender, message, isOwn) {
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        if (isOwn) {
            messageDiv.classList.add('own-message');
        }
        messageDiv.innerHTML = '<span class="message-sender">' + sender + ':</span> <span class="message-text">' + message + '</span>';
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Установка текущей комнаты
    function setCurrentRoom(roomId) {
        currentRoom = roomId;
    }

    // Очистка
    function cleanup() {
        console.log('Cleaning up WebRTC connections');
        
        peerConnections.forEach(function(connection) {
            if (connection && connection.pc) {
                connection.pc.close();
            }
        });
        peerConnections.clear();
        
        remoteAudioElements.forEach(function(audio) {
            audio.pause();
            audio.srcObject = null;
            audio.remove();
        });
        remoteAudioElements.clear();
        
        remoteVideoElements.forEach(function(video) {
            video.remove();
        });
        remoteVideoElements.clear();
        
        remoteScreenElements.forEach(function(screen) {
            screen.remove();
        });
        remoteScreenElements.clear();
        
        if (localStream) {
            localStream.getTracks().forEach(function(track) {
                track.stop();
            });
            localStream = null;
        }
        
        if (cameraStream) {
            cameraStream.getTracks().forEach(function(track) {
                track.stop();
            });
            cameraStream = null;
        }
        
        if (screenStream) {
            screenStream.getTracks().forEach(function(track) {
                track.stop();
            });
            screenStream = null;
        }
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        
        micGainNode = null;
        pendingCandidates.clear();
        currentRoom = null;
        userId = null;
        cameraEnabled = false;
        screenSharing = false;
    }

    console.log('Peer module ready');

    return {
        init: init,
        toggleMic: toggleMic,
        toggleCamera: toggleCamera,
        toggleScreenShare: toggleScreenShare,
        sendMessage: sendMessage,
        addMessage: addMessage,
        setCurrentRoom: setCurrentRoom,
        cleanup: cleanup,
        setVolume: setVolume,
        isMicEnabled: function() { return micEnabled; },
        isCameraEnabled: function() { return cameraEnabled; },
        isScreenSharing: function() { return screenSharing; }
    };
})();

console.log('Peer module loaded:', !!window.peer);
