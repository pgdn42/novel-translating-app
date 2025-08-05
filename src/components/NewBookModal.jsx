import React, { useState } from 'react';

const NewBookModal = ({ isOpen, onClose, onCreate, existingBookNames }) => {
    const [bookName, setBookName] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleCreate = () => {
        const trimmedName = bookName.trim();
        if (!trimmedName) {
            setError('Book name cannot be empty.');
            return;
        }
        if (existingBookNames.includes(trimmedName)) {
            setError(`A book named "${trimmedName}" already exists.`);
            return;
        }
        onCreate(trimmedName);
        setBookName('');
        setError('');
    };

    const handleClose = () => {
        setBookName('');
        setError('');
        onClose();
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h3>Create New Book</h3>
                <div className="modal-body">
                    <label htmlFor="new-book-name">Book Name:</label>
                    <input
                        type="text"
                        id="new-book-name"
                        value={bookName}
                        onChange={(e) => setBookName(e.target.value)}
                        placeholder="Enter the name of the book"
                        autoFocus
                    />
                    {error && <p className="modal-error">{error}</p>}
                </div>
                <div className="modal-footer">
                    <button onClick={handleClose} className="btn-secondary">Cancel</button>
                    <button onClick={handleCreate} className="btn-primary">Create</button>
                </div>
            </div>
        </div>
    );
};

export default NewBookModal;
