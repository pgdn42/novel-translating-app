import React from 'react';
import ImportIcon from '../assets/import-icon.svg';
import EditIcon from '../assets/edit-icon.svg'; // Using edit icon for 'create'

const WelcomeScreen = ({ onCreate, onImport }) => {
    return (
        <div className="welcome-screen">
            <h2>Welcome to Novel Navigator</h2>
            <p>Get started by creating a new book project or importing an existing one.</p>
            <div className="welcome-actions">
                <button onClick={onCreate}>
                    <img src={EditIcon} alt="Create" />
                    Create New Book
                </button>
                <button onClick={onImport}>
                    <img src={ImportIcon} alt="Import" />
                    Import Books from Folder
                </button>
            </div>
        </div>
    );
};

export default WelcomeScreen;