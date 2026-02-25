// Peer Module for WebRTC with Supabase
console.log('Initializing peer module...');

window.peer = (function() {
    let localStream = null;
    let screenStream = null;
    let cameraStream = null;
    let peerConnections = new Map();
    let remoteAudioElements = new Map();
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
                
                // Добавляем видео в свою карточку с зеркальным отображением
                const videoContainer = document.getElementById('video-container-' + userId);
                if (videoContainer) {
                    videoContainer.innerHTML = '';
                    const video = document.createElement('video');
                    video.srcObject = cameraStream;
                    video.autoplay = true;
                    video.playsInline = true;
                    video.muted = true;
                    video.id = 'video-' + userId;
                    video.className = 'participant-video mirror'; // Добавляем класс mirror
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
            await window.supabase
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
            await window.supabase
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
            window.supabase
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
            window.supabase
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

    // Add remote video to participant card
    function addRemoteVideo(userId, stream) {
        const videoContainer = document.getElementById('video-container-' + userId);
        if (!videoContainer) {
            console.log('Video container not found for user:', userId);
            return;
        }
        
        // Remove existing video if any
        const existingVideo = document.getElementById('video-' + userId);
        if (existingVideo) {
            existingVideo.remove();
        }

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.id = 'video-' + userId;
        video.className = 'participant-video';
        
        // Добавляем обработчик клика для увеличения
        video.addEventListener('click', function() {
            if (window.room) window.room.enlargeVideo(userId, 'video');
        });
        
        videoContainer.appendChild(video);
        
        // Показываем кнопку увеличения
        const enlargeBtn = document.getElementById('enlarge-' + userId);
        if (enlargeBtn) {
            enlargeBtn.classList.remove('hidden');
        }
        
        console.log('Remote video added for user:', userId);
    }

    // Add remote screen to participant card
    function addRemoteScreen(userId, stream) {
        // Для экрана создаем отдельный контейнер внутри карточки
        let screenContainer = document.getElementById('screen-container-' + userId);
        
        if (!screenContainer) {
            const card = document.getElementById('participant-' + userId);
            if (!card) return;
            
            screenContainer = document.createElement('div');
            screenContainer.id = 'screen-container-' + userId;
            screenContainer.className = 'participant-screen-container';
            card.appendChild(screenContainer);
        }
        
        // Remove existing screen if any
        const existingScreen = document.getElementById('screen-' + userId);
        if (existingScreen) {
            existingScreen.remove();
        }

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.id = 'screen-' + userId;
        video.className = 'participant-screen';
        
        // Добавляем обработчик клика для увеличения
        video.addEventListener('click', function() {
            if (window.room) window.room.enlargeVideo(userId, 'screen');
        });
        
        screenContainer.appendChild(video);
        
        // Показываем кнопку увеличения
        const enlargeBtn = document.getElementById('enlarge-' + userId);
        if (enlargeBtn) {
            enlargeBtn.classList.remove('hidden');
        }
        
        console.log('Remote screen added for user:', userId);
    }

    // Add remote audio
    function addRemoteAudio(userId, stream) {
        // Remove existing audio if any
        const oldAudio = remoteAudioElements.get(userId);
        if (oldAudio) {
            oldAudio.remove();
        }

        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.id = 'audio-' + userId;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        
        // Устанавливаем громкость из настроек
        const userSettings = window.auth?.getUserSettings?.();
        if (userSettings) {
            audio.volume = userSettings.speakerVolume / 100;
        }

        remoteAudioElements.set(userId, audio);
        
        audio.play().catch(function(e) { 
            console.log('Audio play error:', e);
        });
        
        console.log('Remote audio added for user:', userId);
    }

    // Connect to peer
    async function connectToPeer(targetUserId) {
        if (!currentRoom || !userId || targetUserId === userId) {
            console.log('Cannot connect to self or invalid room');
            return;
        }

        if (peerConnections.has(targetUserId)) {
            console.log('Already have connection to:', targetUserId);
            return;
        }

        console.log('Initiating connection to:', targetUserId);

        try {
            const pc = createPeerConnection(targetUserId);
            
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            console.log('Local description set as offer');
            
            // Send offer via Supabase
            await window.supabase
                .from('signals')
                .insert({
                    room_id: currentRoom,
                    from_user_id: userId,
                    to_user_id: targetUserId,
                    type: 'offer',
                    data: {
                        type: offer.type,
                        sdp: offer.sdp
                    }
                });
            
            console.log('Offer sent to:', targetUserId);
        } catch (error) {
            console.error('Error connecting to peer:', error);
        }
    }

    // Create peer connection
    function createPeerConnection(targetUserId) {
        console.log('Creating peer connection to:', targetUserId);
        
        const pc = new RTCPeerConnection(configuration);
        
        // Add local audio stream
        if (localStream) {
            localStream.getTracks().forEach(function(track) {
                pc.addTrack(track, localStream);
                console.log('Added audio track:', track.kind);
            });
        }
        
        // Add camera stream if enabled
        if (cameraStream && cameraEnabled) {
            cameraStream.getTracks().forEach(function(track) {
                pc.addTrack(track, cameraStream);
                console.log('Added video track:', track.kind);
            });
        }
        
        // Add screen stream if enabled
        if (screenStream && screenSharing) {
            screenStream.getTracks().forEach(function(track) {
                pc.addTrack(track, screenStream);
                console.log('Added screen track:', track.kind);
            });
        }

        // Handle ICE candidates
        pc.onicecandidate = function(event) {
            if (event.candidate && currentRoom && userId) {
                console.log('Generated ICE candidate for:', targetUserId);
                window.supabase
                    .from('ice_candidates')
                    .insert({
                        room_id: currentRoom,
                        from_user_id: userId,
                        to_user_id: targetUserId,
                        candidate: {
                            candidate: event.candidate.candidate,
                            sdpMid: event.candidate.sdpMid,
                            sdpMLineIndex: event.candidate.sdpMLineIndex
                        }
                    }).catch(function(err) { 
                        console.error('Error sending ICE candidate:', err);
                    });
            }
        };

        // Handle connection state
        pc.onconnectionstatechange = function() {
            console.log('Connection state to', targetUserId, ':', pc.connectionState);
            if (pc.connectionState === 'connected') {
                console.log('Successfully connected to:', targetUserId);
                window.auth.showSuccess('Подключен к участнику');
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                console.log('Connection lost to:', targetUserId);
            }
        };

        // Handle ICE connection state
        pc.oniceconnectionstatechange = function() {
            console.log('ICE connection state to', targetUserId, ':', pc.iceConnectionState);
        };

        // Handle remote stream
        pc.ontrack = function(event) {
            console.log('Received remote stream from:', targetUserId);
            console.log('Stream tracks:', event.streams[0].getTracks().length);
            
            // Определяем тип потока (аудио, видео, экран)
            const hasVideo = event.streams[0].getVideoTracks().length > 0;
            const isScreen = event.track && event.track.kind === 'video' && 
                            event.track.label && event.track.label.includes('screen');
            
            if (!hasVideo) {
                // Только аудио
                addRemoteAudio(targetUserId, event.streams[0]);
            } else if (isScreen) {
                // Демонстрация экрана
                addRemoteScreen(targetUserId, event.streams[0]);
            } else {
                // Видео с камеры
                addRemoteVideo(targetUserId, event.streams[0]);
            }
        };

        // Store connection
        peerConnections.set(targetUserId, { pc: pc });

        return pc;
    }

    function setCurrentRoom(roomId) {
        currentRoom = roomId;
    }

    function closeConnection(userId) {
        const connection = peerConnections.get(userId);
        if (connection && connection.pc) {
            connection.pc.close();
            peerConnections.delete(userId);
        }
        
        const audio = remoteAudioElements.get(userId);
        if (audio) {
            audio.pause();
            audio.srcObject = null;
            audio.remove();
            remoteAudioElements.delete(userId);
        }
        
        // Удаляем видео из карточки
        const videoContainer = document.getElementById('video-container-' + userId);
        if (videoContainer) {
            videoContainer.innerHTML = '';
        }
        
        // Удаляем экран из карточки
        const screenContainer = document.getElementById('screen-container-' + userId);
        if (screenContainer) {
            screenContainer.remove();
        }
        
        // Скрываем кнопку увеличения
        const enlargeBtn = document.getElementById('enlarge-' + userId);
        if (enlargeBtn) {
            enlargeBtn.classList.add('hidden');
        }
        
        console.log('Closed connection to user:', userId);
    }

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
        connectToPeer: connectToPeer,
        toggleMic: toggleMic,
        toggleCamera: toggleCamera,
        toggleScreenShare: toggleScreenShare,
        sendMessage: sendMessage,
        addMessage: addMessage,
        setCurrentRoom: setCurrentRoom,
        closeConnection: closeConnection,
        cleanup: cleanup,
        setVolume: setVolume,
        isMicEnabled: () => micEnabled,
        isCameraEnabled: () => cameraEnabled,
        isScreenSharing: () => screenSharing
    };
})();

console.log('Peer module loaded:', !!window.peer);
