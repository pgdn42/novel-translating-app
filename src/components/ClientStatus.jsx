import React from 'react';

const ClientStatus = ({ client, isConnected, lastPing, lastPong }) => {

    const dotColor = isConnected ? 'bg-green-500' : 'bg-red-500';

    return (
        <li className="client-status-item">
            <div className={`status-dot ${dotColor}`} title={isConnected ? 'Connected' : 'Disconnected'}></div>
            <span className="client-id" title={client.id}>{client.name || client.id.substring(0, 8)}</span>
        </li>
    );
};

export default ClientStatus;
