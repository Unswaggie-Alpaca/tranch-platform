// components/documents/DocumentList.jsx

import React, { useState } from 'react';
import DocumentCard from './DocumentCard';
import DocumentViewer from './DocumentViewer';
import { EmptyState } from '../common';
import { useNotifications } from '../../contexts';

const DocumentList = ({ 
  documents = [], 
  onDelete, 
  onUpload, 
  showUploadButton = false,
  emptyMessage = "No documents uploaded",
  emptyIcon = "📁"
}) => {
  const { addNotification } = useNotifications();
  const [previewDocument, setPreviewDocument] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('date');

  const documentTypes = [...new Set(documents.map(doc => doc.document_type))];

  const filteredDocuments = documents
    .filter(doc => filterType === 'all' || doc.document_type === filterType)
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.file_name.localeCompare(b.file_name);
        case 'size':
          return (b.file_size || 0) - (a.file_size || 0);
        case 'date':
        default:
          return new Date(b.uploaded_at) - new Date(a.uploaded_at);
      }
    });

  const handleView = (document) => {
    setPreviewDocument(document);
  };

  const handleDelete = async (document) => {
    if (window.confirm(`Are you sure you want to delete ${document.file_name}?`)) {
      if (onDelete) {
        try {
          await onDelete(document);
          addNotification({
            type: 'success',
            title: 'Document Deleted',
            message: 'Document has been removed successfully'
          });
        } catch (err) {
          addNotification({
            type: 'error',
            title: 'Delete Failed',
            message: 'Failed to delete document'
          });
        }
      }
    }
  };

  if (documents.length === 0) {
    return (
      <EmptyState 
        icon={emptyIcon}
        title="No documents"
        message={emptyMessage}
        action={
          showUploadButton && onUpload && (
            <label className="btn btn-primary">
              Upload Documents
              <input
                type="file"
                multiple
                onChange={(e) => onUpload(Array.from(e.target.files))}
                style={{ display: 'none' }}
              />
            </label>
          )
        }
      />
    );
  }

  return (
    <div className="document-list">
      <div className="document-controls">
        <div className="document-filters">
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
            className="form-select"
          >
            <option value="all">All Documents ({documents.length})</option>
            {documentTypes.map(type => (
              <option key={type} value={type}>
                {type?.replace(/_/g, ' ')} ({documents.filter(d => d.document_type === type).length})
              </option>
            ))}
          </select>
          
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="form-select"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
          </select>
        </div>
        
        {showUploadButton && onUpload && (
          <label className="btn btn-primary">
            <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Upload Documents
            <input
              type="file"
              multiple
              onChange={(e) => onUpload(Array.from(e.target.files))}
              style={{ display: 'none' }}
            />
          </label>
        )}
      </div>

      <div className="documents-grid">
        {filteredDocuments.map(doc => (
          <DocumentCard 
            key={doc.id} 
            document={doc}
            onView={handleView}
            onDelete={onDelete ? () => handleDelete(doc) : null}
          />
        ))}
      </div>

      {previewDocument && (
        <DocumentViewer 
          document={previewDocument}
          isOpen={true}
          onClose={() => setPreviewDocument(null)}
        />
      )}
    </div>
  );
};

export default DocumentList;