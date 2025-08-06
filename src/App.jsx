import React, { useState, useEffect, useCallback } from 'react';
import Glossary from './components/Glossary';
import Translations from './components/Translations';
import WorldBuilding from './components/WorldBuilding';
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

  // Debounce the save function to avoid rapid-fire saves to electron-store
  const debouncedSave = useCallback(
    debounce((data) => {
      api.setStorage('novelNavigatorData', data).catch(err => {
        console.error("Failed to save data:", err);
        logToPanel('error', 'Failed to save application data.');
      });
    }, 1000),
    []
  );

  const updateAppData = (newAppData) => {
    setAppData(newAppData);
    debouncedSave(newAppData);
  };

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

  const handleBookAction = (action) => {
    switch (action.type) {
      case 'select':
        const newAppData = { ...appData, activeBook: action.payload };
        updateAppData(newAppData);
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

  const handleDeleteBook = (bookNameToDelete) => {
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

    updateAppData(newAppData);
    logToPanel('info', `Deleted book: "${bookNameToDelete}"`);
  };

  const handleCreateBook = (bookName) => {
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
    updateAppData(newAppData);
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
        updateAppData(newAppData);
        logToPanel('success', `Successfully imported ${importedCount} book(s).`);
      } else {
        logToPanel('warning', 'No new books were found in the selected folder.');
      }

    } catch (error) {
      console.error("Import failed:", error);
      logToPanel('error', `Import failed: ${error.message}`);
    }
  };

  const handleBookTitleChange = (oldName, newName) => {
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
    updateAppData(newAppData);
    logToPanel('info', `Renamed book from "${oldName}" to "${newName}"`);
  };

  const handleDescriptionChange = (newDescription) => {
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
    updateAppData(newAppData);
  }

  const handleChapterSelect = (chapter, chapterList, index) => {
    setCurrentChapter(chapter);
    setCurrentChapterList(chapterList);
    setCurrentChapterIndex(index);
    setCurrentView('translations');
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

  const handleGlossaryEntryUpdate = (originalTerm, updatedEntry) => {
    if (!appData.activeBook) return;
    const newGlossary = { ...appData.books[appData.activeBook].glossary };

    if (originalTerm && originalTerm !== updatedEntry.term) {
      delete newGlossary[originalTerm];
    }
    newGlossary[updatedEntry.term] = updatedEntry;

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
    updateAppData(newAppData);
    logToPanel('success', `Glossary entry "${updatedEntry.term}" updated.`);
  };

  const handleGlossaryEntryDelete = (termToDelete) => {
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
    updateAppData(newAppData);
    logToPanel('info', `Glossary entry "${termToDelete}" deleted.`);
  };

  const handleSaveSettings = (newSettings) => {
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
    updateAppData(newAppData);
    setIsSettingsModalOpen(false);
    logToPanel('success', `Settings for "${appData.activeBook}" have been updated.`);
  };

  const activeBookData = appData.activeBook ? appData.books[appData.activeBook] : null;

  const renderView = () => {
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
          onImportBooks={() => handleBookAction({ type: 'import' })}
          currentChapter={currentChapter}
          currentChapterList={currentChapterList}
          currentChapterIndex={currentChapterIndex}
          onReturnToTOC={handleReturnToTOC}
          onPreviousChapter={handlePreviousChapter}
          onNextChapter={handleNextChapter}
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
          settings={activeBookData?.settings}
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

// A simple debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export default App;