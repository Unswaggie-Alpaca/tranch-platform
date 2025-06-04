import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LoadingSpinner, ErrorMessage, EmptyState, NumberInput } from '../components';
import { useApi, useDebounce } from '../hooks';
import { useApp } from '../contexts';
import { ProjectCard } from '../components';

const ProjectsPage = () => {
  const api = useApi();
  const { user } = useApp();
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    propertyType: '',
    minLoan: '',
    maxLoan: '',
    suburb: '',
    developmentStage: '',
    sortBy: 'created_at',
  });

  const debouncedFilters = useDebounce(filters, 300);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [projects, debouncedFilters]);

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...projects];
    if (filters.propertyType) {
      filtered = filtered.filter((p) => p.property_type === filters.propertyType);
    }
    if (filters.minLoan) {
      filtered = filtered.filter((p) => p.loan_amount >= parseInt(filters.minLoan));
    }
    if (filters.maxLoan) {
      filtered = filtered.filter((p) => p.loan_amount <= parseInt(filters.maxLoan));
    }
    if (filters.suburb) {
      filtered = filtered.filter((p) => p.suburb?.toLowerCase().includes(filters.suburb.toLowerCase()));
    }
    if (filters.developmentStage) {
      filtered = filtered.filter((p) => p.development_stage === filters.developmentStage);
    }
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'loan_amount_asc':
          return a.loan_amount - b.loan_amount;
        case 'loan_amount_desc':
          return b.loan_amount - a.loan_amount;
        case 'created_at':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });
    setFilteredProjects(filtered);
  };

  const clearFilters = () => {
    setFilters({
      propertyType: '',
      minLoan: '',
      maxLoan: '',
      suburb: '',
      developmentStage: '',
      sortBy: 'created_at',
    });
  };

  if (loading) return <LoadingSpinner />;

  if (!user.approved) {
    return (
      <div className="projects-page">
        <div className="warning-message">
          <h3>Account Pending Approval</h3>
          <p>Your account is currently under review. You'll be able to access projects once approved.</p>
        </div>
      </div>
    );
  }

  if (user.subscription_status !== 'active') {
    return (
      <div className="projects-page">
        <div className="subscription-required">
          <h2>Subscription Required</h2>
          <p>You need an active subscription to browse projects.</p>
          <Link to="/dashboard" className="btn btn-primary">
            Subscribe Now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="projects-page">
      <div className="page-header">
        <h1>Investment Opportunities</h1>
        <p>Browse and filter active property development projects</p>
      </div>
      {error && <ErrorMessage message={error} onClose={() => setError('')} />}
      <div className="filters-section">
        <h3>Filter Projects</h3>
        <div className="filters-grid">
          <div className="filter-group">
            <label>Property Type</label>
            <select value={filters.propertyType} onChange={(e) => setFilters({ ...filters, propertyType: e.target.value })} className="form-select">
              <option value="">All Types</option>
              <option value="Residential">Residential</option>
              <option value="Commercial">Commercial</option>
              <option value="Mixed Use">Mixed Use</option>
              <option value="Industrial">Industrial</option>
              <option value="Retail">Retail</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Min Loan Amount</label>
            <NumberInput value={filters.minLoan} onChange={(value) => setFilters({ ...filters, minLoan: value })} placeholder="Min amount" prefix="$" />
          </div>
          <div className="filter-group">
            <label>Max Loan Amount</label>
            <NumberInput value={filters.maxLoan} onChange={(value) => setFilters({ ...filters, maxLoan: value })} placeholder="Max amount" prefix="$" />
          </div>
          <div className="filter-group">
            <label>Suburb</label>
            <input type="text" value={filters.suburb} onChange={(e) => setFilters({ ...filters, suburb: e.target.value })} className="form-input" placeholder="Search suburb" />
          </div>
          <div className="filter-group">
            <label>Development Stage</label>
            <select value={filters.developmentStage} onChange={(e) => setFilters({ ...filters, developmentStage: e.target.value })} className="form-select">
              <option value="">All Stages</option>
              <option value="Planning">Planning</option>
              <option value="Pre-Construction">Pre-Construction</option>
              <option value="Construction">Construction</option>
              <option value="Near Completion">Near Completion</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Sort By</label>
            <select value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })} className="form-select">
              <option value="created_at">Newest First</option>
              <option value="loan_amount_desc">Loan Amount (High to Low)</option>
              <option value="loan_amount_asc">Loan Amount (Low to High)</option>
            </select>
          </div>
          <button onClick={clearFilters} className="btn btn-outline">
            Clear Filters
          </button>
        </div>
        <div className="filter-summary">Showing {filteredProjects.length} of {projects.length} projects</div>
      </div>
      {filteredProjects.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No projects match your criteria"
          message="Try adjusting your filters to see more projects"
          action={<button onClick={clearFilters} className="btn btn-primary">Clear Filters</button>}
        />
      ) : (
        <div className="projects-grid">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} userRole={user.role} onProjectUpdate={fetchProjects} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
