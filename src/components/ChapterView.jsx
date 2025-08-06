import React from 'react';
import RepeatIcon from '../assets/repeat-icon.svg';
import LoadingSpinner from './LoadingSpinner';

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
    setAutoTranslateNext
}) => {

    const paragraphs = (chapter.content || '').split('\n').filter(p => p.trim() !== '');
    const isTranslating = translatingNextSourceUrl !== null;

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

            <div className="chapter-content-container">
                <div className="chapter-content">
                    {paragraphs.length > 0 ? (
                        paragraphs.map((p, index) => (
                            <p key={index}>{p}</p>
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