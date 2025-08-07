// path: /src/components/Paragraph.jsx
import React from 'react';
import { ReactComponent as BookmarkIcon } from '../assets/bookmark-icon.svg';

const Paragraph = React.memo(({
    text,
    index,
    isBookmarked,
    isBookmarkedAbove,
    onBookmarkClick,
    paragraphRef
}) => {

    const handleBookmarkClick = (e) => {
        // Prevent any other click events from firing
        e.stopPropagation();
        // Notify the parent component which paragraph was clicked
        onBookmarkClick(index);
    };

    // Construct the className string based on props
    const rowClassName = [
        'paragraph-row',
        isBookmarked ? 'bookmarked' : '',
        isBookmarkedAbove ? 'bookmarked-above' : ''
    ].filter(Boolean).join(' ');

    return (
        <div ref={paragraphRef} className={rowClassName}>
            <div className="paragraph-content-wrapper">
                <p>{text}</p>
            </div>
            <div
                className="bookmark-icon-container"
                onClick={handleBookmarkClick}
            >
                <BookmarkIcon className="bookmark-svg" />
            </div>
        </div>
    );
});

export default Paragraph;