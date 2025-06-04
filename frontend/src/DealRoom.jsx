// DealRoom.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from './hooks/useApi';
import { useApp } from './contexts/AppContext';
import { useNotifications } from './contexts/NotificationContext';
import { formatCurrency, formatDate } from './utils/formatters';
import { LoadingSpinner, ErrorMessage, EmptyState, Modal, Tabs } from './components/common';
import DocumentManager from './components/DealRoom/DocumentManager';
import DealComments from './components/DealRoom/DealComments';
import QuoteWizard from './components/DealRoom/QuoteWizard';
import ProposalView from './components/DealRoom/ProposalView';

const DealRoom = () => {
  const { projectId, dealId } = useParams();
  const { user } = useApp();
  const api = useApi();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState(null);
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showQuoteWizard, setShowQuoteWizard] = useState(false);
  
  useEffect(() => {
    fetchDealData();
  }, [dealId]);
  
  const fetchDealData = async () => {
    try {
      const [dealData, projectData] = await Promise.all([
        api.getDeal(dealId),
        api.getProject(projectId)
      ]);
      setDeal(dealData);
      setProject(projectData);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load deal room data'
      });
    } finally {
      setLoading(false);
    }
  };
  
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents' },
    { id: 'comments', label: 'Comments' },
    { id: 'proposal', label: 'Proposal' }
  ];
  
  if (loading) return <LoadingSpinner />;
  
  return (
    <div className="deal-room">
      <div className="deal-header">
        <div className="deal-breadcrumb">
          <Link to="/projects">Projects</Link>
          <span>/</span>
          <Link to={`/project/${projectId}`}>{project.title}</Link>
          <span>/</span>
          <span>Deal Room</span>
        </div>
        
        <div className="deal-title-section">
          <h1>{project.title} - Deal Room</h1>
          <div className="deal-status">
            <StatusBadge status={deal.status} />
          </div>
        </div>
        
        <div className="deal-participants">
          <div className="participant">
            <span className="label">Developer:</span>
            <span className="name">{deal.borrower_name}</span>
          </div>
          <div className="participant">
            <span className="label">Funder:</span>
            <span className="name">{deal.funder_name}</span>
          </div>
        </div>
      </div>
      
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      
      <div className="deal-content">
        {activeTab === 'overview' && <DealOverview deal={deal} project={project} />}
        {activeTab === 'documents' && (
          <DocumentManager 
            dealId={dealId}
            userRole={user.role}
            onUpdate={fetchDealData}
          />
        )}
        {activeTab === 'comments' && (
          <DealComments 
            dealId={dealId}
            userRole={user.role}
          />
        )}
        {activeTab === 'proposal' && (
          <ProposalSection 
            deal={deal}
            userRole={user.role}
            onShowQuoteWizard={() => setShowQuoteWizard(true)}
          />
        )}
      </div>
      
      {showQuoteWizard && (
        <QuoteWizard
          dealId={dealId}
          projectId={projectId}
          onClose={() => setShowQuoteWizard(false)}
          onSuccess={() => {
            setShowQuoteWizard(false);
            fetchDealData();
            addNotification({
              type: 'success',
              title: 'Quote Submitted',
              message: 'Your indicative quote has been sent to the developer'
            });
          }}
        />
      )}
    </div>
  );
};

export default DealRoom;