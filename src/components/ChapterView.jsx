// path: /src/components/ChapterView.jsx
import React, { useRef, useLayoutEffect } from 'react';
import RepeatIcon from '../assets/repeat-icon.svg';
import LoadingSpinner from './LoadingSpinner';
import Paragraph from './Paragraph';
import './Bookmark.css';

const ChapterView = ({
    chapter,
    onBack,
    onPrevious,
    onNext,
    onRetranslate,
    hasPrevious,
    hasNext,
    translatingNextSourceUrl,
    autoTranslateNext,
    setAutoTranslateNext,
    bookmark,
    onUpdateBookmark
}) => {
    const contentContainerRef = useRef(null);
    const paragraphRefs = useRef([]);
    const hasScrolledToBookmark = useRef(false);

    // Effect 1: Scroll to the top ONLY when the chapter changes.
    useLayoutEffect(() => {
        if (contentContainerRef.current) {
            contentContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
        }
        hasScrolledToBookmark.current = false;
    }, [chapter.sourceUrl, chapter.title]); // Depend on title as well for fallback

    // Effect 2: Scroll to the bookmark if it exists in the current chapter.
    useLayoutEffect(() => {
        const isBookmarkedInThisChapter = doBookmarksMatch(bookmark, chapter);

        if (isBookmarkedInThisChapter && !hasScrolledToBookmark.current) {
            const bookmarkedElement = paragraphRefs.current[bookmark.paragraphIndex];
            if (bookmarkedElement) {
                bookmarkedElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                hasScrolledToBookmark.current = true;
            }
        }
    }, [chapter.sourceUrl, chapter.title, bookmark]);


    const handleBookmarkClick = (index) => {
        const isCurrentlyBookmarked = doBookmarksMatch(bookmark, chapter) && bookmark.paragraphIndex === index;

        if (isCurrentlyBookmarked) {
            onUpdateBookmark(null);
        } else {
            // Save both URL and Title to the bookmark for robust matching
            onUpdateBookmark({
                chapterSourceUrl: chapter.sourceUrl,
                chapterTitle: chapter.title,
                paragraphIndex: index
            });
        }
    };

    // New, more robust matching logic
    const doBookmarksMatch = (bookmarkToMatch, currentChapter) => {
        if (!bookmarkToMatch || !currentChapter) return false;

        // Primary matching method: Use the sourceUrl if it's available and not null.
        if (bookmarkToMatch.chapterSourceUrl && currentChapter.sourceUrl) {
            return bookmarkToMatch.chapterSourceUrl === currentChapter.sourceUrl;
        }

        // Fallback matching method: Use the title if URL isn't available.
        if (bookmarkToMatch.chapterTitle && currentChapter.title) {
            return bookmarkToMatch.chapterTitle === currentChapter.title;
        }

        return false;
    };


    const paragraphs = (chapter.content || '').split('\n').filter(p => p.trim() !== '');
    const isTranslating = translatingNextSourceUrl !== null;
    const isBookmarkedInThisChapter = doBookmarksMatch(bookmark, chapter);
    const bookmarkedIndex = isBookmarkedInThisChapter ? bookmark.paragraphIndex : -1;

    return (
        <div className="chapter-view">
            <div className="chapter-header">
                <div className="chapter-header-left">
                    <button onClick={onBack} className="back-button">Back</button>
                </div>
                <div className="chapter-header-center">
                    <h2>{chapter.title}</h2>
                </div>
                <div className="chapter-header-right">
                    <div className="auto-translate-control">
                        <input
                            type="checkbox"
                            id="autoTranslateCheck"
                            checked={autoTranslateNext}
                            onChange={(e) => setAutoTranslateNext(e.target.checked)}
                        />
                        <label htmlFor="autoTranslateCheck">Auto-queue next</label>
                    </div>
                    <button onClick={onRetranslate} className="icon-button retranslate-button" title="Translate this chapter again">
                        <img src={RepeatIcon} alt="Retranslate" />
                    </button>
                </div>
            </div>

            <div className="chapter-content-container" ref={contentContainerRef}>
                <div className="chapter-content">
                    {paragraphs.length > 0 ? (
                        paragraphs.map((p, index) => (
                            <Paragraph
                                key={index}
                                paragraphRef={el => paragraphRefs.current[index] = el}
                                text={p}
                                index={index}
                                isBookmarked={index === bookmarkedIndex}
                                isBookmarkedAbove={bookmarkedIndex !== -1 && index <= bookmarkedIndex}
                                onBookmarkClick={handleBookmarkClick}
                            />
                        ))
                    ) : (
                        <p>This chapter has not been translated yet.</p>
                    )}
                </div>
            </div>

            <div className="chapter-nav-container">
                <div className="chapter-nav">
                    <button onClick={onPrevious} disabled={!hasPrevious}>Previous Chapter</button>
                    <button onClick={onBack}>Table of Contents</button>
                    <button onClick={onNext} disabled={isTranslating} className="next-chapter-button">
                        {isTranslating ? (
                            <LoadingSpinner />
                        ) : (
                            hasNext ? 'Next Chapter' : 'Translate Next'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChapterView;