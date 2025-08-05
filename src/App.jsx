import React, { useState, useEffect, useCallback } from 'react';
import BookSelector from './components/BookSelector';
import Glossary from './components/Glossary';
import Translations from './components/Translations';
import WorldBuilding from './components/WorldBuilding';
import LogPanel from './components/LogPanel';
import NewBookModal from './components/NewBookModal';
import api from './api';
import { onLog, logToPanel } from './logService';
import LogIcon from './assets/log-icon.svg';

const App = () => {
  const [appData, setAppData] = useState({ activeBook: null, books: {} });
  const [currentView, setCurrentView] = useState('translations');

  const [isLogVisible, setIsLogVisible] = useState(false);
  const [logWidth, setLogWidth] = useState(400);
  const [logMessages, setLogMessages] = useState([]);
  const [connectedClients, setConnectedClients] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [isNewBookModalOpen, setIsNewBookModalOpen] = useState(false);

  const handleNewLog = useCallback((log) => {
    setLogMessages(prev => [...prev, log].slice(-100));
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    handleNewLog(message);

    switch (message.type) {
      case 'ws-status':
        setWsStatus(message.payload.status);
        break;
      case 'client-connected':
      case 'client-disconnected':
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
        break;
      case 'create':
        setIsNewBookModalOpen(true);
        break;
      case 'import':
        handleImportBooks();
        break;
      default:
        break;
    }
  };

  const handleCreateBook = async (bookName) => {
    const newBookData = {
      glossary: {},
      chapters: [],
      description: '',
      settings: {},
      worldBuilding: { categories: [] } // Default structure
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
      if (!path) return; // User cancelled

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
      // Revert the change in the UI by re-setting the app data
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

  const activeBookData = appData.activeBook ? appData.books[appData.activeBook] : null;

  const renderView = () => {
    if (!appData.activeBook || !activeBookData) {
      return <div className="p-4">Please select, create, or import a book to get started.</div>;
    }

    switch (currentView) {
      case 'glossary':
        return <Glossary glossary={activeBookData.glossary || {}} />;
      case 'translations':
        return <Translations
          chapters={activeBookData.chapters || []}
          bookTitle={appData.activeBook}
          bookDescription={activeBookData.description || ''}
          onDescriptionChange={handleDescriptionChange}
          onBookTitleChange={handleBookTitleChange}
        />;
      case 'world-building':
        return <WorldBuilding worldBuilding={activeBookData.worldBuilding || {}} />;
      default:
        return <Glossary glossary={activeBookData.glossary || {}} />;
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
      <div className="main-view" style={{ right: isLogVisible ? `${logWidth}px` : '0' }}>
        <nav className="nav-bar">
          <BookSelector
            books={Object.keys(appData.books)}
            activeBook={appData.activeBook}
            onAction={handleBookAction}
          />
          <div className="nav-buttons">
            <button onClick={() => setCurrentView('glossary')}>Glossary</button>
            <button onClick={() => setCurrentView('translations')}>
              Chapters
            </button>
            <button onClick={() => setCurrentView('world-building')}>
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
