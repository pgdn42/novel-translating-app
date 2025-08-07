// path: /src/components/Translations.jsx
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { logToPanel } from '../logService';
import ChapterView from './ChapterView'; // Import ChapterView
import { ReactComponent as DeleteIcon } from '../assets/delete-icon.svg';
import { ReactComponent as SettingsIcon } from '../assets/settings-icon.svg';
import { ReactComponent as EditIcon } from '../assets/edit-icon.svg';
import { ReactComponent as ImportIcon } from '../assets/import-icon.svg';

const Translations = ({
    books,
    activeBook,
    chapters,
    rawChapterCount,
    bookDescription,
    onDescriptionChange,
    onBookTitleChange,
    onChapterSelect,
    onDeleteChapter,
    onDeleteRawChapters,
    onScrapeChapters,
    onStartTranslation,
    sortOrder,
    setSortOrder,
    onOpenSettings,
    onDeleteBook,
    onBookSelect,
    onImportBooks,
    currentChapter,
    currentChapterList,
    currentChapterIndex,
    onReturnToTOC,
    onPreviousChapter,
    onNextChapter,
    translatingNextSourceUrl,
    autoTranslateNext,
    setAutoTranslateNext,
    bookmark,
    onUpdateBookmark
}) => {
    const [description, setDescription] = useState(bookDescription || '');
    const [title, setTitle] = useState(activeBook || '');
    const [sortedChapters, setSortedChapters] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [selectWidth, setSelectWidth] = useState('auto');
    const titleInputRef = useRef(null);
    const descriptionInputRef = useRef(null);
    const titleSizerRef = useRef(null);

    useEffect(() => {
        setDescription(bookDescription || '');
    }, [bookDescription]);

    useEffect(() => {
        setTitle(activeBook || '');
    }, [activeBook]);

    useLayoutEffect(() => {
        if (titleSizerRef.current) {
            // Add 30px for padding and the arrow icon
            setSelectWidth(titleSizerRef.current.offsetWidth + 30);
        }
    }, [activeBook]);

    useEffect(() => {
        if (isEditing && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isEditing]);

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
            logToPanel('info', `Book description updated for "${activeBook}"`);
        }
    };

    const handleTitleBlur = () => {
        const trimmedTitle = title.trim();
        if (trimmedTitle && trimmedTitle !== activeBook) {
            onBookTitleChange(activeBook, trimmedTitle);
        } else {
            setTitle(activeBook);
        }
    };

    const toggleEditing = () => {
        if (isEditing) {
            handleTitleBlur();
            handleDescriptionBlur();
        }
        setIsEditing(!isEditing);
    };


    const handleTitleKeyDown = (e) => {
        if (e.key === 'Enter') {
            titleInputRef.current.blur();
        } else if (e.key === 'Escape') {
            setTitle(activeBook);
            setIsEditing(false);
        }
    };

    const handleDeleteRawChaptersClick = () => {
        if (window.confirm(`Are you sure you want to delete all ${rawChapterCount} raw chapters for "${activeBook}"? This cannot be undone.`)) {
            onDeleteRawChapters();
        }
    };

    const handleGoToBookmark = () => {
        if (!bookmark) {
            logToPanel('info', 'No bookmark set.');
            return;
        }

        // Find the index of the bookmarked chapter in the complete sorted list.
        const chapterIndexInSortedList = sortedChapters.findIndex(c => c.sourceUrl === bookmark.chapterSourceUrl);

        if (chapterIndexInSortedList !== -1) {
            // Get the chapter object from the same list.
            const bookmarkedChapter = sortedChapters[chapterIndexInSortedList];

            // Clear any search term so the user isn't confused when they return to the TOC.
            setSearchTerm('');

            // Navigate using the complete sorted list and the correct index.
            onChapterSelect(bookmarkedChapter, sortedChapters, chapterIndexInSortedList);
        } else {
            // This case can happen if the bookmarked chapter was deleted.
            logToPanel('error', "Bookmarked chapter not found! It may have been deleted.");
            // We clear the stale bookmark to prevent further errors.
            onUpdateBookmark(null);
        }
    };

    const filteredChapters = sortedChapters.filter(chapter =>
        chapter.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (currentChapter) {
        const hasPrevious = sortOrder === 'asc' ? currentChapterIndex > 0 : currentChapterIndex < currentChapterList.length - 1;
        const hasNext = sortOrder === 'asc' ? currentChapterIndex < currentChapterList.length - 1 : currentChapterIndex > 0;
        return <ChapterView
            chapter={currentChapter}
            onBack={onReturnToTOC}
            onPrevious={onPreviousChapter}
            onNext={onNextChapter}
            onRetranslate={() => onStartTranslation(currentChapter, true)}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            translatingNextSourceUrl={translatingNextSourceUrl}
            autoTranslateNext={autoTranslateNext}
            setAutoTranslateNext={setAutoTranslateNext}
            bookmark={bookmark}
            onUpdateBookmark={onUpdateBookmark}
        />;
    }


    return (
        <div className="translations-view">
            <div className="book-header">
                <div className="book-header-main">
                    <h1 ref={titleSizerRef} className="book-title-sizer">{activeBook}</h1>
                    <div className="title-selector-wrapper">
                        {isEditing ? (
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
                            <select
                                className="book-title-selector"
                                value={activeBook}
                                onChange={(e) => onBookSelect(e.target.value)}
                                style={{ width: selectWidth }}
                            >
                                {books.map(book => (
                                    <option key={book} value={book}>{book}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
                <div className="book-header-controls">
                    <button onClick={onImportBooks} className="icon-button" title="Import Books">
                        <ImportIcon />
                    </button>
                    <button onClick={toggleEditing} className="icon-button" title={isEditing ? "Finish Editing" : "Edit Title & Description"}>
                        <EditIcon />
                    </button>
                    <button onClick={onOpenSettings} className="icon-button" title="Book Settings">
                        <SettingsIcon />
                    </button>
                    <button onClick={onDeleteBook} className="icon-button" title="Delete Book">
                        <DeleteIcon />
                    </button>
                </div>
            </div>
            <div className="book-description-container">
                {isEditing ? (
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
                    <div className="book-description-display">
                        {description || <span className="placeholder-text">No description provided.</span>}
                    </div>
                )}
            </div>


            <hr className="stylish-separator" />

            <div className="toc-section-header">
                <div className="toc-title-row">
                    <div className="toc-title-area">
                        <h2>Table of Contents</h2>
                        <span className="raw-chapter-count">({rawChapterCount} raw)</span>
                    </div>
                </div>
                <div className="toc-controls-row">
                    <div className="toc-controls left">
                        <input
                            type="search"
                            placeholder="Search chapters..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <button onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
                            Sort {sortOrder === 'asc' ? 'Newest' : 'Oldest'} First
                        </button>
                        {bookmark && (
                            <button onClick={handleGoToBookmark}>Go to Bookmark</button>
                        )}
                    </div>
                    <div className="toc-controls right">
                        <button onClick={onScrapeChapters} className="btn-secondary">Scrape Chapters</button>
                        <button onClick={handleDeleteRawChaptersClick} className="btn-danger" disabled={!isEditing} title="Delete all raw chapters">Delete Raw Chapters</button>
                    </div>
                </div>
            </div>


            <div className="toc-list">
                {filteredChapters.length > 0 ? (
                    filteredChapters.map((chapter, index) => (
                        <div
                            key={chapter.originalIndex}
                            className="toc-item"
                            onClick={!isEditing ? () => onChapterSelect(chapter, filteredChapters, index) : undefined}
                            style={{ cursor: isEditing ? 'default' : 'pointer' }}
                        >
                            <span className="toc-item-number">Ch. {chapter.chapterNumber}</span>
                            <span className="toc-item-title">{chapter.title}</span>
                            {isEditing && (
                                <button
                                    className="toc-item-delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteChapter(chapter.sourceUrl);
                                    }}
                                    title="Delete Chapter"
                                >
                                    <DeleteIcon />
                                </button>
                            )}
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