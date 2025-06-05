import React, { useState, useEffect } from 'react';
import { formatDate } from '../../utils/formatters';

const DealDocumentManager = ({ dealId, userRole, onUpdate }) => {
  const [documents, setDocuments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [uploading, setUploading] = useState(false);
  
  useEffect(() => {
    // Simulate document data for now
    setDocuments([
      {
        id: 1,
        file_name: 'Financial_Analysis.pdf',
        uploader_name: 'Developer',
        uploaded_at: new Date().toISOString(),
        file_type: 'pdf'
      },
      {
        id: 2,
        file_name: 'Construction_Contract.pdf',
        uploader_name: 'Developer',
        uploaded_at: new Date().toISOString(),
        file_type: 'pdf'
      }
    ]);
    
    setRequests([
      {
        id: 1,
        document_name: 'Insurance Certificate',
        description: 'Current insurance certificate for the project',
        requester_name: 'Funder',
        requester_role: 'funder',
        created_at: new Date().toISOString()
      }
    ]);
  }, [dealId]);
  
  const handleUpload = async (files, requestId = null) => {
    setUploading(true);
    
    // Simulate upload
    setTimeout(() => {
      const newDoc = {
        id: Date.now(),
        file_name: files[0].name,
        uploader_name: userRole === 'funder' ? 'Funder' : 'Developer',
        uploaded_at: new Date().toISOString(),
        file_type: 'pdf'
      };
      setDocuments(prev => [...prev, newDoc]);
      setUploading(false);
      if (onUpdate) onUpdate();
    }, 1000);
  };
  
  return (
    <div className="document-manager">
      <div className="document-header">
        <h3>Deal Documents</h3>
        <div className="document-actions">
          <button className="btn btn-outline">
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
      
      <div className="documents-grid">
        {documents.map(doc => (
          <div key={doc.id} className="document-card">
            <div className="doc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="doc-info">
              <h4>{doc.file_name}</h4>
              <p>Uploaded by {doc.uploader_name}</p>
              <span className="doc-meta">{formatDate(doc.uploaded_at)}</span>
            </div>
            <div className="doc-actions">
              <button className="btn btn-sm btn-outline">
                Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DealDocumentManager;