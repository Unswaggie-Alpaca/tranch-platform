import React, { useState } from 'react';
import { Modal } from './';

const DocumentRequestModal = ({ onClose, onSubmit }) => {
  const [documentName, setDocumentName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ document_name: documentName, description });
  };

  return (
    <Modal isOpen onClose={onClose} title="Request Document">
      <form onSubmit={handleSubmit} className="document-request-form">
        <div className="form-group">
          <label htmlFor="docName">Document Name</label>
          <input
            id="docName"
            type="text"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            className="form-input"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="form-input"
          />
        </div>
        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Submit
          </button>
        </div>
      </form>
    </Modal>
  );
};

export { DocumentRequestModal };
