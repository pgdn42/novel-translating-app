import React, { useEffect, useRef, useState } from 'react';
import RepeatIcon from '../assets/repeat-icon.svg';
import LoadingSpinner from './LoadingSpinner';
import './Bookmark.css'; // Import the new CSS for the bookmark

const BookmarkIcon = () => (
    <svg className="bookmark-svg" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 128 128">
        <path fill="#fff" d="M82.36,110.21l-21.71-19.3c-3.79-3.37-9.5-3.37-13.29,0l-21.71,19.3C19.19,115.94,9,111.36,9,102.73V14 C9,8.48,13.48,4,19,4h70c5.52,0,10,4.48,10,10v88.73C99,111.36,88.81,115.94,82.36,110.21z"></path>
        <path fill="#444b54" d="M19.05,115.76c-1.81,0-3.63-0.38-5.37-1.17C8.94,112.47,6,107.92,6,102.73V14C6,6.83,11.83,1,19,1h70 c1.66,0,3,1.34,3,3c0,1.66-1.34,3-3,3H19c-3.86,0-7,3.14-7,7v88.73c0,2.84,1.54,5.22,4.13,6.39c2.59,1.16,5.4,0.73,7.52-1.15 l21.71-19.3c4.92-4.38,12.35-4.38,17.27,0l21.71,19.3c2.12,1.88,4.93,2.32,7.52,1.15c2.59-1.16,4.13-3.55,4.13-6.39V24 c0-1.66,1.34-3,3-3s3,1.34,3,3v78.73c0,5.19-2.94,9.73-7.67,11.86c-4.73,2.12-10.08,1.31-13.96-2.14l-21.71-19.3 c-2.65-2.36-6.65-2.36-9.3,0l-21.71,19.3C25.19,114.63,22.15,115.76,19.05,115.76z"></path>
        <path fill="#71c2ff" d="M119,75.73c-1.66,0-3-1.34-3-3V14c0-3.86-3.14-7-7-7c-1.66,0-3-1.34-3-3c0-1.66,1.34-3,3-3 c7.17,0,13,5.83,13,13v58.73C122,74.39,120.66,75.73,119,75.73z"></path>
    </svg>
);


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

    // Effect for scrolling to top or to bookmark
    useEffect(() => {
        if (contentContainerRef.current) {
            const isBookmarkedInThisChapter = bookmark && bookmark.chapterSourceUrl === chapter.sourceUrl;
            if (isBookmarkedInThisChapter && paragraphRefs.current[bookmark.paragraphIndex]) {
                // Scroll to the bookmarked paragraph and center it
                paragraphRefs.current[bookmark.paragraphIndex].scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            } else {
                // Scroll to the top for new chapters
                contentContainerRef.current.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        }
    }, [chapter, bookmark]);

    const handleBookmarkClick = (index) => {
        const isCurrentlyBookmarked = bookmark && bookmark.chapterSourceUrl === chapter.sourceUrl && bookmark.paragraphIndex === index;
        if (isCurrentlyBookmarked) {
            onUpdateBookmark(null); // Remove bookmark
        } else {
            onUpdateBookmark({ chapterSourceUrl: chapter.sourceUrl, paragraphIndex: index }); // Set or move bookmark
        }
    };

    const paragraphs = (chapter.content || '').split('\n').filter(p => p.trim() !== '');
    const isTranslating = translatingNextSourceUrl !== null;
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
                                className={`paragraph-container ${index <= bookmarkedIndex ? 'bookmarked-above' : ''}`}
                                onMouseEnter={() => setHoveredParagraph(index)}
                                onMouseLeave={() => setHoveredParagraph(null)}
                            >
                                <p>{p}</p>
                                {(hoveredParagraph === index || bookmarkedIndex === index) && (
                                    <div className="bookmark-icon-container" onClick={() => handleBookmarkClick(index)}>
                                        <BookmarkIcon />
                                    </div>
                                )}
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