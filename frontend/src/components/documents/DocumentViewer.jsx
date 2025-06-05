// components/documents/DocumentViewer.jsx

import React, { useState, useEffect } from 'react';
import { Modal, LoadingSpinner } from '../common';
import { useApi } from '../../hooks';
import { useNotifications } from '../../contexts';

const DocumentViewer = ({ document, isOpen, onClose }) => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (document && isOpen && document.mime_type?.includes('pdf')) {
      loadDocument();
    } else {
      setLoading(false);
    }
  }, [document, isOpen]);

  useEffect(() => {
    // Cleanup blob URL on unmount
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const loadDocument = async () => {
    try {
      const blob = await api.downloadDocument(document.file_path);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Failed to load document:', err);
      addNotification({
        type: 'error',
        title: 'Preview Failed',
        message: 'Unable to preview document'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await api.downloadDocument(document.file_path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = document.file_name;
      a.click();
      URL.revokeObjectURL(url);
      
      addNotification({
        type: 'success',
        title: 'Download Started',
        message: `Downloading ${document.file_name}`
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Download Failed',
        message: 'Unable to download document'
      });
    }
  };

  if (!document) return null;

  const isPDF = document.mime_type?.includes('pdf');
  const isImage = document.mime_type?.includes('image');

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={document.file_name} 
      size="large"
    >
      <div className="document-viewer">
        {loading ? (
          <div className="viewer-loading">
            <LoadingSpinner message="Loading document..." />
          </div>
        ) : isPDF && previewUrl ? (
          <iframe 
            src={previewUrl} 
            className="document-iframe"
            title={document.file_name}
          />
        ) : isImage && previewUrl ? (
          <div className="image-viewer">
            <img 
              src={previewUrl} 
              alt={document.file_name}
              className="document-image"
            />
          </div>
        ) : (
          <div className="preview-unavailable">
            <svg className="unavailable-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <h3>Preview not available</h3>
            <p>This file type cannot be previewed in the browser</p>
            <button onClick={handleDownload} className="btn btn-primary">
              <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download to View
            </button>
          </div>
        )}
      </div>
      
      <div className="viewer-actions">
        <button onClick={handleDownload} className="btn btn-primary">
          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Download
        </button>
      </div>
    </Modal>
  );
};

export default DocumentViewer;