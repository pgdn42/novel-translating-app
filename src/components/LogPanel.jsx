import React, { useState, useCallback, useEffect, useRef } from 'react';
import LogEntry from './LogEntry';
import ClientStatus from './ClientStatus';

const LogPanel = ({ width, setWidth, logs, clients, status }) => {
    const [isResizing, setIsResizing] = useState(false);
    const [clientStates, setClientStates] = useState({});
    const [isClientListCollapsed, setIsClientListCollapsed] = useState(false);
    const logContainerRef = useRef(null);

    useEffect(() => {
        const newClientStates = { ...clientStates };
        let stateChanged = false;

        clients.forEach(client => {
            if (!newClientStates[client.id]) {
                newClientStates[client.id] = { ...client, isConnected: true, lastPing: 0, lastPong: 0 };
                stateChanged = true;
            } else if (!newClientStates[client.id].isConnected) {
                newClientStates[client.id].isConnected = true;
                stateChanged = true;
            }
            // Update name if it changes
            if (newClientStates[client.id].name !== client.name) {
                newClientStates[client.id].name = client.name;
                stateChanged = true;
            }
        });

        Object.keys(newClientStates).forEach(id => {
            if (!clients.some(c => c.id === id) && newClientStates[id].isConnected) {
                newClientStates[id].isConnected = false;
                stateChanged = true;
            }
        });

        const lastLog = logs[logs.length - 1];
        if (lastLog && (lastLog.type === 'ping' || lastLog.type === 'pong')) {
            const { clientId, timestamp } = lastLog.payload;
            if (newClientStates[clientId]) {
                if (lastLog.type === 'ping') {
                    newClientStates[clientId].lastPing = new Date(timestamp).getTime();
                } else {
                    newClientStates[clientId].lastPong = new Date(timestamp).getTime();
                }
                stateChanged = true;
            }
        }

        if (stateChanged) {
            setClientStates(newClientStates);
        }

    }, [clients, logs]);


    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsResizing(true);
    };

    const handleMouseMove = useCallback((e) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
                setWidth(newWidth);
            }
        }
    }, [isResizing, setWidth]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isResizing) {
            // Use document to capture mouse events everywhere on the page
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const getStatusColor = () => {
        switch (status) {
            case 'connected': return 'text-green-400';
            case 'disconnected': return 'text-red-400';
            case 'error': return 'text-red-600';
            default: return 'text-gray-400';
        }
    }

    return (
        <div className="log-panel" style={{ width: `${width}px` }}>
            <div className="log-content">
                <div className="log-header">
                    <h3>WebSocket Log</h3>
                    <p>Status: <span className={getStatusColor()}>{status}</span></p>
                    <div className="client-header" onClick={() => setIsClientListCollapsed(!isClientListCollapsed)}>
                        <span>Clients ({clients.length})</span>
                        <span className="log-caret">{isClientListCollapsed ? '▶' : '▼'}</span>
                    </div>
                    {!isClientListCollapsed && (
                        <ul className="client-list">
                            {Object.entries(clientStates).map(([id, state]) => (
                                <ClientStatus
                                    key={id}
                                    client={{ id, name: state.name }}
                                    isConnected={state.isConnected}
                                    lastPing={state.lastPing}
                                    lastPong={state.lastPong}
                                />
                            ))}
                        </ul>
                    )}
                </div>
                <div className="log-messages" ref={logContainerRef}>
                    {logs.filter(log => log.type !== 'ping' && log.type !== 'pong').map((log, index) => (
                        <LogEntry key={index} log={log} />
                    ))}
                </div>
            </div>
            <div
                className="resizer"
                onMouseDown={handleMouseDown}
            />
        </div>
    );
};

export default LogPanel;
