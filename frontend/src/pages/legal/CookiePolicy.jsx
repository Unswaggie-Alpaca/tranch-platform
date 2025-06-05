// pages/legal/CookiePolicy.jsx

import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const CookiePolicy = () => {
  return (
    <LegalLayout title="Cookie Policy" lastUpdated="January 2025">
      <section>
        <h2>1. What Are Cookies</h2>
        <p>Cookies are small pieces of text sent to your browser by a website you visit. They help that website remember information about your visit, which can both make it easier to visit the site again and make the site more useful to you.</p>
        
        <h3>1.1 How Cookies Work</h3>
        <p>When you visit our website, we place cookies on your device that allow us to:</p>
        <ul>
          <li>Remember your preferences and settings</li>
          <li>Understand how you use our platform</li>
          <li>Improve your user experience</li>
          <li>Provide relevant content and features</li>
        </ul>
      </section>
      
      <section>
        <h2>2. How We Use Cookies</h2>
        <p>We use cookies for the following purposes:</p>
        
        <h3>2.1 Authentication and Security</h3>
        <ul>
          <li>Keep you signed in to your account</li>
          <li>Protect against fraudulent activity</li>
          <li>Maintain session security</li>
        </ul>
        
        <h3>2.2 Preferences and Settings</h3>
        <ul>
          <li>Remember your language preferences</li>
          <li>Store your notification settings</li>
          <li>Save your display preferences</li>
        </ul>
        
        <h3>2.3 Analytics and Performance</h3>
        <ul>
          <li>Understand how you interact with our platform</li>
          <li>Measure feature usage and performance</li>
          <li>Identify areas for improvement</li>
        </ul>
        
        <h3>2.4 Marketing and Advertising</h3>
        <ul>
          <li>Show relevant content and features</li>
          <li>Measure the effectiveness of our campaigns</li>
          <li>Provide personalized experiences</li>
        </ul>
      </section>
      
      <section>
        <h2>3. Types of Cookies We Use</h2>
        
        <h3>3.1 Essential Cookies</h3>
        <p>These cookies are required for the website to function properly. They include:</p>
        <ul>
          <li><strong>Session cookies:</strong> Maintain your session while you navigate the platform</li>
          <li><strong>Authentication cookies:</strong> Keep you logged in to your account</li>
          <li><strong>Security cookies:</strong> Help detect and prevent security threats</li>
        </ul>
        
        <h3>3.2 Analytics Cookies</h3>
        <p>These cookies help us understand how visitors use our website:</p>
        <ul>
          <li><strong>Google Analytics:</strong> Tracks page views, user behavior, and site performance</li>
          <li><strong>Performance cookies:</strong> Monitor site speed and reliability</li>
          <li><strong>Error tracking:</strong> Help us identify and fix technical issues</li>
        </ul>
        
        <h3>3.3 Functional Cookies</h3>
        <p>These cookies remember your preferences and settings:</p>
        <ul>
          <li><strong>Language preferences:</strong> Remember your chosen language</li>
          <li><strong>Display settings:</strong> Store your UI preferences</li>
          <li><strong>Form data:</strong> Save draft information to prevent data loss</li>
        </ul>
        
        <h3>3.4 Marketing Cookies</h3>
        <p>These cookies are used to deliver relevant content:</p>
        <ul>
          <li><strong>Targeting cookies:</strong> Show relevant features based on your usage</li>
          <li><strong>Campaign tracking:</strong> Measure marketing effectiveness</li>
          <li><strong>Referral tracking:</strong> Understand how you found our platform</li>
        </ul>
      </section>
      
      <section>
        <h2>4. Third-Party Cookies</h2>
        <p>We work with third-party services that may set their own cookies:</p>
        
        <h3>4.1 Service Providers</h3>
        <ul>
          <li><strong>Clerk:</strong> Authentication and user management</li>
          <li><strong>Stripe:</strong> Payment processing</li>
          <li><strong>Google Analytics:</strong> Website analytics</li>
        </ul>
        
        <h3>4.2 Third-Party Cookie Management</h3>
        <p>These providers have their own privacy policies and cookie practices. We recommend reviewing their policies for more information.</p>
      </section>
      
      <section>
        <h2>5. Managing Cookies</h2>
        <p>You have control over how cookies are used on your device:</p>
        
        <h3>5.1 Browser Settings</h3>
        <p>Most browsers allow you to control cookies through their settings preferences. However, limiting cookies may impact your experience of the site.</p>
        
        <h3>5.2 Cookie Management Options</h3>
        <ul>
          <li><strong>Accept all cookies:</strong> Full functionality and personalized experience</li>
          <li><strong>Essential cookies only:</strong> Basic functionality, no analytics or personalization</li>
          <li><strong>Custom settings:</strong> Choose which types of cookies to accept</li>
        </ul>
        
        <h3>5.3 How to Manage Cookies in Popular Browsers</h3>
        <ul>
          <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</li>
          <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
          <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
          <li><strong>Edge:</strong> Settings → Privacy, search, and services → Cookies and site permissions</li>
        </ul>
      </section>
      
      <section>
        <h2>6. Cookie Retention</h2>
        <p>Different cookies are retained for different periods:</p>
        
        <h3>6.1 Session Cookies</h3>
        <p>Deleted when you close your browser</p>
        
        <h3>6.2 Persistent Cookies</h3>
        <ul>
          <li>Authentication cookies: 30 days</li>
          <li>Preference cookies: 1 year</li>
          <li>Analytics cookies: 2 years</li>
        </ul>
      </section>
      
      <section>
        <h2>7. Updates to This Policy</h2>
        <p>We may update this Cookie Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "last updated" date.</p>
      </section>
      
      <section>
        <h2>8. Contact Us</h2>
        <p>If you have any questions about our Cookie Policy, please contact us:</p>
        <ul>
          <li>Email: privacy@tranch.com.au</li>
          <li>Phone: 1300 TRANCH</li>
          <li>Address: Level 10, 123 Collins Street, Melbourne VIC 3000</li>
        </ul>
      </section>
    </LegalLayout>
  );
};

export default CookiePolicy;