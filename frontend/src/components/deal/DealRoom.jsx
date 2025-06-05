import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../hooks/useApp';
import { useApi } from '../../hooks/useApi';
import { useNotifications } from '../../hooks/useNotifications';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { StatusBadge } from '../common/StatusBadge';
import { Tabs } from '../common/Tabs';
import DealOverview from './DealOverview';
import DealDocumentManager from './DealDocumentManager';
import DealComments from './DealComments';
import ProposalSection from './ProposalSection';
import QuoteWizard from './QuoteWizard';

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
      // For now, simulate deal data since the backend endpoints might not be fully implemented
      const projectData = await api.getProject(projectId);
      
      // Simulate deal data based on what would come from your server
      const dealData = {
        id: dealId,
        project_id: projectId,
        borrower_name: projectData.borrower_name || 'Developer Name',
        funder_name: user.name,
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      setDeal(dealData);
      setProject(projectData);
    } catch (err) {
      console.error('Failed to load deal data:', err);
      addNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load deal room data'
      });
      navigate(`/project/${projectId}`);
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
  
  if (!deal || !project) {
    return (
      <div className="deal-room">
        <div className="error-message">
          <h3>Deal room not found</h3>
          <p>This deal room may not exist or you don't have access to it.</p>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
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
          <DealDocumentManager 
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