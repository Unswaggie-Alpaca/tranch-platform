import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { formatDate } from '../utils/formatters';
import { FileIcon, DocumentRequestModal } from "./";

const DocumentManager = ({ dealId, userRole, onUpdate }) => {
  const api = useApi();
  const [documents, setDocuments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  useEffect(() => {
    fetchDocuments();
  }, [dealId]);
  
  const fetchDocuments = async () => {
    try {
      const [docs, reqs] = await Promise.all([
        api.getDealDocuments(dealId),
        api.getDocumentRequests(dealId)
      ]);
      setDocuments(docs);
      setRequests(reqs);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };
  
  const handleUpload = async (files, requestId = null) => {
    setUploading(true);
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('documents', file);
    });
    
    if (requestId) {
      formData.append('request_id', requestId);
    }
    
    try {
      await api.uploadDealDocuments(dealId, formData);
      await fetchDocuments();
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="document-manager">
      <div className="document-header">
        <h3>Deal Documents</h3>
        <div className="document-actions">
          <button 
            onClick={() => setShowRequestModal(true)}
            className="btn btn-outline"
          >
            Request Document
          </button>
          <label className="btn btn-primary">
            Upload Documents
            <input
              type="file"
              multiple
              onChange={(e) => handleUpload(Array.from(e.target.files))}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>
      
      {/* Document Requests */}
      {requests.length > 0 && (
        <div className="document-requests">
          <h4>Outstanding Requests</h4>
          {requests.map(request => (
            <div key={request.id} className="request-card">
              <div className="request-info">
                <h5>{request.document_name}</h5>
                <p>{request.description}</p>
                <span className="request-meta">
                  Requested by {request.requester_name} • {formatDate(request.created_at)}
                </span>
              </div>
              {request.requester_role !== userRole && (
                <label className="btn btn-sm btn-primary">
                  Upload Response
                  <input
                    type="file"
                    onChange={(e) => handleUpload(Array.from(e.target.files), request.id)}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Document List */}
      <div className="documents-grid">
        {documents.map(doc => (
          <div key={doc.id} className="document-card">
            <div className="doc-icon">
              <FileIcon type={doc.file_type} />
            </div>
            <div className="doc-info">
              <h4>{doc.file_name}</h4>
              <p>Uploaded by {doc.uploader_name}</p>
              <span className="doc-meta">{formatDate(doc.uploaded_at)}</span>
            </div>
            <div className="doc-actions">
              <button 
                onClick={() => api.downloadDealDocument(dealId, doc.id)}
                className="btn btn-sm btn-outline"
              >
                Download
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {showRequestModal && (
        <DocumentRequestModal
          onClose={() => setShowRequestModal(false)}
          onSubmit={async (requestData) => {
            await api.createDocumentRequest(dealId, requestData);
            setShowRequestModal(false);
            fetchDocuments();
          }}
        />
      )}
    </div>
  );
};

export { DocumentManager };
