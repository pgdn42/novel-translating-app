import React, { useState, useEffect, useRef } from 'react';
import { logToPanel } from '../logService';

const Translations = ({ chapters, bookTitle, bookDescription, onDescriptionChange, onBookTitleChange }) => {
    const [description, setDescription] = useState(bookDescription || '');
    const [title, setTitle] = useState(bookTitle || '');
    const [sortedChapters, setSortedChapters] = useState([]);
    const [sortOrder, setSortOrder] = useState('asc');
    const [searchTerm, setSearchTerm] = useState('');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const titleInputRef = useRef(null);
    const descriptionInputRef = useRef(null);

    useEffect(() => {
        setDescription(bookDescription || '');
    }, [bookDescription]);

    useEffect(() => {
        setTitle(bookTitle || '');
    }, [bookTitle]);

    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isEditingTitle]);

    useEffect(() => {
        if (isEditingDescription && descriptionInputRef.current) {
            descriptionInputRef.current.focus();
        }
    }, [isEditingDescription]);

    useEffect(() => {
        const enhanced = chapters.map((chapter, index) => ({
            ...chapter,
            originalIndex: index,
            chapterNumber: parseInt(chapter.title.match(/(\d+)/)?.[0] || index + 1, 10)
        }));

        const sorted = [...enhanced].sort((a, b) => {
            if (sortOrder === 'asc') {
                return a.chapterNumber - b.chapterNumber;
            } else {
                return b.chapterNumber - a.chapterNumber;
            }
        });

        setSortedChapters(sorted);
    }, [chapters, sortOrder]);

    const handleDescriptionBlur = () => {
        if (description !== bookDescription) {
            onDescriptionChange(description);
            logToPanel('info', `Book description updated for "${bookTitle}"`);
        }
        setIsEditingDescription(false);
    };

    const handleTitleBlur = () => {
        const trimmedTitle = title.trim();
        if (trimmedTitle && trimmedTitle !== bookTitle) {
            onBookTitleChange(bookTitle, trimmedTitle);
        } else {
            setTitle(bookTitle); // Revert if empty or unchanged
        }
        setIsEditingTitle(false);
    };

    const handleTitleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleTitleBlur();
        } else if (e.key === 'Escape') {
            setTitle(bookTitle);
            setIsEditingTitle(false);
        }
    };

    const filteredChapters = sortedChapters.filter(chapter =>
        chapter.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="translations-view">
            <div className="book-header">
                {isEditingTitle ? (
                    <input
                        ref={titleInputRef}
                        type="text"
                        className="book-title-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                    />
                ) : (
                    <h1 className="book-title-display" onClick={() => setIsEditingTitle(true)} title="Click to edit">
                        {bookTitle}
                    </h1>
                )}

                {isEditingDescription ? (
                    <textarea
                        ref={descriptionInputRef}
                        className="book-description-edit"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onBlur={handleDescriptionBlur}
                        placeholder="Add a short summary or notes for this book..."
                        rows="2"
                    ></textarea>
                ) : (
                    <div className="book-description-display" onClick={() => setIsEditingDescription(true)} title="Click to edit">
                        {description || <span className="placeholder-text">Click to add a description...</span>}
                    </div>
                )}
            </div>

            <hr className="stylish-separator" />

            <div className="toc-section-header">
                <h2>Table of Contents</h2>
                <div className="toc-controls">
                    <input
                        type="search"
                        placeholder="Search chapters..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
                        Sort {sortOrder === 'asc' ? 'Newest' : 'Oldest'} First
                    </button>
                </div>
            </div>

            <div className="toc-list">
                {filteredChapters.length > 0 ? (
                    filteredChapters.map((chapter) => (
                        <div key={chapter.originalIndex} className="toc-item">
                            <span className="toc-item-number">Ch. {chapter.chapterNumber}</span>
                            <span className="toc-item-title">{chapter.title}</span>
                        </div>
                    ))
                ) : (
                    <p>No chapters found.</p>
                )}
            </div>
        </div>
    );
};

export default Translations;
