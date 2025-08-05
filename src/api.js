const BASE_URL = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

// --- HTTP Requests ---
const request = async (endpoint, options = {}) => {
    const { body, method = 'GET' } = options;
    const headers = { 'Content-Type': 'application/json' };
    const config = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    };

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, config);
        if (!response.ok) {
            try {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            } catch (e) {
                throw new Error(`Request failed with status: ${response.status}`);
            }
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return response.json();
        }
        return {};
    } catch (error) {
        console.error(`API Client Error: ${method} ${endpoint}`, error);
        throw error;
    }
};


// --- WebSocket Management ---
let socket = null;
let onMessageCallback = null;

const connectWebSocket = (onMessage) => {
    onMessageCallback = onMessage;

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        console.log('WebSocket connection established. Identifying...');
        onMessageCallback({ type: 'ws-status', payload: { status: 'connected' } });
        sendWebSocketMessage({
            type: 'identify',
            payload: { clientName: 'Electron App', clientType: 'electron-app' }
        });
    };

    socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'ping') {
                sendWebSocketMessage({ type: 'pong' });
            }
            if (onMessageCallback) {
                onMessageCallback(message);
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed. Reconnecting in 5s...');
        onMessageCallback({ type: 'ws-status', payload: { status: 'disconnected' } });
        socket = null;
        setTimeout(() => connectWebSocket(onMessage), 5000);
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        onMessageCallback({ type: 'ws-status', payload: { status: 'error' } });
        socket.close();
    };
};

const sendWebSocketMessage = (data) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    } else {
        console.error('WebSocket is not connected. Message not sent:', data);
    }
};

export default {
    // HTTP methods
    getStorage: (key) => request(`/storage/${key}`),
    setStorage: (key, value) => request('/storage', { method: 'POST', body: { key, value } }),
    showDirectoryPicker: () => request('/fs/show-directory-picker'),
    importBooks: (booksDirPath) => request('/fs/import-books', { method: 'POST', body: { booksDirPath } }),
    // WebSocket methods
    connectWebSocket,
    sendWebSocketMessage,
};
