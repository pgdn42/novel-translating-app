import React from 'react';
import './LoadingScreen.css';

const LoadingScreen = ({ message }) => {
    return (
        <div className="loading-container">
            <div className="loading-content">
                <h1>Novel Translator</h1>
                <div className="loading-bar-container">
                    <div className="loading-bar"></div>
                </div>
                <p className="loading-message">{message}</p>
            </div>
        </div>
    );
};

export default LoadingScreen;