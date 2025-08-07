import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import RepeatIcon from '../assets/repeat-icon.svg';
import LoadingSpinner from './LoadingSpinner';
import { ReactComponent as BookmarkIcon } from '../assets/bookmark-icon.svg';
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
    const [hoveredParagraph, setHoveredParagraph] = useState(null);
    const hasScrolledToBookmark = useRef(false);

    // This effect handles all scrolling logic.
    useLayoutEffect(() => {
        const isBookmarkedInThisChapter = bookmark && bookmark.chapterSourceUrl === chapter.sourceUrl;

        // If there's a bookmark in this chapter and we haven't scrolled to it yet
        if (isBookmarkedInThisChapter && !hasScrolledToBookmark.current) {
            const bookmarkedElement = paragraphRefs.current[bookmark.paragraphIndex];
            if (bookmarkedElement) {
                // We scroll to the bookmarked paragraph instead of the top
                bookmarkedElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                hasScrolledToBookmark.current = true; // Mark that we've done the initial scroll
                return; // Stop here to prevent scrolling to top
            }
        }

        // If there's no bookmark, or we've already handled the bookmark scroll,
        // we scroll to the top of the content container.
        if (contentContainerRef.current) {
            contentContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
        }
    }, [chapter.sourceUrl, bookmark]); // Re-run whenever the chapter or bookmark changes

    // Reset the "has scrolled" flag when the chapter changes
    useEffect(() => {
        hasScrolledToBookmark.current = false;
    }, [chapter.sourceUrl]);


    const handleBookmarkClick = (index, event) => {
        event.stopPropagation();
        // Check if the clicked paragraph is the currently active bookmark for this chapter
        const isCurrentlyBookmarked = bookmark && bookmark.chapterSourceUrl === chapter.sourceUrl && bookmark.paragraphIndex === index;

        if (isCurrentlyBookmarked) {
            onUpdateBookmark(null); // Remove bookmark by setting it to null
        } else {
            // Set a new bookmark, ensuring we store THIS chapter's sourceUrl
            onUpdateBookmark({ chapterSourceUrl: chapter.sourceUrl, paragraphIndex: index });
        }
    };

    const paragraphs = (chapter.content || '').split('\n').filter(p => p.trim() !== '');
    const isTranslating = translatingNextSourceUrl !== null;

    // Determine the bookmarked index ONLY if the bookmark belongs to the current chapter
    const bookmarkedIndex = bookmark && bookmark.chapterSourceUrl === chapter.sourceUrl ? bookmark.paragraphIndex : -1;

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
                            <div
                                key={index}
                                ref={el => paragraphRefs.current[index] = el}
                                className={`paragraph-container ${index === bookmarkedIndex ? 'bookmarked' : ''} ${bookmarkedIndex !== -1 && index <= bookmarkedIndex ? 'bookmarked-above' : ''}`}
                                onMouseEnter={() => setHoveredParagraph(index)}
                                onMouseLeave={() => setHoveredParagraph(null)}
                            >
                                <p>{p}</p>
                                <div
                                    className="bookmark-icon-container"
                                    onClick={(e) => handleBookmarkClick(index, e)}
                                >
                                    {(hoveredParagraph === index || bookmarkedIndex === index) && (
                                        <BookmarkIcon className="bookmark-svg" />
                                    )}
                                </div>
                            </div>
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