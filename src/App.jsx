import React, { useState, useEffect, useCallback } from 'react';
import Glossary from './components/Glossary';
import Translations from './components/Translations';
import WorldBuilding from './components/WorldBuilding';
import ChapterView from './components/ChapterView';
import LogPanel from './components/LogPanel';
import NewBookModal from './components/NewBookModal';
import BookSettingsModal from './components/BookSettingsModal';
import api from './api';
import { onLog, logToPanel } from './logService';
import LogIcon from './assets/log-icon.svg';

const App = () => {
  const [appData, setAppData] = useState({ activeBook: null, books: {} });
  const [currentView, setCurrentView] = useState('translations');
  const [currentChapter, setCurrentChapter] = useState(null);
  const [currentChapterList, setCurrentChapterList] = useState([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);
  const [sortOrder, setSortOrder] = useState('asc');

  const [isLogVisible, setIsLogVisible] = useState(false);
  const [logWidth, setLogWidth] = useState(400);
  const [logMessages, setLogMessages] = useState([]);
  const [connectedClients, setConnectedClients] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [isNewBookModalOpen, setIsNewBookModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const handleNewLog = useCallback((log) => {
    setLogMessages(prev => [...prev, log].slice(-100));
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    handleNewLog(message);

    switch (message.type) {
      case 'ws-status':
        setWsStatus(message.payload.status);
        break;
      case 'client-list-update':
        setConnectedClients(message.payload.connectedClients);
        break;
      default:
        break;
    }
  }, [handleNewLog]);

  useEffect(() => {
    api.connectWebSocket(handleWebSocketMessage);
    const unsubscribe = onLog(handleNewLog);

    const fetchData = async () => {
      try {
        const data = await api.getStorage('novelNavigatorData');
        const loadedData = data.novelNavigatorData || { activeBook: null, books: {} };
        setAppData(loadedData);
        if (Object.keys(loadedData.books).length === 0) {
          setIsNewBookModalOpen(true);
        }
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
        setAppData({ activeBook: null, books: {} });
        setIsNewBookModalOpen(true);
      }
    };
    fetchData();

    return () => unsubscribe();
  }, [handleWebSocketMessage, handleNewLog]);

  const handleBookAction = async (action) => {
    switch (action.type) {
      case 'select':
        const newAppData = { ...appData, activeBook: action.payload };
        setAppData(newAppData);
        await api.setStorage('novelNavigatorData', newAppData);
        setCurrentChapter(null);
        break;
      case 'create':
        setIsNewBookModalOpen(true);
        break;
      case 'import':
        handleImportBooks();
        break;
      case 'delete':
        handleDeleteBook(action.payload);
        break;
      default:
        break;
    }
  };

  const handleDeleteBook = async (bookNameToDelete) => {
    // A simple confirmation dialog
    const isConfirmed = window.confirm(`Are you sure you want to delete the book "${bookNameToDelete}"? This action cannot be undone.`);
    if (!isConfirmed) {
      return;
    }

    const newBooks = { ...appData.books };
    delete newBooks[bookNameToDelete];

    const newAppData = {
      ...appData,
      books: newBooks,
      activeBook: appData.activeBook === bookNameToDelete ? null : appData.activeBook,
    };

    setAppData(newAppData);
    await api.setStorage('novelNavigatorData', newAppData);
    logToPanel('info', `Deleted book: "${bookNameToDelete}"`);
  };

  const handleCreateBook = async (bookName) => {
    const newBookData = {
      glossary: {},
      chapters: [],
      description: '',
      settings: {},
      worldBuilding: { categories: [] }
    };
    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [bookName]: newBookData
      },
      activeBook: bookName
    };
    setAppData(newAppData);
    await api.setStorage('novelNavigatorData', newAppData);
    setIsNewBookModalOpen(false);
    logToPanel('info', `Created new book: "${bookName}"`);
  };

  const handleImportBooks = async () => {
    try {
      const { path } = await api.showDirectoryPicker();
      if (!path) return;

      logToPanel('info', `Starting import from folder: ${path}`);
      const importedBooks = await api.importBooks(path);

      let newBooks = { ...appData.books };
      let importedCount = 0;
      for (const bookName in importedBooks) {
        newBooks[bookName] = importedBooks[bookName];
        importedCount++;
      }

      if (importedCount > 0) {
        const newAppData = { ...appData, books: newBooks };
        setAppData(newAppData);
        await api.setStorage('novelNavigatorData', newAppData);
        logToPanel('success', `Successfully imported ${importedCount} book(s).`);
      } else {
        logToPanel('warning', 'No new books were found in the selected folder.');
      }

    } catch (error) {
      console.error("Import failed:", error);
      logToPanel('error', `Import failed: ${error.message}`);
    }
  };

  const handleBookTitleChange = async (oldName, newName) => {
    if (!newName || newName === oldName) return;
    if (appData.books[newName]) {
      logToPanel('error', `A book named "${newName}" already exists.`);

      setAppData({ ...appData });
      return;
    }

    const newBooks = { ...appData.books };
    const bookData = newBooks[oldName];
    delete newBooks[oldName];
    newBooks[newName] = bookData;

    const newAppData = {
      ...appData,
      books: newBooks,
      activeBook: newName
    };

    setAppData(newAppData);
    await api.setStorage('novelNavigatorData', newAppData);
    logToPanel('info', `Renamed book from "${oldName}" to "${newName}"`);
  };

  const handleDescriptionChange = async (newDescription) => {
    if (!appData.activeBook) return;
    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [appData.activeBook]: {
          ...appData.books[appData.activeBook],
          description: newDescription
        }
      }
    };
    setAppData(newAppData);
    await api.setStorage('novelNavigatorData', newAppData);
  }

  const handleChapterSelect = (chapter, chapterList, index) => {
    setCurrentChapter(chapter);
    setCurrentChapterList(chapterList);
    setCurrentChapterIndex(index);
  };

  const handlePreviousChapter = () => {
    const newIndex = sortOrder === 'desc' ? currentChapterIndex + 1 : currentChapterIndex - 1;
    if (newIndex >= 0 && newIndex < currentChapterList.length) {
      setCurrentChapterIndex(newIndex);
      setCurrentChapter(currentChapterList[newIndex]);
    }
  };

  const handleNextChapter = () => {
    const newIndex = sortOrder === 'desc' ? currentChapterIndex - 1 : currentChapterIndex + 1;
    if (newIndex >= 0 && newIndex < currentChapterList.length) {
      setCurrentChapterIndex(newIndex);
      setCurrentChapter(currentChapterList[newIndex]);
    }
  };


  const handleReturnToTOC = () => {
    setCurrentChapter(null);
    setCurrentChapterIndex(-1);
    setCurrentChapterList([]);
  };

  const handleGlossaryEntryUpdate = async (originalTerm, updatedEntry) => {
    if (!appData.activeBook) return;

    const newGlossary = { ...appData.books[appData.activeBook].glossary };

    let newEntryString = `Term: ${updatedEntry.term}`;
    if (updatedEntry.pinyin) newEntryString += `\nPinyin: ${updatedEntry.pinyin}`;
    if (updatedEntry.category) newEntryString += `\nCategory: ${updatedEntry.category}`;
    if (updatedEntry.chosenRendition) newEntryString += `\nChosen_Rendition: ${updatedEntry.chosenRendition}`;
    if (updatedEntry.decisionRationale) newEntryString += `\nDecision_Rationale: ${updatedEntry.decisionRationale}`;
    if (updatedEntry.excludedRendition) newEntryString += `\nExcluded_Rendition: ${updatedEntry.excludedRendition}`;
    if (updatedEntry.excludedRationale) newEntryString += `\nExcluded_Rationale: ${updatedEntry.excludedRationale}`;
    if (updatedEntry.notes) newEntryString += `\nNotes: ${updatedEntry.notes}`;

    if (originalTerm !== updatedEntry.term) {
      delete newGlossary[originalTerm];
    }
    newGlossary[updatedEntry.term] = newEntryString;

    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [appData.activeBook]: {
          ...appData.books[appData.activeBook],
          glossary: newGlossary
        }
      }
    };
    setAppData(newAppData);
    await api.setStorage('novelNavigatorData', newAppData);
    logToPanel('success', `Glossary entry "${updatedEntry.term}" updated.`);
  };

  const handleGlossaryEntryDelete = async (termToDelete) => {
    if (!appData.activeBook) return;

    const newGlossary = { ...appData.books[appData.activeBook].glossary };
    delete newGlossary[termToDelete];

    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [appData.activeBook]: {
          ...appData.books[appData.activeBook],
          glossary: newGlossary
        }
      }
    };
    setAppData(newAppData);
    await api.setStorage('novelNavigatorData', newAppData);
    logToPanel('info', `Glossary entry "${termToDelete}" deleted.`);
  };

  const handleSaveSettings = async (newSettings) => {
    if (!appData.activeBook) return;
    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [appData.activeBook]: {
          ...appData.books[appData.activeBook],
          settings: newSettings,
        },
      },
    };
    setAppData(newAppData);
    await api.setStorage('novelNavigatorData', newAppData);
    setIsSettingsModalOpen(false);
    logToPanel('success', `Settings for "${appData.activeBook}" have been updated.`);
  };

  const activeBookData = appData.activeBook ? appData.books[appData.activeBook] : null;

  const renderView = () => {
    if (currentChapter) {
      const hasPrevious = sortOrder === 'asc' ? currentChapterIndex > 0 : currentChapterIndex < currentChapterList.length - 1;
      const hasNext = sortOrder === 'asc' ? currentChapterIndex < currentChapterList.length - 1 : currentChapterIndex > 0;
      return <ChapterView
        chapter={currentChapter}
        onBack={handleReturnToTOC}
        onPrevious={handlePreviousChapter}
        onNext={handleNextChapter}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
      />;
    }

    if (!appData.activeBook || !activeBookData) {
      return <div className="p-4">Please select, create, or import a book to get started.</div>;
    }

    switch (currentView) {
      case 'glossary':
        return <Glossary glossary={activeBookData.glossary || {}} onUpdateEntry={handleGlossaryEntryUpdate} onDeleteEntry={handleGlossaryEntryDelete} />;
      case 'translations':
        return <Translations
          books={Object.keys(appData.books)}
          activeBook={appData.activeBook}
          chapters={activeBookData.chapters || []}
          bookDescription={activeBookData.description || ''}
          onDescriptionChange={handleDescriptionChange}
          onBookTitleChange={handleBookTitleChange}
          onChapterSelect={handleChapterSelect}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onDeleteBook={() => handleBookAction({ type: 'delete', payload: appData.activeBook })}
          onBookSelect={(book) => handleBookAction({ type: 'select', payload: book })}
        />;
      case 'world-building':
        return <WorldBuilding worldBuilding={activeBookData.worldBuilding || {}} />;
      default:
        return <Glossary glossary={activeBookData.glossary || {}} onUpdateEntry={handleGlossaryEntryUpdate} onDeleteEntry={handleGlossaryEntryDelete} />;
    }
  };

  return (
    <div className="app-container">
      <NewBookModal
        isOpen={isNewBookModalOpen}
        onClose={() => setIsNewBookModalOpen(false)}
        onCreate={handleCreateBook}
        existingBookNames={Object.keys(appData.books)}
      />
      {isSettingsModalOpen && (
        <BookSettingsModal
          settings={activeBookData.settings}
          onClose={() => setIsSettingsModalOpen(false)}
          onSave={handleSaveSettings}
        />
      )}
      <div className="main-view" style={{ right: isLogVisible ? `${logWidth}px` : '0' }}>
        <nav className="nav-bar">
          <div className="nav-buttons">
            <button onClick={() => setCurrentView('translations')} className={currentView === 'translations' ? 'active' : ''}>
              Books
            </button>
            <button onClick={() => setCurrentView('glossary')} className={currentView === 'glossary' ? 'active' : ''}>Glossary</button>
            <button onClick={() => setCurrentView('world-building')} className={currentView === 'world-building' ? 'active' : ''}>
              World
            </button>
          </div>
          <div className="top-right-controls">
            <button onClick={() => setIsLogVisible(!isLogVisible)} className="log-icon-button">
              <img src={LogIcon} alt="Toggle Log" />
            </button>
          </div>
        </nav>
        <main className="main-content">{renderView()}</main>
      </div>
      {isLogVisible && (
        <LogPanel
          width={logWidth}
          setWidth={setLogWidth}
          logs={logMessages}
          clients={connectedClients}
          status={wsStatus}
        />
      )}
    </div>
  );
};

export default App;