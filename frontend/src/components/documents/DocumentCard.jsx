// components/documents/DocumentCard.jsx

import React from 'react';
import { formatDate } from '../../utils/formatters';

const DocumentCard = ({ document, onView, onDelete, showActions = true }) => {
  const getDocumentIcon = () => {
    const fileType = document.file_type || document.mime_type || '';
    
    if (fileType.includes('pdf')) {
      return (
        <svg className="doc-icon pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    } else if (fileType.includes('word') || fileType.includes('doc')) {
      return (
        <svg className="doc-icon word" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="16" y1="21" x2="8" y2="21" />
        </svg>
      );
    } else if (fileType.includes('sheet') || fileType.includes('xls')) {
      return (
        <svg className="doc-icon excel" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <rect x="8" y="12" width="8" height="6" />
          <line x1="11" y1="12" x2="11" y2="18" />
          <line x1="14" y1="12" x2="14" y2="18" />
          <line x1="8" y1="15" x2="16" y2="15" />
        </svg>
      );
    } else if (fileType.includes('image')) {
      return (
        <svg className="doc-icon image" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    } else {
      return (
        <svg className="doc-icon generic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="document-card">
      <div className="doc-icon-wrapper">
        {getDocumentIcon()}
      </div>
      
      <div className="doc-info">
        <h4 className="doc-name" title={document.file_name}>
          {document.file_name}
        </h4>
        {document.document_type && (
          <p className="doc-type">{document.document_type.replace(/_/g, ' ')}</p>
        )}
        <div className="doc-meta">
          <span className="doc-size">{formatFileSize(document.file_size)}</span>
          <span className="doc-date">{formatDate(document.uploaded_at)}</span>
        </div>
        {document.uploader_name && (
          <p className="doc-uploader">Uploaded by {document.uploader_name}</p>
        )}
      </div>
      
      {showActions && (
        <div className="doc-actions">
          <button 
            onClick={() => onView(document)}
            className="btn btn-sm btn-outline"
            title="View document"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="icon">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            View
          </button>
          {onDelete && (
            <button 
              onClick={() => onDelete(document)}
              className="btn btn-sm btn-danger"
              title="Delete document"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="icon">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentCard;