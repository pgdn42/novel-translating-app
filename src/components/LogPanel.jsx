import React, { useState, useCallback, useEffect, useRef } from 'react';
import LogEntry from './LogEntry';
import ClientStatus from './ClientStatus';

const LogPanel = ({ width, setWidth, logs, clients, status, onSendCommand }) => {
    const [isResizing, setIsResizing] = useState(false);
    const [clientStates, setClientStates] = useState({});
    const [isClientListCollapsed, setIsClientListCollapsed] = useState(false);
    const [command, setCommand] = useState('');
    const logContainerRef = useRef(null);

    useEffect(() => {
        // This logic now ONLY reflects the current state from the server.
        // It does not try to remember disconnected clients, which fixes the duplication issue.
        const newClientStates = {};
        clients.forEach(client => {
            newClientStates[client.id] = { ...client, isConnected: true };
        });
        setClientStates(newClientStates);
    }, [clients]);


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

    const handleCommandKeyDown = (e) => {
        if (e.key === 'Enter' && command.trim()) {
            onSendCommand(command);
            setCommand('');
        }
    };

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
                        <span>Clients ({Object.values(clientStates).filter(c => c.isConnected).length})</span>
                        <span className="log-caret">{isClientListCollapsed ? '▶' : '▼'}</span>
                    </div>
                    {!isClientListCollapsed && (
                        <ul className="client-list">
                            {Object.values(clientStates).map(state => (
                                <ClientStatus
                                    key={state.id}
                                    client={{ id: state.id, name: state.name }}
                                    isConnected={state.isConnected}
                                />
                            ))}
                        </ul>
                    )}
                </div>
                <div className="log-messages-container">
                    <div className="log-messages" ref={logContainerRef}>
                        {logs.filter(log => log.type !== 'ping' && log.type !== 'pong').map((log, index) => (
                            <LogEntry key={index} log={log} />
                        ))}
                    </div>
                </div>
                <div className="log-input-container">
                    <input
                        type="text"
                        className="log-input"
                        placeholder="Type a command... (e.g. /message ClientName text)"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onKeyDown={handleCommandKeyDown}
                    />
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