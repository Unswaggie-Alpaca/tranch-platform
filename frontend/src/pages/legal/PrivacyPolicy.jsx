// pages/legal/PrivacyPolicy.jsx

import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const PrivacyPolicy = () => {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="January 2025">
      <section>
        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly to us, such as when you create an account, list a project, or communicate with other users.</p>
        
        <h3>1.1 Information You Provide</h3>
        <ul>
          <li>Account information (name, email, password)</li>
          <li>Profile information (company details, investment preferences)</li>
          <li>Project information (property details, financial data, documents)</li>
          <li>Communications (messages, support inquiries)</li>
          <li>Payment information (processed securely through Stripe)</li>
        </ul>
        
        <h3>1.2 Information We Collect Automatically</h3>
        <ul>
          <li>Usage information (pages visited, features used)</li>
          <li>Device information (IP address, browser type, operating system)</li>
          <li>Cookies and similar technologies</li>
        </ul>
      </section>
      
      <section>
        <h2>2. How We Use Your Information</h2>
        <p>We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.</p>
        
        <h3>2.1 Service Provision</h3>
        <ul>
          <li>Create and maintain your account</li>
          <li>Process and manage project listings</li>
          <li>Facilitate connections between developers and funders</li>
          <li>Process payments and subscriptions</li>
        </ul>
        
        <h3>2.2 Communication</h3>
        <ul>
          <li>Send service-related notifications</li>
          <li>Respond to your inquiries</li>
          <li>Send marketing communications (with your consent)</li>
        </ul>
        
        <h3>2.3 Improvement and Analytics</h3>
        <ul>
          <li>Analyze usage patterns to improve our platform</li>
          <li>Develop new features and services</li>
          <li>Ensure platform security and prevent fraud</li>
        </ul>
      </section>
      
      <section>
        <h2>3. Information Sharing</h2>
        <p>We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.</p>
        
        <h3>3.1 With Other Users</h3>
        <ul>
          <li>Project information is shared with verified funders</li>
          <li>Profile information is visible to users you interact with</li>
          <li>Messages are shared between conversation participants</li>
        </ul>
        
        <h3>3.2 With Service Providers</h3>
        <ul>
          <li>Payment processors (Stripe)</li>
          <li>Cloud hosting services</li>
          <li>Analytics providers</li>
          <li>Customer support tools</li>
        </ul>
        
        <h3>3.3 Legal Requirements</h3>
        <p>We may disclose information if required by law or to protect our rights and the safety of our users.</p>
      </section>
      
      <section>
        <h2>4. Data Security</h2>
        <p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>
        
        <ul>
          <li>Encryption of data in transit and at rest</li>
          <li>Regular security audits and assessments</li>
          <li>Access controls and authentication</li>
          <li>Secure data centers with physical security</li>
        </ul>
      </section>
      
      <section>
        <h2>5. Your Rights</h2>
        <p>You have the right to access, update, or delete your personal information. You can do this through your account settings or by contacting us.</p>
        
        <h3>5.1 Your Choices</h3>
        <ul>
          <li>Update your profile information at any time</li>
          <li>Download your data through account settings</li>
          <li>Delete your account and associated data</li>
          <li>Opt-out of marketing communications</li>
          <li>Control cookie preferences</li>
        </ul>
        
        <h3>5.2 Data Retention</h3>
        <p>We retain your information for as long as your account is active or as needed to provide services. After account deletion, some information may be retained for legal or legitimate business purposes.</p>
      </section>
      
      <section>
        <h2>6. International Data Transfers</h2>
        <p>Your information may be transferred to and processed in countries other than Australia. We ensure appropriate safeguards are in place for such transfers.</p>
      </section>
      
      <section>
        <h2>7. Children's Privacy</h2>
        <p>Our services are not directed to individuals under 18. We do not knowingly collect personal information from children.</p>
      </section>
      
      <section>
        <h2>8. Changes to This Policy</h2>
        <p>We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "last updated" date.</p>
      </section>
      
      <section>
        <h2>9. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, please contact us:</p>
        <ul>
          <li>Email: privacy@tranch.com.au</li>
          <li>Phone: 1300 TRANCH</li>
          <li>Address: Level 10, 123 Collins Street, Melbourne VIC 3000</li>
        </ul>
      </section>
    </LegalLayout>
  );
};

export default PrivacyPolicy;